# new-api-web

[New API](https://github.com/QuantumNous/new-api) 的面板（dashboard），作为独立项目打包。

前后端独立部署：本项目构建出一个静态资源包，由任意 Web 服务器托管；后端则作为一个纯 API
服务运行，完全不知道前端资源包的存在。

---

## 两端如何互相找到对方

一切取决于一个构建期变量：

| 变量                  | 含义                                     |
| --------------------- | ---------------------------------------- |
| `VITE_API_BASE_URL`  | 后端的公开地址。空值表示"同源"。        |

支持两种部署方式，区别只在于这个变量的取值：

**同源** —— `VITE_API_BASE_URL` 为空。所有请求保持相对路径
（`/api/user/self`），由浏览器解析到页面自身的源上。适用于反向代理同时托管面板和
API 的场景，或本地开发时（开发服务器把 API 路径代理到后端）。

**分离部署** —— `VITE_API_BASE_URL=https://api.example.com`。所有请求变成绝对地址，
成为跨域请求。此时后端需要额外配置三项，详见[后端配置](#后端配置)。

该值在构建期被编译进资源包。静态 SPA 无法读取运行时环境变量，所以改变 API 地址就
必须重新构建前端。

---

## 快速开始

```bash
bun install
cp .env.example .env      # 可选，默认值开箱即用
bun run dev               # http://localhost:5173
```

开发服务器会把 `/api`、`/v1`、`/v1beta`、`/mj` 和 `/pg` 代理到
`http://localhost:3000`。用 `VITE_REACT_APP_SERVER_URL` 可以指向别处。

#### 对接远程后端进行开发

把 `VITE_API_BASE_URL` 保持**为空**，只设置代理目标：

```dotenv
# .env.development.local
VITE_API_BASE_URL=
VITE_REACT_APP_SERVER_URL=http://124.156.218.147:3000
```

```bash
bun run dev
```

本地开发时**不要**把 `VITE_API_BASE_URL` 设成远程地址。那会让每个请求都变成跨域
请求，而后端的 Refresh Cookie 是 `HttpOnly` + `SameSite=Strict` +
`Path=/api/user/auth` —— 从 `localhost` 发往远程主机的跨站请求根本不会带上它，
每次刷新页面登录态就断了。那种方式还需要 `CORS_ALLOWED_ORIGINS`、
`SameSite=None` 和 `Secure` Cookie，而 `Secure` Cookie 在纯 HTTP 下浏览器根本
不会存储。

配好代理后，浏览器始终只看到一个源（`http://localhost:5173`），后端 Cookie 的行为
与同源部署完全一致。

### 构建

```bash
bun run build              # -> dist/
```

---

## 部署

> 完整的服务器部署步骤 —— 域名、证书、反向代理、验证清单和故障排查 —— 见
> [deploy/DEPLOYMENT.md](./deploy/DEPLOYMENT.md)。

### Docker

```bash
docker compose up -d --build
```

先在 `.env` 里配置 API 地址（`cp .env.example .env`）：

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

也可以直接构建镜像：

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg VITE_REACT_APP_VERSION=v1.2.3 \
  -t new-api-web:latest .

docker run -d -p 127.0.0.1:8080:80 new-api-web:latest
```

镜像里只有静态资源包和一个用 SPA fallback 托管它的 nginx，所以面板的任意路由都能
正确解析到 `index.html`。

`deploy/nginx.conf` 是分离部署的反向代理模板：一个 server 块托管面板，另一个托管
API。

### 静态托管

`dist/` 是一个纯静态资源包。可以由任意 Web 服务器或 CDN 托管，但有一个要求：
**未知路径必须返回 `index.html`，而不是 404**。面板是单页应用，路由由它自己管理。

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## 后端配置

分离部署只有在后端与前端达成一致后才算完成。后端需要知道：

| 变量                       | 取值                                   | 原因                                                          |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `FRONTEND_BASE_URL`        | `https://app.example.com`              | 浏览器导航重定向到这里；OAuth 回跳、密码重置链接、支付回跳也都用它 |
| `API_BASE_URL`             | `https://api.example.com`              | 后端自身的公开地址，用于图片代理、视频内容和支付异步通知回调  |
| `CORS_ALLOWED_ORIGINS`     | `https://app.example.com`              | 允许携带 Cookie 跨域访问 API 的浏览器源                       |
| `SESSION_COOKIE_SECURE`    | `true`                                 | Refresh Cookie 必须是 `Secure` 才能在跨站请求中存活            |
| `SESSION_COOKIE_SAME_SITE` | `none` —— 仅在跨可注册域名时需要       | 见下文                                                        |

`CORS_ALLOWED_ORIGINS` 必须列出**精确的 origin**。通配符与凭据请求同时出现是非法的：
浏览器会直接拒绝该响应，所以这里填通配符看起来像配置成功，实际会让每一次登录都失败。

`SESSION_COOKIE_SAME_SITE` 只在前端和后端位于**不同可注册域名**时才需要放宽。
同一可注册域名的两个子域（`app.example.com` 和 `api.example.com`）属于同一个站点，
默认的 `strict` 在那里就已经能正常工作。

后端还需要信任前端的 origin，才能通过会话 Cookie 的 origin 校验。
`FRONTEND_BASE_URL` 会被自动信任，所以只有需要额外 origin 时才要设置
`SESSION_COOKIE_TRUSTED_URL`。

---

## 代码如何访问 API

`src/lib/api-base.ts` 是唯一知道 API 地址的地方：

```ts
import { API_BASE_URL, apiUrl, apiOrigin } from '@/lib/api-base'
```

- `API_BASE_URL` —— 配置的基础地址，同源时为空。
- `apiUrl(path)` —— API 路径，分离部署时为绝对地址。给 `fetch` 用。
- `absoluteApiUrl(path)` —— 始终为绝对地址。给 `EventSource` 和流式请求用，
  它们会基于 document 解析 URL。
- `apiOrigin()` —— 提供 API 的源。构造需要用户复制的链接时用它：curl 示例、
  "你的 API 地址"之类的提示。

两个 axios 实例 —— `@/lib/http-client` 和 `@/lib/auth-session` —— 都以
`API_BASE_URL` 作为 `baseURL`，所以常规 API 调用无需任何改动。

### 会话提示（session hint）

后端在写入 `HttpOnly` Refresh Cookie 的同时，还会写一个 `new_api_has_session`
Cookie，让面板可以跳过一次注定失败的刷新。在分离部署中，这个 Cookie 落在**后端的
源**上，面板的 `document.cookie` 看不到它。

因此面板会把这个提示镜像到 `localStorage`（键名 `newapi:has-session`），它作用域是
面板自身的源 —— 也就是真正需要这个答案的地方。`src/lib/session-hint.ts` 负责这个
镜像：登录和刷新时写入，退出登录时清除。

这个提示只是一个优化项，绝不是授权信号。提示缺失意味着"现在不值得发这个请求"，
而不是"已退出登录"。

---

## 项目结构

```
src/
  lib/
    api-base.ts        API 地址，以及基于它的各种辅助函数
    http-client.ts     共享的 axios 实例
    auth-session.ts    刷新、令牌轮换，以及会话生命周期
    session-hint.ts    服务端的提示 Cookie，及其 localStorage 镜像
  features/            功能模块，每个模块自带 components/ 和 lib/
  routes/              基于文件的路由（TanStack Router）
```

---

## 脚本

| 脚本                   | 作用                                   |
| ---------------------- | -------------------------------------- |
| `bun run dev`          | 带 API 代理的开发服务器                |
| `bun run build`        | 生产构建，输出到 `dist/`               |
| `bun run preview`      | 在本地托管生产构建产物                |
| `bun run typecheck`    | 类型检查                               |
| `bun run lint`         | 代码检查                               |
| `bun run format`       | 代码格式化                             |
| `bun run test`         | 单元测试与组件测试                     |

---

## 许可协议

本面板与后端采用相同的许可条款：AGPL-3.0，并提供商业许可。见后端仓库的 `LICENSE`
和 `THIRD-PARTY-LICENSES.md`。
