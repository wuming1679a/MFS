/* =========================================================
   ★ 交互：拖动逻辑（优化）
   ========================================================= */
let drag = null;
let hover = null;      // 待放置组件的吸附落点 {x, y}

/* 多个组件的并集包围盒（整组拖动时作为对齐基准） */
function unionAABB(list){
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of list){
    const b = compAABB(c);
    if (b.x0 < x0) x0 = b.x0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y0 < y0) y0 = b.y0;
    if (b.y1 > y1) y1 = b.y1;
  }
  if (!isFinite(x0)) return { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { x0, x1, y0, y1 };
}

function snapshot(c){
  return {
    x: c.x, y: c.y, angle: c.angle, vAngle: c.vAngle, fieldAngle: c.fieldAngle,
    w: c.w, h: c.h, r: c.r, span: c.span, len: c.len,
    tv: c.tv ? c.tv.map(p => [p[0], p[1]]) : undefined
  };
}

/* 拖动被取消时回滚到按下时的快照 */
function restoreSnapshot(c, s){
  for (const k of ['x','y','angle','vAngle','fieldAngle','w','h','r','span','len']){
    if (s[k] !== undefined) c[k] = s[k];
  }
  if (s.tv) c.tv = s.tv.map(p => [p[0], p[1]]);
}

/* 悬停光标：按手柄类型给出方向提示 */
const HANDLE_CURSOR = {
  rot:'grab', dir:'grab', fdir:'grab', o1:'grab', o2:'grab',
  sx:'ew-resize', 'sx-':'ew-resize', sy:'ns-resize', 'sy-':'ns-resize',
  ne:'nesw-resize', sw:'nesw-resize', nw:'nwse-resize', se:'nwse-resize',
  r:'nwse-resize', sp1:'ew-resize', sp2:'ew-resize',
  v0:'grab', v1:'grab', v2:'grab',
};
function updateHoverCursor(sx, sy){
  const sel = (state.selection.length === 1) ? primaryComp() : null;
  let cur = '';
  if (sel && !state.pending){
    let bestD = 15, bestT = null;
    for (const pt of handlePoints(sel)){
      const [hx, hy] = w2s(pt.x, pt.y);
      const d = Math.hypot(hx - sx, hy - sy);
      if (d < bestD){ bestD = d; bestT = pt.type; }
    }
    if (bestT) cur = HANDLE_CURSOR[bestT] || 'pointer';
  }
  if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
}

/* 拖动时属性面板不必每帧重建（重建一次要造 20 多个 DOM 节点）。
   这里做节流：拖动中约 11 次/秒，松手时 finishDrag 会立即补一次精确刷新。 */
let propRaf = 0, propLastAt = 0, propPending = false;

function schedulePropUpdate(){
  propPending = true;
  if (!propRaf) propRaf = requestAnimationFrame(tickPropPanel);
}

