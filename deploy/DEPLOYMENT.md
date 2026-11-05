# 前后端分离部署指南

后端是纯 API 服务器，前端是静态资源包，两者独立构建、独立部署，通过几个环境变量互相定位。

> **本仓库是 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 前端面板的二开版本。**
> 配套后端在独立仓库 [new-api-backend](https://github.com/你的用户名/new-api-backend)，
> 同样做了前后端分离改造。
>
> 本文中出现的 `new-api-backend` 仓库路径，请替换成你自己的实际路径。

---

## 一、架构与变量

```
浏览器
  │
  ├─→ https://app.example.com   （前端：nginx 托管静态包）
  │        └─ XHR → https://api.example.com/api/...
  │
  └─→ https://api.example.com   （后端：Go API 服务器）
```

| 变量 | 配置在哪 | 作用 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 前端（构建时） | 后端的公开地址。留空 = 同源 |
| `FRONTEND_BASE_URL` | 后端（运行时） | 前端的公开地址。浏览器重定向、OAuth 回跳、密码重置链接、支付回跳都用它 |
| `API_BASE_URL` | 后端（运行时） | 后端自身的公开地址。图片代理、视频内容、支付异步通知回调用它 |
| `CORS_ALLOWED_ORIGINS` | 后端（运行时） | 允许带 Cookie 跨域访问 API 的精确 origin 白名单 |
| `SESSION_COOKIE_SECURE` | 后端（运行时） | `true` 启用 Secure Cookie + refresh/logout 的 Origin 校验 |
| `SESSION_COOKIE_SAME_SITE` | 后端（运行时） | `strict`（默认）/ `lax` / `none` |

**关键点：前端的地址是编译进产物的。** 静态页面读不到运行时环境变量，改后端地址就得重新构建前端。

---

## 二、准备域名与证书

假设：

- 前端：`https://app.example.com`
- 后端：`https://api.example.com`

两个域名要么是**同一个可注册域名的子域**（`example.com`），要么是**两个不同的可注册域名**。这决定了 Cookie 的 `SameSite` 策略：

| 情况 | `SESSION_COOKIE_SAME_SITE` |
| --- | --- |
| 同 registrable domain（`app.example.com` + `api.example.com`） | `strict` 即可 |
| 不同 registrable domain | 必须 `none`，且必须 `SESSION_COOKIE_SECURE=true` |

用 certbot 申请证书：

```bash
certbot certonly --standalone -d app.example.com -d api.example.com
```

---

## 三、部署后端

### 3.1 用 Docker Compose（从源码本地构建）

后端仓库的 `docker-compose.yml` 默认就是 `build: { context: . }`，即**在服务器上从当前目录的
`Dockerfile` 构建镜像**，不会拉取 Docker Hub 上的远程镜像。

上传后端源码到服务器（例如用 `scripts/package-for-server.sh` 打包后上传解压），然后编辑
`docker-compose.yml`：

```yaml
services:
  new-api:
    build:
      context: .
      dockerfile: Dockerfile
    image: new-api:local
    container_name: new-api
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./data:/data
    environment:
      - FRONTEND_BASE_URL=https://app.example.com
      - API_BASE_URL=https://api.example.com
      - CORS_ALLOWED_ORIGINS=https://app.example.com
      - SESSION_COOKIE_SECURE=true
      - SESSION_COOKIE_SAME_SITE=strict    # 跨可注册域名时改成 none
      - SESSION_SECRET=<改成随机字符串>     # 多机部署必填
      - TZ=Asia/Shanghai
```

启动：

```bash
docker compose up -d --build
docker compose logs -f new-api
```

> **不要**把 `image` 改回 `calciumion/new-api:latest`。那是上游官方镜像，**不包含**本二开版本的
> 前后端分离改动（`FRONTEND_BASE_URL`、纯 API 二进制、自定义 CORS 等），行为会与本文不一致。

后端的完整服务器部署步骤见
[new-api-backend 仓库的部署指南](https://github.com/你的用户名/new-api-backend/blob/main/docs/deployment/server-backend.md)。

### 3.2 用二进制

```bash
go build -o new-api          # 纯 API 服务器，不含前端
./new-api
```

### 3.3 验证后端

```bash
# 应该返回 JSON，且 server_address 是 API_BASE_URL
curl https://api.example.com/api/status

# 浏览器访问后端根路径，应该 301 到前端
curl -I https://api.example.com/
```

---

## 四、部署前端

### 4.1 Docker Compose（推荐）

前端仓库自带 `docker-compose.yml`：

```bash
cd new-api-web
cp .env.example .env
```

编辑 `.env`：

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_REACT_APP_VERSION=v1.0.0
```

构建并启动：

```bash
docker compose up -d --build
```

容器监听 `127.0.0.1:8080`，需要用反向代理对外暴露。

### 4.2 不用 Docker

```bash
cd new-api-web
bun install --frozen-lockfile
VITE_API_BASE_URL=https://api.example.com bun run build
```

产物在 `dist/`，用任意 web 服务器托管。

**必须配置 SPA 回退**：未知路径要返回 `index.html`，不能返回 404。面板自己管理路由。

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## 五、反向代理

前端仓库的 `deploy/nginx.conf` 是一份可直接改的模板，包含两个 server 块：

- `app.example.com` → `127.0.0.1:8080`（前端容器）
- `api.example.com` → `127.0.0.1:3000`（后端）

关键点：

**后端必须关闭缓冲。** 中转的响应和 SSE 会挂几分钟，开了缓冲代理会攒完整个响应才发第一个字节：

```nginx
proxy_buffering off;
proxy_read_timeout 3600s;
```

**前端 `/static/` 可以长缓存，根路径不能。** 静态资源带内容哈希，`index.html` 指向当前哈希文件，缓存久了会指向已删除的文件：

```nginx
location /static/ { add_header Cache-Control "public, immutable"; }
location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
```

---

## 六、验证清单

```bash
# 1. 后端返回 JSON，且 server_address 指向后端
curl https://api.example.com/api/status | grep server_address

# 2. CORS 预检：必须回显精确 origin，且带 Allow-Credentials
curl -i -X OPTIONS https://api.example.com/api/user/self \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type"
# 期望：Access-Control-Allow-Origin: https://app.example.com
#       Access-Control-Allow-Credentials: true

# 3. 登录，Set-Cookie 必须带 Secure
curl -i -X POST https://api.example.com/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"...","password":"..."}'
# 期望：Set-Cookie: new_api_refresh=...; Secure; SameSite=...
```

浏览器侧逐项确认：

- [ ] 打开前端，面板正常加载，无 CORS 报错
- [ ] 能登录，刷新页面后仍保持登录
- [ ] 登出后再刷新，跳回登录页
- [ ] 密码重置邮件里的链接指向前端域名
- [ ] OAuth 登录回跳正常，落在前端域名
- [ ] 支付完成后回跳到前端 `/wallet`
- [ ] 面板里显示的 API 地址是后端地址（`/api/status` 的 `server_address`）
- [ ] Passkey 注册/登录可用

---

## 七、常见问题

**登录后刷新就掉线**

Cookie 没带上。检查：

- `SESSION_COOKIE_SECURE=true` 是否设置（生产必须 HTTPS）
- 跨可注册域名时 `SESSION_COOKIE_SAME_SITE=none` 是否设置
- 浏览器是否拦截了第三方 Cookie（Chrome 的「第三方 Cookie 阻止」会直接丢弃 `SameSite=None` 的 Cookie）

**控制台报 CORS 错误**

`CORS_ALLOWED_ORIGINS` 必须是精确 origin，带 scheme、不带路径、不带尾部斜杠。写 `*` 会被浏览器直接拒绝——带凭据的请求不允许通配符 origin。

**改了后端地址，前端没生效**

前端地址是构建时固化的。重新构建：

```bash
docker compose up -d --build    # 或 bun run build
```

**访问后端域名看到 404 JSON**

这是预期行为。纯 API 后端不托管前端，未知路径返回 JSON 404 并提示打开 `FRONTEND_BASE_URL`。浏览器导航（`Accept` 头含 `text/html`）会 301 到前端。

**流式输出要等很久才出字**

反向代理开了 `proxy_buffering`。关掉它。

---

## 八、回退到单体部署

不配置 `FRONTEND_BASE_URL` 时，后端保持原有行为。构建带前端产物的单体二进制：

```bash
# 前端仓库
bun install --frozen-lockfile
bun run build

# 后端仓库（产物会被放进 web/dist）
make build-embedded
```

单体二进制的镜像构建方式：

```bash
# 后端仓库
docker build --build-arg BUILD_FRONTEND=true -t new-api:monolith .
```

详见 [new-api-backend 仓库的部署指南](https://github.com/你的用户名/new-api-backend/blob/main/docs/deployment/server-backend.md)。
