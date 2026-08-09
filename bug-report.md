# bug-report · 标签选中状态显示错误

- 版本：v1.1.0（在 v1.1.1 修复）
- 修复日期：2026-08-09

## 现象

打开公司分析页（如「京都动画」），提示"默认只统计参与身份为「动画制作」的作品"，作品列表也确实只显示了动画制作条目，但上方一排身份标签**全部显示为选中状态**，与实际筛选不一致，造成误导。

## 原因

`js/views/analysis.js` 中的 `chip()` 工具函数创建标签时写死了选中类名：

```js
c.className = 'chip active';   // 无论真实状态如何，一律带 active
```

而筛选逻辑 `state.roles` 在公司场景下只有「动画制作」为 `true`。两者不同步，导致视觉选中状态与真实筛选状态脱节。

## 修复

- `chip(label, onChange, active)` 增加第三个参数 `active`，按真实状态初始化类名：`c.className = 'chip' + (active ? ' active' : '')`。
- 创建身份标签时传入 `state.roles[r]`，创建类型标签时传入 `state.types[t.code]`。

## 验证

- 公司页（id=2481）：`#ana-role-chips .chip` 中仅「动画制作 (102)」为 `active`，其余均为 `false`。
- 个人页（id=1913）：15 个身份标签全部为 `active`，个人逻辑未受影响。
