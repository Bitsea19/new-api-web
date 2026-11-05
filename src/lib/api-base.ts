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

/**
 * Where the backend API lives.
 *
 * The dashboard can be served from two very different places, and the
 * difference decides how every request is built:
 *
 *  - **Same origin.** The backend serves the dashboard itself (the monolith,
 *    or a reverse proxy that routes `/api` to the backend). Requests are
 *    relative: `/api/user/self`. Cookies are first-party, so they are sent
 *    without any special handling.
 *
 *  - **Separate origin.** The dashboard is deployed on its own host and the
 *    API on another. Requests must be absolute: `https://api.example.com/api/user/self`.
 *    Cookies are third-party here, which is the whole reason the backend
 *    needs `CORS_ALLOWED_ORIGINS`, a `SameSite=None` Refresh Cookie, and a
 *    `Secure` deployment.
 *
 * `VITE_API_BASE_URL` selects between them. An empty value (the default)
 * means same origin, which keeps the local development setup — the dev
 * server proxying `/api` to the backend — working exactly as before.
 *
 * The value is baked into the bundle at build time. A static SPA cannot read
 * its runtime environment, so changing the API address means rebuilding the
 * frontend.
 */

/**
 * Normalize a configured base URL.
 *
 * A trailing slash is removed so that concatenating a path never produces a
 * double slash. Everything else is left alone: the URL is used verbatim as
 * the base, and the browser resolves it.
 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * The origin a base URL points at, or `null` when it names no origin.
 *
 * `null` is deliberately distinct from the dashboard's own origin: a caller
 * that needs to know "which host serves the API" must not be handed the
 * dashboard's host and mistake it for the API's.
 */
export function baseUrlOrigin(baseUrl: string): string | null {
  if (!baseUrl) return null
  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

/**
 * Build an API path against a base URL.
 *
 * In a same-origin deployment the path is returned unchanged, so the request
 * stays relative and the browser handles it exactly as before. In a separated
 * deployment the API's origin is prepended, which is what makes the request
 * leave the dashboard's origin and carry the CORS preflight.
 */
export function buildApiUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path
  if (!path.startsWith('/')) return path
  return `${baseUrl}${path}`
}

/**
 * Build an always-absolute API path.
 *
 * Used where a URL is handed to something that resolves it against the
 * document rather than against the API: an `EventSource`, a stream reader,
 * or a link rendered into the page.
 */
export function buildAbsoluteApiUrl(
  baseUrl: string,
  path: string,
  pageOrigin: string
): string {
  if (!path.startsWith('/')) return path
  if (baseUrl) return `${baseUrl}${path}`
  return `${pageOrigin}${path}`
}

/**
 * The configured API base URL, without a trailing slash.
 *
 * An empty string means "same origin": every path is used as-is and the
 * browser resolves it against the page's own origin.
 */
export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? ''
)

/**
 * Whether the API is on a different origin than the dashboard.
 *
 * The distinction drives three things: how URLs are built, whether the
 * session hint can be read from a cookie, and whether the dashboard may
 * rely on `window.location.origin` when it builds a backend link.
 */
export function isCrossOriginApi(): boolean {
  return getApiOrigin() !== null
}

/**
 * The API's origin, or `null` when the API is on the dashboard's own origin.
 */
export function getApiOrigin(): string | null {
  return baseUrlOrigin(API_BASE_URL)
}

/**
 * The origin to use when building a link that points at the backend.
 *
 * This is the API's origin in a separated deployment, and the page's own
 * origin otherwise. It is the value that belongs in a curl example, in a
 * "your API is at" label, and in any URL a user is expected to paste into
 * another tool.
 *
 * The dashboard's own origin is only ever a fallback: a same-origin
 * deployment has exactly one origin, so there is nothing to get wrong.
 */
export function apiOrigin(): string {
  return getApiOrigin() ?? window.location.origin
}

/**
 * Build the URL of an API path.
 */
export function apiUrl(path: string): string {
  return buildApiUrl(API_BASE_URL, path)
}

/**
 * Build the absolute URL of an API path.
 */
export function absoluteApiUrl(path: string): string {
  return buildAbsoluteApiUrl(API_BASE_URL, path, window.location.origin)
}
