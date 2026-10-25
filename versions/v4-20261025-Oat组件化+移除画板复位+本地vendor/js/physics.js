/* =========================================================
   物理：场采样 / 粒子池 / 推进 / 碰撞 / 主步进
   ---------------------------------------------------------
   性能要点（相对上一版）：
   1. 粒子改为「结构体数组 → 并行 TypedArray」（SoA），推进循环里
      不再有任何对象分配，也不再每帧产生几千个临时 [x,y]。
   2. 轨迹不再是每个粒子一个 JS 数组 + shift()（shift 是 O(n) 搬移），
      改成一块大 Float32Array 里的定长环形缓冲，写入 O(1)。
   3. 场/负场/障碍在每次 simulate() 开头预处理成扁平列表，并把电场
      强度和方向预先算成 Ex/Ey 常量，内层循环只剩乘加。
   4. 闭合形状先做包围盒剔除，真正进入 insideShape 的点大幅减少。
   5. 子步数有上限：负载过高时放大步长而不是丢时间，避免"卡一下跳一段"。
   ========================================================= */

/* ---------- 场列表（每帧预处理，避免内层重复判 kind） ---------- */
let physFields = [];
let physNegs = [];
let physSolids = [];
let physObstacles = [];
let physPrepared = false;

/* 闭合形状的包围盒；开放形状（半平面 / 无限）返回 null，不做剔除 */
function fieldAABB(c){
  if (OPEN_SHAPES.has(c.shape) || c.shape === 'infinite') return null;
  const b = compAABB(c);
  const pad = 0.02;
  return { x0: b.x0 - pad, x1: b.x1 + pad, y0: b.y0 - pad, y1: b.y1 + pad };
}

function preparePhysics(){
  physFields.length = 0;
  physNegs.length = 0;
  physSolids.length = 0;
  physObstacles.length = 0;

  const comps = state.components;
  for (let i = 0; i < comps.length; i++){
    const c = comps[i];

    if (c.kind === 'field' || c.kind === 'negfield'){
      const box = fieldAABB(c);
      const ent = {
        c, box,
        x0: box ? box.x0 : 0, x1: box ? box.x1 : 0,
        y0: box ? box.y0 : 0, y1: box ? box.y1 : 0,
        Ex: 0, Ey: 0, Bz: 0,
      };
      if (c.kind === 'field'){
        if (c.fieldType === 'E' && c.strength !== 0){
          ent.Ex = c.strength * Math.cos(c.fieldAngle);
          ent.Ey = c.strength * Math.sin(c.fieldAngle);
        } else if (c.fieldType !== 'E'){
          ent.Bz = c.strength * c.bDir;
        }
        physFields.push(ent);
        // 实体边界才参与碰撞；开放形状（单/双边界）没有实体墙
        if (c.boundary === 'solid' && !SHAPES[c.shape].noBoundary && c.shape !== 'infinite'){
          physSolids.push(ent);
        }
      } else {
        physNegs.push(ent);
      }
    }

    else if (c.kind === 'obstacle'){
      const dx = Math.cos(c.angle) * c.len / 2;
      const dy = Math.sin(c.angle) * c.len / 2;
      physObstacles.push({
        c, ax: c.x - dx, ay: c.y - dy, bx: c.x + dx, by: c.y + dy,
        x0: Math.min(c.x - dx, c.x + dx), x1: Math.max(c.x - dx, c.x + dx),
        y0: Math.min(c.y - dy, c.y + dy), y1: Math.max(c.y - dy, c.y + dy),
      });
    }
  }
  physPrepared = true;
}

/* 单点场强（供外部查询 / 调试；热路径不调用它） */
function sampleField(px, py){
  if (!physPrepared) preparePhysics();
  for (let i = 0; i < physNegs.length; i++){
    const f = physNegs[i];
    if (f.box && (px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1)) continue;
    if (insideShape(f.c, px, py)) return { Ex: 0, Ey: 0, Bz: 0 };
  }
  let Ex = 0, Ey = 0, Bz = 0;
  for (let i = 0; i < physFields.length; i++){
    const f = physFields[i];
    if (f.box && (px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1)) continue;
    if (!insideShape(f.c, px, py)) continue;
    Ex += f.Ex; Ey += f.Ey; Bz += f.Bz;
  }
  return { Ex, Ey, Bz };
}

/* =========================================================
   粒子池（SoA + 轨迹环形缓冲）
   ========================================================= */
const TRAIL_CAP = 256;                 // 单条轨迹容量（2 的幂，取模用位与）
const TRAIL_MASK = TRAIL_CAP - 1;
const TRAIL_BUDGET = 140000;           // 全屏轨迹点数预算：粒子多时自动变短

const TM_NONE = 0, TM_SOLID = 1, TM_DASH = 2, TM_FADE = 3, TM_END = 4;
const TRAIL_CODE = { none: TM_NONE, solid: TM_SOLID, dashed: TM_DASH, fade: TM_FADE, endpoint: TM_END };

