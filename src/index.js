module.exports = function (babel) {
  return {
    pre (state) {
      this.messages = {}
    },
    visitor: {
      ImportDeclaration (path, { opts: { include } }) {
        const { source, specifiers } = path.node
        if (!include) throw path.buildCodeFrameError('Required parameter: include')
        if (!Array.isArray) include = [include]
        if (include.some(re => re.test(source.value))) {
          const node = specifiers.find(({ type }) => type === 'ImportDefaultSpecifier')
          if (node) this.messages[node.local.name] = []
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
      console.log('messages', this.messages)
    }
  }
}
