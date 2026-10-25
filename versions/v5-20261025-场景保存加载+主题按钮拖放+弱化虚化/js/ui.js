/* =========================================================
   左侧类别与图例
   ========================================================= */
const legend = document.getElementById('legend');
const catBtns = document.querySelectorAll('#leftPanel [data-cat]');

const CAT_ITEMS = {
  field: Object.keys(SHAPES),
  negative: Object.keys(SHAPES),
  obstacle: ['line'],
  emitter: ['single','angles','speeds','line'],
};

const EMITTER_LABEL = {
  single: '点发射器',
  angles: '不同角度发射器',
  speeds: '不同速度发射器',
  line: '线状发射器',
};

let currentCat = null;

/* 类别是 Oat 的 [role=tablist] / [role=tab]，状态同时走 .on 与 aria-selected */
function setCatActive(cat){
  catBtns.forEach(b => {
    const on = b.dataset.cat === cat;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

catBtns.forEach(btn => {
  btn.onclick = () => {
    const cat = btn.dataset.cat;
    if (currentCat === cat){
      currentCat = null;
      setCatActive(null);
      legend.innerHTML = '';
      return;
    }
    currentCat = cat;
    setCatActive(cat);
    buildLegend(cat);
  };
});

function buildLegend(cat){
  legend.innerHTML = '';
  const items = CAT_ITEMS[cat];
  items.forEach((key, idx) => {
    const li = document.createElement('li');
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'ghost legendBtn';
    d.setAttribute('aria-pressed', 'false');
    if (cat === 'obstacle') d.textContent = '线形障碍';
    else if (cat === 'emitter') d.textContent = EMITTER_LABEL[key];
    else d.textContent = SHAPES[key].name;

    d.onclick = () => {
      legend.querySelectorAll('.legendBtn').forEach(x => {
        x.classList.remove('on');
        x.setAttribute('aria-pressed', 'false');
      });
      d.classList.add('on');
      d.setAttribute('aria-pressed', 'true');
      state.pending = { cat, key };
      showHint('点击画布放置 ' + d.textContent);
    };
    d.style.animation = '';
    li.style.animationDelay = (idx * 12) + 'ms';
    li.appendChild(d);
    legend.appendChild(li);
  });
}

/* 程序化选中某个类别（开屏默认展开「场」，否则左侧面板开局是一片空白） */
function selectCat(cat){
  if (!CAT_ITEMS[cat]) return;
  currentCat = cat;
  setCatActive(cat);
  buildLegend(cat);
}

/* =========================================================

   提示
   ========================================================= */
const hintEl = document.getElementById('hint');
let hintTimer = null;
let hintToast = null;

/* 提示：优先用 Oat 的 toast（每次先清掉上一条，不会堆叠），
   Oat 不可用时降级为顶部小药丸 */
function showHint(text){
  if (window.ot && typeof ot.toast === 'function'){
    try {
      ot.toast.clear('top-center');
      // Oat 的签名是 (message, title, options)，标题位传 null
      hintToast = ot.toast(text, null, { placement: 'top-center', duration: 1900 });
      return;
    } catch(_){ /* 落到降级分支 */ }
  }
  if (!hintEl) return;
  hintEl.hidden = false;
  hintEl.textContent = text;
  hintEl.style.opacity = '1';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hintEl.style.opacity = '0';
    setTimeout(() => { hintEl.hidden = true; }, 320);
  }, 2200);
}

const propPanel = document.getElementById('propPanel');
const propBody   = document.getElementById('propBody');
const propTitle  = document.getElementById('propTitle');
const propKind   = document.getElementById('propKind');

function el(tag, cls){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/* 分段控件：直接用 Oat 的 [role=tablist] / [role=tab] 外观（选中态 = 主色药丸） */
function markOn(b){
  b.classList.add('on');
  b.setAttribute('aria-selected', 'true');
}

function segCtrl(options, value, onChange){
  const wrap = el('div','segGroup');
  wrap.setAttribute('role','tablist');
  const btns = [];
  options.forEach(o => {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected','false');
    b.textContent = o.label;
    if (o.value === value) markOn(b);
    b.onclick = () => {
      btns.forEach(x => {
        x.classList.remove('on');
        x.setAttribute('aria-selected','false');
      });
      markOn(b);
      onChange(o.value);
    };
    wrap.appendChild(b);
    btns.push(b);
  });
  return wrap;
}

function logSliderCtrl(min, max, value, onChange, fmt){
  const wrap = el('div','sliderWrap');
  const input = el('input');
  input.type = 'range'; input.min = 0; input.max = 1000;
  const toS = v => Math.round(Math.log(v/min) / Math.log(max/min) * 1000);
  const toV = s => min * Math.pow(max/min, s/1000);
  input.value = toS(value);
  const out = el('span','sliderVal');
  out.textContent = fmt(value);
  input.oninput = () => {
    const v = toV(parseFloat(input.value));
    out.textContent = fmt(v);
    onChange(v);
  };
  wrap.append(input, out);
  return wrap;
}

function sliderCtrl(min, max, value, onChange, fmt){
  const wrap = el('div','sliderWrap');
  const input = el('input');
  input.type = 'range'; input.min = min; input.max = max;
  input.step = (max - min) / 500;
  input.value = value;
  const out = el('span','sliderVal');
  out.textContent = fmt(value);
  input.oninput = () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v);
    onChange(v);
  };
  wrap.append(input, out);
  return wrap;
}