function tickPropPanel(){
  propRaf = 0;
  const gap = drag ? 90 : 0;
  if (performance.now() - propLastAt < gap){
    if (propPending) propRaf = requestAnimationFrame(tickPropPanel);
    return;
  }
  propPending = false;
  propLastAt = performance.now();
  buildPropPanel();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const [wx, wy] = s2w(sx, sy);
  const touch = e.pointerType === 'touch';
  const addKey = e.shiftKey || e.ctrlKey || e.metaKey;

  // 1) 手柄优先（触屏放大命中半径，避免点不中）
  const sel = (state.selection.length === 1) ? primaryComp() : null;
  if (sel && !state.pending){
    let best = null, bestD = 1e9;
    const base = touch ? 23 : 15;
    for (const pt of handlePoints(sel)){
      const [hx, hy] = w2s(pt.x, pt.y);
      const isBig = (pt.type === 'rot' || pt.type === 'r' || pt.type[0] === 'v');
      const R = isBig ? base : base - 2;
      const d = Math.hypot(hx - sx, hy - sy);
      if (d < R && d < bestD){ bestD = d; best = pt; }
    }
    if (best){
      drag = {
        type: 'handle', comp: sel, handleType: best.type,
        startScreen: [sx, sy], startWorld: [wx, wy],
        startComp: snapshot(sel), moved: false, touch
      };
      try { canvas.setPointerCapture(e.pointerId); } catch(_){}
      return;
    }
  }

  // 2) 放置待定组件（按吸附点落位）
  if (state.pending){
    const ghostComp = state.pending.cat === 'emitter' ? { kind:'emitter' } : null;
    const [px, py] = resolvePos(wx, wy, snap.on !== e.shiftKey, ghostComp);
    placeComponent(state.pending.cat, state.pending.key, px, py);
    state.pending = null;
    hover = null;
    guides = [];
    legend.querySelectorAll('.legendItem').forEach(x => x.classList.remove('on'));
    showHint('已放置，可在右上角调整属性');
    return;
  }

  // 3) 命中测试
  const hits = [];
  for (let i = state.components.length - 1; i >= 0; i--){
    const c = state.components[i];
    if (hitTest(c, wx, wy)) hits.push(c);
  }

  // 3a) Shift / Ctrl 点击：加入或移出多选
  if (addKey && hits.length){
    toggleSelect(hits[0].id);
    try { canvas.setPointerCapture(e.pointerId); } catch(_){}
    return;
  }

  if (hits.length === 0){
    if (e.shiftKey){
      // 空白 + Shift → 框选
      drag = { type:'marquee', startScreen:[sx, sy], startView:[view.cx, view.cy], moved:false, touch };
      marqueeRect = { x0: sx, y0: sy, x1: sx, y1: sy };
    } else {
      // 空白拖动 → 平移视图；空白单击 → 取消选中
      drag = { type:'empty', startScreen:[sx, sy], startView:[view.cx, view.cy], moved:false, touch };
      if (state.selection.length){
        state.selection = [];
        buildPropPanel();
        renderCompList();
      }
    }
  } else {
    // 已有多选且点在选中项上 → 整组拖动
    if (state.selection.length > 1 && hits.some(c => isSelected(c.id))){
      const items = selList().map(c => ({
        comp: c, sx: c.x, sy: c.y, snap: snapshot(c)
      }));
      const anchor = hits.find(c => isSelected(c.id));
      drag = {
        type: 'multi', items, comp: anchor,
        startComp: snapshot(anchor),
        box0: unionAABB(items.map(it => it.comp)),
        excl: new Set(items.map(it => it.comp.id)),
        startScreen: [sx, sy], startWorld: [wx, wy], moved: false, touch
      };
    } else {
      let target;
      if (state.selectedId && hits.some(c => c.id === state.selectedId)){
        target = hits.find(c => c.id === state.selectedId);
      } else {
        target = hits[0];
      }
      drag = {
        type: 'body', comp: target, hits: hits,
        startScreen: [sx, sy], startWorld: [wx, wy],
        startComp: snapshot(target),
        box0: compAABB(target),
        excl: new Set([target.id]),
        moved: false, touch
      };
    }
  }
  try { canvas.setPointerCapture(e.pointerId); } catch(_){}
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const [wx, wy] = s2w(sx, sy);
  const act = snap.on !== e.shiftKey;   // Shift 临时反转吸附

  // 无拖动时：更新悬停光标 + 待放置组件的吸附预览
  if (!drag){
    updateHoverCursor(sx, sy);
    if (state.pending){
      const ghostComp = state.pending.cat === 'emitter' ? { kind:'emitter' } : null;
      const [px, py] = resolvePos(wx, wy, act, ghostComp);
      hover = { x: px, y: py };
      showHud(e.clientX, e.clientY,
        `放置 <b>${pendingLabel(state.pending)}</b>` +
        `<br>X ${fmt2(px)} m　Y ${fmt2(py)} m${snapTag(act)}`);
    } else {
      if (hover) hover = null;
      if (guides.length) guides = [];
      hideHud();
    }
    return;
  }

  // 第一次超过拖动阈值时确定开始拖动（触屏阈值更大，避免误触发）
  if (!drag.moved){
    const th = drag.touch ? 7 : 4;
    const dxs = sx - drag.startScreen[0], dys = sy - drag.startScreen[1];
    if (Math.hypot(dxs, dys) < th) return;
    drag.moved = true;
    if (drag.type !== 'marquee'){
      canvas.classList.add('grabbing');
      canvas.style.cursor = 'grabbing';
    }

    if (drag.type === 'body' && state.selectedId !== drag.comp.id){
      state.selectedId = drag.comp.id;
      renderCompList();
      schedulePropUpdate();
    }
  }

  if (drag.type === 'handle'){
    boundarySnap = null;
    applyHandleDrag(drag, wx, wy, act);
    hudForHandle(drag, e.clientX, e.clientY, act);
    schedulePropUpdate();
  }
  else if (drag.type === 'body'){
    const c = drag.comp;
    const rawX = drag.startComp.x + (wx - drag.startWorld[0]);
    const rawY = drag.startComp.y + (wy - drag.startWorld[1]);
    // 1) 发射器贴场边界优先
    const bs = c.kind === 'emitter' ? nearestFieldBoundary(rawX, rawY, 14 / SCALE, c.id) : null;
    let px, py;
    if (bs){
      boundarySnap = bs;
      guides = [];
      px = bs.x; py = bs.y;
    } else {
      // 2) 组件对齐 3) 网格
      [px, py] = snapMove(rawX, rawY, act, drag.startComp.x, drag.startComp.y, drag.box0, drag.excl);
    }
    c.x = px; c.y = py;
    const tag = boundarySnap
      ? `<span class="tag">${boundarySnap.comp.name} 边界</span>`
      : snapTag(act);
    showHud(e.clientX, e.clientY,
      `X <b>${fmt2(c.x)}</b> m　Y <b>${fmt2(c.y)}</b> m${tag}`);
    schedulePropUpdate();
  }
  else if (drag.type === 'multi'){
    /* 整组平移：用「被点中的那个」当基准算吸附偏移，其余按同一偏移走。
       这样整组的相对位置绝不会被各自吸附搞乱。 */
    const dx = wx - drag.startWorld[0], dy = wy - drag.startWorld[1];
    const base = drag.startComp;
    const rawX = base.x + dx, rawY = base.y + dy;
    const [px, py] = snapMove(rawX, rawY, act, base.x, base.y, drag.box0, drag.excl);
    const ox = px - base.x, oy = py - base.y;
    for (const it of drag.items){
      it.comp.x = it.sx + ox;
      it.comp.y = it.sy + oy;
    }
    showHud(e.clientX, e.clientY,
      `<b>${drag.items.length}</b> 个组件整体移动${snapTag(act)}`);
    schedulePropUpdate();
  }
  else if (drag.type === 'marquee'){
    marqueeRect = { x0: drag.startScreen[0], y0: drag.startScreen[1], x1: sx, y1: sy };
    hideHud();
  }
  else if (drag.type === 'empty'){
    // 空白处拖动 → 平移视图（保持按下点下的世界位置不漂移）
    view.cx = drag.startView[0] - (sx - drag.startScreen[0]) / SCALE;
    view.cy = drag.startView[1] + (sy - drag.startScreen[1]) / SCALE;
    guides = [];
    boundarySnap = null;
    hideHud();
  }
});

