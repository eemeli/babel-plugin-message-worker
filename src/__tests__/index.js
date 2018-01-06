const babel = require('babel-core')
const fs = require('fs')
const yaml = require('js-yaml')
const tmp = require('tmp')

const plugin = require('../')

it('Requires `include` parameter', () => {
  const example = `import './x'; var foo = 1`
  expect(() => babel.transform(example, { plugins: [plugin] })).toThrow()
  expect(() => babel.transform(example, { plugins: [
    [plugin, { include: /x/ }]
  ] })).not.toThrow()
})

it('Parses bare string', (done) => {
  const msgFilename = tmp.tmpNameSync({ postfix: '.messages.yaml' })
  const jsFile = tmp.fileSync({ postfix: '.js' })
  const js = `import msg from '${msgFilename}'; var foo = msg\`string\``
  fs.write(jsFile.fd, js, err => {
    if (err) throw err
    const plugins = [[plugin, { include: /\.messages\.yaml$/ }]]
    babel.transformFile(jsFile.name, { plugins }, err => {
      if (err) throw err
      fs.readFile(msgFilename, 'utf8', (err, data) => {
        if (err) throw err
        const doc = yaml.safeLoad(data)
        expect(doc).toMatchObject({ string: 'string' })
        done()
      })
    })
  })
})

it('Keeps previously set keys', (done) => {
  const msgFile = tmp.fileSync({ postfix: '.messages.yaml' })
  const msg = { string: 'prev' }
  fs.writeFileSync(msgFile.fd, yaml.safeDump(msg))
  const jsFile = tmp.fileSync({ postfix: '.js' })
  const js = `import msg from '${msgFile.name}'; var foo = msg\`string\``
  fs.write(jsFile.fd, js, err => {
    if (err) throw err
    const plugins = [[plugin, { include: /\.messages\.yaml$/ }]]
    babel.transformFile(jsFile.name, { plugins }, err => {
      if (err) throw err
      fs.readFile(msgFile.fd, 'utf8', (err, data) => {
        if (err) throw err
        const doc = yaml.safeLoad(data)
        expect(doc).toMatchObject({ string: 'prev' })
        done()
      })
    })
  })
})
