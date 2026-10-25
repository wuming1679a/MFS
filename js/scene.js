/* =========================================================
   场景：保存 / 加载 / 分组 / 导入导出
   ---------------------------------------------------------
   一个"场景"= 画布上全部组件 + 视图（缩放 / 平移）+ 速率 + 吸附设置。
   主题不进场景（它是全局偏好，另有 simTheme 记忆）。

   存放：localStorage['simScenes'] = [{ name, group, at, data }]，
   最多 200 个。只序列化"可编辑数据"，运行态字段（acc / emittedOnce /
   color / 轨迹缓冲 / 粒子池）一律不存 —— 加载时现算，才能保证一致。

   分组（group）：给教学用的，比如「作业1」下面放
   「场景1（第二题）」「场景2（第四题）」。空分组落到「未分组」。

   导入导出：整份 / 单组 / 单场景都能导出成 JSON，导入时同组同名覆盖。

   还原顺序很重要：
     先清粒子 → 重建组件（新 id / 重建 counters）→ 恢复视图与开关
     → 作废背景层缓存 → 刷新属性面板与组件列表。
   ========================================================= */
const SCENE_KEY = 'simScenes';
const SCENE_VER = 1;
const SCENE_MAX = 200;
const SCENE_GROUP_DEFAULT = '未分组';

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

/* ---------- 字符串规范化 ---------- */
function normName(s){
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').slice(0, 24);
}
function normGroup(s){
  const g = String(s == null ? '' : s).trim().replace(/\s+/g, ' ').slice(0, 16);
  return g || SCENE_GROUP_DEFAULT;
}

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

/* 自动命名：只在同一组内查重，「作业1」里可以有「场景 1」，「作业2」里也能有 */
function nextSceneName(list, group){
  const g = normGroup(group);
  const same = list.filter(s => normGroup(s.group) === g);
  for (let i = 1; i <= SCENE_MAX + 1; i++){
    const nm = '场景 ' + i;
    if (!same.some(s => s.name === nm)) return nm;
  }
  return '场景 ' + (same.length + 1);
}

function saveCurrentScene(rawName, rawGroup){
  const list = readSceneStore();
  const group = normGroup(rawGroup !== undefined ? rawGroup
                        : (sceneGroupEl ? sceneGroupEl.value : ''));
  let nm = normName(rawName);
  if (!nm) nm = nextSceneName(list, group);

  const rec = { name: nm, group, at: Date.now(), data: packScene() };
  const i = list.findIndex(s => s.name === nm && normGroup(s.group) === group);
  if (i >= 0) list[i] = rec;          // 同组同名覆盖
  else list.unshift(rec);
  while (list.length > SCENE_MAX) list.pop();

  if (!writeSceneStore(list)){
    showHint('保存失败：浏览器本地存储不可用或已满');
    return false;
  }
  renderSceneList();
  showHint((i >= 0 ? '已更新「' : '已保存「') + group + ' / ' + nm + '」');
  return true;
}

/* ---------- 分组 ---------- */
/* 按"首次出现"的顺序分组；list 本身是新的在前，所以组顺序也跟着最新活动走 */
function sceneGroups(list){
  const order = [], map = new Map();
  for (const rec of list){
    const g = normGroup(rec.group);
    if (!map.has(g)){ map.set(g, []); order.push(g); }
    map.get(g).push(rec);
  }
  return order.map(g => ({ group: g, items: map.get(g) }));
}

const collapsedGroups = new Set();   // 折叠的组（本次会话内记忆即可）

/* ---------- 导出 / 导入 ---------- */
function safeFilePart(s){
  return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '').slice(0, 20);
}