/* 角度控件：滑杆 + 可直接输入的角度框（0~360 循环） */
function angleSlider(deg, onChange){
  const start = ((deg % 360) + 360) % 360;
  const wrap = el('div','sliderWrap');
  const range = el('input');
  range.type = 'range'; range.min = 0; range.max = 360; range.step = 1;
  range.value = start;
  const num = el('input');
  num.type = 'number'; num.className = 'numMini';
  num.min = 0; num.max = 360; num.step = 1;
  num.value = Math.round(start * 10) / 10;

  range.oninput = () => {
    const v = parseFloat(range.value);
    num.value = Math.round(v * 10) / 10;
    onChange(v);
  };
  num.oninput = () => {
    let v = parseFloat(num.value);
    if (isNaN(v)) return;
    v = ((v % 360) + 360) % 360;
    range.value = v;
    onChange(v);
  };
  wrap.append(range, num);
  return wrap;
}

function numCtrl(value, onChange, unit){
  const wrap = el('div','numWrap');
  const input = el('input');
  input.type = 'number'; input.value = value;
  input.oninput = () => {
    const v = parseFloat(input.value);
    if (!isNaN(v)) onChange(v);
  };
  wrap.appendChild(input);
  if (unit){
    const u = el('span','unit');
    u.textContent = unit;
    wrap.appendChild(u);
  }
  return wrap;
}

function row(label, node, extra){
  const r = el('div','propRow');
  const l = el('div','rowLabel');
  l.textContent = label;
  if (extra){
    const b = el('b'); b.textContent = extra; l.appendChild(b);
  }
  r.appendChild(l);
  r.appendChild(node);
  return r;
}

function sectionTitle(text){
  const d = el('div','sectionTitle');
  d.textContent = text;
  return d;
}

/* 位置 X / Y 并排，版面更匀称（Oat 的数字输入框 + label） */
function posGrid(c){
  const wrap = el('div','posGrid');
  const mk = (lab, val, on) => {
    const cell = el('label','posField');
    const s = el('span'); s.textContent = lab;
    const inp = el('input');
    inp.type = 'number'; inp.step = '0.1'; inp.value = round2(val);
    inp.oninput = () => { const v = parseFloat(inp.value); if (!isNaN(v)) on(v); };
    const u = el('span','unit'); u.textContent = 'm';
    cell.append(s, inp, u);
    return cell;
  };
  wrap.appendChild(mk('X', c.x, v => c.x = v));
  wrap.appendChild(mk('Y', c.y, v => c.y = v));
  return wrap;
}

