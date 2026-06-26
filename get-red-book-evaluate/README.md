# get-red-book-evaluate

一个面向 Codex 的 Skill，用于把小红书商品搜索结果整理成购买参考报告。

## 适用场景

- 搜索并总结小红书用户对某个商品的评价
- 从正文和评论里提取价格、续航、品控、合规、售后等关键信息
- 按发布时间/IP/广告识别规则筛选有效帖
- 输出 Markdown 报告，并给出购买建议

## 触发方式

- 以 `/get-red-book-evaluate` 开头
- 或者以“总结小红书用户对某个商品的评价”这类表达发起

## 结构

- `SKILL.md`：入口与触发说明
- `prompts/`：工作流步骤，每个文件包含目标、输入、动作、产出和完成标准
- `templates/report-template.md`：最终 Markdown 总结报告模板
- `agents/openai.yaml`：Codex UI 元数据

## 工作流

1. `00-overview.md`：定义任务目标和产出
2. `01-clarify.md`：确定关键词、有效帖数量、时间/IP范围和输出路径
3. `02-preflight.md`：接管 Chrome，检查小红书首页、登录态和搜索能力
4. `03-search.md`：搜索小红书，收集候选帖并筛选有效帖
5. `04-evaluate-post.md`：用新标签页打开帖子，评估正文和评论
6. `05-write-report.md`：写入 Markdown 报告并保留每篇 URL
7. `06-summarize.md`：生成综合购买建议

## 采集规则

- 每个帖子至少停留 5 秒，模拟人工阅读和判断。
- 每个帖子查看 5-50 条评论，评论少则全看，评论多则优先高赞和高回复。
- 遇到折叠评论或折叠回复时尽量展开。
- 正文和评论都没有购买参考价值的帖子，不计入有效帖。

## 说明

本 skill 依赖 `chrome:control-chrome` 在 Chrome 中访问和操作小红书网页。若小红书未登录、白屏、打不开或无法搜索，应立即停止并让用户决定下一步。