const PS = {
  n: 0,
  x:     new Float32Array(MAX_PARTICLES),
  y:     new Float32Array(MAX_PARTICLES),
  vx:    new Float32Array(MAX_PARTICLES),
  vy:    new Float32Array(MAX_PARTICLES),
  qm:    new Float32Array(MAX_PARTICLES),   // q/m，预先算好
  eid:   new Int32Array(MAX_PARTICLES),     // 来源发射器 id
  cidx:  new Int32Array(MAX_PARTICLES),     // 调色板索引（随主题自动换色）
  tmode: new Uint8Array(MAX_PARTICLES),
  dead:  new Uint8Array(MAX_PARTICLES),
  head:  new Int32Array(MAX_PARTICLES),     // 环形写指针
  len:   new Uint16Array(MAX_PARTICLES),    // 已存点数
};
const TX = new Float32Array(MAX_PARTICLES * TRAIL_CAP);
const TY = new Float32Array(MAX_PARTICLES * TRAIL_CAP);

/* 轨迹长度上限（点数）：粒子越多越短，保证总绘制量可控 */
function trailCapFor(n){
  const share = TRAIL_BUDGET / (n > 0 ? n : 1);
  let cap = 32;
  while (cap * 2 <= share && cap < TRAIL_CAP) cap *= 2;
  return clamp(cap, 24, TRAIL_CAP);
}
let trailCapNow = TRAIL_CAP;

function clearParticles(){
  PS.n = 0;
}

function densityCount(d){
  return d === 'low' ? 3 : d === 'high' ? 9 : 5;
}

function spawnParticle(em, x, y, v, angleRad){
  if (PS.n >= MAX_PARTICLES) return;
  const i = PS.n++;
  PS.x[i] = x;
  PS.y[i] = y;
  PS.vx[i] = v * Math.cos(angleRad);
  PS.vy[i] = v * Math.sin(angleRad);
  PS.qm[i] = (em.chargeSign * em.charge) / em.mass;
  PS.eid[i] = em.id;
  PS.cidx[i] = em.cidx;
  PS.tmode[i] = TRAIL_CODE[em.trailMode] !== undefined ? TRAIL_CODE[em.trailMode] : TM_SOLID;
  PS.dead[i] = 0;
  PS.head[i] = 1;
  PS.len[i] = 1;
  const base = i * TRAIL_CAP;
  TX[base] = x;
  TY[base] = y;
}

function emitFrom(em){
  const q = em.chargeSign * em.charge;
  if (q === 0 || em.mass <= 0) return;

  if (em.mode === 'single'){
    spawnParticle(em, em.x, em.y, em.v0, em.vAngle * Math.PI / 180);
    return;
  }
  if (em.mode === 'angles'){
    const n = densityCount(em.angleDensity);
    const spread = em.spread * Math.PI / 180;
    const a0 = em.vAngle * Math.PI / 180 - spread / 2;
    for (let i = 0; i < n; i++){
      spawnParticle(em, em.x, em.y, em.v0, a0 + spread * (n === 1 ? 0.5 : i / (n - 1)));
    }
    return;
  }
  if (em.mode === 'speeds'){
    const n = densityCount(em.speedDensity);
    const a = em.vAngle * Math.PI / 180;
    for (let i = 0; i < n; i++){
      spawnParticle(em, em.x, em.y, em.v0 * (0.4 + 1.2 * (n === 1 ? 0.5 : i / (n - 1))), a);
    }
    return;
  }
  if (em.mode === 'line'){
    const n = densityCount(em.lineDensity);
    const dx = Math.cos(em.lineAngle * Math.PI / 180);
    const dy = Math.sin(em.lineAngle * Math.PI / 180);
    const a = em.vAngle * Math.PI / 180;
    for (let i = 0; i < n; i++){
      const t = (n === 1) ? 0.5 : i / (n - 1);
      spawnParticle(em, em.x + (t - 0.5) * em.lineLength * dx,
                        em.y + (t - 0.5) * em.lineLength * dy, em.v0, a);
    }
  }
}

/* =========================================================
   推进（Boris 半隐式；内联采样，无对象分配）
   ========================================================= */