canvas.addEventListener('pointerleave', () => {
  if (!drag){ hover = null; guides = []; hideHud(); canvas.style.cursor = ''; }
});

/* 手柄拖动的读数 */
function hudForHandle(drag, cx, cy, act){
  const c = drag.comp, t = drag.handleType;
  const tag = snapTag(act);

  if (t === 'rot'){
    const deg = (c.angle * 180 / Math.PI + 360) % 360;
    showHud(cx, cy, `角度 <b>${deg.toFixed(1)}°</b>${act ? '<span class="tag">吸附 ' + snap.rotDeg + '°</span>' : ''}`);
    return;
  }
  if (t === 'dir'){
    const deg = (c.vAngle + 360) % 360;
    showHud(cx, cy, `发射角 <b>${deg.toFixed(1)}°</b>${act ? '<span class="tag">吸附 ' + snap.rotDeg + '°</span>' : ''}`);
    return;
  }
  if (t === 'fdir'){
    const deg = (c.fieldAngle * 180 / Math.PI + 360) % 360;
    showHud(cx, cy, `场方向 <b>${deg.toFixed(1)}°</b>${act ? '<span class="tag">吸附 5°</span>' : ''}`);
    return;
  }
  if (t === 'r'){
    showHud(cx, cy, `半径 <b>${c.r.toFixed(2)}</b> m${tag}`);
    return;
  }
  if (t === 'sp1' || t === 'sp2'){
    showHud(cx, cy, `张角 <b>${c.span.toFixed(0)}°</b>${tag}`);
    return;
  }
  if (t === 'v0' || t === 'v1' || t === 'v2'){
    const [lx, ly] = triVerts(c)[+t.slice(1)];
    showHud(cx, cy, `顶点 (${fmt2(lx)}, ${fmt2(ly)}) m<br>` +
      `底边 <b>${c.w.toFixed(2)}</b> m　高 <b>${c.h.toFixed(2)}</b> m${tag}`);
    return;
  }
  if (t === 'o1' || t === 'o2'){
    const deg = (c.angle * 180 / Math.PI + 360) % 360;
    showHud(cx, cy, `长度 <b>${c.len.toFixed(2)}</b> m　角度 <b>${deg.toFixed(1)}°</b>${tag}`);
    return;
  }
  // 角点 / 边中点
  showHud(cx, cy, `宽 <b>${c.w.toFixed(2)}</b> m　高 <b>${c.h.toFixed(2)}</b> m${tag}`);
}