function deleteBtn(c){
  const b = el('button','outline delBtn');
  b.type = 'button';
  b.dataset.variant = 'danger';
  b.appendChild(Icon.el('trash2', 15, 2));
  b.appendChild(document.createTextNode('删除该组件'));
  b.onclick = () => deleteComp(c);
  return b;
}

function dotColor(c){
  if (c.kind === 'field') return c.fieldType === 'E' ? tc('#f59e0b') : tc('#38bdf8');
  if (c.kind === 'negfield') return theme.light ? '#475569' : '#94a3b8';
  if (c.kind === 'obstacle') return theme.light ? '#334155' : '#e2e8f0';
  return theme.light ? shade(c.color, 0.8) : c.color;
}

function buildPropPanel(){
  const keepScroll = propBody.scrollTop;
  propBody.innerHTML = '';

  const list = selList();
  if (list.length === 0){
    propPanel.style.display = 'none';
    propTitle.textContent = '属性';
    if (propKind) propKind.textContent = '';
    return;
  }
  propPanel.style.display = 'flex';

  if (list.length > 1){
    propTitle.textContent = '多选';
    if (propKind) propKind.textContent = list.length + ' 项';
    buildMultiProps(list);
    propBody.scrollTop = keepScroll;
    return;
  }

  const c = list[0];
  propTitle.textContent = c.name;
  if (propKind) propKind.textContent =
    c.kind === 'field' ? '电场/磁场' :
    c.kind === 'negfield' ? '负场' :
    c.kind === 'obstacle' ? '障碍' : '发射器';

  if (c.kind === 'field') buildFieldProps(c);
  else if (c.kind === 'negfield') buildNegFieldProps(c);
  else if (c.kind === 'obstacle') buildObstacleProps(c);
  else if (c.kind === 'emitter') buildEmitterProps(c);

  propBody.appendChild(deleteBtn(c));
  propBody.scrollTop = keepScroll;
}

/* ---------- 多选批量面板 ---------- */
function buildMultiProps(list){
  const head = el('div','multiHead');
  head.innerHTML = `<span class="multiCount">${list.length}</span>
    <span>个组件已选中，可整体拖动 / 对齐 / 删除</span>`;
  propBody.appendChild(head);

  // 名称清单
  const names = el('menu','unstyled multiList');
  for (const c of list){
    const r = el('li','compRow');
    const dot = el('span','dot');
    dot.style.background = dotColor(c);
    const nm = el('span','nm');
    nm.textContent = c.name;
    r.append(dot, nm);
    names.appendChild(r);
  }
  propBody.appendChild(names);

  propBody.appendChild(sectionTitle('对齐'));
  const row1 = el('div','multiRow');
  [['左', 'left'], ['水平居中', 'cx'], ['右', 'right']].forEach(([label, mode]) => {
    const b = el('button','ghost small');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => { alignSelection(mode); buildPropPanel(); };
    row1.appendChild(b);
  });
  const row2 = el('div','multiRow');
  [['上', 'top'], ['垂直居中', 'cy'], ['下', 'bottom']].forEach(([label, mode]) => {
    const b = el('button','ghost small');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => { alignSelection(mode); buildPropPanel(); };
    row2.appendChild(b);
  });
  propBody.appendChild(row1);
  propBody.appendChild(row2);

  const same = el('button','outline small');
  same.type = 'button';
  same.style.cssText = 'width:100%;margin-bottom:8px;';
  same.textContent = '等间距分布（水平 / 垂直自适应）';
  same.onclick = () => { distributeSelection(); buildPropPanel(); };
  propBody.appendChild(same);

  const del = el('button','outline delBtn');
  del.type = 'button';
  del.dataset.variant = 'danger';
  del.appendChild(Icon.el('trash2', 15, 2));
  del.appendChild(document.createTextNode(`删除这 ${list.length} 个组件`));
  del.onclick = () => {
    const ids = list.map(c => c.id);
    state.components = state.components.filter(c => ids.indexOf(c.id) < 0);
    state.selection = [];
    buildPropPanel();
    renderCompList();
  };
  propBody.appendChild(del);
}

