# v4 — 接入 Oat UI（本地化）+ 删除画板复位按钮

日期：2026-10-25　基于 v3

## 本次变更
1. **删除画板复位按钮**：`#layoutBtn`、`resetLayout()`、`Icon.flash` 相关代码全部移除，右上工具区只剩主题按钮。
2. **组件换成 Oat（https://oat.ink/）**：整套 UI 外观改由 Oat 提供，我们只保留排版与配色桥接。
   - 面板 → Oat `.card`
   - 分段控件（类别 / 缩放 / 吸附步长 / 吸附模式 / 属性里的所有多选）→ `[role=tablist]` + `[role=tab]`
   - 吸附开关 → `input[type=checkbox][role=switch]`
   - 滑杆 / 数字框 → 原生 `input[type=range]` / `input[type=number]` 的 Oat skin
   - 按钮 → `.outline` / `.ghost` / `.small` / `.icon` / `[data-variant=danger]`
   - 提示 → `ot.toast()`（单条覆盖，顶部居中）
   - 悬浮按钮提示 → `data-tooltip`（Oat 的 popover tooltip）
   - 说明块 → `[role=alert]`，自定义数值 → `.badge[data-variant=warning]`
3. **完全本地化**：`vendor/oat/oat.min.css` + `vendor/oat/oat.min.js`，页面里没有任何 http(s) 外链，`file://` 双击可跑。

## 目录
```
index.html            入口（语义化标签 + Oat 组件结构）
css/base.css          色板 + Oat 令牌桥接（--background/--primary/…）+ 画布
css/panels.css        面板骨架、分段控件、属性行排版
css/controls.css      悬浮控件、速率条、toast 微调、响应式
js/*.js               与 v3 相同分层，UI 构建改吐 Oat 结构
vendor/oat/           Oat 0.0.0（jsdelivr 下载后本地存档）
vendor/morphicons.js  morphicons 2.0.2（经典脚本打包）
assets/icons.js       Lucide IconNode 数据
```

## 兼容说明
Oat 的样式全部在 `@layer` 里，我们的 css 不带 layer → 无层样式天然压过 Oat，
所以主题定制不需要 `!important`；反之要小心不要再写 `*{padding:0}` 这类全局重置。
