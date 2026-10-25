const PANEL_IDS = ['leftPanel', 'propPanel', 'listPanel', 'viewPanel'];

function makePanelDraggable(p){
  const head = p.querySelector('.panelHead');
  if (!head) return;
  let d = null;

  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;      // 折叠按钮不触发拖动
    const r = p.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    p.style.left = r.left + 'px';
    p.style.top = r.top + 'px';
    p.style.right = 'auto';
    p.style.bottom = 'auto';
    p.classList.add('dragging');
    try { head.setPointerCapture(e.pointerId); } catch(_){}
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
    }, COLLAPSE_MS + 80);
  }
  syncChevron(p);
}

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
}

function resetLayout(){
  for (const id of PANEL_IDS){
    const p = document.getElementById(id);
    if (!p) continue;
    p.style.left = p.style.top = p.style.right = p.style.bottom = '';
    setPanelCollapsed(p, false, false);
  }
  buildPropPanel();
  showHint('面板布局已复位');
}

/* =========================================================
   主题切换
   ========================================================= */
const themeBtn = document.getElementById('themeBtn');
const themeIconNode = themeBtn ? Icon.el('sun', 19, 2) : null;
if (themeBtn && themeIconNode) themeBtn.appendChild(themeIconNode);

function applyTheme(light, silent){
  theme.light = !!light;
  document.body.classList.toggle('light', theme.light);
  document.documentElement.classList.toggle('light', theme.light);

  // 发射器 / 粒子颜色跟随主题（色板有两套）
  for (const c of state.components){
    if (c.kind === 'emitter' && typeof c.cidx === 'number') c.color = palColor(c.cidx);
  }
  // 粒子颜色按「调色板索引」取，换主题时自动跟着变，无需逐粒子回写

  if (themeBtn){
    Icon.set(themeIconNode, theme.light ? 'moon' : 'sun');
    themeBtn.title = theme.light ? '切换到暗色主题（T）' : '切换到亮色主题（T）';
  }
  try { localStorage.setItem('simTheme', theme.light ? 'light' : 'dark'); } catch(_){}

  if (!silent) showHint(theme.light ? '已切换到亮色主题' : '已切换到暗色主题');
  buildPropPanel();
  renderCompList();
}

if (themeBtn) themeBtn.onclick = () => applyTheme(!theme.light);

const layoutBtn = document.getElementById('layoutBtn');
const layoutIconNode = layoutBtn ? Icon.el('layoutDashboard', 19, 2) : null;
if (layoutBtn){
  layoutBtn.appendChild(layoutIconNode);
  layoutBtn.onclick = () => {
    resetLayout();
    Icon.flash(layoutIconNode, 'rotateCcw', 'layoutDashboard', 700);
  };
}

/* 画布右键不弹菜单（拖动更顺手） */
canvas.addEventListener('contextmenu', e => e.preventDefault());