/* 矩形：拖哪条边就只改哪一侧，对边为锚点，中心随之平移
   （角点则对角为锚点，两向同时伸缩） */
function resizeRectAnchored(drag, wx, wy, act){
  const s = drag.startComp;
  const c = drag.comp;
  const t = drag.handleType;
  const ca = Math.cos(s.angle), sa = Math.sin(s.angle);

  // 指针换算到「按下瞬间」的局部坐标
  const dx = wx - s.x, dy = wy - s.y;
  const lx =  dx*ca + dy*sa;
  const ly = -dx*sa + dy*ca;
  const snapv = (v, base) => act ? snapValue(v, base) : v;
  const MIN = 0.3;

  let x0 = -s.w/2, x1 = s.w/2, y0 = -s.h/2, y1 = s.h/2;
  const east  = (t === 'sx' || t === 'ne' || t === 'se');
  const west  = (t === 'sx-' || t === 'nw' || t === 'sw');
  const north = (t === 'sy' || t === 'ne' || t === 'nw');
  const south = (t === 'sy-' || t === 'se' || t === 'sw');

  // 每条边以「按下时该边的位置」为基准做方向性截断：往外拖补足，往内拖减掉余数
  if (east)  x1 = Math.max(x0 + MIN, snapv(lx,  s.w/2));
  if (west)  x0 = Math.min(x1 - MIN, snapv(lx, -s.w/2));
  if (north) y1 = Math.max(y0 + MIN, snapv(ly,  s.h/2));
  if (south) y0 = Math.min(y1 - MIN, snapv(ly, -s.h/2));

  const nw = Math.max(MIN, x1 - x0);
  const nh = Math.max(MIN, y1 - y0);
  const ncx = (x0 + x1) / 2, ncy = (y0 + y1) / 2;

  c.w = nw;
  c.h = nh;
  c.x = s.x + ncx*ca - ncy*sa;
  c.y = s.y + ncx*sa + ncy*ca;
}

