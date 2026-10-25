/* =========================================================
   主循环
   ========================================================= */
let lastT = performance.now();
let charging = false, chargeStart = 0;
const CHARGE_MS = 900;              // 长按蓄力时长

function loop(t){
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  if (state.running) simulate(dt);
  render();

  if (charging) updateCharge(t);

  requestAnimationFrame(loop);
}

initPanels();

(function initTheme(){
  let saved = null;
  try { saved = localStorage.getItem('simTheme'); } catch(_){}
  applyTheme(saved === 'light', true);
})();

updatePlayBtn();
renderCompList();
buildPropPanel();
selectCat('field');          // 开屏先把「场」类别展开，避免左侧面板一片空白
requestAnimationFrame(loop);

(function initDemo(){
  const f1 = makeField('rect', 0, 0, false);
  f1.w = 4; f1.h = 2.4; f1.angle = 0;
  f1.fieldType = 'E';
  f1.fieldAngle = Math.PI/2;
  f1.strength = 0.2;
  f1.boundary = 'virtual';
  state.components.push(f1);

  const em = makeEmitter(-4.5, 0);
  em.mode = 'single';
  em.vAngle = 0;
  em.v0 = 10;
  em.continuous = false;
  em.trailMode = 'solid';
  state.components.push(em);

  renderCompList();
})();