function alignSelection(mode){
  const list = selList();
  if (list.length < 2) return;
  const xs = list.map(c => c.x), ys = list.map(c => c.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  for (const c of list){
    if (mode === 'left')  c.x = Math.min(...xs);
    if (mode === 'right') c.x = Math.max(...xs);
    if (mode === 'cx')    c.x = cx;
    if (mode === 'top')    c.y = Math.max(...ys);
    if (mode === 'bottom') c.y = Math.min(...ys);
    if (mode === 'cy')    c.y = cy;
  }
  guides = [];
}

/* 等间距：元素多于 2 个时按中心沿跨度较大的轴均匀分布 */
function distributeSelection(){
  const list = selList();
  if (list.length < 3) return;
  const xs = list.map(c => c.x), ys = list.map(c => c.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const axis = spanX >= spanY ? 'x' : 'y';
  const arr = list.slice().sort((a, b) => a[axis] - b[axis]);
  const first = arr[0][axis], last = arr[arr.length - 1][axis];
  const step = (last - first) / (arr.length - 1);
  arr.forEach((c, i) => { c[axis] = first + step * i; });
}

function buildFieldProps(c){
  propBody.appendChild(sectionTitle('场属性'));
  propBody.appendChild(row('场类型', segCtrl(
    [{label:'电场', value:'E'}, {label:'磁场', value:'B'}],
    c.fieldType,
    v => {
      c.fieldType = v;
      c.strength = v === 'E' ? E_PRESET.mid : B_PRESET.mid;
      buildPropPanel();
    }
  )));

  if (c.fieldType === 'E'){
    propBody.appendChild(row('电场方向', angleSlider(
      c.fieldAngle * 180 / Math.PI,
      v => { c.fieldAngle = v * Math.PI/180; }
    )));
  } else {
    propBody.appendChild(row('磁场方向', segCtrl(
      [{label:'垂直屏幕向外', value:1}, {label:'垂直屏幕向里', value:-1}],
      c.bDir,
      v => { c.bDir = v; }
    )));
  }

  const preset = c.fieldType === 'E' ? E_PRESET : B_PRESET;
  const min = c.fieldType === 'E' ? E_MIN : B_MIN;
  const max = c.fieldType === 'E' ? E_MAX : B_MAX;
  const unit = c.fieldType === 'E' ? 'N/C' : 'T';

  function matchPreset(v){
    if (Math.abs(v - preset.weak) < 1e-9) return 'weak';
    if (Math.abs(v - preset.mid) < 1e-9) return 'mid';
    if (Math.abs(v - preset.strong) < 1e-9) return 'strong';
    return null;
  }

  const segWrap = segCtrl(
    [
      {label:'弱', value:'weak'},
      {label:'中', value:'mid'},
      {label:'强', value:'strong'},
    ],
    matchPreset(c.strength),
    v => {
      c.strength = preset[v];
      buildPropPanel();
    }
  );

  if (!matchPreset(c.strength)){
    segWrap.querySelectorAll('[role=tab]').forEach(b => {
      b.classList.remove('on');
      b.setAttribute('aria-selected','false');
    });
    const tag = el('span','badge');
    tag.dataset.variant = 'warning';
    tag.textContent = '自定义';
    tag.style.marginLeft = '6px';
    segWrap.appendChild(tag);
  }

  propBody.appendChild(row('场大小', segWrap));
  propBody.appendChild(row('数值', logSliderCtrl(
    min, max, c.strength,
    v => { c.strength = v; },
    v => v.toPrecision(2) + ' ' + unit
  )));

  if (!SHAPES[c.shape].noBoundary){
    propBody.appendChild(row('边界属性', segCtrl(
      [{label:'实边界', value:'solid'}, {label:'虚边界', value:'virtual'}],
      c.boundary,
      v => { c.boundary = v; }
    )));
  }

  if (!(c.shape === 'infinite' || c.shape === 'single' || c.shape === 'double')){
    propBody.appendChild(sectionTitle('形状'));
    addSizeControls(c);
  }

  propBody.appendChild(sectionTitle('变换'));
  propBody.appendChild(row('角度', angleSlider(
    c.angle * 180 / Math.PI,
    v => { c.angle = v * Math.PI/180; }
  )));

  propBody.appendChild(row('位置', posGrid(c)));
}

function addSizeControls(c){
  const s = c.shape;
  if (s === 'infinite' || s === 'single' || s === 'double') return;

  if (s === 'circle'){
    propBody.appendChild(row('半径', sliderCtrl(
      0.2, 6, c.r, v => c.r = v, v => v.toFixed(2) + ' m'
    )));
  }
  else if (s === 'sector'){
    propBody.appendChild(row('半径', sliderCtrl(
      0.2, 6, c.r, v => c.r = v, v => v.toFixed(2) + ' m'
    )));
    propBody.appendChild(row('圆心角', sliderCtrl(
      10, 350, c.span, v => c.span = v, v => Math.round(v) + '°'
    )));
  }
  else if (s === 'triangle'){
    propBody.appendChild(row('底边', sliderCtrl(
      0.3, 10, c.w, v => setTriSize(c, v, c.h), v => v.toFixed(2) + ' m'
    )));
    propBody.appendChild(row('高', sliderCtrl(
      0.3, 10, c.h, v => setTriSize(c, c.w, v), v => v.toFixed(2) + ' m'
    )));
    const tip = el('p','viewHint');
    tip.textContent = '提示：拖动三个蓝色方点可任意改变形状，松手后自动以重心为新中心。';
    propBody.appendChild(tip);
  }
  else {
    propBody.appendChild(row('长（局部 X）', sliderCtrl(
      0.3, 10, c.w, v => c.w = v, v => v.toFixed(2) + ' m'
    )));
    propBody.appendChild(row('宽（局部 Y）', sliderCtrl(
      0.3, 10, c.h, v => c.h = v, v => v.toFixed(2) + ' m'
    )));
  }
}

function buildNegFieldProps(c){
  const tip = el('div','tipAlert');
  tip.setAttribute('role','alert');
  tip.textContent = '负场区域内电场与磁场均归零，不显示方向与大小。';
  propBody.appendChild(tip);

  if (!(c.shape === 'infinite' || c.shape === 'single' || c.shape === 'double')){
    propBody.appendChild(sectionTitle('形状'));
    addSizeControls(c);
  }

  propBody.appendChild(sectionTitle('变换'));
  propBody.appendChild(row('角度', angleSlider(
    c.angle * 180 / Math.PI,
    v => { c.angle = v * Math.PI/180; }
  )));

  propBody.appendChild(row('位置', posGrid(c)));
}

function buildObstacleProps(c){
  propBody.appendChild(sectionTitle('参数'));
  propBody.appendChild(row('长度', sliderCtrl(
    0.3, 10, c.len, v => c.len = v, v => v.toFixed(2) + ' m'
  )));
  propBody.appendChild(sectionTitle('变换'));
  propBody.appendChild(row('角度', angleSlider(
    c.angle * 180 / Math.PI,
    v => { c.angle = v * Math.PI/180; }
  )));
  propBody.appendChild(row('位置', posGrid(c)));
}

function buildEmitterProps(c){
  propBody.appendChild(sectionTitle('发射器'));
  propBody.appendChild(row('发射器形式', segCtrl(
    [
      {label:'单点', value:'single'},
      {label:'不同角度', value:'angles'},
      {label:'不同速度', value:'speeds'},
      {label:'线状', value:'line'},
    ],
    c.mode,
    v => { c.mode = v; buildPropPanel(); }
  )));

  propBody.appendChild(row('电荷正负', segCtrl(
    [{label:'正电荷', value:1}, {label:'负电荷', value:-1}],
    c.chargeSign,
    v => { c.chargeSign = v; }
  )));

  propBody.appendChild(row('电荷量', logSliderCtrl(
    1e-9, 1e-3, c.charge,
    v => c.charge = v,
    v => v.toExponential(1) + ' C'
  )));

  propBody.appendChild(row('质量', logSliderCtrl(
    1e-12, 1e-5, c.mass,
    v => c.mass = v,
    v => v.toExponential(1) + ' kg'
  )));

  propBody.appendChild(row('初速度大小', sliderCtrl(
    0.5, 100, c.v0, v => c.v0 = v, v => v.toFixed(1) + ' m/s'
  )));

  propBody.appendChild(row('初速度方向', angleSlider(
    c.vAngle, v => c.vAngle = v
  )));

  if (c.mode !== 'single') propBody.appendChild(sectionTitle('发射特性'));
  if (c.mode === 'angles'){
    propBody.appendChild(row('角度疏密', segCtrl(
      [{label:'稀', value:'low'}, {label:'中', value:'mid'}, {label:'密', value:'high'}],
      c.angleDensity, v => c.angleDensity = v
    )));
    propBody.appendChild(row('扩散角度', sliderCtrl(
      5, 360, c.spread, v => c.spread = v, v => Math.round(v) + '°'
    )));
  }
  if (c.mode === 'speeds'){
    propBody.appendChild(row('速度疏密', segCtrl(
      [{label:'稀', value:'low'}, {label:'中', value:'mid'}, {label:'密', value:'high'}],
      c.speedDensity, v => c.speedDensity = v
    )));
  }
  if (c.mode === 'line'){
    propBody.appendChild(row('线的疏密', segCtrl(
      [{label:'稀', value:'low'}, {label:'中', value:'mid'}, {label:'密', value:'high'}],
      c.lineDensity, v => c.lineDensity = v
    )));
    propBody.appendChild(row('线的长度', sliderCtrl(
      0.2, 10, c.lineLength, v => c.lineLength = v, v => v.toFixed(2) + ' m'
    )));
    propBody.appendChild(row('线的角度', sliderCtrl(
      0, 360, c.lineAngle, v => c.lineAngle = v, v => Math.round(v) + '°'
    )));
  }

  propBody.appendChild(sectionTitle('发射节奏'));
  propBody.appendChild(row('持续发射', segCtrl(
    [{label:'是', value:true}, {label:'否', value:false}],
    c.continuous,
    v => { c.continuous = v; c.emittedOnce = false; }
  )));

  if (c.continuous){
    propBody.appendChild(row('发射间隔', segCtrl(
      [{label:'稀', value:0.4}, {label:'中', value:0.15}, {label:'密', value:0.05}],
      c.interval,
      v => { c.interval = v; buildPropPanel(); }
    )));
    propBody.appendChild(row('间隔数值', sliderCtrl(
      0.01, 1.5, c.interval, v => c.interval = v, v => v.toFixed(3) + ' s'
    )));
  }

  propBody.appendChild(sectionTitle('轨迹'));
  propBody.appendChild(row('轨迹显示', segCtrl(
    [
      {label:'不显示', value:'none'},
      {label:'实线', value:'solid'},
      {label:'虚线', value:'dashed'},
      {label:'渐弱', value:'fade'},
      {label:'仅终点', value:'endpoint'},
    ],
    c.trailMode,
    v => { c.trailMode = v; }
  )));

  propBody.appendChild(sectionTitle('变换'));
  propBody.appendChild(row('位置', posGrid(c)));
}

function round2(v){ return Math.round(v * 100) / 100; }

/* =========================================================
   组件列表
   ========================================================= */
const listPanel = document.getElementById('listPanel');
const listBody = document.getElementById('listBody');

function deleteComp(c){
  const i = state.components.indexOf(c);
  if (i >= 0) state.components.splice(i, 1);
  state.selection = state.selection.filter(id => id !== c.id);
  if (drag && drag.comp === c) drag = null;
  buildPropPanel();
  renderCompList();
}

function renderCompList(){
  listBody.innerHTML = '';
  if (state.components.length === 0){
    const t = el('li','emptyTip');
    t.textContent = '暂无组件';
    listBody.appendChild(t);
    return;
  }
  state.components.forEach(c => {
    const row = el('li','compRow');

    // 选中 / 多选走 Oat 的 ghost 按钮
    const pick = el('button','ghost compPick');
    pick.type = 'button';
    if (isSelected(c.id)){
      pick.classList.add('on');
      pick.setAttribute('aria-pressed','true');
    } else {
      pick.setAttribute('aria-pressed','false');
    }
    const dot = el('span','dot');
    dot.style.background = dotColor(c);
    const nm = el('span','nm');
    nm.textContent = c.name;
    pick.append(dot, nm);
    // Shift / Ctrl 点击 = 多选
    pick.onclick = (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelect(c.id);
      else selectComponent(c.id);
    };

    const x = el('button','ghost compDel');
    x.type = 'button';
    x.setAttribute('aria-label', '删除 ' + c.name);
    x.textContent = '×';
    x.onclick = (e) => {
      e.stopPropagation();
      deleteComp(c);
    };

    row.append(pick, x);
    listBody.appendChild(row);
  });
}

/* =========================================================
   键盘快捷键
   ========================================================= */
window.addEventListener('keydown', (e) => {
  // 在输入框内输入时不触发画布快捷键
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  // 场景对话框打开时，画布快捷键全部让位（Esc 交给 dialog 自己关）
  const dlg = document.getElementById('sceneDialog');
  if (dlg && dlg.open) return;

  if (e.code === 'Space'){
    e.preventDefault();
    state.running = !state.running;
    updatePlayBtn();
  }
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd'){
    e.preventDefault(); setScaleAt(SCALE * 1.2, W/2, H/2);
  }
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract'){
    e.preventDefault(); setScaleAt(SCALE * 0.8, W/2, H/2);
  }
  if (e.key === '0'){ resetView(); }
  if (e.key === 'g' || e.key === 'G'){
    snap.on = !snap.on;
    guides = [];
    updateSnapUI();
    showHint(snap.on
      ? `吸附：开（${snap.step} m · ${snap.mode === 'grid' ? '严格' : '磁性'}）`
      : '吸附：关');
  }
  if (e.key === 'm' || e.key === 'M'){
    snap.mode = snap.mode === 'grid' ? 'magnet' : 'grid';
    updateSnapUI();
    showHint(snap.mode === 'grid' ? '切换为严格吸附（始终落在格线）' : '切换为磁性吸附（靠近才吸）');
  }
  if (e.code === 'Escape' && drag){
    // 拖动中按 Esc：回滚到按下时的状态
    const d = drag;
    drag = null;
    if (d.comp && d.startComp) restoreSnapshot(d.comp, d.startComp);
    if (d.type === 'multi' && d.items){
      for (const it of d.items){
        it.comp.x = it.sx;
        it.comp.y = it.sy;
        if (it.snap) restoreSnapshot(it.comp, it.snap);
      }
    }
    guides = [];
    boundarySnap = null;
    hideHud();
    canvas.classList.remove('grabbing');
    canvas.style.cursor = '';
    buildPropPanel();
    renderCompList();
    return;
  }
  if (e.code === 'Escape'){
    state.pending = null;
    state.selectedId = null;
    hover = null;
    marqueeRect = null;
    guides = [];
    hideHud();
    legend.querySelectorAll('.legendBtn').forEach(x => {
      x.classList.remove('on');
      x.setAttribute('aria-pressed','false');
    });
    buildPropPanel();
    renderCompList();
  }
  if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)){
    e.preventDefault();
    state.selection = state.components.map(c => c.id);
    buildPropPanel();
    renderCompList();
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace'){
    if (state.selection.length){
      const ids = state.selection.slice();
      state.components = state.components.filter(c => ids.indexOf(c.id) < 0);
      state.selection = [];
      buildPropPanel();
      renderCompList();
    }
  }
  if (e.key === 't' || e.key === 'T'){ applyTheme(!theme.light); }
  if (e.key === 's' || e.key === 'S'){
    if (e.ctrlKey || e.metaKey){ e.preventDefault(); saveCurrentScene(''); }
    else openSceneDialog();
  }
});

/* =========================================================
   面板：折叠 / 拖动 / 复位
   ========================================================= */