function downloadTextFile(text, filename, mime){
  try {
    const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch(_){ return false; }
}

function dateStamp(){
  const d = new Date();
  const p = n => (n < 10 ? '0' : '') + n;
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

function exportScenes(recs, groupHint){
  if (!recs || !recs.length){ showHint('没有可导出的场景'); return false; }
  const payload = {
    app: 'charge-sim-scenes',
    v: SCENE_VER,
    exportedAt: Date.now(),
    scenes: recs.map(r => ({
      name: r.name,
      group: normGroup(r.group),
      at: r.at,
      data: r.data,
    })),
  };
  const base = groupHint ? '场景-' + safeFilePart(groupHint) : '场景-全部';
  const filename = (base || '场景') + '-' + dateStamp() + '.json';
  if (!downloadTextFile(JSON.stringify(payload, null, 2), filename)){
    showHint('导出失败：浏览器不允许下载');
    return false;
  }
  showHint('已导出 ' + recs.length + ' 个场景 → ' + filename);
  return true;
}

function importScenesFromText(text){
  let obj;
  try { obj = JSON.parse(text); }
  catch(_){ showHint('导入失败：不是合法的 JSON 文件'); return false; }

  const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.scenes) ? obj.scenes : null);
  if (!arr){ showHint('导入失败：文件里找不到场景数据'); return false; }

  const list = readSceneStore();
  let added = 0, replaced = 0, skipped = 0;

  for (const raw of arr){
    if (!raw || !raw.data || !Array.isArray(raw.data.comps)){ skipped++; continue; }
    const group = normGroup(raw.group);
    let nm = normName(raw.name);
    if (!nm) nm = nextSceneName(list, group);
    const rec = { name: nm, group, at: raw.at || Date.now(), data: raw.data };
    const i = list.findIndex(s => s.name === nm && normGroup(s.group) === group);
    if (i >= 0){ list[i] = rec; replaced++; }
    else { list.unshift(rec); added++; }
  }

  while (list.length > SCENE_MAX) list.pop();

  if (!writeSceneStore(list)){
    showHint('导入失败：本地存储空间不足');
    return false;
  }
  renderSceneList();
  showHint('导入完成：新增 ' + added + (replaced ? ' · 覆盖 ' + replaced : '')
           + (skipped ? ' · 跳过 ' + skipped + ' 个无效项' : ''));
  return true;
}

function importScenesFromFile(file){
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => importScenesFromText(String(fr.result));
  fr.onerror = () => showHint('导入失败：文件读取错误');
  fr.readAsText(file);
}

/* ---------- 对话框 ---------- */
const sceneDlg      = document.getElementById('sceneDialog');
const sceneListEl   = document.getElementById('sceneList');
const sceneNameEl   = document.getElementById('sceneName');
const sceneGroupEl  = document.getElementById('sceneGroup');
const sceneSaveBtn  = document.getElementById('sceneSave');
const sceneOpenBtn  = document.getElementById('sceneBtn');
const sceneCountEl  = document.getElementById('sceneCount');
const groupListEl   = document.getElementById('sceneGroupList');
const exportAllBtn  = document.getElementById('sceneExportAll');
const importBtn     = document.getElementById('sceneImport');
const sceneFileEl   = document.getElementById('sceneFile');

