<div align="center">
  <img src="images/logo.png" alt="Logo" width="128" height="128">
  <h1 align="center" style="font-weight: 700">YesPlayMusic - RSS Podcast Edition</h1>
  <p align="center">
    <b>网易云音乐 × 标准 RSS / OPML 播客高颜值双模桌面播放器</b>
    <br />
    基于 YesPlayMusic 与开放 RSS / Apple Podcasts 公开目录开发（无需登录小宇宙账号，零封号风险）
  </p>
  <p align="center">
    <a href="https://github.com/baicai77/YesPlayMusic-Podcast/releases"><strong>📦️ 下载 Windows 客户端 (Releases)</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="./WINDOWS使用说明.md"><strong>📖 Windows 使用指南</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="./API_REVIEW.md"><strong>🔍 接口检查与审查记录</strong></a>
  </p>
</div>

---

> ⚠️ **重要免责声明与身份说明**
> 
> * **非官方客户端**：本项目为个人出于学习、技术研究与个人日常视听需求开发的**非官方第三方客户端**，非网易云音乐官方亦非小宇宙官方产品。
> * **原项目致谢与来源**：
>   * 前端与音乐核心基于优秀的开源项目 [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic)（MIT 许可证）。
>   * 小宇宙播客接口逻辑源自开源项目 [ultrazg/xyz](https://github.com/ultrazg/xyz)（MIT 许可证），由本项目移植为纯 Node.js / Express 内置代理实现。
> * **开源许可证**：本项目遵循 **[MIT License](./LICENSE)**。

---

## ✨ 核心特性

### 1. 🎙️ 标准 RSS / OPML 播客（免登录・零封号风险）
* **完全开放标准**：不再登录小宇宙账号，也不调用任何第三方私有移动端 API，彻底规避账号风控与封号风险。
* **任意 RSS / Atom 订阅**：粘贴任意公开 RSS / Atom 链接即可解析封面、简介、单集列表与 Show Notes，一键本地订阅。
* **OPML 导入与导出**：支持从 Apple Podcasts、Overcast、Pocket Casts、AntennaPod 等播客客户端导入标准 OPML 订阅列表，或将当前订阅一键导出备份。
* **公开榜单与搜索**：接入 Apple Podcasts 公开热门榜单（多地区、多分类）及 iTunes Search 公开检索接口（支持搜节目与搜单集），自动关联官方 RSS 源。
* **订阅更新流与单集筛选**：支持并发刷新全部已订阅 RSS 源、查看「订阅最新更新」，节目详情页支持按标题实时筛选与正序/倒序切换。
* **全屏 Show Notes 节目单**：播放播客时，全屏视图自适应切换为安全过滤后的 Show Notes 图文视图。
* **倍速与本地断点续听**：支持 `0.8x / 1.0x / 1.25x / 1.5x / 1.75x / 2.0x` 倍速、快退 15s / 快进 30s，以及纯本地自动保存断点进度与收听历史。

### 2. 🎵 网易云音乐 (YesPlayMusic 原生体验)
* 完整保留 YesPlayMusic 原生的极简高颜值体验。
* 发现音乐、每日推荐、私人 FM、排行榜、精选歌单、动态背景模糊。
* 支持多音源解锁 (`@unblockneteasemusic`)。

---

## 🔒 隐私安全与已知限制

### 隐私与账号安全说明
1. **播客免登录**：播客模块完全基于开放 RSS / Atom / OPML 与 Apple Podcasts 公开目录，**不再登录小宇宙账号、不再保存或发送任何小宇宙 Token**，彻底规避小宇宙封号风险。
2. **本地存储**：RSS 订阅列表、收听历史、断点续听进度及网易云 Cookie 仅保存在本机 `localStorage` 中，**绝不会上传至任何第三方服务器**。
3. **SSRF 防护**：内置本地 `/podcast-api` 抓取代理仅允许公网 HTTP/HTTPS RSS 源，禁止访问本机及内网地址。

### 已知限制说明
* **平台专属内容**：仅支持公开 RSS 源播客，无法同步小宇宙评论区、云端收听进度或仅限小宇宙 App 内的独家/付费内容。
* **多设备同步**：可通过「OPML 导入/导出」手动在多设备或不同播客客户端之间迁移订阅列表。
* **Windows 未签名提示**：因个人开源构建未购买商业数字证书，首次运行时 Windows Defender SmartScreen 可能会提示“未知发布者”，点击“更多信息 -> 仍要运行”即可。

---

## 📦️ 下载与安装

前往 **[GitHub Releases](https://github.com/baicai77/YesPlayMusic-Podcast/releases)** 页面获取最新构建：

| 文件名 | 说明 |
| :--- | :--- |
| `YesPlayMusic 0.4.11.exe` | **免安装便携版**：解压即用，无需安装 |
| `YesPlayMusic Setup 0.4.11.exe` | **Windows 安装程序**：标准安装向导与快捷方式 |
| `SHA256SUMS.txt` | 安装包 SHA-256 校验和文件 |
| `WINDOWS使用说明.md` | Windows 详细使用与排错说明 |

---

## 🛠️ 本地开发与构建

### 运行环境
* Node.js 16+ / 20+ / 24+
* npm 8+

### 1. 启动 Web 调试模式
```powershell
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run serve
# 或直接双击运行 dev.bat
```
浏览器访问 `http://localhost:8080` 即可预览。

### 2. 启动桌面端调试 (Electron)
```powershell
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run electron:serve
# 或直接双击运行 electron-dev.bat
```

### 3. 构建 Windows 安装包
```powershell
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run electron:build-win
```
构建产物将输出在 `dist_electron/` 目录下。

---

## 📜 开源协议

本项目基于 [MIT License](./LICENSE) 协议分发。代码衍生自：
* [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic) - MIT License
* [ultrazg/xyz](https://github.com/ultrazg/xyz) - MIT License
