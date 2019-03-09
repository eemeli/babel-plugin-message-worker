const t = require('babel-types')
const MessageFormat = require('messageformat')

const MAX_LINE_LENGTH = 60

const accumulateVars = (parts, vars = []) => {
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

const visit = (plugin, path, msg = []) => {
  if (path.isTemplateLiteral()) {
    const quasis = path.node.quasis.map(q => q.value.cooked)
    msg.push(quasis[0])
    for (let i = 1; i < quasis.length; ++i) {
      visit(plugin, path.get(`expressions.${i - 1}`), msg)
      msg.push(quasis[i])
    }
  } else if (path.isLiteral()) {
    const { value } = path.node
    msg.push(value == null ? 'null' : String(value))
  } else if (path.isBinaryExpression({ operator: '+' })) {
    visit(plugin, path.get('left'), msg)
    visit(plugin, path.get('right'), msg)
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

const compileMessagePart = ({
  allNamedVars,
  indent,
  inPlural,
  path,
  vars,
  wrapVar
}) => part => {
  if (typeof part === 'string') return MessageFormat.escape(part, inPlural)
  if (part instanceof Message) return part.compileMessage(vars, indent + '  ')
  if (!part || !part.node)
    throw path.buildCodeFrameError('Unknown message part')
  if (allNamedVars) return wrapVar(part.node.name)
  const q = part.isIdentifier() ? part.node.name : part
  return wrapVar(String(vars.indexOf(q)))
}

class Message {
  constructor(plugin, path, name) {
    this.plugin = plugin
    this.path = path
    this.name = name
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
    if (!this._msg) this._msg = visit(this.plugin, this.arg)
    this.vars = accumulateVars([this.variable])
    accumulateVars(this._msg, this.vars)
    return this.vars
  }
}

class TemplateMessage extends Message {
  static parse(plugin, path) {
    const msg = new TemplateMessage(plugin, path)
    msg.vars = msg.parseVars()
    return msg
  }

  parseVars() {
    this.parts = visit(this.plugin, this.path.get('quasi'))
    this.vars = accumulateVars(this.parts)
    return this.vars
  }

  compileMessage(vars, indent = '') {
    const ctx = {
      allNamedVars: false,
      indent,
      inPlural: false,
      path: this.path,
      vars: vars || this.vars,
      wrapVar: name => `{${name}}`
    }
    if (ctx.vars.every(v => typeof v === 'string')) ctx.allNamedVars = true
    const body = this.parts.map(compileMessagePart(ctx))
    return body.join('')
  }
}

class SelectMessage extends Message {
  static parse(plugin, path) {
    const msg = new SelectMessage(plugin, path)
    msg.vars = msg.parseVars()
    return msg
  }

  constructor(plugin, path, name = 'select') {
    super(plugin, path, name)
    if (this.variable.isLiteral())
      throw this.variable.buildCodeFrameError(
        `Expected a non-literal value as the first ${name}() argument`
      )
    if (!this.arg.isObjectExpression())
      throw this.arg.buildCodeFrameError(
        `Expected a literal object as the second ${name}() argument`
      )
  }

  parseVars() {
    this.vars = accumulateVars([this.variable])
    for (const { msg } of this.cases) accumulateVars(msg, this.vars)
    return this.vars
  }

  /** @type {{ key: string, msg: (string|Message|NodePath)[] }[]} */
  get cases() {
    if (!this._cases)
      this._cases = this.arg.node.properties.map(({ type }, i) => {
        if (type !== 'ObjectProperty')
          throw this.arg.buildCodeFrameError(
            `The cases parameter does not support ${type}`
          )
        const keyPath = this.arg.get(`properties.${i}.key`)
        const key = keyPath.isIdentifier()
          ? keyPath.node.name
          : keyPath.isLiteral()
          ? String(keyPath.node.value)
          : null
        if (key == null)
          throw keyPath.buildCodeFrameError(
            `Keys of type ${keyPath.node.type} are not supported here`
          )
        //console.log('CASES PLUGIN', this.plugin)
        const msg = visit(this.plugin, this.arg.get(`properties.${i}.value`))
        return { key, msg }
      })
    return this._cases
  }

  get offset() {
    if (typeof this._offset === 'number') return this._offset
    if (!t.isObjectExpression(this.options) || this.name !== 'plural')
      return (this._offset = 0)
    const { properties } = this.options.node
    for (let i = 0; i < properties.length; ++i) {
      if (properties[i].key.name !== 'offset') continue
      const path = this.options.get(`properties.${i}.value`)
      if (!path.isNumericLiteral)
        throw path.buildCodeFrameError(
          'If set, the offset option must be a literal number'
        )
      return (this._offset = path.node.value)
    }
    return (this._offset = 0)
  }

  compileMessage(vars, indent = '') {
    const ctx = {
      allNamedVars: false,
      indent,
      inPlural: this.name === 'plural',
      path: this.arg,
      vars: vars || this.vars,
      wrapVar: name => `{${name}}`
    }
    let varName
    if (ctx.vars.every(v => typeof v === 'string')) {
      ctx.allNamedVars = true
      varName = this.variable.node.name
    } else {
      const q = this.variable.isIdentifier()
        ? this.variable.node.name
        : this.variable
      varName = String(ctx.vars.indexOf(q))
    }
    if (ctx.inPlural)
      ctx.wrapVar = name => (name === varName ? '#' : `{${name}}`)
    const cmp = compileMessagePart(ctx)

    const body = [`{${varName}, ${this.name},`]
    if (this.offset > 0) body[0] += ` offset:${this.offset}`
    for (const { key, msg } of this.cases)
      body.push(` ${key} {${msg.map(cmp).join('')}}`)
    const len = body.reduce((len, s) => len + s.length, 0)
    const maxLen = MAX_LINE_LENGTH - indent.length
    return len > maxLen || body.some(s => s.includes('\n'))
      ? body.join(`\n${indent} `) + `\n${indent}}`
      : body.join('') + '}'
  }
}

class PluralMessage extends SelectMessage {
  static parse(plugin, path) {
    const msg = new PluralMessage(plugin, path)
    msg.vars = msg.parseVars()
    return msg
  }

  constructor(plugin, path) {
    super(plugin, path, 'plural')
    for (const c of this.cases) {
      if (Number.isInteger(Number(c.key))) {
        c.key = `=${c.key}`
      } else if (
        !['zero', 'one', 'two', 'few', 'many', 'other'].includes(c.key)
      ) {
        throw path.buildCodeFrameError(
          'Expected only valid plural categories as plural() cases'
        )
      }
    }
  }
}

module.exports = {
  parseMsgFunction: (plugin, path) => 'MSG-FUNC',
  parseMsgTemplate: TemplateMessage.parse,
  parsePlural: PluralMessage.parse,
  parseSelect: SelectMessage.parse
}
