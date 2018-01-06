const fs = require('fs')
const yaml = require('js-yaml')
const path = require('path')

const resolveImportPath = (source, target) => (
  path.isAbsolute(target) ? target :
    (!source || target[0] !== '.') ? null :
      path.resolve(path.dirname(source), target)
)

module.exports = function (babel) {
  return {
    pre ({ opts: { filename } }) {
      this.filename = filename
      this.messages = {}
      this.files = {}
    },
    visitor: {
      ImportDeclaration ({ node: { source, specifiers } }, { opts: { include } }) {
        const filepath = resolveImportPath(this.filename, source.value)
        if (!filepath) return;
        if (!include) throw new Error(
          'Required parameter for babel-plugin-message-worker: ' +
          '`include` should be a RegExp object, or an array of RegExp objects'
        )
        if (!Array.isArray(include)) include = [include]
        if (include.some(re => re.test(source.value))) {
          const node = specifiers.find(({ type }) => type === 'ImportDefaultSpecifier')
          if (node) {
            this.files[node.local.name] = filepath
            this.messages[node.local.name] = []
          }
        }
      },
      TaggedTemplateExpression ({ node: { tag: { name }, quasi: { quasis } } }) {
        if (!this.messages[name]) return
        let message = quasis[0].value.cooked
        for (let i = 1; i < quasis.length; ++i) {
          message += `{${i - 1}}${quasis[i].value.cooked}`
        }
        this.messages[name].push(message)  // file, line number
      }
    },
    post (state) {
      for (const key in this.files) {
        const filename = this.files[key]
        const messages = this.messages[key]
        let doc
        try {
          const data = fs.readFileSync(filename, 'utf8')
          doc = yaml.safeLoad(data, { filename }) // may throw YAMLException on error
          let changed = false
          messages.forEach(msg => {
            if (!doc.hasOwnProperty(msg)) {
              doc[msg] = msg
              changed = true
            }
          })
          if (!changed) continue
        } catch (err) {
          if (err.code !== 'ENOENT') throw err
          doc = messages.reduce((doc, msg) => {
            doc[msg] = msg
            return doc
          }, {})
        }
        fs.writeFileSync(filename, yaml.safeDump(doc))
      }
    }
  }
}
