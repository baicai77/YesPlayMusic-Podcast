# YesPlayMusic × 小宇宙 (xyz) 双模聚合播放器

本项目将 **YesPlayMusic**（高颜值第三方网易云音乐播放器）与 **ultrazg/xyz**（小宇宙播客 FM API 服务）深度融合，打造类似 Spotify 的**音乐 + 播客双模桌面/Web 聚合播放器**。

---

## 🌟 核心特性

### 1. 🎵 音乐专区 (网易云音乐)
* 完整保留 YesPlayMusic 原生的极简高颜值体验。
* 发现音乐、每日推荐、私人 FM、排行榜、精选歌单、歌词滚动与背景模糊特效。
* 支持多音源解锁 (@unblockneteasemusic)。

### 2. 🎙️ 播客专区 (小宇宙 FM)
* **无需安装 Go 编译器**：采用纯 Node.js / Express 原生移植 `ultrazg/xyz` 的完整 API 代理服务，零外部二进制依赖。
* **精选推荐 & 热门榜单**：官方「今日精选单集」、「推荐播客」以及「最热榜 / 新星榜 / 锋芒榜」。
* **我的订阅与收件箱**：手机号短信登录小宇宙账号，多端同步订阅的播客与更新。
* **播客节目与单集详情**：详尽的播客介绍、节目单、正序/倒序排列。
* **Show Notes 与章节沉浸阅读**：播放播客单集时，全屏歌词界面自动切换为 Show Notes 节目单视图，图文解析并支持直接点击参考链接。
* **倍速播放控制**：Howler 音频引擎深度扩展，支持 `0.8x / 1.0x / 1.25x / 1.5x / 1.75x / 2.0x` 快捷切换。
* **快进 30s / 快退 15s**：播客专属快速跳过/回顾按钮。
* **双向进度云同步**：自动记忆断点续听，播放中每 15 秒静默上报最新收听进度至小宇宙云端，与手机客户端无缝衔接。

---

## 🚀 快速启动

工作区目录：`d:\code\listingc`

### 方式 1：Web 浏览器模式（开发调试推荐）
双击运行根目录下的 `dev.bat`，或者在终端执行：
```bash
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run serve
```
浏览器打开 `http://localhost:8080` 即可体验。

### 方式 2：桌面客户端模式 (Electron)
双击运行根目录下的 `electron-dev.bat`，或者在终端执行：
```bash
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run electron:serve
```

### 方式 3：打包 Windows 客户端 (.exe)
```bash
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run electron:build-win
```

---

## 📂 项目新增与核心改造文件一览

* `src/xyz/api.js` / `src/xyz/requestProfile.js`：桌面端上游请求与公共头封装，使用应用自己的标识，不发送手机机型或官方 App 标识。
* `src/xyz/server.js`：Express 路由中间件，提供 `/xyz/*` 本地代理接口，解决跨域与鉴权。
* `src/xyz/adapter.js`：数据模型转换层，将小宇宙 Podcast / Episode 映射为播放器通用的 Track / Playlist 规范。
* `src/xyz/client.js`：前端小宇宙 SDK 与 Token/用户状态管理。
* `src/components/ModalLoginXyz.vue`：小宇宙手机号短信验证码登录弹窗。
* `src/views/podcastHome.vue`：播客首页（精选推荐、我的订阅、榜单排行、收听历史）。
* `src/views/podcast.vue`：播客节目详情与单集列表页。
* `src/components/Player.vue`：统一播放栏播客倍速切换与快进/快退支持。
* `src/views/lyrics.vue`：全屏模式自适应 Show Notes 节目单渲染。
* `src/utils/Player.js`：音源调度、音频格式扩展、倍速与小宇宙云端进度同步。

## 短信人机验证限制与备用登录

`empty captchaVerifyParam` 表示短信接口要求人机验证，当前本项目未接入该验证组件。不要反复发送短信。

