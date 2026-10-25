# v5 — 场景保存/加载 + 主题按钮拖放 + 弱化虚化

日期：2026-10-25　基于 v4

## 本次变更

1. **弱化「选中后其它组件虚化」**
   四个淡化系数统一抬高（改的是 `js/render.js` 顶部的常量，方便再调）：
   | 对象 | v4 | v5 |
   |---|---|---|
   | 场填充 / 箭头 | 0.07 | 0.16 |
   | 障碍线 | 0.12 | 0.34 |
   | 发射器本体 | 0.18 | 0.42 |
   | 负场虚框 / 名称 | 0.32 | 0.55 |

2. **主题切换 tooltip 改为朝下**
   按钮加 `data-tooltip-placement="bottom"`（Oat 的 tooltip 读这个属性，`--_y:1` 即向下）。
   文案也补了「· 可拖动」，让拖放能力可被发现。

3. **主题按钮支持拖放并记住位置**
   - 从 `#topTools` 的 flex 流里独立出来，改成 `position:fixed`（默认 `right:12px; top:12px`）
   - 通用 `makeFloatDraggable(el, key)`：位移 > 4px 才算拖动；松手写 `localStorage['simThemePos']`
   - 拖动结束后 350ms 内的 click 被忽略，避免"拖完顺手切了主题"
   - 窗口缩放时自动夹回可视区

4. **场景保存 / 加载**（新增 `js/scene.js`）
   - 右上「场景」按钮（或按 `S`）打开 `<dialog>`；`Ctrl/Cmd+S` 直接用自动名保存
   - 保存内容：全部组件 + 缩放 + 平移 + 速率 + 吸附设置（主题不进场景）
   - 多槽位、命名、同名覆盖、最多 12 个、点条目即加载、× 删除
   - 存储：`localStorage['simScenes']`，纯 JSON，清站点数据会丢失
   - 只序列化可编辑字段（白名单 `SCENE_FIELDS`），运行态（acc / emittedOnce / color / 粒子 / 轨迹）一律不存
   - 加载时：清粒子 → 重建组件 → 按名字反推计数器 → 重排 id → 恢复视图/速率/吸附 → 作废背景层缓存 → 刷新面板

5. **亮色主题鼠标改黑色**
   画布的 `crosshair` 换成自绘 SVG 十字：`--cursor-cross` 两个版本，暗色用 `#e6edf7`、亮色用 `#111a2b`。
   比系统反色光标稳定（深色背景上系统反色经常糊成一团）。

## 目录
```
index.html            147 行（新增场景按钮 / dialog）
css/  base 142 · panels 190 · controls 131
js/   core 142 · snap 190 · geometry 290 · state 155 · physics 359
      render 1174 · ui 844 · panels 256 · scene 300 · controls 115
      interact 784 · main 52 · icons 85
assets/icons.js        24    Lucide IconNode
vendor/oat/            Oat UI（本地）
vendor/morphicons.js   morphicons 2.0.2（经典脚本）
```

## 验证
回归 134 项全绿（新增 27 项：tooltip 朝向 ×2、光标配色 ×2、按钮 drag/save/click 抑制 ×3、场景 save/load 字段 ×12、同名覆盖、自动命名、对话框开关、列表渲染、坏数据容错）。
