const t = require('babel-types')
const compileMessagePart = require('./compileMessagePart')
const Message = require('./Message')

module.exports = class SelectMessage extends Message {
  static parse(plugin, path) {
    const msg = new SelectMessage(plugin, path)

    const casePath = path.get('arguments.0')
    msg.cases = msg.parseCases(casePath)

    const optPath = path.get('arguments.1')
    if (optPath) msg.options = msg.parseOptions(optPath)

    msg.argument = msg.parseArgument(msg.path.parentPath)
    msg.vars = msg.parseVars()
    return msg
  }

  constructor(plugin, path) {
    super(plugin, path)

    /** @type {{ key: string, msg: (string|Message|NodePath)[] }[]} */
    this.cases = null

    this.vars = null
  }

  parseCases(path) {
    path.assertObjectExpression()
    const cases = []
    const propCount = path.node.properties.length
    for (let i = 0; i < propCount; ++i) {
      const propPath = path.get(`properties.${i}`)
      propPath.assertObjectProperty()
      const keyPath = propPath.get('key')
      const key = keyPath.isIdentifier()
        ? keyPath.node.name
        : keyPath.isLiteral()
        ? String(keyPath.node.value)
        : null
      if (key == null)
        throw keyPath.buildCodeFrameError(
          `Keys of type ${keyPath.node.type} are not supported here`
        )
      const msg = this.visit(propPath.get('value'))
      cases.push({ key, msg })
    }
    return cases
  }

  parseOptions(path) {
    path.assertObjectExpression()
    const options = new Map()
    const propCount = path.node.properties.length
    for (let i = 0; i < propCount; ++i) {
      const propPath = path.get(`properties.${i}`)
      propPath.assertObjectProperty()
      const { key } = propPath.node
      const keyName = t.isIdentifier(key) ? key.name : String(key.value)
      const valuePath = propPath.get('value')
      valuePath.assertLiteral()
      options.set(keyName, valuePath.node.value)
    }
    return options
  }

  parseArgument(path) {
    path.assertVariableDeclarator()
    const idPath = path.get('id')
    idPath.assertIdentifier()
    const binding = path.scope.getBinding(idPath.node.name)
    for (const refPath of binding.referencePaths) {
      if (t.isCallExpression(refPath.parent)) {
        const argPath = refPath.parentPath.get('arguments.0')
        if (argPath && argPath.isIdentifier()) return argPath
      }
    }
    throw path.buildCodeFrameError('Argument not found for select expression')
  }

  parseVars() {
    const vars = Message.accumulateVars([this.argument])
    for (const { msg } of this.cases) Message.accumulateVars(msg, vars)
    return vars
  }

  getNumberOptions() {
    if (this._numOpt === undefined) {
      if (!this.options) return (this._numOpt = '')
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

  compileMessage(vars, indent = '') {
    const ctx = {
      allNamedVars: false,
      indent: `${indent}     `,
      path: this.path,
      vars: vars || this.vars,
      wrapVar: name => `{$${name}}`
    }
    let varName
    if (ctx.vars.every(v => typeof v === 'string')) {
      ctx.allNamedVars = true
      varName = this.argument.node.name
    } else {
      const q = this.argument.isIdentifier()
        ? this.argument.node.name
        : this.argument
      varName = String(ctx.vars.indexOf(q))
    }
    const numOpt = this.getNumberOptions()
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
