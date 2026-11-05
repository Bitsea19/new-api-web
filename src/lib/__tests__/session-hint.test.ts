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
import { afterEach, describe, expect, it } from 'vitest'

import {
  SESSION_HINT_COOKIE_NAME,
  SESSION_HINT_STORAGE_KEY,
  hasSessionHint,
  hasSessionHintMirror,
  readCookie,
  writeSessionHintMirror,
} from '../session-hint'

function clearHintCookie(): void {
  document.cookie = `${SESSION_HINT_COOKIE_NAME}=; path=/; max-age=0`
}

afterEach(() => {
  clearHintCookie()
  localStorage.removeItem(SESSION_HINT_STORAGE_KEY)
})

describe('readCookie', () => {
  it('reads a value out of a cookie header', () => {
    expect(readCookie('a=1; new_api_has_session=1', 'new_api_has_session')).toBe(
      '1'
    )
  })

  it('returns null for a cookie that is not there', () => {
    expect(readCookie('a=1; b=2', 'new_api_has_session')).toBeNull()
  })
})

describe('the session hint mirror', () => {
  it('is absent until something records it', () => {
    expect(hasSessionHintMirror()).toBe(false)
  })

  it('records that a session exists', () => {
    writeSessionHintMirror(true)
    expect(hasSessionHintMirror()).toBe(true)
    expect(localStorage.getItem(SESSION_HINT_STORAGE_KEY)).toBe('1')
  })

  it('clears the record when the session is gone', () => {
    writeSessionHintMirror(true)
    writeSessionHintMirror(false)
    expect(hasSessionHintMirror()).toBe(false)
    expect(localStorage.getItem(SESSION_HINT_STORAGE_KEY)).toBeNull()
  })
})

describe('hasSessionHint', () => {
  it('is true when the server set the hint cookie', () => {
    document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; path=/`
    expect(hasSessionHint()).toBe(true)
  })

  it('is true from the mirror when the cookie cannot be read', () => {
    // A dashboard on another origin never receives the backend's cookie, so
    // the mirror is the only record it can consult.
    writeSessionHintMirror(true)
    expect(hasSessionHint()).toBe(true)
  })

  it('is false when neither the cookie nor the mirror says anything', () => {
    expect(hasSessionHint()).toBe(false)
  })
})
