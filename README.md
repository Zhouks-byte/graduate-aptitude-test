# 考研备考 · PWA

一个零依赖、原生 JS 实现的考研备考 Web 应用，可作为 PWA 离线使用，数据仅存本机（localStorage，`kp_` 前缀）。

## 功能模块

| 模块 | 说明 |
|------|------|
| 仪表盘 | 各科进度环、连续打卡、当月完成率、今日任务摘要 |
| 题库 | 按科目/章节/题型筛选、限时练习、逐题作答与解析 |
| 真题 | 历年真题套卷，逐题提交、判分、错误原因归因 |
| 计划 | 月历 + 当天任务，打卡统计、完成率 |
| 单词 | 间隔复习卡片、评级、掌握度跟踪 |
| 错题本 | 聚合各模块错题，可重做、标记已掌握 |
| 间隔复习 | 基于艾宾浩斯的复习队列 |
| 模考 | 模考记录、分数/正确率趋势、六维薄弱点雷达 |
| 笔记 | 按科目分组、内置 Markdown 渲染、标签 |

## 技术特性

- **零依赖**：纯原生 JS/CSS/HTML，无构建、无框架、无外部字体/图标。
- **PWA**：`manifest.webmanifest` + `sw.js`（离线缓存），可"添加到主屏"。
- **离线单文件**：`考研备考-离线版.html`（内联 CSS/JS），双击即可离线打开。
- **数据导出/导入**：顶栏按钮导出全部 `kp_*` 数据为 JSON，导入可恢复。
- **SVG 图表**：纯手绘（环形、双轴趋势折线、六维雷达），深色主题自适应。

## 本地运行

静态应用，任意静态服务器即可：

```bash
# 方式一：用项目自带服务器
node tools/serve.mjs 8899
# 打开 http://localhost:8899
```

或直接把 `index.html` 拖入浏览器（`file://` 下 Service Worker 自动跳过，离线单文件功能不受影响）。

## 生成离线单文件

```bash
node tools/build.mjs
# 输出 考研备考-离线版.html
```

## 生成图标

```bash
node tools/gen-icons.mjs
# 输出 assets/icon-192.png / icon-512.png / icon-1024.png
```

## 运行测试

```bash
node tests/store.test.js
node tests/model.test.js
```

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库（如 `graduate-aptitude-test`）。
2. 本地推送：
   ```bash
   git init
   git add .
   git commit -m "init: 考研备考 PWA"
   git branch -M main
   git remote add origin https://github.com/<用户名>/<仓库>.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Build and deployment**，Source 选 `Deploy from a branch`，分支选 `main` / 根目录 `/ (root)`，保存。
4. 稍后访问 `https://<用户名>.github.io/<仓库>/` 即在线可用（HTTPS，满足 PWA / SW 要求）。

> PWA 的 Service Worker 仅在 HTTPS 或 `localhost` 生效；GitHub Pages 提供 HTTPS，可直接使用。
