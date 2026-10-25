/* =========================================================
   吸附系统
   ---------------------------------------------------------
   两种模式：
     · magnet（磁性，默认）—— 只有光标落在格线 / 参考线附近（tolPx
       像素）时才被"吸"过去；两条格线之间是自由值。拖动跟手，
       不会出现"数值一直落后光标半格"的感觉。
     · grid（严格）—— 始终按步长量化，并沿运动方向截断
       （15.40 往里收 → 15.00，往外放 → 15.50）。

   三层优先级（从高到低）：
     1. 场边界（发射器贴边）
     2. 组件对齐参考线（左/中/右、上/中/下 与其它组件对齐）
     3. 网格
   ========================================================= */
const snap = {
  on: true,          // 总开关
  step: 0.5,         // 网格步长（米）
  axisTan: 0.035,    // 端点轴向吸附：约 2°
  rotDeg: 5,         // 旋转吸附步长（度）
  mode: 'magnet',    // 'magnet' | 'grid'
  tolPx: 7,          // 磁性吸附容差（屏幕像素）
  guidePx: 6,        // 组件对齐容差（屏幕像素）
  dead: 0.06,        // 起手死区（步长比例），避免手抖来回跳
};

/* 当前帧的吸附参考线（供渲染层画辅助线） */
let guides = [];
/* 当前帧的场边界吸附结果 {x,y,comp} */
let boundarySnap = null;
/* 框选矩形（屏幕坐标） */
let marqueeRect = null;

/* 拖拽读数 HUD */
const hudEl = document.getElementById('dragHud');

function roundTo(v, s){ return Math.round(v / s) * s; }

/* 严格模式：按「相对起始值的变化方向」取整
   - 变小 → 向下截断：15.40 变 15.00（多余部分直接减掉）
   - 变大 → 向上补足：15.40 变 15.50
   base 为按下拖动那一刻的值；缺省时退化为四舍五入。 */
function snapTo(v, step, base){
  if (base === undefined || base === null || !isFinite(base)) return roundTo(v, step);
  const EPS = 1e-9;
  if (Math.abs(v - base) < step * snap.dead) return base;   // 起手死区
  const q = v / step;
  if (v > base + EPS) return Math.ceil(q - EPS) * step;
  if (v < base - EPS) return Math.floor(q + EPS) * step;
  return roundTo(base, step);
}

/* 磁性模式：只在容差内吸附到最近格线，否则原样返回 */
function snapValue(v, base){
  if (!snap.on) return v;
  if (snap.mode === 'grid') return snapTo(v, snap.step, base);
  if (base !== undefined && base !== null && Math.abs(v - base) < snap.step * snap.dead) return base;
  const q = Math.round(v / snap.step) * snap.step;
  const tol = snap.tolPx / SCALE;
  return Math.abs(v - q) <= tol ? q : v;
}

/* 角度吸附：归一到 [0, 2π)，近轴自动贴合 0/90/180/270 */
function snapAngle(rad, snapDeg){
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a < 0) a += twoPi;
  if (snapDeg){
    const st = snapDeg * Math.PI / 180;
    a = roundTo(a, st);
  }
  const axes = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, twoPi];
  for (const ax of axes){
    if (Math.abs(a - ax) < 0.028) return ax % twoPi;
  }
  return a % twoPi;
}

/* 端点吸附：网格 + 轴向对齐（相对固定端点） */
function snapEndpoint(fixed, moving, act, base){
  let mx = moving[0], my = moving[1];
  if (!act) return [mx, my];
  mx = snapValue(mx, base ? base[0] : undefined);
  my = snapValue(my, base ? base[1] : undefined);
  const dx = mx - fixed[0], dy = my - fixed[1];
  if (Math.abs(dy) < Math.abs(dx) * snap.axisTan) my = fixed[1];      // 水平
  else if (Math.abs(dx) < Math.abs(dy) * snap.axisTan) mx = fixed[0]; // 竖直
  return [mx, my];
}

/* ---------- 组件对齐（智能参考线） ----------
   把被拖动包围盒的 左/中/右 与其它组件的 左/中/右 两两比较，
   取容差内最近的一个偏移量。只在拖动时调用，开销可忽略。 */
