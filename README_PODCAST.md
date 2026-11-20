# YesPlayMusic × 标准 RSS / OPML 播客双模播放器

本分支（`feat/rss-podcast`）移除了所有小宇宙私有移动端 API 代理与账号凭证登录逻辑，改用**开放标准 RSS / Atom / OPML 播客架构**与 **Apple Podcasts 公开检索目录**，实现**零账号风险、纯本地订阅与断点续听**的音乐 + 播客双模体验。

---

## 🌟 核心特性

### 1. 🎙️ 标准 RSS / OPML 播客（无需登录任何平台账号）
* **零封号风险**：不登录小宇宙账号、不携带第三方 Token、不调用任何私有 API。
* **任意 RSS / Atom 订阅**：支持粘贴标准 RSS / Atom 链接，即时解析预览封面、作者、单集列表与 HTML Show Notes。
* **OPML 导入与导出**：兼容 Apple Podcasts、Overcast、Pocket Casts、AntennaPod 等标准 OPML 文件，支持预览勾选导入及一键导出本地订阅列表。
* **公开热门榜单与搜索**：接入 Apple Podcasts 公开榜单（支持多地区、多分类）及 iTunes Search 公开接口（支持搜索节目与单集），自动关联官方公开 RSS 地址。
* **本地订阅管理与刷新**：本地管理订阅节目、并发刷新全部订阅源、汇总「订阅最新更新」单集流。
* **本地断点续听与收听历史**：播放中每 10 秒及暂停/切集时自动在本地记录进度与收听历史，刷新或重启后自动恢复。
* **完整播客播放体验**：复用 Howler 播放引擎，支持 `0.8x / 1.0x / 1.25x / 1.5x / 1.75x / 2.0x` 倍速（仅播客生效，音乐自动保持 `1x`）、快退 15s / 快进 30s、以及安全过滤后的全屏 Show Notes 阅读视图。
* **安全防护**：内置本地 `/podcast-api` 抓取代理包含 SSRF 防护，仅允许公网 HTTP/HTTPS RSS 地址并拦截重定向至本机/内网地址。

### 2. 🎵 音乐专区（网易云音乐）
* 完整保留 YesPlayMusic 原生体验，与播客模式完全隔离。

---

## 📂 核心模块结构

* `src/podcast/xml.js`：零依赖轻量级 XML 解析与实体编解码器。
* `src/podcast/rss.js`：标准 RSS 2.0 / iTunes Podcast / Atom 解析器、时长解析与确定性 ID 生成。
* `src/podcast/opml.js`：OPML 1.0 / 2.0 导入解析与标准导出。
* `src/podcast/security.js`：公网 HTTP(S) URL 校验与 SSRF 内网地址拦截。
* `src/podcast/service.js`：本地 RSS 抓取服务（含重定向安全校验、短时缓存）与 Apple iTunes 公开检索/榜单集成。
* `src/podcast/server.js`：挂载于 `/podcast-api` 的 Express 路由（同时服务 Web 开发模式与 Electron 内置服务）。
* `src/podcast/client.js`：前端 `/podcast-api` 请求封装与错误文案映射。
* `src/podcast/adapter.js`：RSS 数据模型到 YesPlayMusic `Track / Playlist` 对象的适配器。
* `src/podcast/storage.js`：纯本地 `localStorage` 持久化（订阅列表、Feed 索引、单集缓存、最新更新流、收听历史与断点进度）。
* `src/podcast/notes.js`：Show Notes 白名单 HTML 安全渲染器。
* `src/components/ModalAddRss.vue`：添加 RSS 链接预览与 OPML 导入/导出弹窗。
* `src/views/podcastHome.vue`：播客中心（我的订阅、热门榜单、搜索播客、收听历史）。
* `src/views/podcast.vue`：播客节目详情页（单集搜索筛选、正序/倒序、Show Notes 弹窗、复制 RSS）。

---

## 🧪 验证命令

```bash
# 运行播客 RSS / OPML / SSRF / Player 离线回归测试
node tests/podcast.cjs

# 运行网易云登录回归测试
node tests/netease-login.cjs
```
