/* =========================================================
   全局状态
   ========================================================= */
const state = {
  components: [],
  selection: [],          // 多选：按选中顺序保存 id，最后一个是"主选中"
  pending: null,
  running: false,
  speed: 0.2,
  simTime: 0,
  counters: {},
  nextId: 1,

  /* 兼容旧逻辑：selectedId 读写都映射到 selection */
  get selectedId(){
    return this.selection.length ? this.selection[this.selection.length - 1] : null;
  },
  set selectedId(v){
    this.selection = (v === null || v === undefined) ? [] : [v];
  },
};

/* ---------- 选择辅助 ---------- */
function isSelected(id){ return state.selection.indexOf(id) >= 0; }
function selList(){
  const out = [];
  for (const id of state.selection){
    const c = state.components.find(x => x.id === id);
    if (c) out.push(c);
  }
  return out;
}
function primaryComp(){
  const id = state.selectedId;
  return (id === null || id === undefined) ? null : (state.components.find(c => c.id === id) || null);
}
function setSelection(ids){
  state.selection = ids.filter((id, i) => ids.indexOf(id) === i);
  buildPropPanel();
  renderCompList();
}
function toggleSelect(id){
  const i = state.selection.indexOf(id);
  if (i >= 0) state.selection.splice(i, 1);
  else state.selection.push(id);
  buildPropPanel();
  renderCompList();
}

let particles = [];

const PALETTE_DARK  = ['#22d3ee','#f472b6','#a3e635','#fbbf24','#a78bfa',
                       '#fb7185','#34d399','#60a5fa','#f97316','#e879f9'];
const PALETTE_LIGHT = ['#0891b2','#db2777','#4d7c0f','#b45309','#7c3aed',
                       '#e11d48','#059669','#2563eb','#ea580c','#a21caf'];
function palColor(i){
  const arr = theme.light ? PALETTE_LIGHT : PALETTE_DARK;
  return arr[i % arr.length];
}
let emitterColorIdx = 0;

const E_PRESET = { weak:0.05, mid:0.2, strong:1.0 };
const B_PRESET = { weak:0.01, mid:0.05, strong:0.2 };
const E_MIN = 0.01, E_MAX = 5;
const B_MIN = 0.002, B_MAX = 1;

/* =========================================================
   组件创建
   ========================================================= */
function nextName(base){
  state.counters[base] = (state.counters[base] || 0) + 1;
  return base + state.counters[base];
}

function makeField(shapeKey, wx, wy, negative){
  const def = SHAPES[shapeKey];
  const id = state.nextId++;
  const name = nextName(def.name);
  const c = {
    id, kind: negative ? 'negfield' : 'field',
    name, negative: !!negative,
    shape: shapeKey, x: wx, y: wy, angle: 0,
    w: def.w || 2, h: def.h || 2, r: def.r || 1.6, span: def.span || 90,
    fieldType: 'E',
    strength: negative ? 0 : E_PRESET.mid,
    fieldAngle: 0,
    bDir: 1,
    boundary: def.noBoundary ? 'virtual' : 'solid',
  };
  if (shapeKey === 'triangle') setTriSize(c, c.w, c.h);
  return c;
}

function makeObstacle(wx, wy){
  const id = state.nextId++;
  return {
    id, kind:'obstacle', name: nextName('线形障碍'),
    x: wx, y: wy, angle: 0, len: 3,
  };
}

function makeEmitter(wx, wy){
  const id = state.nextId++;
  const cidx = emitterColorIdx++;
  const color = palColor(cidx);
  return {
    id, kind:'emitter', name: nextName('发射器'),
    cidx,
    x: wx, y: wy,
    mode: 'single',
    chargeSign: 1,
    charge: 1e-6,
    mass: 1e-8,
    v0: 10,
    vAngle: 0,
    continuous: true,
    interval: 0.15,
    trailMode: 'solid',
    angleDensity: 'mid',
    speedDensity: 'mid',
    lineDensity: 'mid',
    lineLength: 2,
    lineAngle: 90,
    spread: 60,
    color,
    acc: 0,
    emittedOnce: false,
  };
}

function placeComponent(cat, shapeKey, wx, wy){
  let c = null;
  if (cat === 'field')    c = makeField(shapeKey, wx, wy, false);
  if (cat === 'negative') c = makeField(shapeKey, wx, wy, true);
  if (cat === 'obstacle') c = makeObstacle(wx, wy);
  if (cat === 'emitter')  c = makeEmitter(wx, wy);
  if (!c) return null;

  // 发射器形式由所选图例决定
  if (cat === 'emitter') c.mode = shapeKey;

  if (c.kind === 'field'){
    c.strength = E_PRESET.mid;
    c.boundary = SHAPES[c.shape].noBoundary ? 'virtual' : 'solid';
  }
  state.components.push(c);
  selectComponent(c.id);
  return c;
}

function selectComponent(id){
  state.selectedId = id;
  buildPropPanel();
  renderCompList();
}
