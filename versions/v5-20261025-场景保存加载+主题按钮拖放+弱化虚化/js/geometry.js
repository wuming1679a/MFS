/* =========================================================
   形状定义
   ========================================================= */
const SHAPES = {
  single:       { name:'单边界',        w:0,  h:0,  noBoundary:true,  infinite:true,  open:true },
  double:       { name:'双边界',        w:2,  h:0,  noBoundary:true,  infinite:true,  open:true },
  singleFinite: { name:'单边界有限场',  w:0,  h:3,  noBoundary:false, infinite:true,  open:true },
  doubleFinite: { name:'双边界有限场',  w:2,  h:3,  noBoundary:false, infinite:false },
  sector:       { name:'扇形场',        w:0,  h:0,  r:2.5, span:90, noBoundary:false, infinite:false },
  triangle:     { name:'三角形场',      w:3,  h:2.5,noBoundary:false, infinite:false },
  rect:         { name:'矩形场',        w:3,  h:2,  noBoundary:false, infinite:false },
  circle:       { name:'圆形场',        w:0,  h:0,  r:1.6, noBoundary:false, infinite:false },
  ellipse:      { name:'椭圆形场',      w:3.2,h:2,  noBoundary:false, infinite:false },
  infinite:     { name:'无限场',        w:0,  h:0,  noBoundary:true,  infinite:true  },
};
const OPEN_SHAPES = new Set(['single','double','singleFinite']);

function toLocal(f, px, py){
  const dx = px - f.x, dy = py - f.y;
  const ca = Math.cos(-f.angle), sa = Math.sin(-f.angle);
  return [ dx*ca - dy*sa, dx*sa + dy*ca ];
}
function toWorld(f, lx, ly){
  const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
  return [ f.x + lx*ca - ly*sa, f.y + lx*sa + ly*ca ];
}

/* ---------- 三角形：以三个顶点为准（局部坐标） ----------
   默认等腰三角形：底边在 y=-h/2，顶点在 y=+h/2。
   顶点可自由拖动，拖动结束后把重心归零并换算回中心位置。 */
