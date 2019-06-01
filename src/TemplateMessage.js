const compileMessagePart = require('./compileMessagePart')
const Message = require('./Message')

module.exports = class TemplateMessage extends Message {
  static parse(plugin, path) {
    const msg = new TemplateMessage(plugin, path)
    msg.vars = msg.parseVars()
    return msg
  }

  parseVars() {
    this.parts = this.visit(this.path.get('quasi'))
    this.vars = Message.accumulateVars(this.parts)
    return this.vars
  }

  compileMessage(vars, indent = '') {
    const ctx = {
      allNamedVars: false,
      indent,
      path: this.path,
      vars: vars || this.vars,
      wrapVar: name => `{$${name}}`
    }
    if (ctx.vars.every(v => typeof v === 'string')) ctx.allNamedVars = true
    const body = this.parts.map(compileMessagePart(ctx))
    return body.join('')
  }
}
