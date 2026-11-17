# YesPlayMusic - Podcast Edition v0.4.11-podcast

高颜值的第三方网易云音乐与小宇宙播客 (XiaoYuniverse FM) 双模桌面播放器。
基于 [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic) 与 [ultrazg/xyz](https://github.com/ultrazg/xyz) 融合衍生开发。

## 📦️ 下载文件说明

* **`YesPlayMusic 0.4.11.exe`**：免安装绿色版，下载后双击即可直接运行。
* **`YesPlayMusic Setup 0.4.11.exe`**：Windows 标准安装包，附带开始菜单和桌面快捷方式。
* **`WINDOWS使用说明.md`**：详细使用说明、登录排错与注意事项。
* **`SHA256SUMS.txt`**：安装包 SHA-256 完整性校验文件。

### 校验和 (SHA-256)
```
219266090A08C77D355CD3D66D34DB4453F6E5D7D9862627F470ADB17B28541C  YesPlayMusic 0.4.11.exe
237475390E3B710D630CA081667754DD57F2011236641B82C2E57FBEFD168FD0  YesPlayMusic Setup 0.4.11.exe
```

## ✨ 本版本主要特性

1. **小宇宙播客原生集成**：
   * 采用纯 Node.js / Express 原生实现小宇宙 API 代理，无需另外安装 Go 语言环境。
   * 精选推荐、我的订阅、热门榜单（最热榜/新星榜/锋芒榜）、收听历史与全量搜索。
   * 播客节目详情、单集列表正序/倒序排列。
   * 全屏 Show Notes 节目单图文排版渲染，支持直接点击参考链接。
2. **播放器增强**：
   * 支持倍速播放（0.8x / 1.0x / 1.25x / 1.5x / 1.75x / 2.0x）。
   * 专属快退 15 秒、快进 30 秒跳过控制。
   * 播客音频格式扩展（m4a、aac、ogg、wav、mp3、flac）。
   * 本地断点续听，播放中每 15 秒静默向小宇宙云端同步收听进度。
3. **网易云音乐完整保留**：
   * 极简 UI、私人 FM、歌词滚动与多音源解锁。

## ⚠️ 免责声明与安全提示
* 本项目为非官方第三方客户端，遵循 MIT 开源许可。
* 登录 Token / Cookie 仅保存在用户本地电脑 localStorage 中，绝不向第三方上传。
* 第三方接口可能存在上游风控与限制，请合理合法使用。