function triVerts(c){
  if (!c.tv || c.tv.length !== 3){
    const hw = (c.w || 3) / 2, hh = (c.h || 2.5) / 2;
    c.tv = [[-hw, -hh], [hw, -hh], [0, hh]];
  }
  return c.tv;
}
function updateTriBox(c){
  const v = triVerts(c);
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const p of v){
    mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]);
    mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
  }
  c.w = Math.max(0.3, mxx - mnx);
  c.h = Math.max(0.3, mxy - mny);
}
/* 由宽高重建标准等腰三角形（面板滑杆用） */
function setTriSize(c, w, h){
  const hw = Math.max(0.15, w/2), hh = Math.max(0.15, h/2);
  c.w = w; c.h = h;
  c.tv = [[-hw, -hh], [hw, -hh], [0, hh]];
}
/* 拖动结束后：重心移到组件中心，顶点坐标随之归一 */
function recenterTriangle(c){
  const v = triVerts(c);
  const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
  const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
  for (const p of v){ p[0] -= cx; p[1] -= cy; }
  const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  c.x += cx*ca - cy*sa;
  c.y += cx*sa + cy*ca;
  updateTriBox(c);
}
function pointInTri(px, py, v){
  const d1 = (px - v[1][0]) * (v[0][1] - v[1][1]) - (v[0][0] - v[1][0]) * (py - v[1][1]);
  const d2 = (px - v[2][0]) * (v[1][1] - v[2][1]) - (v[1][0] - v[2][0]) * (py - v[2][1]);
  const d3 = (px - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (py - v[0][1]);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}

function insideShape(f, px, py){
  const [lx, ly] = toLocal(f, px, py);
  switch(f.shape){
    case 'infinite': return true;
    case 'rect': case 'doubleFinite':
      return Math.abs(lx) <= f.w/2 && Math.abs(ly) <= f.h/2;
    case 'circle':
      return lx*lx + ly*ly <= f.r*f.r;
    case 'ellipse':
      return (lx/(f.w/2))**2 + (ly/(f.h/2))**2 <= 1;
    case 'sector': {
      const r = Math.hypot(lx, ly);
      if (r > f.r) return false;
      if (r < 1e-9) return true;
      const a = Math.atan2(ly, lx);
      return Math.abs(a) <= f.span*Math.PI/360;
    }
    case 'triangle':
      return pointInTri(lx, ly, triVerts(f));
    case 'single':       return lx >= 0;
    case 'double':       return Math.abs(lx) <= f.w/2;
    case 'singleFinite': return lx >= 0 && Math.abs(ly) <= f.h/2;
  }
  return false;
}

/* =========================================================
   组件包围盒（纯几何：物理 / 吸附 / 交互 / 渲染共用）
   ========================================================= */
/* 短边界（单 / 双边界）在世界里的半长：屏幕上看起来是固定长度的一段短线，
   这样"无限延伸"的观感与缩放无关；单边界有限场则按真实 h 走。 */
function shortHalfPx(c){
  if (c.shape === 'singleFinite') return c.h * SCALE / 2;
  return Math.min(H * 0.4, 160);
}

/* 组件世界包围盒：框选 / 选中框 / 对齐参考线 / 物理剔除都靠它。 */
function compAABB(c){
  if (c.kind === 'obstacle'){
    const dx = Math.cos(c.angle)*c.len/2, dy = Math.sin(c.angle)*c.len/2;
    return { x0: Math.min(c.x-dx, c.x+dx), x1: Math.max(c.x-dx, c.x+dx),
             y0: Math.min(c.y-dy, c.y+dy), y1: Math.max(c.y-dy, c.y+dy) };
  }
  if (c.kind === 'emitter'){
    const r = 0.36;
    return { x0: c.x-r, x1: c.x+r, y0: c.y-r, y1: c.y+r };
  }
  if (c.shape === 'infinite'){
    const [ax, ay] = s2w(0, 0), [bx, by] = s2w(W, H);
    return { x0: Math.min(ax,bx), x1: Math.max(ax,bx),
             y0: Math.min(ay,by), y1: Math.max(ay,by) };
  }
  let pts;
  if (OPEN_SHAPES.has(c.shape)){
    const half = shortHalfPx(c) / SCALE;
    if (c.shape === 'double') pts = [[-c.w/2,-half],[c.w/2,-half],[c.w/2,half],[-c.w/2,half]];
    else if (c.shape === 'single') pts = [[0,-half],[0,half]];
    else pts = [[-0.1,-c.h/2],[0.1,-c.h/2],[0.1,c.h/2],[-0.1,c.h/2]];
  } else if (c.shape === 'triangle'){
    pts = triVerts(c).slice();
  } else if (c.shape === 'circle' || c.shape === 'sector'){
    const r = c.r;
    pts = [[-r,-r],[r,-r],[r,r],[-r,r]];
  } else {
    const hw = c.w/2, hh = c.h/2;
    pts = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lx, ly] of pts){
    const [wx, wy] = toWorld(c, lx, ly);
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
    y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
  }
  return { x0, x1, y0, y1 };
}


/* =========================================================
   边界几何：任意形状的边界最近点 + 外法线
   ========================================================= */
function normAngle(a){
  const twoPi = Math.PI * 2;
  a %= twoPi;
  if (a < 0) a += twoPi;
  return a;
}

