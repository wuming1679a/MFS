/* =========================================================
   渲染
   ========================================================= */
/* ---------- 未选中组件的淡化系数 ----------
   选中某个组件时，其它组件淡出以突出焦点；但系数不能太低，
   否则完全看不出画布上还有什么（旧值 0.07 / 0.12 / 0.18 / 0.32
   在深色背景上几乎不可见）。这里统一抬高到"能看清轮廓、又不抢焦点"。 */
const DIM_FIELD   = 0.16;   // 场填充与箭头
const DIM_OBSTACLE= 0.34;   // 障碍线
const DIM_EMITTER = 0.42;   // 发射器本体
const DIM_NEG     = 0.55;   // 负场虚框与名称

/* ---------- 场景指纹 ----------
   几何 / 视图 / 主题 / 选中态任一变化才重画背景层；粒子流动不影响它。
   用整数哈希累加，不产生字符串垃圾。 */
function strHash(str){
  if (!str) return 0;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function sceneHash(){
  let h = 2166136261;
  const mix  = v => { h = Math.imul(h ^ (v | 0), 16777619); };
  const mixf = v => { mix(Math.round((v || 0) * 2000)); };

  mixf(W); mixf(H);
  mixf(SCALE); mixf(view.cx); mixf(view.cy);
  mix(theme.light ? 11 : 22);
  mix(snap.on ? 33 : 44); mixf(snap.step);

  const sel = state.selection;
  mix(sel.length);
  for (let i = 0; i < sel.length; i++) mix(sel[i]);

  const cs = state.components;
  mix(cs.length);
  for (let i = 0; i < cs.length; i++){
    const c = cs[i];
    mix(c.id);
    mixf(c.x); mixf(c.y); mixf(c.angle);
    mixf(c.w); mixf(c.h); mixf(c.r); mixf(c.span); mixf(c.len);
    mixf(c.fieldAngle); mixf(c.strength); mix(c.bDir);
    mix(strHash(c.shape));
    mix(strHash(c.boundary || ''));
    mix(strHash(c.fieldType || ''));
    if (c.tv){
      mixf(c.tv[0][0]); mixf(c.tv[0][1]);
      mixf(c.tv[1][0]); mixf(c.tv[1][1]);
      mixf(c.tv[2][0]); mixf(c.tv[2][1]);
    }
  }
  return h;
}

/* 背景层 = 网格 + 所有场（含负场挖洞）+ 负场标记 */
function rebuildBG(hash){
  if (!bgLayer) return;
  const main = ctx;
  ctx = bgCtx;
  ctx.clearRect(0, 0, W, H);
  drawGrid();
  const hasSel = state.selection.length > 0;
  drawAllFields(hasSel ? (id => state.selection.indexOf(id) < 0) : (() => false));
  ctx = main;
  bgHash = hash;
}

function render(){
  const h = sceneHash();
  if (h !== bgHash) rebuildBG(h);

  ctx.clearRect(0, 0, W, H);
  if (bgLayer) ctx.drawImage(bgLayer, 0, 0, W, H);

  const hasSel = state.selection.length > 0;
  const single = state.selection.length === 1;
  const dim = hasSel ? (id => state.selection.indexOf(id) < 0) : (() => false);

  for (const c of state.components){
    if (c.kind !== 'obstacle') continue;
    ctx.globalAlpha = dim(c.id) ? DIM_OBSTACLE : 1;
    drawObstacle(c);
    ctx.globalAlpha = 1;
  }

  drawParticles();

  for (const c of state.components){
    if (c.kind !== 'emitter') continue;
    ctx.globalAlpha = dim(c.id) ? DIM_EMITTER : 1;
    drawEmitter(c);
    ctx.globalAlpha = 1;
  }

  // 多选：每个选中项画虚线外框（单选时用变换手柄表达）
  if (!single) for (const c of selList()) drawSelectionBox(c);

  const sel = single ? primaryComp() : null;
  if (sel) drawHandles(sel);

  // 旋转中的角度指示（参考轴 + 圆弧 + 度数）
  if (sel && drag && drag.type === 'handle' && drag.handleType === 'rot') drawRotIndicator(sel);

  // 场边界吸附高亮
  if (boundarySnap) drawBoundarySnapHint();

  // 待放置组件的吸附预览
  if (state.pending && hover) drawGhost(state.pending, hover.x, hover.y);

  drawGuides();
  drawMarquee();
}

/* 多选项外框 */
function drawSelectionBox(c){
  const b = compAABB(c);
  const [ax, ay] = w2s(b.x0, b.y1);
  const [bx, by] = w2s(b.x1, b.y0);
  const cv = CV();
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = cv.selBox;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(ax - 4, ay - 4, (bx - ax) + 8, (by - ay) + 8);
  ctx.setLineDash([]);
  // 左上角小方块，强调"已选中"
  ctx.fillStyle = cv.selBox;
  ctx.fillRect(ax - 6, ay - 6, 5, 5);
  ctx.restore();
}

/* 框选矩形 */
function drawMarquee(){
  if (!marqueeRect) return;
  const { x0, y0, x1, y1 } = marqueeRect;
  const cv = CV();
  ctx.save();
  ctx.fillStyle = cv.marqueeBg;
  ctx.strokeStyle = cv.marquee;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  ctx.fillRect(x, y, Math.abs(x1-x0), Math.abs(y1-y0));
  ctx.strokeRect(x, y, Math.abs(x1-x0), Math.abs(y1-y0));
  ctx.setLineDash([]);
  ctx.restore();
}

/* 旋转指示：从 0°（本地 +x 轴）画到当前角度 */
function drawRotIndicator(c){
  const [cx, cy] = w2s(c.x, c.y);
  const R = 54;
  const a = -c.angle;                 // 屏幕角（y 轴向下）

  ctx.save();
  // 0° 参考轴
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(245,158,11,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx + R*1.9, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // 角度圆弧
  ctx.strokeStyle = 'rgba(245,158,11,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, a, a < 0);
  ctx.stroke();

  // 半径指示线
  ctx.strokeStyle = 'rgba(245,158,11,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a)*R, cy + Math.sin(a)*R);
  ctx.stroke();

  // 度数
  const deg = (c.angle * 180 / Math.PI + 360) % 360;
  const mid = a / 2;
  const lx = cx + Math.cos(mid) * (R + 16);
  const ly = cy + Math.sin(mid) * (R + 16);
  ctx.font = '600 12px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(245,158,11,0.98)';
  ctx.fillText(deg.toFixed(1) + '°', lx, ly);
  ctx.restore();
}

/* 场边界吸附：描亮边界 + 吸附点 + 指向场内的法线 */
function drawBoundarySnapHint(){
  const hit = boundarySnap;
  const c = hit.comp;
  if (!c) return;

  const [sx, sy] = w2s(c.x, c.y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-c.angle);
  ctx.beginPath();
  buildShapePath(c);
  ctx.setLineDash([]);
  const hi = theme.light ? 'rgba(2,132,199,0.95)' : 'rgba(34,211,238,0.95)';
  ctx.strokeStyle = hi;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.light ? 'rgba(2,132,199,0.35)' : 'rgba(34,211,238,0.7)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  const [px, py] = w2s(hit.x, hit.y);
  ctx.save();
  // 吸附点
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI*2);
  ctx.fillStyle = hi;
  ctx.fill();
  ctx.strokeStyle = CV().handleBd;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // 法线箭头（指向场内）
  const [ix, iy] = inwardDir(hit);
  const [qx, qy] = w2s(hit.x + ix*0.55, hit.y + iy*0.55);
  ctx.strokeStyle = hi;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();

  const ang = Math.atan2(qy - py, qx - px);
  ctx.beginPath();
  ctx.moveTo(qx, qy);
  ctx.lineTo(qx - Math.cos(ang - 0.42)*8, qy - Math.sin(ang - 0.42)*8);
  ctx.lineTo(qx - Math.cos(ang + 0.42)*8, qy - Math.sin(ang + 0.42)*8);
  ctx.closePath();
  ctx.fillStyle = hi;
  ctx.fill();
  ctx.restore();
}

/* 待放置组件的半透明预览（含吸附落点十字） */
function pendingLabel(p){
  if (p.cat === 'obstacle') return '线形障碍';
  if (p.cat === 'emitter') return EMITTER_LABEL[p.key] || '发射器';
  return (SHAPES[p.key] && SHAPES[p.key].name) || p.key;
}

function drawGhost(pending, wx, wy){
  const key = pending.key;
  const def = SHAPES[key] || {};
  let g;
  if (pending.cat === 'obstacle'){
    g = { kind:'obstacle', shape:'line', x:wx, y:wy, angle:0, len:3 };
  } else if (pending.cat === 'emitter'){
    g = {
      kind:'emitter', name: pendingLabel(pending), x:wx, y:wy, angle:0,
      vAngle:0, color:'#38bdf8', mode: key,
      lineLength: 2, lineAngle: 90,
    };
  } else {
    g = {
      kind: pending.cat === 'negative' ? 'negfield' : 'field',
      shape: key, name: def.name || '', x: wx, y: wy, angle: 0,
      w: def.w || 2, h: def.h || 2, r: def.r || 1.6, span: def.span || 90,
      fieldType: 'E', strength: E_PRESET.mid, fieldAngle: 0, bDir: 1,
      boundary: (key === 'infinite' || def.noBoundary) ? 'virtual' : 'solid',
    };
  }

  ctx.save();
  ctx.globalAlpha = 0.42;
  if (g.kind === 'obstacle') drawObstacle(g);
  else if (g.kind === 'emitter') drawEmitter(g);
  else drawFieldComponent(g);
  ctx.restore();

  // 落点十字：吸附命中时更亮
  const [sx, sy] = w2s(wx, wy);
  ctx.save();
  ctx.strokeStyle = snap.on
    ? (theme.light ? 'rgba(2,132,199,0.9)' : 'rgba(56,189,248,0.9)')
    : (theme.light ? 'rgba(100,116,139,0.75)' : 'rgba(148,163,184,0.7)');
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
  ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 3.2, 0, Math.PI*2);
  ctx.fillStyle = theme.light ? 'rgba(2,132,199,0.95)' : 'rgba(56,189,248,0.95)';
  ctx.fill();
  ctx.restore();
}

