const babel = require('babel-core')
const fs = require('fs')
const tmp = require('tmp')
const util = require('util')
const YAML = require('yaml')

const plugin = require('../')

const readFile = util.promisify(fs.readFile)
const transformFile = util.promisify(babel.transformFile)
const writeFile = util.promisify(fs.writeFile)

const parse = (js) => {
  const jsFile = tmp.fileSync({ postfix: '.js' })
  const msgFile = tmp.fileSync({ postfix: '.messages.yaml' })
  const plugins = [[plugin, { filePath: msgFile.name }]]
  return writeFile(jsFile.fd, js)
    .then(() => transformFile(jsFile.name, { plugins }))
    .then(() => readFile(msgFile.name, 'utf8'))
    .then(src => YAML.parse(src))
}

test('select & plural', () => {
  const js = `
import { plural, select } from 'messages';
var foo = 'FOO', bar = 'BAR'
var baz = {
  zzz: select(foo, {
  bar: 'U',
  foo: 'X' + plural(bar, {
    one: bar,
    other: 'N'
  })
})};
var baz_zzz = plural(foo, { other: 'Z' })`
  const expected = {
    baz_zzz_0: `{foo, select,\n  bar {U}\n  foo {X{bar, plural, one {#} other {N}}}\n}`,
    baz_zzz_1: `{foo, plural, other {Z}}`
  }
  return parse(js).then(obj => expect(obj).toMatchObject(expected))
})

/*
it('works', () => {
  const msgFile = tmp.fileSync({ postfix: '.messages.yaml' })
  const msg = { string: 'prev' }
  const js = `import msg from 'messages'; var foo = msg\`string\`; var bar = msg({a:1});`
  return writeFile(msgFile.fd, yaml.safeDump(msg))
    .then(() => parse(msgFile.name, js))
    .then(doc => expect(doc).toMatchObject({ string: 'prev' }))
})

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

it('Parses one variable', () => {
  const msgFilename = tmp.tmpNameSync({ postfix: '.messages.yaml' })
  const js = `
import msg from '${msgFilename}';
var foo = 'foo';
var bar = msg\`var \${foo}\`;`
  return parse(msgFilename, js)
    .then(doc => expect(doc).toMatchObject({ 'var {0}': 'var {0}' }))
})

it('Parses simple expression', () => {
  const msgFilename = tmp.tmpNameSync({ postfix: '.messages.yaml' })
  const js = `
import msg from '${msgFilename}';
var bar = msg\`var \${1 + 1}\`;`
  return parse(msgFilename, js)
    .then(doc => expect(doc).toMatchObject({ 'var {0}': 'var {0}' }))
})
*/
