/* =========================================================
   场景：保存 / 加载
   ---------------------------------------------------------
   一个"场景"= 画布上全部组件 + 视图（缩放 / 平移）+ 速率 + 吸附设置。
   主题不进场景（它是全局偏好，另有 simTheme 记忆）。

   存放：localStorage['simScenes'] = [{ name, at, data }]，最多 12 个。
   只序列化"可编辑数据"，运行态字段（acc / emittedOnce / color /
   轨迹缓冲 / 粒子池）一律不存 —— 加载时现算，才能保证一致性。

   还原顺序很重要：
     先清粒子 → 重建组件（新 id / 重建 counters）→ 恢复视图与开关
     → 作废背景层缓存 → 刷新属性面板与组件列表。
   ========================================================= */
const SCENE_KEY = 'simScenes';
const SCENE_VER = 1;
const SCENE_MAX = 12;

/* 组件的可持久化字段白名单（id 不存：加载时重新分配，避免撞号） */
const SCENE_FIELDS = [
  'kind', 'name', 'negative', 'shape',
  'x', 'y', 'angle',
  'w', 'h', 'r', 'span', 'len',
  'fieldType', 'strength', 'fieldAngle', 'bDir', 'boundary',
  'cidx', 'mode', 'chargeSign', 'charge', 'mass', 'v0', 'vAngle',
  'continuous', 'interval', 'trailMode',
  'angleDensity', 'speedDensity', 'lineDensity',
  'lineLength', 'lineAngle', 'spread',
];

/* ---------- 序列化 ---------- */
function packComp(c){
  const o = {};
  for (const k of SCENE_FIELDS) if (c[k] !== undefined) o[k] = c[k];
  if (Array.isArray(c.tv)) o.tv = c.tv.map(p => [p[0], p[1]]);
  return o;
}

/* 先按 kind 造一个"正规"组件（保证默认字段齐全），再把存档字段盖上去 */
function unpackComp(o){
  const kind = o.kind;
  const wx = typeof o.x === 'number' ? o.x : 0;
  const wy = typeof o.y === 'number' ? o.y : 0;
  let c;
  if (kind === 'obstacle')      c = makeObstacle(wx, wy);
  else if (kind === 'emitter')  c = makeEmitter(wx, wy);
  else c = makeField(SHAPES[o.shape] ? o.shape : 'rect', wx, wy, kind === 'negfield');

  for (const k of SCENE_FIELDS){
    if (k === 'kind' || o[k] === undefined) continue;
    c[k] = o[k];
  }
  if (Array.isArray(o.tv)) c.tv = o.tv.map(p => [p[0], p[1]]);

  if (c.kind === 'emitter'){
    c.acc = 0;
    c.emittedOnce = false;
    c.cidx = (typeof o.cidx === 'number') ? o.cidx : emitterColorIdx++;
    if (c.cidx >= emitterColorIdx) emitterColorIdx = c.cidx + 1;
    c.color = palColor(c.cidx);            // 颜色按索引现算，跟随主题
  }
  return c;
}

/* 从「矩形场3 / 发射器5」这类名字里反推计数器，避免加载后又从 1 开始重名 */
function rebuildCounters(){
  state.counters = {};
  for (const c of state.components){
    const m = /^(.*?)(\d+)$/.exec(c.name || '');
    if (!m) continue;
    const base = m[1], n = parseInt(m[2], 10);
    if (!isFinite(n)) continue;
    state.counters[base] = Math.max(state.counters[base] || 0, n);
  }
}

function packScene(){
  return {
    v: SCENE_VER,
    at: Date.now(),
    scale: SCALE,
    view: { cx: view.cx, cy: view.cy },
    speed: state.speed,
    snap: { on: snap.on, step: snap.step, mode: snap.mode },
    comps: state.components.map(packComp),
  };
}

function applyScene(s){
  if (!s || !Array.isArray(s.comps)) return false;

  // 拖动 / 框选中加载：先把交互状态收干净，否则残留的 drag 会写回旧组件
  drag = null;
  hover = null;
  marqueeRect = null;
  guides = [];
  boundarySnap = null;
  canvas.style.cursor = '';
  canvas.classList.remove('grabbing');
  hideHud();

  clearParticles();
  state.components = s.comps.map(unpackComp);
  rebuildCounters();

  let maxId = 0;
  for (const c of state.components) if (c.id > maxId) maxId = c.id;
  state.nextId = maxId + 1;

  state.selection = [];
  state.pending = null;
  state.simTime = 0;
  state.running = false;
  updatePlayBtn();

  if (typeof s.scale === 'number') SCALE = clamp(s.scale, SCALE_MIN, SCALE_MAX);
  if (s.view){
    if (typeof s.view.cx === 'number') view.cx = s.view.cx;
    if (typeof s.view.cy === 'number') view.cy = s.view.cy;
  }
  if (typeof s.speed === 'number') setSpeed(s.speed);
  if (s.snap){
    snap.on = !!s.snap.on;
    if (typeof s.snap.step === 'number') snap.step = s.snap.step;
    if (s.snap.mode === 'grid' || s.snap.mode === 'magnet') snap.mode = s.snap.mode;
    updateSnapUI();
  }

  bgHash = -1;                 // 背景层缓存作废，下一帧整块重建
  updateZoomUI();
  buildPropPanel();
  renderCompList();
  return true;
}

