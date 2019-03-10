const MessageFormat = require('messageformat')
const Message = require('./Message')

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

module.exports = compileMessagePart
