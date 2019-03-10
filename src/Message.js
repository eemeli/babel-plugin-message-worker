const t = require('babel-types')

// used for automatic key generation
const getSourceTarget = path => {
  if (path.isVariableDeclarator()) {
    // var x = msg() -> 'x'
    const id = path.get('id')
    return id.node.name || id.getSource()
  } else if (path.isAssignmentExpression()) {
    // x.y = msg() -> 'x.y'
    return path.get('left').getSource()
  } else if (path.isObjectProperty()) {
    // var x = { y: msg() } -> 'x.y'
    const key = path.get('key')
    return (
      getSourceTarget(path.parentPath.parentPath) +
      '.' +
      (key.node.name || key.getSource())
    )
  } else {
    return ''
  }
}

module.exports = class Message {
  static accumulateVars(parts, vars = []) {
    for (const part of parts) {
      if (part instanceof Message) {
        for (const v of part.vars) if (!vars.includes(v)) vars.push(v)
      } else if (part && typeof part === 'object') {
        const { name, type } = part.node
        if (type !== 'Identifier') vars.push(part)
        else if (!vars.includes(name)) vars.push(name)
      }
    }
    return vars
  }

  static visit(plugin, path, msg = []) {
    if (path.isTemplateLiteral()) {
      const quasis = path.node.quasis.map(q => q.value.cooked)
      msg.push(quasis[0])
      for (let i = 1; i < quasis.length; ++i) {
        Message.visit(plugin, path.get(`expressions.${i - 1}`), msg)
        msg.push(quasis[i])
      }
    } else if (path.isLiteral()) {
      const { value } = path.node
      msg.push(value == null ? 'null' : String(value))
    } else if (path.isBinaryExpression({ operator: '+' })) {
      Message.visit(plugin, path.get('left'), msg)
      Message.visit(plugin, path.get('right'), msg)
    } else {
      const parse = plugin.get(path.node)
      if (parse) {
        msg.push(parse(plugin, path))
        plugin.delete(path.node) // inner message is included in this visit
      } else {
        msg.push(path)
      }
    }
    return msg
  }

  constructor(plugin, path) {
    this.plugin = plugin
    this.path = path
    if (path.isCallExpression()) {
      this.variable = path.get('arguments.0')
      this.arg = path.get('arguments.1')
      this.options = path.get('arguments.2')
    }
  }

  get key() {
    if (this._key) return this._key
    if (t.isObjectExpression(this.options)) {
      const { properties } = this.options.node
      for (let i = 0; i < properties.length; ++i) {
        if (properties[i].key.name !== 'key') continue
        const keyPath = this.options.get(`properties.${i}.value`)
        if (!keyPath.isStringLiteral)
          throw keyPath.buildCodeFrameError(
            'If set, the key option must be a literal string'
          )
        return (this._key = keyPath.node.value)
      }
    }
    const srcKey =
      getSourceTarget(this.path.parentPath) || this.compileMessage()
    return (this._key = srcKey.replace(/\W+/g, '_').replace(/^_|_$/g, ''))
  }

  set key(key) {
    this._key = key
  }

  parseVars() {
    if (!this._msg) this._msg = Message.visit(this.plugin, this.arg)
    this.vars = Message.accumulateVars([this.variable])
    Message.accumulateVars(this._msg, this.vars)
    return this.vars
  }
}
