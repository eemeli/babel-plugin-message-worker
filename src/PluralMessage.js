const SelectMessage = require('./SelectMessage')

module.exports = class PluralMessage extends SelectMessage {
  static parseOrdinal(plugin, path) {
    const msg = new PluralMessage(plugin, path, 'ordinal')
    msg.vars = msg.parseVars()
    return msg
  }

  static parsePlural(plugin, path) {
    const msg = new PluralMessage(plugin, path, 'plural')
    msg.vars = msg.parseVars()
    return msg
  }

  constructor(plugin, path, name = 'plural') {
    super(plugin, path, name)
    for (const c of this.cases) {
      if (Number.isInteger(Number(c.key))) {
        c.key = `=${c.key}`
      } else if (
        !['zero', 'one', 'two', 'few', 'many', 'other'].includes(c.key)
      ) {
        throw path.buildCodeFrameError(
          `Expected only valid plural categories as ${name}() cases`
        )
      }
    }
  }
}