备用方式：打开「登录小宇宙」→ 展开「使用官方网页登录凭证」→ 在 https://podcaster.xiaoyuzhoufm.com/ 完成官方登录及验证 → 按 F12，在 Application / Cookies 中复制本人 `x-jike-access-token` 的值，可选复制 `x-jike-refresh-token` → 仅粘贴到本地应用密码框 → 点击「验证并登录」。

应用会调用固定的小宇宙 `/v1/profile/get` 验证当前用户，成功后才保存；失败不覆盖旧登录。不要把 Token 发到聊天、截图或提交到 Git。凭证保存在 localStorage，不是加密存储；第三方访问可能触发风控。官方网页账号权限及 Token 与移动端 API 的兼容性仍需真实账号验证，不保证所有账号可用。

参考（仅参考方案，未复制第三方源码）：
- https://github.com/ultrazg/xyz/issues/25
- https://github.com/weiguanght/xiaoyuzhou-podcast-context/pull/1
- https://github.com/ultrazg/xyz/blob/main/handlers/profile.go

## 本轮完善

- 新增节目/单集搜索入口、节目单集分页、订阅和历史分页。
- 请求失败显示错误并支持重试；切换标签、榜单和节目时忽略过期响应。
- Access Token 过期自动刷新，并发请求共用一次刷新；退出清除本地凭证。
- 修复节目名和封面适配、播客倍速影响音乐、随机队列干扰播客的问题。
- 单集加载完成后恢复断点；播放中每 15 秒、暂停和切换时保存进度。未登录只保存本地进度，登录后尝试上报云端。
- Show Notes 保留安全的基础排版、图片及 HTTP(S) 链接，过滤脚本、事件属性和危险协议。

### 桌面请求与 Android 本地测试

- 上游固定为小宇宙 HTTPS 地址，复用连接，12 秒总超时包含连接池排队；客户端断开时取消上游请求。不跟随重定向，不因网络错误自动重发短信或进度写入。已到达上游的写入不能撤回。
- 上游限流时保留 `Retry-After`；超时单独提示。遇到人机验证或访问受限，调整请求头不能替代官方授权流程。
- Android 测试场景使用自定义测试头和回环 HTTP 服务，不读取登录凭证、不接入生产代理。运行 `node tests/xyz-request-profile.cjs` 即可检查；桌面请求与未公开接口的兼容性仍需在获准的环境里手动验证。

- 收到 `429` 后，代理共享冷却窗口，支持秒数和 HTTP 日期；缺少有效提示时等待 30 秒。窗口内不发送新的上游请求，不自动重放写入。收到 `403` 或人机验证后，本会话的云进度同步暂停，换会话后重新启用。
- 在「播客 → 本地 RSS」添加发布者公开的 HTTPS RSS，或导入 `.rss` / `.xml` 文件。直连需要发布源允许跨域；不支持重定向和非 HTTPS 音频，每源导入最多 100 集。订阅与断点存本机，不涉及小宇宙账号或付费内容。
- Electron 和 Android 的本地网络对照测试见 `tests/network-lab/README.md`。

### 使用及验证

1. 按上文启动 Web 或 Electron 开发模式，进入「播客」。
2. 先登录小宇宙，再检查推荐、订阅、榜单、历史和搜索。当前匿名推荐接口实测返回 401，游客访问不保证可用。
3. 播放单集，检查倍速、快进/快退与 Show Notes；暂停并重播，确认恢复断点；切回音乐后应恢复正常速度。
4. 云端同步、短信验证码、跨设备续听需要真实账号手动验收，本地自动测试不发送短信或写入真实云端记录。
5. 离线回归：`node tests/podcast.cjs`。

注意：使用的是非官方接口，上游接口及鉴权规则可能变化。纯静态 Web 部署必须另外提供同源 `/xyz` Node 服务；`npm run serve` 和现有 Electron 本地服务已挂载该代理。凭证保存在当前应用的 localStorage，并非操作系统钥匙串。
