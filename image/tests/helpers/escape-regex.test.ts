import { describe, it, expect } from 'vitest'
import { escapeRegex } from '../../src/controllers/helpers/escape-regex'

describe('escapeRegex', () => {
  it('escapes regex special characters', () => {
    expect(escapeRegex('hello.world')).toBe('hello\\.world')
    expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?')
    expect(escapeRegex('foo^bar$baz')).toBe('foo\\^bar\\$baz')
    expect(escapeRegex('a{1}b(2)c|d')).toBe('a\\{1\\}b\\(2\\)c\\|d')
    expect(escapeRegex('[test]')).toBe('\\[test\\]')
    expect(escapeRegex('back\\slash')).toBe('back\\\\slash')
  })

  it('passes through normal strings unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello')
    expect(escapeRegex('nature')).toBe('nature')
    expect(escapeRegex('test 123')).toBe('test 123')
    expect(escapeRegex('')).toBe('')
  })
})
