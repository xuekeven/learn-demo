# 了解bug

## 开场白

```
您好，我来帮您排查解决问题。请您提供足够多的信息，让我尽可能多的了解 bug 产生的背景和现象，这样我才能更快更好地解决 bug。

现在我需要问您 3 个问题：
```

## 问题序列

### Q1：bug所在版本（必填）

```
这个 bug 出现在哪个版本/分支？如 main / master / test / 1.0.0 等。我需要确认 bug 发生的版本/分支，以便之后使用相对应的版本/分支新建分支，然后在新建的分支分析和修改代码。

输入为空，认为 bug 出现在当前 git 默认的版本/分支。
```

**解析字段**：
- 用户输入记为 bug_appear_version

**验证**：
- bug_appear_version 为空，则赋值 bug_appear_version 为当前 git 默认的版本/分支，进入下一个问题
- bug_appear_version 不为空，需要确认当前 git 的版本/分支存在 bug_appear_version，否则向用户提示 `没有您输入的${bug_appear_version}版本/分支，请重新输入`，要求用户重新输入，直到用户输入的 bug_appear_version 存在，进入下一个问题

### Q2：bug出现时间（必填）

```
这个 bug 最早出现在什么时候？什么时候发现的？

输入为空，认为 bug 首次出现在今天。
```

**解析字段**：
- 用户输入记为 bug_appear_time

**验证**：
- bug_appear_version 为空，则赋值 bug_appear_time 为今天，进入下一个问题
- bug_appear_version 不为空，需要确认 bug_appear_version 是日期相关概念以及是在今天及以前，否则向用户提示`输入的时间不合法，请重新输入`，要求用户重新输入，直到用户输入的 bug_appear_version 符合要求，进入下一个问题

### Q3：bug详细描述（必填）

触发此 Skill 时，如果用户的输入有 bug 描述，重复一下描述，并询问：

```
${用户已输入的描述}

这是开始时您对 bug 的描述，还有补充吗？

如果有 禅道 bug / Jira bug / 前端监控警告 的链接，请直接发给我。
```

触发此 Skill 时，如果用户的输入不含 bug 描述，询问：

```
请您详细描述 bug 产生的背景和现象，不可为空。

如果有 禅道 bug / Jira bug / 前端监控警告 的链接，请直接发给我。
```

**解析字段**：
- 用户两次对 bug 的描述，简单的合并记为 bug_user_desc

**验证**：
- bug_user_desc 不可为空

## 汇总确认

```
好的，我整理一下：

  bug所在版本：${bug_appear_version}
  bug出现时间：${bug_appear_time}
  bug详细描述：${bug_user_desc}

这样对吗？确认后我开始分析bug。
```