function stepParticles(h){
  const n = PS.n;
  if (n === 0) return;

  const X = PS.x, Y = PS.y, VX = PS.vx, VY = PS.vy, QM = PS.qm, DEAD = PS.dead;
  const nf = physFields, nn = physNegs;
  const nfLen = nf.length, nnLen = nn.length;
  const half = h * 0.5;
  const trailMin2 = 0.0009;

  for (let i = 0; i < n; i++){
    if (DEAD[i]) continue;

    const px = X[i], py = Y[i];

    /* ---- 采样：负场优先，区域内一律置零 ---- */
    let Ex = 0, Ey = 0, Bz = 0, zero = false;
    for (let k = 0; k < nnLen; k++){
      const f = nn[k];
      if (f.box && (px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1)) continue;
      if (insideShape(f.c, px, py)){ zero = true; break; }
    }
    if (!zero){
      for (let k = 0; k < nfLen; k++){
        const f = nf[k];
        if (f.box && (px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1)) continue;
        if (!insideShape(f.c, px, py)) continue;
        Ex += f.Ex; Ey += f.Ey; Bz += f.Bz;
      }
    }

    const qm = QM[i];

    /* ---- Boris 半步电场 → 整步磁场旋转 → 半步电场 ---- */
    let vxm = VX[i] + qm * Ex * half;
    let vym = VY[i] + qm * Ey * half;

    if (Bz !== 0){
      const tz = qm * Bz * half;
      const vpx = vxm + vym * tz;
      const vpy = vym - vxm * tz;
      const s = 2 / (1 + tz * tz);
      vxm += s * vpy * tz;
      vym -= s * vpx * tz;
    }

    vxm += qm * Ex * half;
    vym += qm * Ey * half;
    VX[i] = vxm; VY[i] = vym;

    const nx = px + vxm * h;
    const ny = py + vym * h;
    X[i] = nx; Y[i] = ny;

    if (hitSomething(i, px, py, nx, ny)) continue;

    /* ---- 轨迹写入（环形，O(1)） ---- */
    const base = i * TRAIL_CAP;
    const hd = PS.head[i];
    const lastIdx = base + ((hd - 1) & TRAIL_MASK);
    const ddx = nx - TX[lastIdx], ddy = ny - TY[lastIdx];
    if (ddx * ddx + ddy * ddy > trailMin2){
      TX[base + hd] = nx;
      TY[base + hd] = ny;
      PS.head[i] = (hd + 1) & TRAIL_MASK;
      if (PS.len[i] < TRAIL_CAP) PS.len[i]++;
    }
  }
}

/* 碰撞：实体场边界 + 障碍线段。命中即停（原地停住，不再推进） */
function hitSomething(i, ox, oy, nx, ny){
  for (let k = 0; k < physSolids.length; k++){
    const f = physSolids[k];
    const c = f.c;

    // 闭合形状先用包围盒挡一层（扩展一点，确保跨越检测不漏）
    if (f.box && (Math.min(ox, nx) > f.x1 || Math.max(ox, nx) < f.x0 ||
                  Math.min(oy, ny) > f.y1 || Math.max(oy, ny) < f.y0)) continue;

    const wasIn = insideShape(c, ox, oy);
    const isIn  = insideShape(c, nx, ny);
    if (wasIn === isIn) continue;

    let a = 0, b = 1;
    for (let s = 0; s < 22; s++){
      const m = (a + b) * 0.5;
      if (insideShape(c, ox + (nx - ox) * m, oy + (ny - oy) * m) === wasIn) a = m;
      else b = m;
    }
    PS.x[i] = ox + (nx - ox) * a;
    PS.y[i] = oy + (ny - oy) * a;
    PS.vx[i] = 0; PS.vy[i] = 0; PS.dead[i] = 1;
    return true;
  }

  for (let k = 0; k < physObstacles.length; k++){
    const o = physObstacles[k];
    if (Math.min(ox, nx) > o.x1 || Math.max(ox, nx) < o.x0 ||
        Math.min(oy, ny) > o.y1 || Math.max(oy, ny) < o.y0) continue;

    const hit = segIntersect(ox, oy, nx, ny, o.ax, o.ay, o.bx, o.by);
    if (hit){
      PS.x[i] = hit[0]; PS.y[i] = hit[1];
      PS.vx[i] = 0; PS.vy[i] = 0; PS.dead[i] = 1;
      return true;
    }
  }
  return false;
}

function segIntersect(x1, y1, x2, y2, x3, y3, x4, y4){
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  return null;
}

/* =========================================================
   主步进
   ========================================================= */
const MAX_SUBSTEPS = 720;              // 单帧子步上限（超了放大步长，不丢时间）
const MAX_DT = 0.05;                   // 单帧最大时间（切标签页回来不会爆炸）

function simulate(dtReal){
  const dt = Math.min(MAX_DT, dtReal);
  const dtSim = dt * state.speed;
  if (dtSim <= 0) return;

  preparePhysics();

  /* ---- 发射 ---- */
  const comps = state.components;
  for (let i = 0; i < comps.length; i++){
    const c = comps[i];
    if (c.kind !== 'emitter') continue;
    if (!c.continuous){
      if (!c.emittedOnce){ emitFrom(c); c.emittedOnce = true; }
    } else {
      c.acc = (c.acc || 0) + dtSim;
      let guard = 0;
      while (c.acc >= c.interval && guard++ < 12){
        c.acc -= c.interval;
        emitFrom(c);
      }
    }
  }

  /* ---- 推进 ---- */
  let steps = Math.ceil(dtSim / SUB_DT);
  let h = SUB_DT;
  if (steps > MAX_SUBSTEPS){ steps = MAX_SUBSTEPS; h = dtSim / steps; }
  for (let s = 0; s < steps; s++) stepParticles(h);

  trailCapNow = trailCapFor(PS.n);
  state.simTime += dtSim;
}