function applyHandleDrag(drag, wx, wy, act){
  const c = drag.comp;
  const s = drag.startComp;
  const t = drag.handleType;
  const snapOn = act;            // 吸附生效
  const free = !snapOn;

  // 半宽/半高吸附：中心在网格上时四边也落在网格
  // base = 按下时的半宽/半高，用于方向性截断（缩小减余数、放大的补足）
  const half = (v, min, base) => free ? Math.max(min, v)
    : Math.max(snap.step, snapValue(v, base));

  /* ---------- 旋转（场 / 障碍通用，绕自身中心） ---------- */
  if (t === 'rot'){
    const dx = wx - c.x, dy = wy - c.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    // 0° = 本地 +x 轴；吸附时按 5° 递进并自动贴合正轴
    c.angle = snapAngle(Math.atan2(dy, dx), snapOn ? snap.rotDeg : 0);
    return;
  }

  /* ---------- 电场方向手柄 ---------- */
  if (t === 'fdir'){
    const dx = wx - c.x, dy = wy - c.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    c.fieldAngle = snapAngle(Math.atan2(dy, dx), snapOn ? 5 : 0);
    return;
  }

  /* ---------- 发射器方向手柄 ---------- */
  if (t === 'dir'){    const dx = wx - c.x, dy = wy - c.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;

    if (snapOn){
      deg = Math.round(deg / snap.rotDeg) * snap.rotDeg;
      // 贴在某个场边界上时，方向自动贴合「射入场内」的法线
      const hit = nearestFieldBoundary(c.x, c.y, 0.12, c.id);
      if (hit){
        const [ix, iy] = inwardDir(hit);
        const target = Math.atan2(iy, ix) * 180 / Math.PI;
        let d = Math.abs(((deg - target + 540) % 360) - 180);
        if (d < 10){
          deg = (target + 360) % 360;
          boundarySnap = { ...hit, dirOnly: true };
          showHint('发射方向已对齐 ' + hit.comp.name + ' 边界法线');
        }
      }
    }
    c.vAngle = ((deg % 360) + 360) % 360;
    return;
  }

  /* ---------- 障碍端点 ---------- */
  if (t === 'o1' || t === 'o2'){
    const h = s.len / 2;
    const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
    const end1 = [s.x - h*cosA, s.y - h*sinA];  // o1
    const end2 = [s.x + h*cosA, s.y + h*sinA];  // o2

    const fixedEnd = (t === 'o1') ? end2 : end1;
    const startEnd = (t === 'o1') ? end1 : end2;   // 该端点的起始位置（方向性截断基准）
    const newEnd = snapEndpoint(fixedEnd, [wx, wy], snapOn, startEnd);

    const newLen = Math.hypot(newEnd[0] - fixedEnd[0], newEnd[1] - fixedEnd[1]);
    let newAngle;
    if (t === 'o1')
      newAngle = Math.atan2(fixedEnd[1] - newEnd[1], fixedEnd[0] - newEnd[0]);
    else
      newAngle = Math.atan2(newEnd[1] - fixedEnd[1], newEnd[0] - fixedEnd[0]);

    // 角度吸附后，以“固定端点”为锚重新求中心，保证另一端不漂移
    const a = snapAngle(newAngle, 0);
    const dirX = (t === 'o1') ? -Math.cos(a) : Math.cos(a);
    const dirY = (t === 'o1') ? -Math.sin(a) : Math.sin(a);
    const L = Math.max(0.3, newLen);

    c.len = L;
    c.angle = a;
    c.x = fixedEnd[0] + dirX * L / 2;
    c.y = fixedEnd[1] + dirY * L / 2;
    return;
  }

  /* ---------- 圆形 / 扇形半径 ---------- */
  if (t === 'r'){
    const [lx, ly] = toLocal(c, wx, wy);
    const v = Math.hypot(lx, ly);
    c.r = free ? Math.max(0.2, v) : Math.max(snap.step, snapValue(v, s.r));
    return;
  }

  /* ---------- 扇形张角（对称张开） ---------- */
  if (t === 'sp1' || t === 'sp2'){
    const [lx, ly] = toLocal(c, wx, wy);
    if (Math.hypot(lx, ly) < 1e-6) return;
    let a = Math.abs(Math.atan2(ly, lx));            // 0 ~ π
    if (snapOn) a = Math.round(a / (5*Math.PI/180)) * (5*Math.PI/180);
    c.span = clamp(a * 360 / Math.PI, 6, 350);       // 单侧角×2
    return;
  }

  /* ---------- 三角形：直接拖顶点（拖动中中心不动，松手后重算中心） ---------- */
  if (t === 'v0' || t === 'v1' || t === 'v2'){
    const idx = +t.slice(1);
    const sv = triVerts(s);                       // 起始顶点（世界坐标作吸附基准）
    const [bx, by] = toWorld(s, sv[idx][0], sv[idx][1]);
    const px = snapOn ? snapValue(wx, bx) : wx;
    const py = snapOn ? snapValue(wy, by) : wy;
    const [lx, ly] = toLocal(c, px, py);
    const v = triVerts(c);
    v[idx][0] = lx;
    v[idx][1] = ly;
    updateTriBox(c);          // 同步包围盒（面板 / HUD 用）
    return;
  }

  /* ---------- 矩形：单侧伸缩 ---------- */
  if (c.shape === 'rect' &&
      (t === 'sx' || t === 'sx-' || t === 'sy' || t === 'sy-' ||
       t === 'ne' || t === 'nw' || t === 'se' || t === 'sw')){
    resizeRectAnchored(drag, wx, wy, act);
    return;
  }

  /* ---------- 角点：同时改宽高 ---------- */
  if (t === 'ne' || t === 'nw' || t === 'se' || t === 'sw'){
    const [lx, ly] = toLocal(c, wx, wy);
    const w = half(Math.abs(lx), 0.15, s.w/2) * 2;
    const h = half(Math.abs(ly), 0.15, s.h/2) * 2;
    c.w = Math.max(0.3, w);
    c.h = Math.max(0.3, h);
    return;
  }

  /* ---------- 边中点：只改一个方向 ---------- */
  if (t === 'sx' || t === 'sx-' || t === 'sy' || t === 'sy-'){
    const [lx, ly] = toLocal(c, wx, wy);
    const isAxisX = (t === 'sx' || t === 'sx-');

    if (c.shape === 'circle' || c.shape === 'sector'){
      const v = isAxisX ? Math.abs(lx) : Math.abs(ly);
      c.r = free ? Math.max(0.2, v) : Math.max(snap.step, snapValue(v, s.r));
      return;
    }
    const baseHalf = (isAxisX ? s.w : s.h) / 2;
    const v = half(isAxisX ? Math.abs(lx) : Math.abs(ly), 0.15, baseHalf) * 2;
    if (isAxisX) c.w = Math.max(0.3, v);
    else         c.h = Math.max(0.3, v);
    return;
  }
}

