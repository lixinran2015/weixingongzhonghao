# 微信公众号图文发布器

基于 Playwright + TypeScript 的微信公众号图文自动保存草稿工具。

参考了 `baijiahao` 项目的架构设计，复用了配置驱动、Cookie 登录、日志截图等核心模式。

---

## 功能特性

- Cookie/Session 自动登录
- 图文消息自动编辑（标题、正文、封面、作者）
- 自动保存到草稿箱
- 操作日志与失败截图
- JSON 格式结果报告

---

## 快速开始

### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 2. 准备 Cookie

1. 浏览器登录 [微信公众号平台](https://mp.weixin.qq.com/)
2. 按 F12 打开 DevTools → Application → Cookies → `mp.weixin.qq.com`
3. 复制所有 Cookie 保存到 `cookies/cookies.json`

Cookie 文件格式（数组格式）：
```json
[
  {
    "name": "wxtokenkey",
    "value": "your-token-value",
    "domain": "mp.weixin.qq.com",
    "path": "/"
  }
]
```

### 3. 检查登录状态

```bash
npm run check:login
# 或调试模式
npm run check:login -- --debug
```

### 4. 创建配置

```bash
cp config/example-article-config.yaml config/article-config.yaml
```

编辑 `config/article-config.yaml`：

```yaml
article:
  title: "文章标题"
  content: "./articles/example.html"  # 也可以是 .md 或纯文本
  cover: "./covers/cover.jpg"
  summary: "文章摘要"
  author: "作者名"
  original: true

settings:
  headless: false
  slowMo: 500
  timeout: 120000

output:
  logDir: "./logs"
  reportDir: "./reports"
  screenshots: true
```

### 5. 运行发布

```bash
# 标准模式
npm run publish -- --config ./config/article-config.yaml

# 调试模式（显示浏览器窗口，操作更慢）
npm run publish -- --config ./config/article-config.yaml --debug
```

---

## 项目结构

```
weixingongzhonghao/
├── src/
│   ├── core/
│   │   ├── base-publisher.ts    # 发布器基类（浏览器、Cookie、截图）
│   │   └── publisher.ts         # 微信公众号发布器核心逻辑
│   ├── utils/
│   │   ├── config-loader.ts     # YAML 配置加载与校验
│   │   ├── logger.ts            # 日志工具
│   │   └── reporter.ts          # 报告生成
│   ├── auth/
│   │   └── cookie-manager.ts    # Cookie 管理
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义
│   └── index.ts                 # CLI 入口
├── config/
│   └── example-article-config.yaml
├── cookies/
│   └── cookies.json             # Cookie 存储
├── articles/                    # 文章正文存放目录
├── covers/                      # 封面图片存放目录
├── logs/                        # 日志与截图
└── reports/                     # 发布结果报告
```

---

## 核心流程

1. **加载 Cookie** → 访问 `mp.weixin.qq.com`
2. **登录校验** → 检查是否被重定向到登录页
3. **进入编辑器** → 提取 token 或直接跳转图文编辑页
4. **填写标题** → 定位 `#title` 或标题输入框
5. **填写正文** → 通过 iframe 中的 `contenteditable` body 注入 HTML
6. **设置封面** → 点击上传区域并选择图片文件
7. **保存草稿** → 点击保存按钮并检测成功提示

---

## 注意事项

1. **Cookie 有效期**：微信公众号 Cookie 会过期，建议定期使用 `check-login` 验证
2. **正文格式**：`content` 字段支持直接传 HTML 字符串，或传入 `.html` / `.md` 文件路径
3. **页面改版**：如果微信页面结构变化，可能需要更新 `src/core/publisher.ts` 中的选择器
4. **调试建议**：首次运行建议使用 `--debug` 模式观察流程是否正常
5. **封面限制**：建议使用 jpg/png 格式，大小不超过 5MB

---

## 故障排查

### 登录验证失败

- 检查 `cookies/cookies.json` 是否存在且格式正确
- 运行 `npm run check:login -- --debug` 观察浏览器行为

### 未找到标题/正文编辑器

- 微信页面可能已改版，查看 `logs/screenshots/` 中的截图确认页面状态
- 检查当前 URL 是否已进入 `appmsg_edit` 编辑页面

### 封面未上传成功

- 微信封面上传弹窗可能是自定义组件，自动上传有一定失败率
- 若自动上传失败，工具会跳过封面继续保存草稿

---

## License

MIT
