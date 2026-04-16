---
name: publish-wechat-draft
description: 发布文章到微信公众号草稿箱。当用户要求发布公众号文章、保存微信草稿、publish wechat draft、或提到"发公众号"/"发微信"时调用。
tools: Read, Bash, Edit, Write
---

# 微信公众号草稿发布 Skill

使用项目 `weixingongzhonghao-publisher` 的 CLI 工具，将文章发布到微信公众号草稿箱。

## 前置检查

1. **确认项目**：当前工作目录必须存在 `package.json` 且 `name` 为 `weixingongzhonghao-publisher`。如不是，提示用户切换到正确项目目录。
2. **确认依赖已安装**：如 `node_modules` 不存在，运行 `npm install && npx playwright install chromium`。

## 登录与 Cookie 管理

1. **确定 Cookie 路径**：运行 `node -e "console.log(require('path').join(process.env.HOME||process.env.USERPROFILE,'.config','weixingongzhonghao','cookies.json'))"` 获取默认路径。
2. **检查 Cookie 是否有效**：运行 `npm run check:login`。
   - 如果提示 Cookie 无效或为空，**先执行 `npm run login`**：这会打开浏览器等待用户扫码，登录成功后自动保存 Cookie。
   - 如果用户拒绝扫码，停止执行。

## 解析用户意图与文章源

用户可能通过以下几种方式提供内容：

### 方式 A：提供 HTML/MD 文件路径
- 直接使用 `--file` 模式：
  ```bash
  npm run publish -- --file <path> [--title "标题"]
  ```
- 标题优先级：`--title` 参数 > HTML `<title>` 标签 > 文件名

### 方式 B：只提供纯文本或 Markdown 内容
- 帮用户生成临时 HTML 文件到 `articles/` 目录：
  1. 读取 `articles/` 下现有文件，确定可用文件名（如 `articles/untitled-1.html`）
  2. 将内容包装成基础 HTML 结构（包含 `<html><head><title>...</title></head><body>...</body></html>`）
  3. 使用 `Write` 写入文件
  4. 然后以 `--file` 方式调用发布

### 方式 C：提供配置文件路径
- 如果用户明确要求使用某个 yaml 配置：
  ```bash
  npm run publish -- --config <path>
  ```

## 发布执行流程

1. 如果用户要求调试或首次运行，追加 `--debug` 参数（显示浏览器窗口，slowMo 1000ms）。
2. 运行发布命令，timeout 建议设为 300 秒（Playwright 操作较慢）。
3. **不要静默执行**：在打开浏览器扫码前，明确告知用户需要操作什么。

## 结果反馈

- **成功**：返回草稿链接、耗时，并祝贺用户。
- **失败**：
  1. 读取 `logs/screenshots/` 下最新的错误截图（按修改时间排序）
  2. 分析截图和终端输出，给出明确的错误原因和下一步建议

## 安全与隐私原则

- **绝不读取或泄露 Cookie 内容**。只验证文件是否存在、格式是否正确。
- **绝不把 Cookie 文件提交到 git**。如发现 `cookies/cookies.json` 被 git 跟踪，立即提醒用户取消跟踪。
- 用户扫码登录时，浏览器窗口由用户控制，Claude 不模拟任何登录操作。