function finishDrag(e, cancelled){
  canvas.classList.remove('grabbing');
  canvas.style.cursor = '';
  if (!drag) return;
  const d = drag;
  drag = null;
  guides = [];
  boundarySnap = null;
  hideHud();

  // 落位精度归一，避免浮点残值（如 1.4999999）
  if (d.type === 'body' && d.moved && d.comp){
    d.comp.x = Math.round(d.comp.x * 1e4) / 1e4;
    d.comp.y = Math.round(d.comp.y * 1e4) / 1e4;
  }
  if (d.type === 'multi' && d.moved){
    for (const it of d.items){
      it.comp.x = Math.round(it.comp.x * 1e4) / 1e4;
      it.comp.y = Math.round(it.comp.y * 1e4) / 1e4;
    }
  }
  // 三角形：顶点移动结束后以重心为新中心
  if (!cancelled && d.type === 'handle' && d.comp && d.comp.shape === 'triangle' &&
      d.handleType && d.handleType[0] === 'v'){
    recenterTriangle(d.comp);
  }
  if (!cancelled){
    if (d.type === 'marquee'){
      // 框选结算：与框有交集的组件（无限场不参与框选）
      if (d.moved && marqueeRect){
        const x0 = Math.min(marqueeRect.x0, marqueeRect.x1);
        const x1 = Math.max(marqueeRect.x0, marqueeRect.x1);
        const y0 = Math.min(marqueeRect.y0, marqueeRect.y1);
        const y1 = Math.max(marqueeRect.y0, marqueeRect.y1);
        const ids = [];
        for (const c of state.components){
          if (c.shape === 'infinite') continue;
          const b = compAABB(c);
          const [ax, ay] = w2s(b.x0, b.y1);
          const [bx, by] = w2s(b.x1, b.y0);
          const ix0 = Math.min(ax, bx), ix1 = Math.max(ax, bx);
          const iy0 = Math.min(ay, by), iy1 = Math.max(ay, by);
          if (ix1 >= x0 && ix0 <= x1 && iy1 >= y0 && iy0 <= y1) ids.push(c.id);
        }
        state.selection = ids;
        buildPropPanel();
        renderCompList();
        if (ids.length) showHint(`框选到 ${ids.length} 个组件`);
      }
    }
    else if (d.type === 'empty' && !d.moved){
      // 空白单击 → 取消选中
      if (state.selectedId !== null){
        state.selectedId = null;
        buildPropPanel();
        renderCompList();
      }
    }
    else if (d.type === 'body' && !d.moved){
      const hits = d.hits;
      // 多选状态下单击其中一个 → 收敛为单选
      if (state.selection.length > 1){
        state.selectedId = d.comp.id;
        buildPropPanel();
        renderCompList();
      } else {
        // 单击组件：同位置多层循环切换，到最底层取消选中
        const curIdx = hits.findIndex(c => c.id === state.selectedId);
        if (curIdx >= 0){
          if (hits.length === 1){
            state.selectedId = null;
          } else {
            state.selectedId = hits[(curIdx + 1) % hits.length].id;
          }
        } else {
          state.selectedId = hits[0].id;
        }
        buildPropPanel();
        renderCompList();
      }
    }
    else if (d.type === 'body' && d.moved){
      if (state.selectedId !== d.comp.id) state.selectedId = d.comp.id;
      buildPropPanel();
      renderCompList();
    }
    else if (d.type === 'multi' && d.moved){
      buildPropPanel();
      renderCompList();
    }
    else if (d.type === 'multi' && !d.moved){
      // 多选状态下单击其中一个 → 收敛为单选
      if (d.comp) state.selectedId = d.comp.id;
      buildPropPanel();
      renderCompList();
    }
    else if (d.type === 'handle'){
      buildPropPanel();
      renderCompList();
    }
  }

  marqueeRect = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch(_){}
}

