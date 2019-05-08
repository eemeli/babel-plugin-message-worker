const babel = require('babel-core')
const { source } = require('common-tags')
const fs = require('fs')
const tmp = require('tmp')
const util = require('util')
const YAML = require('yaml')

const plugin = require('../')

const readFile = util.promisify(fs.readFile)
const transformFile = util.promisify(babel.transformFile)
const writeFile = util.promisify(fs.writeFile)

const testParse = (js, expected) => {
  const jsFile = tmp.fileSync({ postfix: '.js' })
  const msgFile = tmp.fileSync({ postfix: '.messages.yaml' })
  const plugins = [[plugin, { filePath: msgFile.name }]]
  return writeFile(jsFile.fd, js)
    .then(() => transformFile(jsFile.name, { plugins }))
    .then(() => readFile(msgFile.name, 'utf8'))
    .then(src => {
      const obj = YAML.parse(src)
      expect(obj).toMatchObject(expected)
    })
}

test('ordinal', () => {
  const js = source`
    import { ordinal } from 'messages'
    var bar = 'BAR'
    var baz = ordinal(bar, { one: bar, other: 'N' })`
  return testParse(js, {
    baz: `{bar, selectordinal, one {#} other {N}}`
  })
})

test('plural in select in object', () => {
  const js = source`
    import { plural, select } from 'messages'
    var foo = 'FOO', bar = 'BAR'
    var baz = {
      zzz: select(foo, {
      bar: 'U',
      foo: 'X' + plural(bar, {
        one: bar,
        other: 'N'
      })
    })}
    var baz_zzz = plural(foo, { other: 'Z' })`
  return testParse(js, {
    baz_zzz_0: source`
      {foo, select,
        bar {U}
        foo {X{bar, plural, one {#} other {N}}}
      }`,
    baz_zzz_1: `{foo, plural, other {Z}}`
  })
})

test('plural in template literal in select', () => {
  const js = source`
    import { plural, select } from 'messages'
    var foo = 'FOO', bar = 'BAR'
    var baz = select(foo, {
      bar: 'U',
      foo: \`X\${plural(bar, {
        one: bar,
        other: 'N'
      })}Y\`
    })`
  return testParse(js, {
    baz: source`
      {foo, select,
        bar {U}
        foo {X{bar, plural, one {#} other {N}}Y}
      }`
  })
})

describe('template literal', () => {
  test('default import', () => {
    const js = source`
      import msg from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${foo}\${bar}\``
    return testParse(js, { baz: `MSG {foo}{bar}` })
  })

  test('named import', () => {
    const js = source`
      import { msg } from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${foo}\${bar}\``
    return testParse(js, { baz: `MSG {foo}{bar}` })
  })

  test('bare string', () => {
    const js = source`
      import msg from 'messages'
      var baz = msg\`MSG\``
    return testParse(js, { baz: `MSG` })
  })

  test('variable concatenation', () => {
    const js = source`
      import msg from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${foo + 'X' + bar}\``
    return testParse(js, { baz: `MSG {foo}X{bar}` })
  })

  test('wrapped function', () => {
    const js = source`
      import msg from 'messages'
      function foo() { return 'FOO' }
      var baz = msg\`MSG \${foo()}\``
    return testParse(js, { baz: `MSG {0}` })
  })

  test('wrapped select', () => {
    const js = source`
      import msg, { select } from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${select(foo, { bar: 'U', foo: foo })}\${bar}\``
    return testParse(js, { baz: `MSG {foo, select, bar {U} foo {{foo}}}{bar}` })
  })
})

/*
it('Requires `include` parameter', () => {
  const example = `import './x'; var foo = 1`
  expect(() => babel.transform(example, { plugins: [plugin] })).toThrow()
  expect(() => babel.transform(example, { plugins: [
    [plugin, { include: /x/ }]
  ] })).not.toThrow()
})
*/
