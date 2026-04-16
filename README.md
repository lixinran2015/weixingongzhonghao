# 微信公众号图文发布器

基于 Playwright + TypeScript 的微信公众号图文自动保存草稿工具。

支持**自动扫码登录**、**直接传入 HTML 文件发布**、**Claude Code 自然语言 Skill**，无需手动管理 Cookie 和 YAML 配置。

---

## 功能特性

- **自动扫码登录**：未登录时自动打开浏览器等待微信扫码，登录成功后自动保存 Cookie
- **直接传 HTML 发布**：无需创建 YAML 配置，一行命令即可发布
- **Cookie 隔离**：支持自定义 Cookie 路径，多用户/多设备互不冲突
- **Claude Code Skill**：支持自然语言指令发布（全局安装 skill 后可用）
- **图文消息自动编辑**：标题、正文、封面、作者自动填充
- **操作日志与失败截图**：失败时自动截图，便于排查

---

## Claude Code Skill（自然语言发布）

本项目已内置 Claude Code Skill，支持用自然语言直接发布文章到微信公众号草稿箱。

### 安装 Skill（全局可用）

```bash
curl -fsSL https://raw.githubusercontent.com/lixinran2015/weixingongzhonghao/main/install-skill.sh | bash
```

安装后，在任何目录打开 Claude Code，直接说：

> "把这篇文章发到微信草稿"
> "publish wechat draft"

Claude 会自动：
1. 查找 `weixingongzhonghao-publisher` 项目目录
2. 检查 Cookie 登录状态（失效时自动打开浏览器引导扫码）
3. 执行发布并反馈草稿链接

### 项目目录查找规则

Skill 按以下顺序查找项目：
1. 当前工作目录
2. `WECHAT_PUBLISHER_DIR` 环境变量
3. `~/workspace/weixingongzhonghao` 或 `~/weixingongzhonghao`

---

## 快速开始

### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 2. 扫码登录（首次使用）

```bash
npm run login
```

执行后会自动打开浏览器窗口，使用微信扫码登录公众号平台。登录成功后，Cookie 会自动保存到默认路径（`~/.config/weixingongzhonghao/cookies.json`）。

> 你也可以手动导出 Cookie 保存到该路径，但扫码登录更省心。

### 3. 检查登录状态

```bash
npm run check:login
# 或调试模式（显示浏览器窗口）
npm run check:login -- --debug
```

### 4. 发布文章

#### 方式 A：直接传入 HTML 文件（推荐）

```bash
# 标题自动读取 HTML <title> 标签
npm run publish -- --file ./articles/2026-04-16.html

# 手动指定标题
npm run publish -- --file ./articles/2026-04-16.html --title "A股短线龙头日报"

# 自定义 Cookie 路径
npm run publish -- --file ./articles/2026-04-16.html --cookie ~/.config/weixingongzhonghao/cookies.json
```

#### 方式 B：使用 YAML 配置文件

```bash
cp config/example-article-config.yaml config/article-config.yaml
# 编辑 config/article-config.yaml 后运行
npm run publish -- --config ./config/article-config.yaml
```

#### 调试模式

首次运行或遇到问题时，建议加 `--debug`：

```bash
npm run publish -- --file ./articles/2026-04-16.html --debug
```

---

## CLI 命令与参数

| 命令 | 说明 | 常用参数 |
|---|---|---|
| `npm run login` | 扫码登录并保存 Cookie | `--cookie <path>` 自定义保存路径 |
| `npm run check:login` | 检查 Cookie 是否有效 | `--cookie <path>`, `--debug` |
| `npm run publish` | 发布文章到草稿箱 | `--file <path>`, `--title <title>`, `--config <path>`, `--cookie <path>`, `--debug` |

### Cookie 路径优先级

`--cookie` 参数 > `WECHAT_COOKIE_PATH` 环境变量 > `~/.config/weixingongzhonghao/cookies.json` > 项目目录 `cookies/cookies.json`

### 环境变量

```bash
# 设置全局默认 Cookie 路径
export WECHAT_COOKIE_PATH=~/.config/weixingongzhonghao/cookies.json

# 设置 Skill 查找的项目目录
export WECHAT_PUBLISHER_DIR=/path/to/weixingongzhonghao
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
│   │   └── cookie-manager.ts    # Cookie 管理（支持自动保存）
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义
│   └── index.ts                 # CLI 入口
├── config/
│   └── example-article-config.yaml
├── articles/                    # 文章正文存放目录
├── covers/                      # 封面图片存放目录
├── logs/                        # 日志与截图
├── reports/                     # 发布结果报告
├── .claude/skills/              # Claude Code Skill
│   └── publish-wechat-draft/
│       └── SKILL.md
└── install-skill.sh             # 全局 Skill 一键安装脚本
```

---

## 核心流程

1. **登录检查** → Cookie 无效时自动打开浏览器扫码
2. **进入编辑器** → 提取 token 跳转图文编辑页
3. **填写标题** → 定位 `#title` 输入框
4. **填写正文** → 通过 `contenteditable` 编辑器注入 HTML 内容
5. **设置封面** → 点击上传区域并选择图片文件
6. **保存草稿** → 点击保存按钮并检测成功提示

---

## 注意事项

1. **首次发布前必须登录**：运行 `npm run login` 扫码，或手动准备 Cookie 文件
2. **Cookie 有效期**：微信公众号 Cookie 会过期，失效后再次运行 `npm run login` 即可
3. **页面改版**：如果微信页面结构变化，可能需要更新 `src/core/publisher.ts` 中的 DOM 选择器
4. **调试建议**：遇到问题请加 `--debug`，观察浏览器行为并查看 `logs/screenshots/` 截图
5. **封面限制**：建议使用 jpg/png 格式，大小不超过 5MB

---

## 故障排查

### 登录验证失败 / Cookie 已失效

- 运行 `npm run login` 重新扫码登录
- 运行 `npm run check:login -- --debug` 观察浏览器行为

### 未找到标题/正文编辑器

- 微信页面可能已改版，查看 `logs/screenshots/` 中的最新截图确认页面状态
- 检查当前 URL 是否已进入 `appmsg_edit` 编辑页面

### 封面未上传成功

- 微信封面上传弹窗可能是自定义组件，自动上传有一定失败率
- 若自动上传失败，工具会跳过封面继续保存草稿

### 发布命令报错 "请提供 --config 或 --file"

- 确保传入了文章源：`--file ./articles/xxx.html` 或 `--config ./config/xxx.yaml`

---

## License

MIT