function drawGrid(){
  // 网格步长：开启吸附时用吸附步长（所见即所吸附），否则自适应疏密
  let worldStep = null;
  if (snap.on && snap.step * SCALE >= 7) worldStep = snap.step;
  if (worldStep === null){
    worldStep = 1;
    while (worldStep * SCALE < 55) worldStep *= 2;
    while (worldStep * SCALE > 150) worldStep /= 2;
  }
  const step = worldStep * SCALE;
  const ox = ((W/2 - view.cx*SCALE) % step + step) % step;
  const oy = ((H/2 + view.cy*SCALE) % step + step) % step;
  const cv = CV();

  // 细网格
  ctx.strokeStyle = snap.on ? cv.grid : cv.gridPlain;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x < W; x += step){ ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = oy; y < H; y += step){ ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  // 主网格（每 1 米加亮，便于估算距离）
  if (worldStep < 1){
    const big = SCALE;                      // 1 米
    if (big >= 18){
      const bx = ((W/2 - view.cx*SCALE) % big + big) % big;
      const by = ((H/2 + view.cy*SCALE) % big + big) % big;
      ctx.strokeStyle = cv.gridMajor;
      ctx.beginPath();
      for (let x = bx; x < W; x += big){ ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = by; y < H; y += big){ ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
  }

  // 原点十字
  const [cx, cy] = w2s(0, 0);
  ctx.strokeStyle = cv.axis;
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
  ctx.moveTo(0, cy); ctx.lineTo(W, cy);
  ctx.stroke();
}

/* 吸附参考线：青色虚线（网格吸附较淡，智能对齐较亮） */
function drawGuides(){
  if (!guides.length) return;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  const cv = CV();
  for (const g of guides){
    ctx.strokeStyle = g.grid ? cv.guideSoft : cv.guide;
    ctx.beginPath();
    if (g.axis === 'x'){
      const [sx] = w2s(g.v, 0);
      ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    } else {
      const [, sy] = w2s(0, g.v);
      ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function fieldColor(c){
  if (c.kind === 'negfield') return theme.light ? '#475569' : '#94a3b8';
  if (c.fieldType === 'E') return theme.light ? '#b45309' : '#f59e0b';
  return theme.light ? '#0369a1' : '#38bdf8';
}

function fieldFillAlpha(c){
  if (c.kind === 'negfield') return theme.light ? 0.15 : 0.11;
  return theme.light ? 0.13 : 0.09;
}

/* =========================================================
   场 / 负场分层渲染
   ---------------------------------------------------------
   负场语义是「该区域场强置零」，所以视觉上不该再盖一层新的场，
   而应该把它下面那一层的场渲染淡化掉。
   做法：所有「场」先画到离屏层 → 负场在该层上 destination-out 挖洞
   → 整层合成回主画布 → 最后在主场画负场的虚线轮廓与名称。
   这样被挖掉的只是场的填充与符号，网格、粒子、手柄都保持清晰。
   ========================================================= */
function drawAllFields(dim){
  const fields = [], negs = [];
  for (const c of state.components){
    if (c.kind === 'field') fields.push(c);
    else if (c.kind === 'negfield') negs.push(c);
  }

  // 没有负场：直接画（省一次全屏合成）
  if (!negs.length || !fieldCtx){
    for (const c of fields){
      ctx.globalAlpha = dim(c.id) ? DIM_FIELD : 1;
      drawFieldComponent(c);
    }
    ctx.globalAlpha = 1;
    return;
  }

  const main = ctx;
  ctx = fieldCtx;
  ctx.clearRect(0, 0, W, H);

  for (const c of fields){
    ctx.globalAlpha = dim(c.id) ? DIM_FIELD : 1;
    drawFieldComponent(c);
  }
  for (const c of negs) carveNegField(c);
  ctx.globalAlpha = 1;

  ctx = main;
  main.drawImage(fieldLayer, 0, 0, W, H);

  for (const c of negs){
    main.globalAlpha = dim(c.id) ? DIM_NEG : 1;
    drawNegFieldMark(c);
  }
  main.globalAlpha = 1;
}

/* 与各形状的填充区域一致的路径（本地 px 坐标，调用前已 translate/rotate） */
function buildMaskPath(c){
  const S = SCALE;
  const big = Math.hypot(W, H) * 2;
  if (c.shape === 'single')            ctx.rect(0, -big, big, big * 2);
  else if (c.shape === 'double')       ctx.rect(-c.w*S/2, -big, c.w*S, big * 2);
  else if (c.shape === 'singleFinite') ctx.rect(0, -c.h*S/2, big, c.h*S);
  else if (c.shape === 'infinite')     ctx.rect(-W*2, -H*2, W*4, H*4);
  else buildShapePath(c);
}

/* 负场：挖掉 88% 的场渲染，保留极淡痕迹 */
function carveNegField(c){
  const [sx, sy] = w2s(c.x, c.y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-c.angle);
  ctx.beginPath();
  buildMaskPath(c);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fill();
  ctx.restore();
}

/* 负场在主场上的标记：极淡灰底 + 虚线轮廓 + 名称 */
function drawNegFieldMark(c){
  const col = fieldColor(c);
  const [sx, sy] = w2s(c.x, c.y);
  const closed = !OPEN_SHAPES.has(c.shape) && c.shape !== 'infinite';

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-c.angle);

  if (closed){
    ctx.beginPath();
    buildMaskPath(c);
    ctx.fillStyle = hexA(col, theme.light ? 0.06 : 0.045);
    ctx.fill();
  }

  if (closed){
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = hexA(col, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (OPEN_SHAPES.has(c.shape)){
    drawShortBoundary(c, col);
  }
  ctx.restore();

  drawFieldName(c, col);
}

function drawFieldComponent(c){
  const col = fieldColor(c);
  const [sx, sy] = w2s(c.x, c.y);
  const alpha = fieldFillAlpha(c);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-c.angle);

  if (c.shape === 'infinite'){
    ctx.beginPath();
    ctx.rect(-W*2, -H*2, W*4, H*4);
    ctx.fillStyle = hexA(col, alpha * 0.8);
    ctx.fill();
  } else if (OPEN_SHAPES.has(c.shape)){
    // 开放形状（单/双/单有限）：只画淡淡有效区域 + "短边界"标记，不做实体墙
    fillOpenRegion(c, col, alpha);
    drawShortBoundary(c, col);
  } else {
    ctx.beginPath();
    buildShapePath(c);
    ctx.fillStyle = hexA(col, alpha);
    ctx.fill();

    const isSolid = c.boundary === 'solid';
    ctx.setLineDash(isSolid ? [] : [7, 7]);
    if (isSolid){ ctx.shadowColor = hexA(col, 0.5); ctx.shadowBlur = 9; }
    ctx.strokeStyle = hexA(col, isSolid ? 0.95 : 0.62);
    ctx.lineWidth = isSolid ? 2.2 : 1.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }
  ctx.restore();

  if (c.kind === 'field') drawFieldSymbols(c, col);
  drawFieldName(c, col);
}

/* 开放形状的有效区域填充（本地 px 坐标，随旋转） */
function fillOpenRegion(c, col, alpha){
  const S = SCALE;
  const big = (Math.hypot(W, H) * 2);
  ctx.beginPath();
  if (c.shape === 'single'){
    ctx.rect(0, -big, big, big * 2);
  } else if (c.shape === 'double'){
    ctx.rect(-c.w*S/2, -big, c.w*S, big * 2);
  } else {
    ctx.rect(0, -c.h*S/2, big, c.h*S);
  }
  ctx.fillStyle = hexA(col, alpha);
  ctx.fill();
}

/* 短边界半长（屏幕 px）：单/双边界用固定视觉长度，单有限场按实际长度 */

/* 短边界（与单边界同款）：短线段 + 端点刻度，表示"无限延伸"
   单/双边界不具实体碰撞，粒子可直接穿过 */
function drawShortBoundary(c, col){
  const solid = (c.boundary === 'solid') && c.shape === 'singleFinite';
  const half = shortHalfPx(c);
  const xs = (c.shape === 'double') ? [-c.w*SCALE/2, c.w*SCALE/2] : [0];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  // 柔和光晕底
  ctx.strokeStyle = hexA(col, theme.light ? 0.10 : 0.16);
  ctx.lineWidth = solid ? 8 : 7;
  for (const x of xs){
    ctx.beginPath(); ctx.moveTo(x, -half); ctx.lineTo(x, half); ctx.stroke();
  }

  // 主描边
  ctx.setLineDash(solid ? [] : [8, 6]);
  ctx.strokeStyle = hexA(col, solid ? 0.98 : 0.85);
  ctx.lineWidth = solid ? 2.6 : 2.1;
  for (const x of xs){
    ctx.beginPath(); ctx.moveTo(x, -half); ctx.lineTo(x, half); ctx.stroke();
  }
  ctx.setLineDash([]);

  // 端点刻度
  const tk = 10;
  ctx.strokeStyle = hexA(col, solid ? 0.9 : 0.72);
  ctx.lineWidth = 1.7;
  for (const x of xs){
    const dir = (c.shape === 'double') ? (x < 0 ? -1 : 1) : 1;
    ctx.beginPath();
    ctx.moveTo(x, -half); ctx.lineTo(x + dir*tk, -half);
    ctx.moveTo(x,  half); ctx.lineTo(x + dir*tk,  half);
    ctx.stroke();
  }
  ctx.restore();
}

/* 场名称（带半透明底衬） */
function drawFieldName(c, col){
  if (c.shape === 'infinite' || c.shape === 'single' || c.shape === 'double') return;
  const [tx, ty] = w2s(c.x, c.y);
  ctx.font = '12px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(c.name).width;
  const bw = tw + 14, bh = 18, bx = tx - bw/2, by = ty - bh/2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
  else ctx.rect(bx, by, bw, bh);
  ctx.fillStyle = CV().labelBg;
  ctx.fill();
  ctx.fillStyle = hexA(col, 0.98);
  ctx.fillText(c.name, tx, ty);
}

function buildShapePath(c){
  const S = SCALE;
  switch(c.shape){
    case 'rect': case 'doubleFinite':
      ctx.rect(-c.w*S/2, -c.h*S/2, c.w*S, c.h*S);
      break;
    case 'circle':
      ctx.arc(0, 0, c.r*S, 0, Math.PI*2);
      break;
    case 'ellipse':
      ctx.ellipse(0, 0, c.w*S/2, c.h*S/2, 0, 0, Math.PI*2);
      break;
    case 'sector': {
      const half = c.span * Math.PI / 360;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, c.r*S, -half, half);
      ctx.closePath();
      break;
    }
    case 'triangle': {
      const v = triVerts(c);
      ctx.moveTo(v[0][0]*S, -v[0][1]*S);
      ctx.lineTo(v[1][0]*S, -v[1][1]*S);
      ctx.lineTo(v[2][0]*S, -v[2][1]*S);
      ctx.closePath();
      break;
    }
    case 'single':
      ctx.moveTo(0, -20000); ctx.lineTo(0, 20000);
      break;
    case 'double':
      ctx.moveTo(-c.w*S/2, -20000); ctx.lineTo(-c.w*S/2, 20000);
      ctx.moveTo( c.w*S/2, -20000); ctx.lineTo( c.w*S/2, 20000);
      break;
    case 'singleFinite': {
      const hh = c.h*S/2;
      ctx.moveTo(0, -hh); ctx.lineTo(0, hh);
      ctx.moveTo(0, -hh); ctx.lineTo(30, -hh);
      ctx.moveTo(0,  hh); ctx.lineTo(30,  hh);
      break;
    }
    case 'infinite':
      ctx.rect(-W, -H, W*2, H*2);
      break;
  }
}

function drawFieldSymbols(c, col){
  const norm = c.fieldType === 'E'
    ? Math.min(1, Math.max(0, Math.log(c.strength/E_MIN) / Math.log(E_MAX/E_MIN)))
    : Math.min(1, Math.max(0, Math.log(c.strength/B_MIN) / Math.log(B_MAX/B_MIN)));

  // 符号间距（世界单位）：场强越大越密；对齐世界网格 → 平移/缩放时符号跟随场体
  let sp = 0.62 - 0.34 * norm;              // 米
  while (sp * SCALE < 26) sp *= 1.35;       // 屏幕最小间距，避免过密

  const [minx, miny, maxx, maxy] = shapeWorldBBox(c);
  const x0 = Math.ceil(minx / sp) * sp;
  const y0 = Math.ceil(miny / sp) * sp;

  const arrowLen = clamp(sp * SCALE * 0.42, 8, 20);
  const half = arrowLen / 2;
  const ah = Math.min(7, arrowLen * 0.34);

  ctx.save();
  ctx.strokeStyle = hexA(col, 0.72);
  ctx.fillStyle = hexA(col, 0.72);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';

  if (c.fieldType === 'E'){
    const ang = c.fieldAngle;
    const dx = Math.cos(ang), dy = -Math.sin(ang);
    for (let wy = y0; wy <= maxy; wy += sp){
      for (let wx = x0; wx <= maxx; wx += sp){
        if (!insideShape(c, wx, wy)) continue;
        const [sx, sy] = w2s(wx, wy);
        const tx = sx - dx*half, ty = sy - dy*half;
        const hx = sx + dx*half, hy = sy + dy*half;
        ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        const a1 = ang + Math.PI*0.82, a2 = ang - Math.PI*0.82;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(a1)*ah, hy - Math.sin(a1)*ah);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(a2)*ah, hy - Math.sin(a2)*ah);
        ctx.stroke();
      }
    }
  } else {
    const out = c.bDir > 0;
    const r = clamp(sp * SCALE * 0.10, 2, 6);
    for (let wy = y0; wy <= maxy; wy += sp){
      for (let wx = x0; wx <= maxx; wx += sp){
        if (!insideShape(c, wx, wy)) continue;
        const [sx, sy] = w2s(wx, wy);
        ctx.beginPath();
        if (out){
          ctx.arc(sx, sy, r, 0, Math.PI*2);
          ctx.fill();
        } else {
          const d = r + 1.1;
          ctx.moveTo(sx-d, sy-d); ctx.lineTo(sx+d, sy+d);
          ctx.moveTo(sx+d, sy-d); ctx.lineTo(sx-d, sy+d);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/* 场的世界坐标包围盒（无限类场取当前可见区域） */
function shapeWorldBBox(c){
  const [ax, ay] = s2w(0, 0);
  const [bx, by] = s2w(W, H);
  let minx = Math.min(ax, bx), maxx = Math.max(ax, bx);
  let miny = Math.min(ay, by), maxy = Math.max(ay, by);

  const unbounded = (c.shape === 'infinite' || c.shape === 'single' ||
                     c.shape === 'double'   || c.shape === 'singleFinite');
  if (unbounded) return [minx, miny, maxx, maxy];

  let hw, hh;
  if (c.shape === 'circle' || c.shape === 'sector'){ hw = hh = c.r; }
  else { hw = c.w/2; hh = c.h/2; }

  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  for (const [lx, ly] of corners){
    const [wx, wy] = toWorld(c, lx, ly);
    mnx = Math.min(mnx, wx); mxx = Math.max(mxx, wx);
    mny = Math.min(mny, wy); mxy = Math.max(mxy, wy);
  }
  return [Math.max(minx, mnx), Math.max(miny, mny),
          Math.min(maxx, mxx), Math.min(maxy, mxy)];
}

function drawObstacle(c){
  const dx = Math.cos(c.angle)*c.len/2;
  const dy = Math.sin(c.angle)*c.len/2;
  const [ax, ay] = w2s(c.x - dx, c.y - dy);
  const [bx, by] = w2s(c.x + dx, c.y + dy);

  const cv = CV();
  // 外发光：让"实体墙"在两种底色上都清楚
  ctx.strokeStyle = theme.light ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.75)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.strokeStyle = cv.obstacle;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.strokeStyle = cv.obstacle2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();
}

function drawEmitter(em){
  const [sx, sy] = w2s(em.x, em.y);
  const col = theme.light ? shade(em.color, 0.78) : em.color;

  if (em.mode === 'line'){
    const dx = Math.cos(em.lineAngle*Math.PI/180) * em.lineLength/2;
    const dy = Math.sin(em.lineAngle*Math.PI/180) * em.lineLength/2;
    const [ax, ay] = w2s(em.x - dx, em.y - dy);
    const [bx, by] = w2s(em.x + dx, em.y + dy);
    ctx.strokeStyle = hexA(col, 0.55);
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
  }

  const ang = em.vAngle * Math.PI/180;
  const dx = Math.cos(ang), dy = -Math.sin(ang);
  const L = 34;
  const ex = sx + dx*L, ey = sy + dy*L;

  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

  const a1 = ang + Math.PI*0.82, a2 = ang - Math.PI*0.82;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + Math.cos(a1)*9, ey - Math.sin(a1)*9);
  ctx.lineTo(ex + Math.cos(a2)*9, ey - Math.sin(a2)*9);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = CV().handleBd;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.font = '12px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(em.name).width;
  const bw = tw + 12, bh = 17, bx = sx - bw/2, by = sy + 22 - bh/2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
  else ctx.rect(bx, by, bw, bh);
  ctx.fillStyle = CV().labelBg;
  ctx.fill();
  ctx.fillStyle = hexA(col, 0.95);
  ctx.fillText(em.name, sx, sy + 22);
}

/* ---------- 粒子绘制：按颜色 / 模式分批 ----------
   旧版是「每个粒子一条 path、每段轨迹一次 stroke」，1500 粒子 × 上百段
   = 十几万次 stroke。现在把同色同模式的轨迹合并成一条 path，一次描完：
   描边次数从 ~1500 降到 ~30。屏幕坐标也在这里内联换算，不再每点
   new 一个 [x, y] 数组。 */
const TRAIL_BUCKETS = [];
const HEAD_BUCKETS = [];
let palRGB = [], palRGBLight = null;

function ensurePalRGB(){
  if (palRGBLight === theme.light) return;
  const p = theme.light ? PALETTE_LIGHT : PALETTE_DARK;
  palRGB = p.map(hex => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  palRGBLight = theme.light;
}

function drawParticles(){
  const n = PS.n;
  if (n === 0) return;

  ensurePalRGB();
  const NP = palRGB.length;
  const S = SCALE;
  const ox = W / 2 - view.cx * S;
  const oy = H / 2 + view.cy * S;
  const TAU = Math.PI * 2;
  const cap = trailCapNow;
  const X = PS.x, Y = PS.y, C = PS.cidx, TM = PS.tmode, DEAD = PS.dead;

  /* 复用桶，避免每帧新建数组 */
  for (let i = TRAIL_BUCKETS.length; i < NP * 5; i++) TRAIL_BUCKETS.push([]);
  for (let i = 0; i < TRAIL_BUCKETS.length; i++) TRAIL_BUCKETS[i].length = 0;
  for (let i = HEAD_BUCKETS.length; i < NP; i++) HEAD_BUCKETS.push([]);
  for (let i = 0; i < HEAD_BUCKETS.length; i++) HEAD_BUCKETS[i].length = 0;

  for (let i = 0; i < n; i++){
    let ci = C[i] % NP;
    if (ci < 0) ci += NP;
    HEAD_BUCKETS[ci].push(i);
    const tm = TM[i];
    if (tm === TM_NONE || tm === TM_END) continue;
    if (PS.len[i] < 2) continue;
    TRAIL_BUCKETS[ci * 5 + tm].push(i);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  /* 显式清掉上一次绘制（虚线边界 / 网格 / 选框）遗留的 dash，
     否则实线轨迹会被画成虚线 */
  ctx.setLineDash([]);

  /* ---------- 轨迹 ---------- */
  for (let ci = 0; ci < NP; ci++){
    const rgb = palRGB[ci];
    const pre = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',';

    for (let tm = TM_SOLID; tm <= TM_FADE; tm++){
      const bucket = TRAIL_BUCKETS[ci * 5 + tm];
      if (!bucket.length) continue;

      if (tm === TM_FADE){
        /* 淡出：把整条轨迹按长度切成 5 段，每段一个统一 alpha，
           5 条 path 描完，而不是每段一次 stroke */
        const BANDS = 5;
        for (let b = 0; b < BANDS; b++){
          ctx.beginPath();
          let any = false;
          for (let bi = 0; bi < bucket.length; bi++){
            const i = bucket[bi];
            const len = Math.min(PS.len[i], cap);
            const from = Math.floor(len * b / BANDS);
            const to   = Math.floor(len * (b + 1) / BANDS);
            if (to - from < 2) continue;
            const base = i * TRAIL_CAP;
            let idx = (PS.head[i] - len + from) & TRAIL_MASK;
            ctx.moveTo(ox + TX[base + idx] * S, oy - TY[base + idx] * S);
            for (let k = from + 1; k < to; k++){
              idx = (idx + 1) & TRAIL_MASK;
              ctx.lineTo(ox + TX[base + idx] * S, oy - TY[base + idx] * S);
            }
            any = true;
          }
          if (!any) continue;
          ctx.strokeStyle = pre + ((b + 1) / BANDS * 0.85).toFixed(3) + ')';
          ctx.stroke();
        }
        continue;
      }

      /* 实线 / 虚线：一条 path 收掉同色同模式的全部轨迹 */
      if (tm === TM_DASH) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (let bi = 0; bi < bucket.length; bi++){
        const i = bucket[bi];
        const len = Math.min(PS.len[i], cap);
        const base = i * TRAIL_CAP;
        let idx = (PS.head[i] - len) & TRAIL_MASK;
        ctx.moveTo(ox + TX[base + idx] * S, oy - TY[base + idx] * S);
        for (let k = 1; k < len; k++){
          idx = (idx + 1) & TRAIL_MASK;
          ctx.lineTo(ox + TX[base + idx] * S, oy - TY[base + idx] * S);
        }
      }
      ctx.strokeStyle = pre + (tm === TM_DASH ? '0.85)' : '0.80)');
      ctx.stroke();
      if (tm === TM_DASH) ctx.setLineDash([]);
    }
  }

  /* ---------- 粒子头 ---------- */
  for (let ci = 0; ci < NP; ci++){
    const bucket = HEAD_BUCKETS[ci];
    if (!bucket.length) continue;
    const rgb = palRGB[ci];

    // 运动中的点：同色一次 fill
    let any = false;
    ctx.beginPath();
    for (let bi = 0; bi < bucket.length; bi++){
      const i = bucket[bi];
      if (DEAD[i]) continue;
      const sx = ox + X[i] * S, sy = oy - Y[i] * S;
      ctx.moveTo(sx + 3.2, sy);
      ctx.arc(sx, sy, 3.2, 0, TAU);
      any = true;
    }
    if (any){
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fill();
    }

    // 已停止（打到实体/障碍）的点：小一号 + 一圈细环
    any = false;
    ctx.beginPath();
    for (let bi = 0; bi < bucket.length; bi++){
      const i = bucket[bi];
      if (!DEAD[i]) continue;
      const sx = ox + X[i] * S, sy = oy - Y[i] * S;
      ctx.moveTo(sx + 2.4, sy);
      ctx.arc(sx, sy, 2.4, 0, TAU);
      any = true;
    }
    if (any){
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fill();
    }

    any = false;
    ctx.beginPath();
    for (let bi = 0; bi < bucket.length; bi++){
      const i = bucket[bi];
      if (!DEAD[i]) continue;
      const sx = ox + X[i] * S, sy = oy - Y[i] * S;
      ctx.moveTo(sx + 5.1, sy);
      ctx.arc(sx, sy, 5.1, 0, TAU);
      any = true;
    }
    if (any){
      ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.lineWidth = 1.6;
    }
  }
}

/* =========================================================
   手柄（世界坐标）
   type: sx/sx- 左右边中点  sy/sy- 上下边中点
         ne/se/sw/nw 角点    r 半径   sp1/sp2 扇形张角
         apex/bl/br 三角形顶点  rot 旋转  o1/o2 障碍端点  dir 发射方向
   ========================================================= */
function handlePoints(c){
  const pts = [];
  const P = (lx, ly, extra) => {
    const [x, y] = toWorld(c, lx, ly);
    pts.push(Object.assign({ x, y }, extra));
  };

  if (c.kind === 'field' || c.kind === 'negfield'){
    const s = c.shape;

    // 电场方向手柄（绝对世界角度，与形状角度解耦；负场无方向）
    if (c.kind === 'field' && c.fieldType === 'E' && c.strength > 0){
      // 半径取「短边的一半」的一半左右，避开边缘手柄
      const minExt = (s === 'circle' || s === 'sector') ? c.r : Math.min(c.w/2, c.h/2);
      const R = clamp(minExt * 0.55, 0.3, 1.0);
      pts.push({
        type:'fdir',
        x: c.x + Math.cos(c.fieldAngle) * R,
        y: c.y + Math.sin(c.fieldAngle) * R,
      });
    }

    if (s === 'infinite') return pts;

    if (s === 'single'){
      P(0.9, 0, { type:'rot' });          // 无限长边界：只能旋转
      return pts;
    }
    if (s === 'double'){
      const hw = c.w/2;
      P( hw, 0, { type:'sx' });
      P(-hw, 0, { type:'sx-' });
      P( hw + 0.7, 0, { type:'rot' });
      return pts;
    }
    if (s === 'singleFinite'){
      const hh = c.h/2;
      P(0,  hh, { type:'sy' });
      P(0, -hh, { type:'sy-' });
      P(0.9, 0, { type:'rot' });
      return pts;
    }
    if (s === 'circle'){
      for (const a of [0, 90, 180, 270]){
        const r = a * Math.PI/180;
        P(Math.cos(r)*c.r, Math.sin(r)*c.r, { type:'r' });
      }
      return pts;
    }
    if (s === 'sector'){
      const half = c.span * Math.PI / 360;
      P(c.r, 0, { type:'r' });
      P(Math.cos(half)*c.r,  Math.sin(half)*c.r,  { type:'sp1' });
      P(Math.cos(-half)*c.r, Math.sin(-half)*c.r, { type:'sp2' });
      P(c.r + 0.75, 0, { type:'rot' });
      return pts;
    }
    if (s === 'triangle'){
      const v = triVerts(c);
      P(v[0][0], v[0][1], { type:'v0' });
      P(v[1][0], v[1][1], { type:'v1' });
      P(v[2][0], v[2][1], { type:'v2' });
      // 旋转环放在最远顶点外侧
      let far = 0, fi = 0;
      v.forEach((pt, i) => { const d = Math.hypot(pt[0], pt[1]); if (d > far){ far = d; fi = i; } });
      const ux = far > 1e-6 ? v[fi][0]/far : 1, uy = far > 1e-6 ? v[fi][1]/far : 0;
      P(v[fi][0] + ux*0.6, v[fi][1] + uy*0.6, { type:'rot' });
      return pts;
    }

    // rect / ellipse / doubleFinite：4 角 + 4 边中点 + 旋转
    const hw = c.w/2, hh = c.h/2;
    P( hw,  hh, { type:'ne' });
    P( hw, -hh, { type:'se' });
    P(-hw, -hh, { type:'sw' });
    P(-hw,  hh, { type:'nw' });
    P( hw, 0, { type:'sx' });
    P(0,  hh, { type:'sy' });
    P(-hw, 0, { type:'sx-' });
    P(0, -hh, { type:'sy-' });
    P(Math.max(hw, hh) + 0.7, 0, { type:'rot' });
    return pts;
  }

  if (c.kind === 'obstacle'){
    P(-c.len/2, 0, { type:'o1' });
    P( c.len/2, 0, { type:'o2' });
    P( c.len/2 + 0.55, 0, { type:'rot' });
    return pts;
  }

  if (c.kind === 'emitter'){
    // 方向手柄跟随发射角，长度与箭头一致（屏幕像素换算到世界）
    const ang = c.vAngle * Math.PI / 180;
    const L = 34/SCALE + 0.2;
    pts.push({ type:'dir', x: c.x + Math.cos(ang)*L, y: c.y + Math.sin(ang)*L });
    return pts;
  }
  return pts;
}

/* 手柄外观 */
const HANDLE_STYLE = {
  rot:  { color:'#f59e0b', shape:'rot' },
  fdir: { color:'#fbbf24', shape:'dot' },
  r:    { color:'#38bdf8', shape:'dot' },
  sp1:  { color:'#e879f9', shape:'dot' },
  sp2:  { color:'#e879f9', shape:'dot' },
  v0:   { color:'#7dd3fc', shape:'square' },
  v1:   { color:'#7dd3fc', shape:'square' },
  v2:   { color:'#7dd3fc', shape:'square' },
  o1:   { color:'#22d3ee', shape:'dot' },
  o2:   { color:'#22d3ee', shape:'dot' },
  dir:  { color:'#a3e635', shape:'dir' },
};
function handleStyle(t){
  const base = HANDLE_STYLE[t] ||
    ((t === 'ne' || t === 'nw' || t === 'se' || t === 'sw' || t[0] === 'v')
      ? { color:'#60a5fa', shape:'square' }
      : { color:'#38bdf8', shape:'dot' });
  return { color: tc(base.color), shape: base.shape };
}

function drawHandles(c){
  const pts = handlePoints(c);
  if (!pts.length) return;

  // 角度参考轴：便于理解 0° 方向（本地 +x 轴）
  const hasAngle = c.kind === 'obstacle' ||
    ((c.kind === 'field' || c.kind === 'negfield') && c.shape !== 'circle' && c.shape !== 'infinite');
  if (hasAngle){
    const [ax, ay] = w2s(c.x, c.y);
    const [bx, by] = w2s(...toWorld(c, 1.1, 0));
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.light ? 'rgba(71,85,105,0.35)' : 'rgba(148,163,184,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  for (const pt of pts){
    const [sx, sy] = w2s(pt.x, pt.y);
    const st = handleStyle(pt.type);

    if (st.shape === 'square'){
      ctx.beginPath();
      ctx.rect(sx - 5, sy - 5, 10, 10);
    } else if (st.shape === 'rot'){
      ctx.beginPath();
      ctx.arc(sx, sy, 6.5, 0, Math.PI*2);
      ctx.fillStyle = theme.light ? 'rgba(255,255,255,.92)' : 'rgba(15,23,42,.85)';
      ctx.fill();
      ctx.strokeStyle = st.color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI*2);
      ctx.fillStyle = st.color;
      ctx.fill();
      continue;
    } else if (st.shape === 'dir'){
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI*2);
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, 5.2, 0, Math.PI*2);
    }

    ctx.fillStyle = st.color;
    ctx.fill();
    ctx.strokeStyle = CV().handleBd;
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }
  ctx.restore();
}