canvas.addEventListener('pointerup', (e) => finishDrag(e, false));
canvas.addEventListener('pointercancel', (e) => finishDrag(e, true));

/* =========================================================
   ★ 视图缩放 / 平移
   ========================================================= */
function updateZoomUI(){
  const z = document.getElementById('zoomVal');
  if (z) z.textContent = Math.round(SCALE) + '%';
}
function setScaleAt(ns, sx, sy){
  const [bx, by] = s2w(sx, sy);
  SCALE = clamp(ns, SCALE_MIN, SCALE_MAX);
  const [ax, ay] = s2w(sx, sy);
  view.cx += bx - ax;
  view.cy += by - ay;
  updateZoomUI();
}
function resetView(){ SCALE = 100; view.cx = 0; view.cy = 0; updateZoomUI(); }

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  setScaleAt(SCALE * (e.deltaY > 0 ? 0.88 : 1.14), sx, sy);
}, { passive: false });

const zoomSeg = document.getElementById('zoomSeg');
if (zoomSeg){
  zoomSeg.querySelectorAll('[data-z]').forEach(b => {
    b.onclick = () => {
      const z = b.dataset.z;
      if (z === 'in') setScaleAt(SCALE * 1.25, W/2, H/2);
      else if (z === 'out') setScaleAt(SCALE * 0.8, W/2, H/2);
      else resetView();
    };
  });
}
updateZoomUI();

