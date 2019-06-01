const t = require('babel-types')
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
    if (this.variable.isLiteral()) {
      const msg = `Expected a non-literal value as the first ${name}() argument`
      throw this.variable.buildCodeFrameError(msg)
    }

    this.arg = path.get('arguments.1')
    if (!this.arg.isObjectExpression()) {
      const msg = `Expected a literal object as the second ${name}() argument`
      throw this.arg.buildCodeFrameError(msg)
    }

    const opt = path.get('arguments.2')
    if (opt) this.parseOptions(opt)
  }

  parseVars() {
    this.vars = Message.accumulateVars([this.variable])
    for (const { msg } of this.cases) Message.accumulateVars(msg, this.vars)
    return this.vars
  }

  parseOptions(opt) {
    if (!opt.isObjectExpression()) {
      const msg = `Expected a literal object as the third ${name}() argument`
      throw opt.buildCodeFrameError(msg)
    }
    for (const { key, type, value } of opt.node.properties) {
      if (type !== 'ObjectProperty') {
        const msg = `The options parameter does not support ${type}`
        throw opt.buildCodeFrameError(msg)
      }
      const keyName = t.isIdentifier(key) ? key.name : String(key.value)
      if (!t.isLiteral(value)) {
        const msg = `Expected literal option value, but found ${value.type}`
        throw opt.buildCodeFrameError(msg)
      }
      this.options.set(keyName, value.value)
    }
  }

  get numberOptions() {
    if (this._numOpt === undefined) {
      this._numOpt = [
        'minimumIntegerDigits',
        'minimumFractionDigits',
        'maximumFractionDigits',
        'minimumSignificantDigits',
        'maximumSignificantDigits',
        'type'
      ]
        .filter(key => this.options.has(key))
        .map(key => `${key}: ${JSON.stringify(this.options.get(key))}`)
        .join(', ')
    }
    return this._numOpt
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
      indent: `${indent}     `,
      path: this.arg,
      vars: vars || this.vars,
      wrapVar: name => `{$${name}}`
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
    const numOpt = this.numberOptions
    const selArg = numOpt ? `NUMBER($${varName}, ${numOpt})` : `$${varName}`

    const body = [`{ ${selArg} ->`]
    const cmp = compileMessagePart(ctx)
    let hasOther = false
    for (const { key, msg } of this.cases) {
      let def = ' '
      if (key === 'other') {
        def = '*'
        hasOther = true
      }
      body.push(`${def}[${key}] ${msg.map(cmp).join('')}`)
    }
    if (!hasOther) body.push('*[other]')
    return body.join(`\n${indent}  `) + `\n${indent}}`
  }
}
