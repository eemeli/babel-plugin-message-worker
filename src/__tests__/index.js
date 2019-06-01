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

describe('select', () => {
  test('simple', () => {
    const js = source`
      import { select } from 'messages'
      var bar = 'BAR'
      var baz = select(bar, { one: bar, other: 'N' })`
    return testParse(js, {
      baz: source`
        { $bar ->
           [one] {$bar}
          *[other] N
        }`
    })
  })

  describe('options', () => {
    test('minimumFractionDigits: 2', () => {
      const js = source`
        import { select } from 'messages'
        var bar = 'BAR'
        var baz = select(bar, { one: bar, other: 'N' }, { minimumFractionDigits: 2 })`
      return testParse(js, {
        baz: source`
          { NUMBER($bar, minimumFractionDigits: 2) ->
             [one] {$bar}
            *[other] N
          }`
      })
    })

    test('type: "ordinal"', () => {
      const js = source`
        import { select } from 'messages'
        var bar = 'BAR'
        var baz = select(bar, { one: bar, other: 'N' }, { type: 'ordinal' })`
      return testParse(js, {
        baz: source`
          { NUMBER($bar, type: "ordinal") ->
             [one] {$bar}
            *[other] N
          }`
      })
    })

    test('multiple', () => {
      const js = source`
        import { select } from 'messages'
        var bar = 'BAR'
        var baz = select(bar, { one: bar, other: 'N' }, { type: 'ordinal', minimumFractionDigits: 2 })`
      return testParse(js, {
        baz: source`
          { NUMBER($bar, minimumFractionDigits: 2, type: "ordinal") ->
             [one] {$bar}
            *[other] N
          }`
      })
    })
  })
})

test('select in select in object', () => {
  const js = source`
    import { select } from 'messages'
    var foo = 'FOO', bar = 'BAR'
    var baz = {
      zzz: select(foo, {
      bar: 'U',
      foo: 'X' + select(bar, {
        one: bar,
        other: 'N'
      })
    })}
    var baz_zzz = select(foo, { other: 'Z' })`
  return testParse(js, {
    baz_zzz_0: source`
      { $foo ->
         [bar] U
         [foo] X{ $bar ->
              [one] {$bar}
             *[other] N
           }
        *[other]
      }`,
    baz_zzz_1: source`
      { $foo ->
        *[other] Z
      }`
  })
})

test('select in template literal in select', () => {
  const js = source`
    import { select } from 'messages'
    var foo = 'FOO', bar = 'BAR'
    var baz = select(foo, {
      bar: 'U',
      foo: \`X\${select(bar, {
        one: bar,
        other: 'N'
      })}Y\`
    })`
  return testParse(js, {
    baz: source`
      { $foo ->
         [bar] U
         [foo] X{ $bar ->
              [one] {$bar}
             *[other] N
           }Y
        *[other]
      }`
  })
})

describe('template literal', () => {
  test('default import', () => {
    const js = source`
      import msg from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${foo}\${bar}\``
    return testParse(js, { baz: `MSG {$foo}{$bar}` })
  })

  test('named import', () => {
    const js = source`
      import { msg } from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${foo}\${bar}\``
    return testParse(js, { baz: `MSG {$foo}{$bar}` })
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
    return testParse(js, { baz: `MSG {$foo}X{$bar}` })
  })

  test('wrapped function', () => {
    const js = source`
      import msg from 'messages'
      function foo() { return 'FOO' }
      var baz = msg\`MSG \${foo()}\``
    return testParse(js, { baz: `MSG {$arg0}` })
  })

  test('wrapped select', () => {
    const js = source`
      import msg, { select } from 'messages'
      var foo = 'FOO', bar = 'BAR'
      var baz = msg\`MSG \${select(foo, { bar: 'U', foo: foo })}\${bar}\``
    return testParse(js, {
      baz: source`
        MSG { $foo ->
           [bar] U
           [foo] {$foo}
          *[other]
        }{$bar}`
    })
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