/* =========================================================
   ★ 吸附控件
   ========================================================= */
const snapToggleEl = document.getElementById('snapToggle');
const snapSegEl = document.getElementById('snapSeg');
const snapModeEl = document.getElementById('snapModeSeg');

function updateSnapUI(){
  if (snapToggleEl){
    snapToggleEl.classList.toggle('on', snap.on);
    snapToggleEl.textContent = snap.on ? '开' : '关';
  }
  if (snapSegEl){
    snapSegEl.classList.toggle('on', snap.on);
    snapSegEl.querySelectorAll('[data-step]').forEach(b => {
      b.classList.toggle('on', Math.abs(parseFloat(b.dataset.step) - snap.step) < 1e-6);
    });
  }
  if (snapModeEl){
    snapModeEl.classList.toggle('on', snap.on);
    snapModeEl.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === snap.mode);
    });
  }
}

if (snapModeEl){
  snapModeEl.querySelectorAll('[data-mode]').forEach(b => {
    b.onclick = () => {
      snap.mode = b.dataset.mode;
      updateSnapUI();
      showHint(snap.mode === 'grid'
        ? '严格吸附：始终落在格线上，按拖动方向取整'
        : '磁性吸附：只有靠近格线或其它组件时才被吸住');
    };
  });
}

if (snapToggleEl){
  snapToggleEl.onclick = () => {
    snap.on = !snap.on;
    guides = [];
    updateSnapUI();
    showHint(snap.on
      ? `网格吸附已开启（${snap.step} m），按住 Shift 可临时关闭`
      : '网格吸附已关闭，按住 Shift 可临时开启');
  };
}
if (snapSegEl){
  snapSegEl.querySelectorAll('[data-step]').forEach(b => {
    b.onclick = () => {
      snap.step = parseFloat(b.dataset.step);
      guides = [];
      updateSnapUI();
    };
  });
}
updateSnapUI();

/* =========================================================
   ★ 命中测试（优化：单边 / 无限场）
   ========================================================= */
function hitTest(c, wx, wy){
  if (c.kind === 'field' || c.kind === 'negfield'){
    // 无限场覆盖全屏，无法通过点击精确选中，只能从列表选择
    if (c.shape === 'infinite') return false;

    // 单边界：右侧半平面均可点中，边界线左侧 0.25m 内也视为命中
    if (c.shape === 'single'){
      const [lx] = toLocal(c, wx, wy);
      return lx > -0.25;
    }
    // 双边界：整个竖直带范围，外扩 0.25m
    if (c.shape === 'double'){
      const [lx] = toLocal(c, wx, wy);
      return Math.abs(lx) < c.w / 2 + 0.25;
    }
    // 单边界有限：右侧矩形带，外扩 0.25m
    if (c.shape === 'singleFinite'){
      const [lx, ly] = toLocal(c, wx, wy);
      return lx > -0.25 && Math.abs(ly) < c.h / 2 + 0.25;
    }
    return insideShape(c, wx, wy);
  }
  if (c.kind === 'obstacle'){
    const dx = Math.cos(c.angle)*c.len/2;
    const dy = Math.sin(c.angle)*c.len/2;
    return distToSeg(wx, wy, c.x-dx, c.y-dy, c.x+dx, c.y+dy) < 0.2;
  }
  if (c.kind === 'emitter'){
    return Math.hypot(wx - c.x, wy - c.y) < 0.32;
  }
  return false;
}

function distToSeg(px, py, x1, y1, x2, y2){
  const dx = x2-x1, dy = y2-y1;
  const l2 = dx*dx + dy*dy;
  if (l2 === 0) return Math.hypot(px-x1, py-y1);
  let t = ((px-x1)*dx + (py-y1)*dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1+t*dx), py - (y1+t*dy));
}

/* =========================================================
   属性面板
   ========================================================= */