function alignDelta(box, excludeIds, tolW){
  let dx = null, dy = null, gx = 0, gy = 0;
  const axs = [box.x0, (box.x0 + box.x1) / 2, box.x1];
  const ays = [box.y0, (box.y0 + box.y1) / 2, box.y1];
  const comps = state.components;

  for (let i = 0; i < comps.length; i++){
    const o = comps[i];
    if (excludeIds && excludeIds.has(o.id)) continue;
    if (o.shape === 'infinite') continue;
    const b = compAABB(o);
    const bxs = [b.x0, (b.x0 + b.x1) / 2, b.x1];
    const bys = [b.y0, (b.y0 + b.y1) / 2, b.y1];

    for (let a = 0; a < 3; a++){
      for (let k = 0; k < 3; k++){
        const d = bxs[k] - axs[a];
        if (Math.abs(d) <= tolW && (dx === null || Math.abs(d) < Math.abs(dx))){ dx = d; gx = bxs[k]; }
        const e = bys[k] - ays[a];
        if (Math.abs(e) <= tolW && (dy === null || Math.abs(e) < Math.abs(dy))){ dy = e; gy = bys[k]; }
      }
    }
  }
  return { dx, dy, gx, gy };
}

/* ---------- 位置拖动：对齐 → 网格 ----------
   box0 为按下时的包围盒（可选）；excludeIds 为不参与对齐的组件 id 集合。 */
function snapMove(rawX, rawY, act, baseX, baseY, box0, excludeIds){
  guides = [];
  boundarySnap = null;
  if (!act) return [rawX, rawY];

  let x = rawX, y = rawY;
  let snappedX = false, snappedY = false;

  if (box0){
    const dx = rawX - baseX, dy = rawY - baseY;
    const box = { x0: box0.x0 + dx, x1: box0.x1 + dx, y0: box0.y0 + dy, y1: box0.y1 + dy };
    const g = alignDelta(box, excludeIds, snap.guidePx / SCALE);
    if (g.dx !== null){ x = rawX + g.dx; snappedX = true; guides.push({ axis: 'x', v: g.gx }); }
    if (g.dy !== null){ y = rawY + g.dy; snappedY = true; guides.push({ axis: 'y', v: g.gy }); }
  }

  if (!snappedX){
    const nx = snapValue(x, baseX);
    if (nx !== x){ guides.push({ axis: 'x', v: nx, grid: true }); x = nx; }
  }
  if (!snappedY){
    const ny = snapValue(y, baseY);
    if (ny !== y){ guides.push({ axis: 'y', v: ny, grid: true }); y = ny; }
  }
  return [x, y];
}

/* 兼容旧签名：放置待定组件 / 单点吸附 */
function resolvePos(rawX, rawY, act, comp, baseX, baseY){
  guides = [];
  boundarySnap = null;
  if (!act) return [rawX, rawY];

  // 发射器贴近场边界时直接贴到边界上
  if (comp && comp.kind === 'emitter'){
    const hit = nearestFieldBoundary(rawX, rawY, 14 / SCALE, comp.id);
    if (hit){
      boundarySnap = hit;
      return [hit.x, hit.y];
    }
  }

  const x = snapValue(rawX, baseX);
  const y = snapValue(rawY, baseY);
  if (x !== rawX) guides.push({ axis: 'x', v: x, grid: true });
  if (y !== rawY) guides.push({ axis: 'y', v: y, grid: true });
  return [x, y];
}

/* HUD 显示（贴边时自动翻到光标另一侧） */
function showHud(clientX, clientY, html){
  hudEl.innerHTML = html;
  const bw = hudEl.offsetWidth || 150;
  const bh = hudEl.offsetHeight || 42;
  let x = clientX + 16, y = clientY + 18;
  if (x + bw > window.innerWidth - 8) x = clientX - bw - 14;
  if (y + bh > window.innerHeight - 8) y = clientY - bh - 14;
  hudEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  hudEl.style.opacity = '1';
}
function hideHud(){ hudEl.style.opacity = '0'; }

const fmt2 = v => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(2);

function snapTag(act){
  if (!act) return '';
  if (snap.mode === 'grid') return `<span class="tag">吸附 ${snap.step}m</span>`;
  return `<span class="tag">磁性 ${snap.step}m</span>`;
}
