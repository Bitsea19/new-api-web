# Build the dashboard into a static bundle.
#
# The frontend is deployed on its own, independently of the backend: this
# image contains nothing but static files and a web server. The backend's
# address is baked in at build time through VITE_API_BASE_URL.

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# The backend's public URL. Empty means "same origin", which requires a
# reverse proxy to route the API paths to the backend. Set it to the
# backend's absolute URL for a separated deployment.
ARG VITE_API_BASE_URL=""
ARG VITE_REACT_APP_VERSION=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_REACT_APP_VERSION=${VITE_REACT_APP_VERSION}

RUN DISABLE_ESLINT_PLUGIN='true' bun run build

# Serve the built bundle.
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
