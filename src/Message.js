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

  constructor(plugin, path) {
    this.plugin = plugin
    this.path = path
    this.options = null
  }

  get key() {
    if (this._key) return this._key
    if (this.options && this.options.has('key')) {
      const key = this.options.get('key')
      if (typeof key !== 'string') {
        const msg = 'If set, the key option must be a literal string'
        throw this.path.buildCodeFrameError(msg)
      }
      return (this._key = key)
    }
    const srcKey =
      getSourceTarget(this.path.parentPath) || this.compileMessage()
    return (this._key = srcKey.replace(/\W+/g, '_').replace(/^_|_$/g, ''))
  }

  set key(key) {
    this._key = key
  }

  visit(path, msg = []) {
    if (path.isTemplateLiteral()) {
      const quasis = path.node.quasis.map(q => q.value.cooked)
      msg.push(quasis[0])
      for (let i = 1; i < quasis.length; ++i) {
        this.visit(path.get(`expressions.${i - 1}`), msg)
        msg.push(quasis[i])
      }
    } else if (path.isLiteral()) {
      const { value } = path.node
      msg.push(value == null ? 'null' : String(value))
    } else if (path.isBinaryExpression({ operator: '+' })) {
      this.visit(path.get('left'), msg)
      this.visit(path.get('right'), msg)
    } else {
      const parse = this.plugin.get(path.node)
      if (parse) {
        msg.push(parse(this.plugin, path))
        this.plugin.delete(path.node) // inner message is included in this visit
      } else {
        msg.push(path)
      }
    }
    return msg
  }
}
