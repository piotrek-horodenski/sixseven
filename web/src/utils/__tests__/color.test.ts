import { describe, it, expect } from 'vitest'
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, hexToHsv, hsvToHex,
  hueToHex, isValidHex,
  rgbToHsl, hslToRgb, hexToHsl, hslToHex,
  type HSV, type HSL,
} from '../color'

describe('color utilities', () => {
  describe('hexToRgb', () => {
    it('parses black', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('parses white', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    })

    it('parses red', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('parses arbitrary color', () => {
      expect(hexToRgb('#d4953d')).toEqual({ r: 212, g: 149, b: 61 })
    })
  })

  describe('rgbToHex', () => {
    it('converts black', () => {
      expect(rgbToHex(0, 0, 0)).toBe('#000000')
    })

    it('converts white', () => {
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
    })

    it('converts arbitrary color', () => {
      expect(rgbToHex(212, 149, 61)).toBe('#d4953d')
    })
  })

  describe('hex → HSV → hex round-trip', () => {
    const cases = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#d4953d', '#8b5cf6']

    cases.forEach(hex => {
      it(`round-trips ${hex}`, () => {
        const hsv = hexToHsv(hex)
        const result = hsvToHex(hsv)
        expect(result).toBe(hex)
      })
    })
  })

  describe('rgbToHsv', () => {
    it('black has zero saturation and value', () => {
      const hsv = rgbToHsv(0, 0, 0)
      expect(hsv.s).toBe(0)
      expect(hsv.v).toBe(0)
    })

    it('white has zero saturation and full value', () => {
      const hsv = rgbToHsv(255, 255, 255)
      expect(hsv.s).toBe(0)
      expect(hsv.v).toBe(100)
    })

    it('pure red has hue 0, full saturation and value', () => {
      const hsv = rgbToHsv(255, 0, 0)
      expect(hsv.h).toBe(0)
      expect(hsv.s).toBe(100)
      expect(hsv.v).toBe(100)
    })

    it('pure green has hue 120', () => {
      const hsv = rgbToHsv(0, 255, 0)
      expect(hsv.h).toBe(120)
    })

    it('pure blue has hue 240', () => {
      const hsv = rgbToHsv(0, 0, 255)
      expect(hsv.h).toBe(240)
    })
  })

  describe('hsvToRgb', () => {
    it('converts pure red', () => {
      expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('converts pure green', () => {
      expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 })
    })

    it('converts pure blue', () => {
      expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual({ r: 0, g: 0, b: 255 })
    })

    it('converts black', () => {
      expect(hsvToRgb({ h: 0, s: 0, v: 0 })).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('converts white', () => {
      expect(hsvToRgb({ h: 0, s: 0, v: 100 })).toEqual({ r: 255, g: 255, b: 255 })
    })
  })

  describe('hueToHex', () => {
    it('hue 0 is red', () => {
      expect(hueToHex(0)).toBe('#ff0000')
    })

    it('hue 120 is green', () => {
      expect(hueToHex(120)).toBe('#00ff00')
    })

    it('hue 240 is blue', () => {
      expect(hueToHex(240)).toBe('#0000ff')
    })
  })

  describe('isValidHex', () => {
    it('accepts valid 6-char hex', () => {
      expect(isValidHex('#ff0000')).toBe(true)
      expect(isValidHex('#d4953d')).toBe(true)
      expect(isValidHex('#ABCDEF')).toBe(true)
    })

    it('rejects invalid values', () => {
      expect(isValidHex('#fff')).toBe(false)
      expect(isValidHex('ff0000')).toBe(false)
      expect(isValidHex('#gggggg')).toBe(false)
      expect(isValidHex('#ff00001')).toBe(false)
      expect(isValidHex('')).toBe(false)
    })
  })

  describe('HSL conversions', () => {
    it('hex → HSL → hex round-trip for primary colors', () => {
      const cases = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000']
      cases.forEach(hex => {
        const hsl = hexToHsl(hex)
        const result = hslToHex(hsl)
        expect(result).toBe(hex)
      })
    })

    it('rgbToHsl for pure red', () => {
      const hsl = rgbToHsl(255, 0, 0)
      expect(hsl.h).toBe(0)
      expect(hsl.s).toBe(100)
      expect(hsl.l).toBe(50)
    })

    it('rgbToHsl for white', () => {
      const hsl = rgbToHsl(255, 255, 255)
      expect(hsl.s).toBe(0)
      expect(hsl.l).toBe(100)
    })

    it('rgbToHsl for black', () => {
      const hsl = rgbToHsl(0, 0, 0)
      expect(hsl.s).toBe(0)
      expect(hsl.l).toBe(0)
    })

    it('hslToRgb for pure red', () => {
      expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('hslToRgb for pure green', () => {
      expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 })
    })
  })
})
