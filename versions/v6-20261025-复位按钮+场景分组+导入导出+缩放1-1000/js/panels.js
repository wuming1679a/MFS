const PANEL_IDS = ['leftPanel', 'propPanel', 'listPanel', 'viewPanel'];

function makePanelDraggable(p){
  const head = p.querySelector('.panelHead');
  if (!head) return;
  let d = null;

  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;      // 折叠按钮不触发拖动
    const r = p.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    p.dataset.dragged = '1';                     // 标记：已被手动挪走，不再受停靠约束
    p.style.left = r.left + 'px';
    p.style.top = r.top + 'px';
    p.style.right = 'auto';
    p.style.bottom = 'auto';
    p.classList.add('dragging');
    try { head.setPointerCapture(e.pointerId); } catch(_){}
    if (p.id === 'viewPanel') fitLeftDock();
  });

  head.addEventListener('pointermove', (e) => {
    if (!d) return;
    const w = p.offsetWidth || 200;
    const x = clamp(e.clientX - d.dx, 4, Math.max(4, window.innerWidth - w - 4));
    const y = clamp(e.clientY - d.dy, 4, Math.max(4, window.innerHeight - 40));
    p.style.left = x + 'px';
    p.style.top = y + 'px';
  });

  const end = (e) => {
    if (!d) return;
    d = null;
    p.classList.remove('dragging');
    try { head.releasePointerCapture(e.pointerId); } catch(_){}
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

/* 折叠 / 展开动画：先锁住当前高度，再过渡到目标高度，动画结束后交还给 CSS */
const COLLAPSE_MS = 260;

/* 标题栏的折叠箭头：朝下 = 展开，朝右 = 已折叠（由 morph 表达旋转） */
function chevIconOf(p){
  const chev = p.querySelector('.chev');
  return chev ? chev.firstElementChild : null;
}
function syncChevron(p){
  const ic = chevIconOf(p);
  if (ic) Icon.set(ic, p.classList.contains('collapsed') ? 'chevronRight' : 'chevronDown');
}

function setPanelCollapsed(p, collapse, animate){
  const body = p.querySelector('.panelBody');
  if (!body) return;
  const cur = p.classList.contains('collapsed');
  if (animate === false || collapse === cur){
    p.classList.toggle('collapsed', !!collapse);
    body.style.height = '';
    body.style.overflow = '';
    body.style.opacity = '';
    syncChevron(p);
    fitLeftDock();
    return;
  }
  clearTimeout(body._collapseTimer);

  if (collapse){
    const h0 = body.getBoundingClientRect().height;
    body.style.overflow = 'hidden';
    body.style.height = h0 + 'px';
    void body.offsetHeight;                 // 让起始高度落地
    p.classList.add('collapsed');           // CSS 用 !important 把高度压到 0 → 触发过渡
    body._collapseTimer = setTimeout(() => {
      body.style.height = '';
      body.style.overflow = '';
      fitLeftDock();
    }, COLLAPSE_MS + 80);
  } else {
    p.classList.remove('collapsed');
    const target = body.scrollHeight;
    body.style.overflow = 'hidden';
    body.style.height = '0px';
    void body.offsetHeight;
    body.style.height = target + 'px';
    body._collapseTimer = setTimeout(() => {
      body.style.height = '';
      body.style.overflow = '';
      fitLeftDock();
    }, COLLAPSE_MS + 80);
  }
  syncChevron(p);
}

/* 左上「组件」与左下「视图」都贴着左边，视图面板高度随内容变化，
   所以组件面板的最大高度要按它的实测高度让位，避免两块互相压盖。 */
function fitLeftDock(){
  const lp = document.getElementById('leftPanel');
  const vp = document.getElementById('viewPanel');
  if (!lp || !vp) return;
  if (lp.dataset.dragged === '1'){ lp.style.maxHeight = ''; return; }
  const vh = vp.getBoundingClientRect().height;
  const limit = Math.max(150, window.innerHeight - vh - 12 - 12 - 8);
  lp.style.maxHeight = limit + 'px';
}
window.addEventListener('resize', fitLeftDock);

function initPanels(){
  for (const id of PANEL_IDS){
    const p = document.getElementById(id);
    if (!p) continue;
    const chev = p.querySelector('.chev');
    if (chev){
      chev.textContent = '';
      chev.appendChild(Icon.el('chevronDown', 14, 2.6));
      chev.addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelCollapsed(p, !p.classList.contains('collapsed'));
      });
    }
    makePanelDraggable(p);
  }
  fitLeftDock();
  requestAnimationFrame(fitLeftDock);      // 等字体/布局稳定后再量一次
}

