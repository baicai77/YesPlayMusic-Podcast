<div align="center">
  <img src="images/logo.png" alt="Logo" width="128" height="128">
  <h1 align="center" style="font-weight: 700">YesPlayMusic - Podcast Edition</h1>
  <p align="center">
    <b>网易云音乐 × 小宇宙播客 (XiaoYuniverse FM) 高颜值双模桌面播放器</b>
    <br />
    基于 YesPlayMusic 与 ultrazg/xyz 深度融合衍生开发
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

### 1. 🎙️ 小宇宙播客 (XiaoYuniverse FM)
* **零外部环境依赖**：完全用 Node.js / Express 原生实现小宇宙 API 代理，无需额外安装 Go 语言环境或配置二进制子进程。
* **精选与热门榜单**：同步小宇宙官方「今日精选单集」、「推荐节目」以及「最热榜 / 新星榜 / 锋芒榜」。
* **我的订阅与历史记录**：支持手机短信验证码登录或官方网页 Token 导入，无缝拉取已订阅播客与云端收听历史。
* **播客节目主页与选集**：完整的节目介绍、作者信息、总集数、正序/倒序排列。
* **全屏 Show Notes 节目单**：播放播客时，全屏视图自适应切换为 Show Notes 视图，图文排版清晰，支持一键点击参考链接。
* **倍速播放控制**：Howler 音频引擎深度扩展，支持 `0.8x / 1.0x / 1.25x / 1.5x / 1.75x / 2.0x` 快速切换。
* **快进 30s / 快退 15s**：专属跳过/回溯控制。
* **双向进度云同步**：本地自动保存断点续听，播放中定时（每 15 秒）静默上报进度至小宇宙云端，实现手机端与电脑端进度无缝互通。

### 2. 🎵 网易云音乐 (YesPlayMusic 原生体验)
* 完整保留 YesPlayMusic 原生的极简高颜值体验。
* 发现音乐、每日推荐、私人 FM、排行榜、精选歌单、动态背景模糊。
* 支持多音源解锁 (`@unblockneteasemusic`)。

---

## 🔒 凭证安全风险与已知限制

### 凭证安全风险提示
1. **本地存储**：你的小宇宙 Token (`x-jike-access-token` / `x-jike-refresh-token`) 与网易云 Cookie 仅保存在本机客户端的 `localStorage` 中，直接由本地轻量代理与官方服务器通信，**绝不会上传至任何第三方服务器**。
2. **凭证妥善保管**：Token 与 Cookie 等同于你的登录密码，切勿将配置文件、调试日志或带有 Token 的请求截图发送给他人。
3. **风控风险**：使用非官方第三方客户端调用接口存在被官方风控（如要求验证码人机校验）或限制账号的风险，请谨慎合理使用。

### 已知限制说明
* **短信验证码人机验证**：小宇宙官方对部分短信登录请求可能要求 `captchaVerifyParam` 滑块校验。如遇到限制，推荐使用客户端内置的**「使用官方网页登录凭证」**功能（在小宇宙官方创作者后台登录后复制 Token 导入）。
* **部分接口权限**：目前收件箱、评论提交与收藏读取在第三方环境可能返回上游 `rpc_error`，当前 UI 暂未开放这些受限入口。
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
