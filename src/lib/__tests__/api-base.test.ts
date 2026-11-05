/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import {
  baseUrlOrigin,
  buildAbsoluteApiUrl,
  buildApiUrl,
  normalizeBaseUrl,
} from '../api-base'

describe('api-base helpers', () => {
  describe('normalizeBaseUrl', () => {
    it('removes a trailing slash so a path never doubles up', () => {
      expect(normalizeBaseUrl('https://api.example.com/')).toBe(
        'https://api.example.com'
      )
      expect(normalizeBaseUrl('https://api.example.com///')).toBe(
        'https://api.example.com'
      )
    })

    it('keeps an empty value empty', () => {
      expect(normalizeBaseUrl('')).toBe('')
      expect(normalizeBaseUrl('   ')).toBe('')
    })

    it('trims surrounding whitespace', () => {
      expect(normalizeBaseUrl('  https://api.example.com  ')).toBe(
        'https://api.example.com'
      )
    })
  })

  describe('baseUrlOrigin', () => {
    it('returns the origin of a configured base URL', () => {
      expect(baseUrlOrigin('https://api.example.com')).toBe(
        'https://api.example.com'
      )
      expect(baseUrlOrigin('https://api.example.com:8443/gateway')).toBe(
        'https://api.example.com:8443'
      )
    })

    it('returns null when there is no base URL', () => {
      expect(baseUrlOrigin('')).toBeNull()
    })

    it('returns null for a value that is not a URL', () => {
      expect(baseUrlOrigin('not-a-url')).toBeNull()
    })
  })

  describe('buildApiUrl', () => {
    it('leaves the path relative when there is no base URL', () => {
      expect(buildApiUrl('', '/api/user/self')).toBe('/api/user/self')
    })

    it('prefixes the base URL when there is one', () => {
      expect(buildApiUrl('https://api.example.com', '/api/user/self')).toBe(
        'https://api.example.com/api/user/self'
      )
    })

    it('leaves a path that is not rooted alone', () => {
      expect(buildApiUrl('https://api.example.com', 'api/user/self')).toBe(
        'api/user/self'
      )
    })
  })

  describe('buildAbsoluteApiUrl', () => {
    it('resolves against the page origin when there is no base URL', () => {
      expect(
        buildAbsoluteApiUrl('', '/pg/chat/completions', 'https://app.example.com')
      ).toBe('https://app.example.com/pg/chat/completions')
    })

    it('uses the base URL when there is one', () => {
      expect(
        buildAbsoluteApiUrl(
          'https://api.example.com',
          '/pg/chat/completions',
          'https://app.example.com'
        )
      ).toBe('https://api.example.com/pg/chat/completions')
    })
  })
})
