const compileMessagePart = require('./compileMessagePart')
const Message = require('./Message')

const MAX_LINE_LENGTH = 60

module.exports = class SelectMessage extends Message {
  static parse(plugin, path) {
    const msg = new SelectMessage(plugin, path)
    msg.vars = msg.parseVars()
    return msg
  }

  constructor(plugin, path, name = 'select') {
    super(plugin, path, name)
    this.name = name
    this.variable = path.get('arguments.0')
    this.arg = path.get('arguments.1')
    this.options = path.get('arguments.2')
    if (this.variable.isLiteral()) {
      const msg = `Expected a non-literal value as the first ${name}() argument`
      throw this.variable.buildCodeFrameError(msg)
    }
    if (!this.arg.isObjectExpression()) {
      const msg = `Expected a literal object as the second ${name}() argument`
      throw this.arg.buildCodeFrameError(msg)
    }
  }

  parseVars() {
    this.vars = Message.accumulateVars([this.variable])
    for (const { msg } of this.cases) Message.accumulateVars(msg, this.vars)
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
        const msg = this.visit(this.arg.get(`properties.${i}.value`))
        return { key, msg }
      })
    return this._cases
  }

  compileMessage(vars, indent = '') {
    const ctx = {
      allNamedVars: false,
      indent,
      inPlural: this.name === 'ordinal' || this.name === 'plural',
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
    const argName = this.name === 'ordinal' ? 'selectordinal' : this.name
    if (ctx.inPlural)
      ctx.wrapVar = name => (name === varName ? '#' : `{${name}}`)
    const cmp = compileMessagePart(ctx)

    const body = [`{${varName}, ${argName},`]
    for (const { key, msg } of this.cases)
      body.push(` ${key} {${msg.map(cmp).join('')}}`)
    const len = body.reduce((len, s) => len + s.length, 0)
    const maxLen = MAX_LINE_LENGTH - indent.length
    return len > maxLen || body.some(s => s.includes('\n'))
      ? body.join(`\n${indent} `) + `\n${indent}}`
      : body.join('') + '}'
  }
}