function sEl(tag, cls){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function iconBtn(icon, size, tip, onClick, danger){
  const b = sEl('button', 'ghost miniAct' + (danger ? ' danger' : ''));
  b.type = 'button';
  if (icon) b.appendChild(Icon.el(icon, size || 13, 2.2));
  if (tip){ b.title = tip; b.dataset.tooltip = tip; b.dataset.tooltipPlacement = 'top'; }
  b.onclick = onClick;
  return b;
}

function updateSceneCount(list){
  if (sceneCountEl) sceneCountEl.textContent = list.length + ' / ' + SCENE_MAX;
}

function syncGroupDatalist(list){
  if (!groupListEl) return;
  const seen = new Set();
  groupListEl.innerHTML = '';
  for (const rec of list){
    const g = normGroup(rec.group);
    if (seen.has(g)) continue;
    seen.add(g);
    const o = document.createElement('option');
    o.value = g;
    groupListEl.appendChild(o);
  }
}

/* 单条场景：点名字加载，右侧「导出 / 删除」 */
function sceneRowEl(rec){
  const row = sEl('li', 'sceneRow');

  const pick = sEl('button', 'ghost scenePick');
  pick.type = 'button';
  pick.dataset.tooltip = '加载「' + rec.name + '」';
  pick.dataset.tooltipPlacement = 'left';

  const nm = sEl('span', 'nm');
  nm.textContent = rec.name;

  const meta = sEl('small', 'sceneMeta');
  const n = (rec.data && Array.isArray(rec.data.comps)) ? rec.data.comps.length : 0;
  meta.textContent = n + ' 组件 · ' + fmtSceneTime(rec.at);
  pick.append(nm, meta);

  pick.onclick = () => {
    if (applyScene(rec.data)){
      closeSceneDialog();
      if (sceneGroupEl) sceneGroupEl.value = normGroup(rec.group);
      showHint('已加载「' + normGroup(rec.group) + ' / ' + rec.name + '」');
    } else {
      showHint('这个场景的数据已损坏，无法加载');
    }
  };

  const exp = iconBtn('download', 13, '导出这个场景', (e) => {
    e.stopPropagation();
    exportScenes([rec], null);
  });

  const del = sEl('button', 'ghost miniAct danger');
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除这个场景';
  del.setAttribute('aria-label', '删除场景 ' + rec.name);
  del.onclick = (e) => {
    e.stopPropagation();
    const rest = readSceneStore().filter(s =>
      !(s.name === rec.name && normGroup(s.group) === normGroup(rec.group)));
    if (!writeSceneStore(rest)) return;
    renderSceneList();
    showHint('已删除「' + normGroup(rec.group) + ' / ' + rec.name + '」');
  };

  row.append(pick, exp, del);
  return row;
}

/* 一个分组：折叠头 + 组内场景 */
function sceneGroupNode(g){
  const li = sEl('li', 'sceneGroup');
  if (collapsedGroups.has(g.group)) li.classList.add('collapsed');

  const head = sEl('div', 'sceneGroupHead');

  const pick = sEl('button', 'ghost groupPick');
  pick.type = 'button';
  const chev = Icon.el('chevronDown', 12, 2.4);
  chev.classList.add('gchev');
  const name = sEl('span', 'gname');
  name.textContent = g.group;
  const cnt = sEl('span', 'gcount');
  cnt.textContent = String(g.items.length);
  pick.append(chev, name, cnt);
  pick.title = '折叠 / 展开「' + g.group + '」';
  pick.onclick = () => {
    const off = li.classList.toggle('collapsed');
    if (off) collapsedGroups.add(g.group);
    else collapsedGroups.delete(g.group);
  };

  const exp = iconBtn('download', 12, '导出整组（' + g.items.length + ' 个）', (e) => {
    e.stopPropagation();
    exportScenes(g.items, g.group);
  });

  const del = sEl('button', 'ghost miniAct danger');
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除整组';
  del.setAttribute('aria-label', '删除分组 ' + g.group);
  del.onclick = (e) => {
    e.stopPropagation();
    const rest = readSceneStore().filter(s => normGroup(s.group) !== g.group);
    if (!writeSceneStore(rest)) return;
    collapsedGroups.delete(g.group);
    renderSceneList();
    showHint('已删除分组「' + g.group + '」共 ' + g.items.length + ' 个场景');
  };

  head.append(pick, exp, del);

  const items = sEl('menu', 'unstyled sceneGroupItems');
  for (const rec of g.items) items.appendChild(sceneRowEl(rec));

  li.append(head, items);
  return li;
}

function renderSceneList(){
  if (!sceneListEl) return;
  const list = readSceneStore();
  sceneListEl.innerHTML = '';
  updateSceneCount(list);
  syncGroupDatalist(list);

  if (!list.length){
    const li = sEl('li', 'emptyTip');
    li.textContent = '还没有保存的场景';
    sceneListEl.appendChild(li);
    return;
  }

  for (const g of sceneGroups(list)) sceneListEl.appendChild(sceneGroupNode(g));
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
      const nm = sceneNameEl ? sceneNameEl.value : '';
      const gp = sceneGroupEl ? sceneGroupEl.value : '';
      if (saveCurrentScene(nm, gp) && sceneNameEl) sceneNameEl.value = '';
    };
  }

  // 输入框里的按键不要冒泡到画布快捷键（空格 / Delete 会误触）
  for (const inp of [sceneNameEl, sceneGroupEl]){
    if (!inp) continue;
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter'){
        e.preventDefault();
        if (sceneSaveBtn) sceneSaveBtn.click();
      }
    });
  }

  // 导出全部（按当前存储顺序，含分组信息）
  if (exportAllBtn) exportAllBtn.onclick = () => exportScenes(readSceneStore(), null);

  // 导入：同一个文件要能连续导入两次，所以每次读完都清空 value
  if (importBtn && sceneFileEl){
    importBtn.onclick = () => sceneFileEl.click();
    sceneFileEl.onchange = () => {
      importScenesFromFile(sceneFileEl.files && sceneFileEl.files[0]);
      sceneFileEl.value = '';
    };
  }

  if (sceneDlg){
    const close = document.getElementById('sceneClose');
    if (close) close.onclick = () => closeSceneDialog();
    // 点遮罩关闭（Oat 的 dialog 内部铺满，target 是 dialog 本体时才是点到了外面）
    sceneDlg.addEventListener('click', (e) => {
      if (e.target === sceneDlg) closeSceneDialog();
    });
  }

  // 工具条图标（导出 / 导入）用动效图标填
  for (const host of document.querySelectorAll('.btnIc[data-icon]')){
    host.appendChild(Icon.el(host.dataset.icon, 14, 2.2));
  }
}

initSceneUI();
