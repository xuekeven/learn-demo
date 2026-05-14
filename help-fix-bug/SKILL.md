---

name: help-fix-bug
description: 系统性排查并修复缺陷：澄清现象与复现、收集证据（日志/报错/环境）、缩小范围、提出最小修复并验证。在用户以 /help-fix 开头（可接问题描述、禅道/Jira/前端监控警告的链接、或 https://*.jd100.com/* 产品H5链接），或说「帮我看看这个 bug」「帮我看看这个问题」「帮忙排查一下」「看下这个报错」等求助排查/修复表达（可接同上描述或链接）时触发。
allowed-tools: Read, Write, Edit, Bash

---

# 排查解决问题（Help Fix Bug）

## 触发条件

在对话以以下任一方式表达排查/修复意图时，**主动按本 Skill 流程执行**：

- 以 `/help-fix` 开头（可带空格后接**具体问题描述**、**问题报告链接**、**项目产品链接**，可组合，也可为空）
- 「看看这个问题/bug」「解决一个问题/bug」「排查一下」「看下这个报错」等**求助排查/修复**的表达（后接**具体问题描述**、**问题报告链接**、**项目产品链接**，可组合，也可为空）

**报告链接**（`*` 表示可变片段）：

- 禅道：`https://zentao.jiandan100.cn/zentao/bug-view-*.html`  
示例：`https://zentao.jiandan100.cn/zentao/bug-view-59554.html`
- Jira：`https://jira.jiandan100.cn/jira/browse/JDRW-`*  
示例：`https://jira.jiandan100.cn/jira/browse/JDRW-129337`
- 前端监控警告：`https://fe-monitor.jd100.com/easytech/issues/*?project=`*  
示例：`https://fe-monitor.jd100.com/easytech/issues/24150?project=10`

**产品链接**（`*` 表示可变片段）：

- `https://*.jd100.com/`*（子域名为占位，路径与查询串可变）  
示例：`https://jdldoq.jd100.com/checkQuestion?subjectId=3&questionId=61599`

若用户明确只要解释概念、不要做排查，则不要强行套本流程。

## 目标

根据用户提供的信息，首先分析定位 bug 产生原因并报告给用户，然后等用户实际手动复现和确认原因，之后再给出多种（如果有）可验证的修复方案并报告给用户，然后等用户选择方案和确认解决 bug，之后排查整个项目是否存在相同的问题，最终总结生成 bug 报告。

## 工作流

### 1. 了解bug

参考 `./prompts/comprehend.md` 文档开始。

### 2. 分析bug

参考 `./prompts/analyze.md` 文档开始。

### 3. 修复bug

参考 `./prompts/fix.md` 文档开始。

### 4. 总结bug

参考 `./prompts/summarize.md` 文档开始。

## 与用户沟通方式

- 解答时，先列出bug详情，然后说**结论或当前最可能原因**，再给**证据链**（日志行、代码引用）
- 阻塞时明确阻塞点（需用户本机权限/密钥/业务数据时如实说明），并写出 **缺少什么信息**、**谁能提供**、**下一步应该怎样**

## 示例触发话术（等价即启用）

- `/help-fix 登录后偶发 401`
- `/help-fix https://zentao.jiandan100.cn/zentao/bug-view-59554.html`
- `/help-fix https://jdldoq.jd100.com/checkQuestion?subjectId=3&questionId=61599`
- 「帮我看看这个 bug，批量导出会卡住」
- 「帮我看看这个问题，明明有数据列表却是空的」
- 「帮忙排查一下 https://jira.jiandan100.cn/jira/browse/JDRW-129337」
- 「看下这个报错 https://fe-monitor.jd100.com/easytech/issues/24150?project=10」

