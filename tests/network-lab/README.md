# 本地网络对照测试

两个客户端使用同一个本地 Mock 约定：UTF-8 JSON、gzip、401、429 和 `Retry-After`。不读取账号凭证，不连接小宇宙。Electron 拦截所有非实验地址的请求；Android 仅使用固定的模拟器宿主回环映射。

## Electron（Windows）

```powershell
& .\node_modules\.bin\electron.cmd tests/network-lab/electron.cjs
```

脚本自启随机端口回环服务，还会检查 Chromium 中的 RSS 解析与本地存储。

## Android 模拟器

准备 JDK 17、Gradle 8.9、Android SDK 35 和 API 26 或以上的 Android Studio 模拟器。在仓库根目录的两个终端分别运行：

```powershell
node tests/network-lab/mock.cjs
```

```powershell
gradle -p tests/network-lab/android connectedDebugAndroidTest
```

仅支持标准 Android 模拟器的 `10.0.2.2` 宿主回环映射，不要把测试地址改成线上服务。Android 工程未纳入应用的生产打包。
