# new-api-web

The dashboard for [new-api](https://github.com/QuantumNous/new-api), packaged
as a standalone project.

The backend and the frontend are deployed independently: this project builds a
static bundle that is served by any web server, and the backend runs as a pure
API server that knows nothing about the bundle.

---

## How the two halves find each other

Everything hinges on one build-time value:

| Value                | Meaning                                                       |
| -------------------- | ------------------------------------------------------------- |
| `VITE_API_BASE_URL` | The backend's public URL. Empty means "same origin".           |

Two deployments are supported, and they differ only in this value:

**Same origin** — `VITE_API_BASE_URL` is empty. Every request stays relative
(`/api/user/self`) and the browser resolves it against the page's own origin.
Use this when a reverse proxy serves both, or during development, where the
dev server proxies the API paths to the backend.

**Separated** — `VITE_API_BASE_URL=https://api.example.com`. Every request
becomes absolute and cross-origin. The backend then needs three settings of
its own; see [Backend configuration](#backend-configuration).

The value is baked into the bundle at build time. A static SPA cannot read
its runtime environment, so changing the API address means rebuilding.

---

## Getting started

```bash
bun install
cp .env.example .env      # optional; the defaults work out of the box
bun run dev               # http://localhost:5173
```

The dev server proxies `/api`, `/v1`, `/v1beta`, `/mj` and `/pg` to
`http://localhost:3000`. Point it elsewhere with `VITE_REACT_APP_SERVER_URL`.

### Build

```bash
bun run build              # -> dist/
```

---

## Deployment

### Docker

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg VITE_REACT_APP_VERSION=v1.2.3 \
  -t new-api-web:latest .

docker run -d -p 8080:80 new-api-web:latest
```

The image contains the static bundle and an nginx that serves it with an
SPA fallback, so every dashboard route resolves to `index.html`.

### Static hosting

`dist/` is a plain static bundle. Serve it from any web server or CDN, with
one requirement: **unknown paths must return `index.html`**, not a 404. The
dashboard is a single-page application and owns its own routes.

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## Backend configuration

A separated deployment is only complete once the backend agrees with the
frontend. The backend needs to know:

| Variable                  | Value                              | Why                                                             |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `FRONTEND_BASE_URL`       | `https://app.example.com`          | Browser navigation is redirected here; OAuth callbacks, password-reset links and payment returns use it. |
| `API_BASE_URL`            | `https://api.example.com`          | The backend's own public URL, used for the image proxy, video content and payment notify callbacks. |
| `CORS_ALLOWED_ORIGINS`    | `https://app.example.com`          | The browser origin allowed to call the API with credentials.     |
| `SESSION_COOKIE_SECURE`   | `true`                             | The Refresh Cookie must be `Secure` to survive a cross-site request. |
| `SESSION_COOKIE_SAME_SITE`| `none` — only across registrable domains | See below.                                                |

`CORS_ALLOWED_ORIGINS` must list **exact origins**. A wildcard is invalid
alongside credentials: the browser rejects the response outright, so a
wildcard here would look like a working configuration while breaking every
sign-in.

`SESSION_COOKIE_SAME_SITE` needs to be relaxed only when the frontend and the
backend are on **different registrable domains**. Two subdomains of one
registrable domain (`app.example.com` and `api.example.com`) are the same
site, so the default `strict` already works there.

The backend also needs the frontend's origin to be trusted for the session
cookie's origin guard. `FRONTEND_BASE_URL` is trusted automatically, so
`SESSION_COOKIE_TRUSTED_URL` is only needed for additional origins.

---

## How the code reaches the API

`src/lib/api-base.ts` is the single place that knows about the API's address:

```ts
import { API_BASE_URL, apiUrl, apiOrigin } from '@/lib/api-base'
```

- `API_BASE_URL` — the configured base URL, empty when same-origin.
- `apiUrl(path)` — an API path, absolute when separated. Use it for `fetch`.
- `absoluteApiUrl(path)` — always absolute. Use it for `EventSource` and
  streams, which resolve their URL against the document.
- `apiOrigin()` — the origin that serves the API. Use it when building a link
  a user is expected to copy: a curl example, a "your API is at" label.

The two axios instances — `@/lib/http-client` and `@/lib/auth-session` — take
`API_BASE_URL` as their `baseURL`, so ordinary API calls need no changes.

### The session hint

The backend writes a `new_api_has_session` cookie alongside the `HttpOnly`
Refresh Cookie, so the dashboard can skip a refresh that would certainly
fail. In a separated deployment that cookie lands on the **backend's** origin,
which the dashboard's `document.cookie` cannot see.

The dashboard therefore mirrors the hint into `localStorage`
(`newapi:has-session`), which is scoped to its own origin — the origin that
needs the answer. `src/lib/session-hint.ts` owns the mirror; it is written on
sign-in and refresh, and cleared on sign-out.

The hint is an optimization, never an authorization signal. A missing hint
means "not worth a request right now", never "signed out".

---

## Project layout

```
src/
  lib/
    api-base.ts        The API's address, and the helpers built on it
    http-client.ts     The shared axios instance
    auth-session.ts    Refresh, rotation, and the session lifecycle
    session-hint.ts    The server's hint cookie, and its localStorage mirror
  features/            Feature modules, each with its own components/ and lib/
  routes/              File-based routes (TanStack Router)
```

---

## Scripts

| Script                  | What it does                              |
| ----------------------- | ----------------------------------------- |
| `bun run dev`           | Dev server with the API proxy             |
| `bun run build`         | Production build into `dist/`             |
| `bun run preview`       | Serve the production build locally       |
| `bun run typecheck`     | Type check                                |
| `bun run lint`          | Lint                                      |
| `bun run format`        | Format                                    |
| `bun run test`          | Unit and component tests                  |

---

## License

The dashboard is licensed under the same terms as the backend: AGPL-3.0, with
a commercial license available. See the backend's `LICENSE` and
`THIRD-PARTY-LICENSES.md`.
