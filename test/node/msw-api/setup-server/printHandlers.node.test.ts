/**
 * @jest-environment node
 */
import { rest, graphql } from 'msw'
import { setupServer } from 'msw/node'

const resolver = () => void 0

const github = graphql.link('https://api.github.com')

const server = setupServer(
  rest.get('https://test.mswjs.io/book/:bookId', resolver),
  graphql.query('GetUser', resolver),
  graphql.mutation('UpdatePost', resolver),
  graphql.operation(resolver),
  github.query('GetRepo', resolver),
  github.operation(resolver),
)

beforeAll(() => {
  server.listen()
})

beforeEach(() => {
  jest.spyOn(global.console, 'log').mockImplementation()
})

afterEach(() => {
  jest.restoreAllMocks()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

test('lists all current request handlers', () => {
  server.printHandlers()

  // Test failed here, commenting so it shows up in the PR
  expect(console.log).toBeCalledTimes(6)

  expect(console.log).toBeCalledWith(`\
${'[rest] GET https://test.mswjs.io/book/:bookId'}
  Declaration: ${__filename}:12:8
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] query GetUser (origin: *)'}
  Declaration: ${__filename}:13:11
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] mutation UpdatePost (origin: *)'}
  Declaration: ${__filename}:14:11
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] all (origin: *)'}
  Declaration: ${__filename}:15:11
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] query GetRepo (origin: https://api.github.com)'}
  Declaration: ${__filename}:16:10
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] all (origin: https://api.github.com)'}
  Declaration: ${__filename}:17:10
`)
})

test('respects runtime request handlers when listing handlers', () => {
  server.use(
    rest.get('https://test.mswjs.io/book/:bookId', resolver),
    graphql.query('GetRandomNumber', resolver),
  )

  server.printHandlers()

  // Runtime handlers are prepended to the list of handlers
  // and they DON'T remove the handlers they may override.
  expect(console.log).toBeCalledTimes(8)

  expect(console.log).toBeCalledWith(`\
${'[rest] GET https://test.mswjs.io/book/:bookId'}
  Declaration: ${__filename}:76:10
`)

  expect(console.log).toBeCalledWith(`\
${'[graphql] query GetRandomNumber (origin: *)'}
  Declaration: ${__filename}:77:13
`)
})