/* =========================================================
   悬浮按钮：可拖动 + 位置记忆
   ---------------------------------------------------------
   面板是"整块拖"，这里是"单个圆形按钮拖"。要点：
   1) 只有位移超过 4px 才算拖动，否则仍是一次点击（不影响点按切主题）
   2) 拖动结束的 350ms 内忽略随之而来的 click，避免"拖完顺手切了主题"
   3) 位置写进 localStorage，窗口缩放时把按钮夹回可视区内
   ========================================================= */
const DRAG_SLOP = 4;              // px：小于这个位移视为点击（鼠标）
const DRAG_SLOP_TOUCH = 9;        // 触屏抖动更大，阈值放宽，免得点不动

function _floatBox(el){
  const w = el.offsetWidth || 34, h = el.offsetHeight || 34;
  return [w, h];
}
function placeFloat(el, x, y){
  const [w, h] = _floatBox(el);
  el.style.left = clamp(x, 4, Math.max(4, window.innerWidth - w - 4)) + 'px';
  el.style.top  = clamp(y, 4, Math.max(4, window.innerHeight - h - 4)) + 'px';
  el.style.right = 'auto';
}
function readFloatPos(key){
  try {
    const o = JSON.parse(localStorage.getItem(key) || 'null');
    if (o && typeof o.x === 'number' && typeof o.y === 'number') return o;
  } catch(_){}
  return null;
}
function writeFloatPos(key, el){
  const r = el.getBoundingClientRect();
  try { localStorage.setItem(key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch(_){}
}

function makeFloatDraggable(el, key){
  if (!el) return;
  let press = null, moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = el.getBoundingClientRect();
    press = { px: e.clientX, py: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top,
              touch: e.pointerType === 'touch' };
    moved = false;
    try { el.setPointerCapture(e.pointerId); } catch(_){}
  });

  el.addEventListener('pointermove', (e) => {
    if (!press) return;
    if (!moved){
      const slop = press.touch ? DRAG_SLOP_TOUCH : DRAG_SLOP;
      if (Math.hypot(e.clientX - press.px, e.clientY - press.py) < slop) return;
      moved = true;
      el.classList.add('dragging');
    }
    placeFloat(el, e.clientX - press.ox, e.clientY - press.oy);
  });

  const end = (e) => {
    if (!press) return;
    const wasDrag = moved;
    press = null;
    moved = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch(_){}
    if (wasDrag){
      writeFloatPos(key, el);
      el._dragEndedAt = performance.now();     // 让紧随其后的 click 空转
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // 窗口尺寸变化：把按钮夹回可视区，但不再重排到默认位置
  window.addEventListener('resize', () => {
    if (!el.style.left) return;
    placeFloat(el, parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
  });
}

/* 拖动结束后的那次 click 不算点击 */
function floatClickAllowed(el){
  return performance.now() - (el._dragEndedAt || 0) > 350;
}

/* =========================================================
   主题切换
   ========================================================= */
const themeBtn = document.getElementById('themeBtn');
const themeIconNode = themeBtn ? Icon.el('sun', 19, 2) : null;
if (themeBtn && themeIconNode) themeBtn.appendChild(themeIconNode);

const THEME_POS_KEY = 'simThemePos';
makeFloatDraggable(themeBtn, THEME_POS_KEY);
(function restoreThemePos(){
  const p = readFloatPos(THEME_POS_KEY);
  if (p && themeBtn) placeFloat(themeBtn, p.x, p.y);
})();

function applyTheme(light, silent){
  theme.light = !!light;
  // 双写：body 给自有色板，html 给 Oat 的 color-scheme
  document.body.classList.toggle('light', theme.light);
  document.documentElement.classList.toggle('light', theme.light);

  // 发射器 / 粒子颜色跟随主题（色板有两套）
  for (const c of state.components){
    if (c.kind === 'emitter' && typeof c.cidx === 'number') c.color = palColor(c.cidx);
  }
  // 粒子颜色按「调色板索引」取，换主题时自动跟着变，无需逐粒子回写

  if (themeBtn){
    Icon.set(themeIconNode, theme.light ? 'moon' : 'sun');
    const tip = (theme.light ? '切换到暗色主题（T）' : '切换到亮色主题（T）') + ' · 可拖动';
    themeBtn.title = tip;
    themeBtn.dataset.tooltip = tip;
    themeBtn.setAttribute('aria-label', tip);
  }
  try { localStorage.setItem('simTheme', theme.light ? 'light' : 'dark'); } catch(_){}

  if (!silent) showHint(theme.light ? '已切换到亮色主题' : '已切换到暗色主题');
  buildPropPanel();
  renderCompList();
}

if (themeBtn) themeBtn.onclick = () => {
  if (!floatClickAllowed(themeBtn)) return;   // 刚拖完，不触发切换
  applyTheme(!theme.light);
};

/* =========================================================
   复位：视图 + 面板布局 + 悬浮按钮
   ---------------------------------------------------------
   清掉所有"手动挪过"的痕迹，让界面回到 CSS 定义的默认位置：
     1) 视图缩放 / 平移回到 100% / 原点（resetView 在 interact.js）
     2) 四个面板去掉内联 left/top 与 dataset.dragged，并全部展开
     3) 主题按钮清掉拖放记忆，回到 CSS 的默认右上角
   组件与粒子不动 —— 复位的是"看的方式"，不是"画的内容"。
   ========================================================= */
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) resetBtn.appendChild(Icon.el('rotateCcw', 17, 2));

function resetAllLayout(){
  // 1) 视图
  if (typeof resetView === 'function') resetView();

  // 2) 面板
  for (const id of PANEL_IDS){
    const p = document.getElementById(id);
    if (!p) continue;
    p.style.left = '';
    p.style.top = '';
    p.style.right = '';
    p.style.bottom = '';
    p.style.maxHeight = '';
    p.classList.remove('dragging');
    delete p.dataset.dragged;
    setPanelCollapsed(p, false, false);      // 立刻展开，不做过渡
  }

  // 3) 悬浮按钮
  try { localStorage.removeItem(THEME_POS_KEY); } catch(_){}
  if (themeBtn){
    themeBtn.style.left = '';
    themeBtn.style.top = '';
    themeBtn.style.right = '';
    themeBtn.classList.remove('dragging');
    themeBtn._dragEndedAt = 0;
  }

  fitLeftDock();
  requestAnimationFrame(fitLeftDock);
  buildPropPanel();

  if (resetBtn){
    resetBtn.classList.remove('spin');
    void resetBtn.offsetWidth;               // 重启动画
    resetBtn.classList.add('spin');
    setTimeout(() => resetBtn.classList.remove('spin'), 520);
  }
  showHint('已复位视图与面板布局');
}

if (resetBtn) resetBtn.onclick = () => resetAllLayout();

/* 画布右键不弹菜单（拖动更顺手） */
canvas.addEventListener('contextmenu', e => e.preventDefault());