/* 形状边界上距 (px,py) 最近的点；返回 {x,y,nx,ny,dist}（法线指向形状外侧） */
function nearestOnBoundary(c, px, py){
  const [lx, ly] = toLocal(c, px, py);
  const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  let best = null;

  // 局部点 → 世界点 + 世界法线
  const push = (qlx, qly, nlx, nly) => {
    const wx = c.x + qlx*ca - qly*sa;
    const wy = c.y + qlx*sa + qly*ca;
    let nx = nlx*ca - nly*sa;
    let ny = nlx*sa + nly*ca;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const d = Math.hypot(wx - px, wy - py);
    if (!best || d < best.dist) best = { x: wx, y: wy, nx, ny, dist: d };
  };

  // 线段最近点（局部坐标），法线取远离中心的一侧
  const seg = (ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay;
    const L2 = vx*vx + vy*vy;
    let t = L2 < 1e-12 ? 0 : ((lx - ax)*vx + (ly - ay)*vy) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + vx*t, qy = ay + vy*t;
    let nx = -vy, ny = vx;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    // 朝外：与「点相对中心」同向
    if (nx*qx + ny*qy < 0){ nx = -nx; ny = -ny; }
    push(qx, qy, nx, ny);
  };

  switch (c.shape){
    case 'infinite': return null;

    case 'rect': case 'doubleFinite': {
      const hw = c.w/2, hh = c.h/2;
      seg(-hw, -hh,  hw, -hh);
      seg( hw, -hh,  hw,  hh);
      seg( hw,  hh, -hw,  hh);
      seg(-hw,  hh, -hw, -hh);
      return best;
    }

    case 'circle': {
      const r0 = Math.hypot(lx, ly);
      if (r0 < 1e-9){ push(c.r, 0, 1, 0); return best; }
      const ux = lx / r0, uy = ly / r0;
      push(ux*c.r, uy*c.r, ux, uy);
      return best;
    }

    case 'ellipse': {
      const a = c.w/2, b = c.h/2;
      const r0 = Math.hypot(lx, ly);
      if (r0 < 1e-9){ push(a, 0, 1, 0); return best; }
      const ux = lx/r0, uy = ly/r0;
      const t = 1 / Math.sqrt((ux/a)**2 + (uy/b)**2);
      const qx = ux*t, qy = uy*t;
      push(qx, qy, qx/(a*a), qy/(b*b));
      return best;
    }

    case 'sector': {
      const half = c.span * Math.PI / 360;
      const ang = Math.atan2(ly, lx);
      const r0 = Math.hypot(lx, ly);
      if (Math.abs(ang) <= half && r0 > 1e-9){
        const ux = lx/r0, uy = ly/r0;
        push(ux*c.r, uy*c.r, ux, uy);       // 圆弧段
      } else {
        seg(0, 0, Math.cos(half)*c.r,  Math.sin(half)*c.r);
        seg(0, 0, Math.cos(-half)*c.r, Math.sin(-half)*c.r);
      }
      return best;
    }

    case 'triangle': {
      const v = triVerts(c);
      seg(v[0][0], v[0][1], v[1][0], v[1][1]);
      seg(v[1][0], v[1][1], v[2][0], v[2][1]);
      seg(v[2][0], v[2][1], v[0][0], v[0][1]);
      return best;
    }

    case 'double': {
      const hw = c.w/2;
      seg(-hw, -2000, -hw, 2000);
      seg( hw, -2000,  hw, 2000);
      return best;
    }

    case 'single': {
      seg(0, -2000, 0, 2000);
      return best;
    }

    case 'singleFinite': {
      const hh = c.h/2;
      seg(0, -hh, 0, hh);
      return best;
    }
  }
  return null;
}

/* 在所有场（含负场）边界中找最近的一个 */
function nearestFieldBoundary(px, py, maxDist, excludeId){
  let best = null;
  for (const c of state.components){
    if (c.kind !== 'field' && c.kind !== 'negfield') continue;
    if (c.id === excludeId) continue;
    if (c.shape === 'infinite') continue;
    const hit = nearestOnBoundary(c, px, py);
    if (!hit) continue;
    if (hit.dist > maxDist) continue;
    if (!best || hit.dist < best.dist) best = { ...hit, comp: c };
  }
  return best;
}

/* 指向场内部的方向（用于粒子射入） */
function inwardDir(hit){
  const c = hit.comp;
  let nx = -hit.nx, ny = -hit.ny;                 // 先试反法线
  const eps = 0.02;
  if (insideShape(c, hit.x + nx*eps, hit.y + ny*eps)) return [nx, ny];
  return [-nx, -ny];
}
