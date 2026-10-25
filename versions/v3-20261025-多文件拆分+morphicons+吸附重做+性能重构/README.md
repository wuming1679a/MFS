# v3 — 多文件拆分 + morphicons 动效图标 + 吸附重做 + 性能重构

日期：2026-10-25

## 相对 v2（单文件）的变更
- 单文件 4096 行 → index.html + 3 CSS + 12 JS + vendor/ + assets/，全部经典 script，`file://` 双击可运行
- 吸附：磁性 / 严格 双模式；场边界 → 组件对齐参考线 → 网格 三级优先级；整组拖动只算一次偏移
- 性能：粒子 SoA TypedArray、轨迹环形缓冲、背景层哈希缓存、按调色板×轨迹模式分桶批绘
- 图标：morphicons 2.0.2 本地打包成经典脚本，Lucide IconNode 数据（13 个图标）

## 原单文件
../legacy/原单文件-4096行.html
