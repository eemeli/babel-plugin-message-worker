const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const {
  parseMsgFunction,
  parseMsgTemplate,
  parsePlural,
  parseSelect
} = require('./parse')

// this: PluginPass, babel-core/src/transformation/plugin-pass.js
//   #file: File
//   #key: plugin.key
//   #opts: plugin.options || {}
//   #filename: file.opts.filename
//   #set(key, val)
//   #get(key)
//
// state === this.file, babel-core/src/transformation/file/file.js
//   #opts: options || {}
//   #code: string
//   #ast: object
//   #shebang: string || null
//   #inputMap: object || null
//   #path: NodePath
//   #scope: Scope

const getImportParsers = ({ filename, opts }, { value }) => {
  if (value[0] === '.') {
    if (!filename) return null
    value = path.resolve(path.dirname(filename), target)
  }
  return opts.imports[value]
}

const getMessages = values => {
  const messages = Array.from(values)
  messages.sort((a, b) => (a.path.node.start < b.path.node.start ? -1 : 1))
  for (let i = 0; i < messages.length - 1; ++i) {
    const { key } = messages[i]
    const match = [i]
    for (let j = i + 1; j < messages.length; ++j) {
      if (messages[j].key === key) match.push(j)
    }
    if (match.length > 1) {
      for (let k = 0; k < match.length; ++k) messages[k].key += `_${k}`
      i = -1 // in case we created a new conflict
    }
  }
  return messages
}

const getFilePath = ({ filePath, locales }, { filename }) => {
  if (!path.isAbsolute(filePath))
    filePath = path.resolve(process.cwd(), filePath)
  return filePath.replace('[locale]', locales[0])
  // TODO: handle sourcepath
}

module.exports = function(babel) {
  return {
    pre(state) {
      this.opts = Object.assign(
        {
          filePath: 'messages/[locale].yaml',
          locales: ['en'],
          messagePath: '[sourcepath]/[name]',
          imports: {}
        },
        this.opts
      )
      if (!this.opts.imports.hasOwnProperty('messages')) {
        const msg = {
          CallExpression: parseMsgFunction,
          TaggedTemplateExpression: parseMsgTemplate
        }
        this.opts.imports.messages = {
          default: msg,
          msg,
          plural: { CallExpression: parsePlural },
          select: { CallExpression: parseSelect }
        }
      }
    },

    visitor: {
      ImportDeclaration(path) {
        const { source, specifiers } = path.node
        const importParsers = getImportParsers(this, source)
        if (!importParsers) return
        for (const { imported, local, type } of specifiers) {
          let parsers
          switch (type) {
            case 'ImportNamespaceSpecifier':
              throw path.buildCodeFrameError(
                'Namespace imports ("* as foo") are not supported for message functions'
              )
            case 'ImportDefaultSpecifier':
              parsers = importParsers.default
              break
            default:
              parsers = importParsers[imported.name]
          }
          if (parsers) {
            for (const { parent: node } of path.scope.getBinding(local.name)
              .referencePaths) {
              const parse = parsers[node.type]
              if (parse) this.set(node, parse)
            }
          }
        }
      },

      'CallExpression|TaggedTemplateExpression'(path) {
        const parse = this.get(path.node)
        if (parse) this.set(path.node, parse(this, path))
      }
    },

    post(state) {
      const filePath = getFilePath(this.opts, state.opts)
      const messages = getMessages(this.values())

      const doc = new YAML.Document()
      doc.contents = {}
      //doc.contents = YAML.createNode({})
      for (const msg of messages) {
        doc.contents[msg.key] = msg.compileMessage()
        //const node = YAML.createNode(msg.compileMessage())
        //node.type = 'BLOCK_LITERAL'
        //doc.set(msg.key, node)
      }
      //for (let i = 1; i < doc.contents.items.length; ++i)
      //  doc.contents.items[i].spaceBefore = true
      fs.writeFileSync(filePath, String(doc))
    }
  }
}