/* ---------- 存储 ---------- */
function readSceneStore(){
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(s => s && s.name && s.data);
  } catch(_){ return []; }
}

function writeSceneStore(list){
  try {
    localStorage.setItem(SCENE_KEY, JSON.stringify(list));
    return true;
  } catch(_){ return false; }
}

function fmtSceneTime(ts){
  const d = new Date(ts || Date.now());
  const p = n => (n < 10 ? '0' : '') + n;
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function nextSceneName(list){
  for (let i = 1; i <= SCENE_MAX + 1; i++){
    const nm = '场景 ' + i;
    if (!list.some(s => s.name === nm)) return nm;
  }
  return '场景 ' + (list.length + 1);
}

function saveCurrentScene(rawName){
  const list = readSceneStore();
  let nm = (rawName || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!nm) nm = nextSceneName(list);

  const rec = { name: nm, at: Date.now(), data: packScene() };
  const i = list.findIndex(s => s.name === nm);
  if (i >= 0) list[i] = rec;          // 同名覆盖
  else list.unshift(rec);
  if (list.length > SCENE_MAX) list.length = SCENE_MAX;

  if (!writeSceneStore(list)){
    showHint('保存失败：浏览器本地存储不可用');
    return false;
  }
  renderSceneList();
  showHint((i >= 0 ? '已更新场景「' : '已保存场景「') + nm + '」');
  return true;
}

/* ---------- 对话框 ---------- */
const sceneDlg     = document.getElementById('sceneDialog');
const sceneListEl  = document.getElementById('sceneList');
const sceneNameEl  = document.getElementById('sceneName');
const sceneSaveBtn = document.getElementById('sceneSave');
const sceneOpenBtn = document.getElementById('sceneBtn');

function renderSceneList(){
  if (!sceneListEl) return;
  const list = readSceneStore();
  sceneListEl.innerHTML = '';

  if (!list.length){
    const li = document.createElement('li');
    li.className = 'emptyTip';
    li.textContent = '还没有保存的场景';
    sceneListEl.appendChild(li);
    return;
  }

  list.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'sceneRow';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'ghost scenePick';
    pick.dataset.tooltip = '加载「' + rec.name + '」';

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = rec.name;

    const meta = document.createElement('small');
    meta.className = 'sceneMeta';
    const n = (rec.data && Array.isArray(rec.data.comps)) ? rec.data.comps.length : 0;
    meta.textContent = n + ' 个组件 · ' + fmtSceneTime(rec.at);
    pick.append(nm, meta);

    pick.onclick = () => {
      if (applyScene(rec.data)){
        closeSceneDialog();
        showHint('已加载场景「' + rec.name + '」');
      } else {
        showHint('这个场景的数据已损坏，无法加载');
      }
    };

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost compDel';
    del.textContent = '×';
    del.setAttribute('aria-label', '删除场景 ' + rec.name);
    del.onclick = (e) => {
      e.stopPropagation();
      if (!writeSceneStore(readSceneStore().filter(s => s.name !== rec.name))) return;
      renderSceneList();
      showHint('已删除场景「' + rec.name + '」');
    };

    li.append(pick, del);
    sceneListEl.appendChild(li);
  });
}

function openSceneDialog(){
  if (!sceneDlg) return;
  renderSceneList();
  if (sceneDlg.open) return;
  if (typeof sceneDlg.showModal === 'function') sceneDlg.showModal();
  else sceneDlg.setAttribute('open', '');
  if (sceneNameEl) setTimeout(() => sceneNameEl.focus(), 30);
}

function closeSceneDialog(){
  if (!sceneDlg) return;
  if (typeof sceneDlg.close === 'function' && sceneDlg.open) sceneDlg.close();
  else sceneDlg.removeAttribute('open');
}

function initSceneUI(){
  if (sceneOpenBtn) sceneOpenBtn.onclick = () => openSceneDialog();

  if (sceneSaveBtn){
    sceneSaveBtn.onclick = () => {
      if (saveCurrentScene(sceneNameEl ? sceneNameEl.value : '') && sceneNameEl){
        sceneNameEl.value = '';
      }
    };
  }

  if (sceneNameEl){
    // 输入框里的按键不要冒泡到画布快捷键（空格 / Delete 会误触）
    sceneNameEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter'){
        e.preventDefault();
        if (sceneSaveBtn) sceneSaveBtn.click();
      }
    });
  }

  if (sceneDlg){
    const close = document.getElementById('sceneClose');
    if (close) close.onclick = () => closeSceneDialog();
    // 点遮罩关闭（Oat 的 dialog 内部铺满，target 是 dialog 本体时才是点到了外面）
    sceneDlg.addEventListener('click', (e) => {
      if (e.target === sceneDlg) closeSceneDialog();
    });
  }
}

initSceneUI();
