<div align="center">

![new-api](./public/logo.png)

# New API Web（前后端分离二开版）

**New API 的管理面板 —— 独立前端项目**

> **本仓库是 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 前端面板的二次开发版本。**
>
> 核心改动：**将前端从后端仓库中完全剥离，成为可独立构建、独立部署的 SPA**。
> 配套后端位于独立仓库 [new-api-backend](https://github.com/Bitsea19/new-api-backend)，
> 它作为纯 API 服务运行，不携带任何前端产物。
> 同步上游时采用快照基线三方合并，**上游更新不会覆盖二开改动**（见文末「同步上游」）。

</div>

---

## 📌 这是什么

这是 New API 的 Web 管理面板 —— 一个 React 单页应用。用户通过它管理渠道、模型、用户、额度、
令牌、日志与计费。

**本仓库只包含前端。** 它构建出一个纯静态资源包，由任意 Web 服务器托管：

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  new-api-web（本仓库）     │  ──▶   │  new-api-backend         │
│  React SPA + Nginx       │  HTTP  │  Go 纯 API 服务          │
│  独立构建、独立部署        │◀──     │  独立构建、独立部署        │
└─────────────────────────┘         └───────────┬─────────────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    │                         │
                              ┌─────▼─────┐           ┌───────▼──────┐
                              │ PostgreSQL │           │    Redis     │
                              └───────────┘           └──────────────┘
```

---

## ✨ 本二开版本的核心改动

### 1. 从后端仓库剥离

上游项目的前端源码位于后端仓库的 `web/` 目录中，前后端必须一起构建、一起发布。
本项目把前端彻底剥离出来：

| 维度 | 上游原版 | 本二开版本 |
| --- | --- | --- |
| 前端代码位置 | 后端仓库的 `web/` 目录 | **独立仓库** `new-api-web` |
| 构建产物 | 打进后端二进制 / 镜像 | **纯静态资源包** `dist/` |
| 部署方式 | 随后端一起 | **独立构建、独立部署**，可分属不同主机 |
| 升级方式 | 前后端一起升 | **各自独立升级** |
| 产物体积 | 数十 MB 的镜像 | 只需几 MB 的静态包 |

### 2. API 地址集中管理

上游前端把后端地址散落在多处硬编码。本版本把它收敛到唯一入口 `src/lib/api-base.ts`：

```ts
import { API_BASE_URL, apiUrl, absoluteApiUrl, apiOrigin } from '@/lib/api-base'
```

| 导出 | 用途 |
| --- | --- |
| `API_BASE_URL` | 配置的基础地址，同源时为空 |
| `apiUrl(path)` | API 路径，分离部署时为绝对地址。给 `fetch` 用 |
| `absoluteApiUrl(path)` | 始终为绝对地址。给 `EventSource` 与流式请求用 |
| `apiOrigin()` | 提供 API 的源。构造需要用户复制的链接时用它 |

两个 axios 实例 —— `@/lib/http-client` 与 `@/lib/auth-session` —— 都以 `API_BASE_URL`
作为 `baseURL`，因此常规 API 调用无需任何改动。

### 3. 跨源登录态处理

分离部署下，浏览器的 Refresh Cookie 落在后端的源上，前端的 `document.cookie` 看不到它。
本版本让后端额外写一个 `new_api_has_session` 提示 Cookie，前端把它镜像到 `localStorage`
（键名 `newapi:has-session`），作用域是前端自身的源 —— 也就是真正需要这个答案的地方。

`src/lib/session-hint.ts` 拥有这个镜像：登录和刷新时写入，退出登录时清除。
提示只是一项优化，绝不是授权信号：提示缺失意味着「现在不值得发这个请求」，而不是「已退出登录」。

---

## 🔧 两端如何互相找到对方

一切取决于一个构建期变量：

| 变量                  | 所属   | 含义                                     |
| --------------------- | ------ | ---------------------------------------- |
| `VITE_API_BASE_URL`  | 前端   | 后端的公开地址。空值表示「同源」        |
| `FRONTEND_BASE_URL`  | 后端   | 前端的公开地址。用于浏览器重定向与各类回跳 |
| `API_BASE_URL`       | 后端   | 后端自身的公开地址。用于图片代理与支付回调  |
| `CORS_ALLOWED_ORIGINS` | 后端 | 允许携带 Cookie 跨域访问 API 的精确 origin |

支持两种部署方式，区别只在于 `VITE_API_BASE_URL` 的取值：

**同源** —— 留空。所有请求保持相对路径（`/api/user/self`），由浏览器解析到页面自身的源上。
适用于反向代理同时托管面板和 API 的场景，或本地开发时。

**分离部署** —— `VITE_API_BASE_URL=https://api.example.com`。所有请求变成绝对地址，
成为跨域请求。此时后端需要额外配置 `CORS_ALLOWED_ORIGINS`、`SESSION_COOKIE_SECURE`
与（跨可注册域名时）`SESSION_COOKIE_SAME_SITE=none`。

> **该值在构建期被编译进资源包。** 静态 SPA 无法读取运行时环境变量，
> 所以改变 API 地址就必须重新构建前端。

---

## 🚀 快速开始

```bash
bun install
cp .env.example .env      # 可选，默认值开箱即用
bun run dev               # http://localhost:5173
```

开发服务器会把 `/api`、`/v1`、`/v1beta`、`/mj` 和 `/pg` 代理到 `http://localhost:3000`。
用 `VITE_REACT_APP_SERVER_URL` 可以指向别处。

### 对接远程后端进行开发

把 `VITE_API_BASE_URL` 保持**为空**，只设置代理目标：

```dotenv
# .env.development.local
VITE_API_BASE_URL=
VITE_REACT_APP_SERVER_URL=http://124.156.218.147:3000
```

本地开发时**不要**把 `VITE_API_BASE_URL` 设成远程地址。那会让每个请求都变成跨域请求，
而后端的 Refresh Cookie 是 `HttpOnly` + `SameSite=Strict` + `Path=/api/user/auth` ——
从 `localhost` 发往远程主机的跨站请求根本不会带上它，每次刷新页面登录态就断了。
那种方式还需要 `CORS_ALLOWED_ORIGINS`、`SameSite=None` 和 `Secure` Cookie，
而 `Secure` Cookie 在纯 HTTP 下浏览器根本不会存储。

配好代理后，浏览器始终只看到一个源（`http://localhost:5173`），
后端 Cookie 的行为与同源部署完全一致。

---

## 📦 构建

```bash
bun run build              # -> dist/
```

产物在 `dist/`，是一个纯静态资源包。带内容哈希的资源位于 `dist/static/`。

---

## 🚢 部署

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

镜像里只有静态资源包和一个用 SPA fallback 托管它的 nginx，
所以面板的任意路由都能正确解析到 `index.html`。

`deploy/nginx.conf` 是分离部署的反向代理模板：一个 server 块托管面板，另一个托管 API。

### 静态托管

`dist/` 可以由任意 Web 服务器或 CDN 托管，但有一个要求：
**未知路径必须返回 `index.html`，而不是 404**。面板是单页应用，路由由它自己管理。

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## 🗂️ 项目结构

```
src/
  lib/
    api-base.ts        API 地址，以及基于它的各种辅助函数
    http-client.ts     共享的 axios 实例
    auth-session.ts    刷新、令牌轮换，以及会话生命周期
    session-hint.ts    服务端的提示 Cookie，及其 localStorage 镜像
  features/            功能模块，每个模块自带 components/ 和 lib/
  routes/              基于文件的路由（TanStack Router）
  i18n/                语言文件与语言环境工具
deploy/
  nginx.conf           反向代理模板
  DEPLOYMENT.md        完整部署指南
```

---

## 🛠️ 脚本

| 脚本                   | 作用                                   |
| ---------------------- | -------------------------------------- |
| `bun run dev`          | 带 API 代理的开发服务器                |
| `bun run build`        | 生产构建，输出到 `dist/`               |
| `bun run preview`      | 在本地托管生产构建产物                |
| `bun run typecheck`    | 类型检查                               |
| `bun run lint`         | 代码检查                               |
| `bun run format`       | 代码格式化                             |
| `bun run test`         | 单元测试与组件测试                     |
| `bun run i18n:sync`    | 同步各语言文件                         |

开发规范见 [AGENTS.md](./AGENTS.md)。

---

## 🔄 同步上游（QuantumNous/new-api）

本仓库是上游前端面板的二开版本，需要持续跟进上游的改动。

### 分支结构

| 分支 / 远程             | 作用                                              |
| ------------------------ | ------------------------------------------------- |
| `origin`（Bitsea19/new-api-web） | 本仓库的正式仓库，二开版本推送到这里   |
| `upstream`（QuantumNous/new-api） | 上游原始仓库，只读，用于拉取上游改动     |
| `upstream-web`           | 上游 `web/` 目录的快照提交链，作为合并基线        |
| `master`                 | 二开主分支，包含全部二开改动                      |

`master` 的最底层提交是「上游前端快照基线」，它的内容就是上游 `web/` 目录在某个 commit 上的样子。
因此合并上游时，git 能以该快照为共同祖先做三方合并：

- 上游改过的文件 → 自动合入
- 二开改过的文件 → **保留二开版本**（双方都改才会产生冲突）

### 同步脚本放在本地，不随仓库分发

同步脚本是**本地维护工具**，不纳入版本管理，因此不会出现在 GitHub 仓库里。
它保存在你本地的 `更新/` 目录：

```
F:\我的开发\更新\
  sync-all.ps1        一次同步前后端两个仓库
  sync-web.ps1        只同步前端仓库（本仓库）
  sync-backend.ps1    只同步后端仓库
```

### 同步步骤

```bash
# 一次同步两个仓库
powershell -ExecutionPolicy Bypass -File F:\我的开发\更新\sync-all.ps1

# 或者只同步前端
powershell -ExecutionPolicy Bypass -File F:\我的开发\更新\sync-web.ps1
```

脚本会完成：拉取上游 → 生成新的快照提交 → 三方合并到当前分支。
合并后若有冲突文件，脚本会列出清单：

```bash
# 保留二开版本
git checkout --ours <文件>
# 采用上游版本
git checkout --theirs <文件>
git add <文件>
git commit
```

只想看看会合并什么、不实际改动：

```bash
powershell -ExecutionPolicy Bypass -File F:\我的开发\更新\sync-web.ps1 -DryRun
```

### 日常同步节奏

```bash
powershell -ExecutionPolicy Bypass -File F:\我的开发\更新\sync-all.ps1
# 解决冲突（如果有）→ git commit
# cd new-api-web && git push origin master
# cd new-api-backend && git push origin main
```

上游的改动只会影响 `src/` 下的业务代码。本仓库的二开集中在
`src/lib/api-base.ts`、`src/lib/http-client.ts`、`src/lib/auth-session.ts`、
`src/lib/session-hint.ts` 以及 `Dockerfile` / `docker-compose.yml` / `deploy/`，
这些文件在上游不存在或未被改动，因此同步时基本不会产生冲突。

---

## 📜 许可证与致谢

本项目采用 [GNU Affero 通用公共许可证 v3.0 (AGPLv3)](./LICENSE) 授权。

根据 AGPLv3 第 7 条，修改版本必须在适当法律声明及界面中显著的关于、法律、页脚或署名位置
保留作者署名 `Frontend design and development by New API contributors.`，
并保留指向原项目 <https://github.com/QuantumNous/new-api> 的可见链接。

本项目在 [QuantumNous/new-api](https://github.com/QuantumNous/new-api)（在
[One API](https://github.com/songquanpeng/one-api)（MIT 许可证）基础上二次开发）
的前端面板基础上完成前后端分离改造。

如果您所在的组织政策不允许使用 AGPLv3 许可的软件，或您希望规避 AGPLv3 的开源义务，
请发送邮件至：[support@quantumnous.com](mailto:support@quantumnous.com)

署名及依赖声明见 [NOTICE](./NOTICE) 和[第三方许可证](./THIRD-PARTY-LICENSES.md)。

---

<div align="center">

### 💖 感谢使用 New API

如果这个项目对你有帮助，欢迎给它一个 ⭐️ Star！

**上游项目**：[QuantumNous/new-api](https://github.com/QuantumNous/new-api) • **[官方文档](https://docs.newapi.ai/zh/docs)**

<sub>Built with ❤️ by QuantumNous and contributors</sub>

</div>
