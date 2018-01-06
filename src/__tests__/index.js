const babel = require('babel-core')
const fs = require('fs')
const yaml = require('js-yaml')
const tmp = require('tmp')
const util = require('util')

const plugin = require('../')

const readFile = util.promisify(fs.readFile)
const transformFile = util.promisify(babel.transformFile)
const writeFile = util.promisify(fs.writeFile)

const parse = (msgFilename, js) => {
  const jsFile = tmp.fileSync({ postfix: '.js' })
  const plugins = [[plugin, { include: /\.messages\.yaml$/ }]]
  return writeFile(jsFile.fd, js)
    .then(() => transformFile(jsFile.name, { plugins }))
    .then(() => readFile(msgFilename, 'utf8'))
    .then(data => yaml.safeLoad(data))
}

it('Requires `include` parameter', () => {
  const example = `import './x'; var foo = 1`
  expect(() => babel.transform(example, { plugins: [plugin] })).toThrow()
  expect(() => babel.transform(example, { plugins: [
    [plugin, { include: /x/ }]
  ] })).not.toThrow()
})

it('Parses bare string', () => {
  const msgFilename = tmp.tmpNameSync({ postfix: '.messages.yaml' })
  const js = `import msg from '${msgFilename}'; var foo = msg\`string\``
  return parse(msgFilename, js)
    .then(doc => expect(doc).toMatchObject({ string: 'string' }))
})

it('Keeps previously set keys', () => {
  const msgFile = tmp.fileSync({ postfix: '.messages.yaml' })
  const msg = { string: 'prev' }
  const js = `import msg from '${msgFile.name}'; var foo = msg\`string\``
  return writeFile(msgFile.fd, yaml.safeDump(msg))
    .then(() => parse(msgFile.name, js))
    .then(doc => expect(doc).toMatchObject({ string: 'prev' }))
})
