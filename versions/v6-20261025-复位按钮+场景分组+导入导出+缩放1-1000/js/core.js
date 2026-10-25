/* =========================================================
   常量
   ========================================================= */
let SCALE = 100;                          // 每米像素数（可缩放）
const SCALE_MIN = 1, SCALE_MAX = 1000;    // 1% ~ 1000%（SCALE 的数值即百分比）
const MAX_PARTICLES = 1500;
const MAX_TRAIL = 420;
const SUB_DT = 0.0008;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* =========================================================

   主题（亮色 / 暗色）
   ========================================================= */
const theme = { light: false };

/* 画布用色：随主题切换 */
const CANVAS_DARK = {
  grid:      'rgba(56,189,248,0.075)',
  gridMajor: 'rgba(148,163,184,0.10)',
  gridPlain: 'rgba(148,163,184,0.055)',
  axis:      'rgba(56,189,248,0.16)',
  guide:     'rgba(56,189,248,0.55)',
  guideSoft: 'rgba(56,189,248,0.22)',
  labelBg:   'rgba(11,17,32,0.6)',
  handleBd:  'rgba(255,255,255,0.92)',
  obstacle:  'rgba(226,232,240,0.92)',
  obstacle2: 'rgba(148,163,184,0.45)',
  marquee:   'rgba(56,189,248,0.75)',
  marqueeBg: 'rgba(56,189,248,0.10)',
  selBox:    'rgba(56,189,248,0.75)',
  nameText:  '#0b1120',
  shadow:    'rgba(0,0,0,0.55)',
};
const CANVAS_LIGHT = {
  grid:      'rgba(37,99,235,0.10)',
  gridMajor: 'rgba(51,65,85,0.14)',
  gridPlain: 'rgba(100,116,139,0.10)',
  axis:      'rgba(37,99,235,0.20)',
  guide:     'rgba(2,132,199,0.65)',
  guideSoft: 'rgba(2,132,199,0.22)',
  labelBg:   'rgba(255,255,255,0.82)',
  handleBd:  'rgba(15,23,42,0.78)',
  obstacle:  'rgba(51,65,85,0.9)',
  obstacle2: 'rgba(100,116,139,0.55)',
  marquee:   'rgba(2,132,199,0.85)',
  marqueeBg: 'rgba(2,132,199,0.10)',
  selBox:    'rgba(2,132,199,0.85)',
  nameText:  '#0b1120',
  shadow:    'rgba(15,23,42,0.25)',
};
function CV(){ return theme.light ? CANVAS_LIGHT : CANVAS_DARK; }

/* #rrggbb 明度缩放：亮色主题下把亮色压深，保证白底可读 */
function shade(hex, f){
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
/* 主题化颜色：亮色主题自动压深 */
function tc(hex){ return theme.light ? shade(hex, 0.72) : hex; }
/* 两色线性插值（用于速率条由蓝转红） */
function mixHex(h1, h2, t){
  const p = h => { const n = parseInt(h.slice(1),16); return [(n>>16)&255, (n>>8)&255, n&255]; };
  const a = p(h1), b = p(h2);
  const c = a.map((v,i) => Math.round(lerp(v, b[i], t)));
  return '#' + ((1<<24) + (c[0]<<16) + (c[1]<<8) + c[2]).toString(16).slice(1);
}

/* 速度条配色：沿色相环 蓝 → 青 → 绿 → 黄 → 红
   （直接在两色之间插值，中段会发灰发紫，不好看）
   指数 1.4 让低中速长时间保持蓝色调，只有接近满速才明显转红 */
function rampColor(p){
  const t = clamp(p, 0, 1);
  const h = lerp(200, 0, Math.pow(t, 1.4));
  const s = lerp(84, 88, t);
  const l = lerp(57, 54, t);
  return 'hsl(' + h.toFixed(1) + ',' + s.toFixed(0) + '%,' + l.toFixed(0) + '%)';
}

/* 视图平移：画布中心对应的世界坐标 */
const view = { cx: 0, cy: 0 };

/* =========================================================

   画布
   ========================================================= */
const canvas = document.getElementById('cv');
let ctx = canvas.getContext('2d');
/* 场渲染离屏层：负场在这一层上"挖洞"，从而只淡化场本身、不伤网格与粒子 */
let fieldLayer = null, fieldCtx = null;
/* 背景层：网格 + 场 + 负场标记合成到一张位图。
   场景（视图/主题/组件几何/选中态）不变时，每帧只需一次 drawImage。 */
let bgLayer = null, bgCtx = null;
let bgHash = -1;
let W = 0, H = 0;

function resize(){
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!fieldLayer){
    fieldLayer = document.createElement('canvas');
    fieldCtx = fieldLayer.getContext('2d');
  }
  fieldLayer.width  = canvas.width;
  fieldLayer.height = canvas.height;
  fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!bgLayer){
    bgLayer = document.createElement('canvas');
    bgCtx = bgLayer.getContext('2d');
  }
  bgLayer.width  = canvas.width;
  bgLayer.height = canvas.height;
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgHash = -1;                      // 尺寸变了，背景层作废
}
window.addEventListener('resize', resize);
resize();

function w2s(x, y){ return [W/2 + (x - view.cx)*SCALE, H/2 - (y - view.cy)*SCALE]; }
function s2w(sx, sy){ return [(sx - W/2)/SCALE + view.cx, (H/2 - sy)/SCALE + view.cy]; }

/* =========================================================

   工具函数
   ========================================================= */
function hexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
