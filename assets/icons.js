/*!
 * 图标数据 —— 取自 Lucide（ISC License, © Lucide Contributors）
 * https://lucide.dev
 *
 * 结构是 morphicons 原生的 IconNode（Lucide 格式：[tag, attrs][]），
 * 而不是拼起来的 d 字符串 —— 每个 <path> 的相对指令（m/l）各自独立，
 * 拼成一条 d 会让后续子路径的坐标以错误的起点计算。
 * 统一 24×24 网格 / 2px 描边，任意两个图标可以直接互相形变。
 */
const ICON_D = {
  play:            [['polygon', { points: '6 3 20 12 6 21 6 3' }]],
  pause:           [['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }], ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }]],
  sun:             [['circle', { cx: '12', cy: '12', r: '4' }], ['path', { d: 'M12 2v2' }], ['path', { d: 'M12 20v2' }], ['path', { d: 'm4.93 4.93 1.41 1.41' }], ['path', { d: 'm17.66 17.66 1.41 1.41' }], ['path', { d: 'M2 12h2' }], ['path', { d: 'M20 12h2' }], ['path', { d: 'm6.34 17.66-1.41 1.41' }], ['path', { d: 'm19.07 4.93-1.41 1.41' }]],
  moon:            [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
  chevronDown:     [['path', { d: 'm6 9 6 6 6-6' }]],
  chevronRight:    [['path', { d: 'm9 18 6-6-6-6' }]],
  trash2:          [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }], ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }], ['line', { x1: '10', y1: '11', x2: '10', y2: '17' }], ['line', { x1: '14', y1: '11', x2: '14', y2: '17' }]],
  layoutDashboard: [['rect', { x: '3', y: '3', width: '7', height: '9', rx: '1' }], ['rect', { x: '14', y: '3', width: '7', height: '5', rx: '1' }], ['rect', { x: '14', y: '12', width: '7', height: '9', rx: '1' }], ['rect', { x: '3', y: '16', width: '7', height: '5', rx: '1' }]],
  rotateCcw:       [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
  magnet:          [['path', { d: 'm6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15' }], ['path', { d: 'm5 8 4 4' }], ['path', { d: 'm12 15 4 4' }]],
  plus:            [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  minus:           [['path', { d: 'M5 12h14' }]],
  crosshair:       [['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '22', y1: '12', x2: '18', y2: '12' }], ['line', { x1: '6', y1: '12', x2: '2', y2: '12' }], ['line', { x1: '12', y1: '6', x2: '12', y2: '2' }], ['line', { x1: '12', y1: '22', x2: '12', y2: '18' }]],
  download:        [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '7 10 12 15 17 10' }], ['line', { x1: '12', y1: '15', x2: '12', y2: '3' }]],
  upload:          [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '17 8 12 3 7 8' }], ['line', { x1: '12', y1: '3', x2: '12', y2: '15' }]],
  folder:          [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
};
