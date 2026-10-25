/* =========================================================
   模拟控制：悬浮圆形按钮（开始 / 暂停 / 长按清空）
   ========================================================= */
const playBtn = document.getElementById('playBtn');
const playWrap = document.getElementById('playWrap');
const chargeRing = document.getElementById('chargeRing');

/* 播放图标：▶ ↔ ⏸ 由 morphicons 做形变，不是二选一的硬切 */
const playIconNode = Icon.el('play', 26, 2.4);
(function mountPlayIcon(){
  const host = playBtn.querySelector('.icon');
  if (host) host.appendChild(playIconNode);
})();

/* 运行中显示"暂停"两道杠，停止时显示"开始"三角 */
function updatePlayBtn(){
  playBtn.classList.toggle('running', !!state.running);
  Icon.set(playIconNode, state.running ? 'pause' : 'play');
  playBtn.setAttribute('aria-label', state.running ? '暂停' : '开始');
  playBtn.title = state.running ? '点击暂停 · 长按清空重置' : '点击开始 · 长按清空重置';
}

function updateCharge(t){
  const prog = Math.min(1, (t - chargeStart) / CHARGE_MS);
  chargeRing.style.setProperty('--cp', (prog * 100).toFixed(1));
  playBtn.style.background = mixHex('#2563eb', '#ef4444', prog);
  if (prog >= 1){
    charging = false;
    playBtn.style.background = '';
    playWrap.classList.remove('charging');
    chargeRing.style.setProperty('--cp', 0);
    resetSimulation();
  }
}

function resetSimulation(){
  clearParticles();
  state.simTime = 0;
  state.running = false;
  for (const c of state.components){
    if (c.kind === 'emitter'){ c.acc = 0; c.emittedOnce = false; }
  }
  updatePlayBtn();
  playBtn.animate(
    [{transform:'scale(1)'},{transform:'scale(1.24)'},{transform:'scale(.9)'},{transform:'scale(1)'}],
    {duration:380, easing:'ease-out'}
  );
  showHint('已清空全部粒子与轨迹 · 点击 ▶ 重新开始');
}

playBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (charging) return;
  charging = true;
  chargeStart = performance.now();
  chargeRing.style.setProperty('--cp', 0);
  playWrap.classList.add('charging');
  try { playBtn.setPointerCapture(e.pointerId); } catch(_){}
});

function endCharge(e, cancelled){
  if (!charging) return;
  const dur = performance.now() - chargeStart;
  charging = false;
  playBtn.style.background = '';
  playWrap.classList.remove('charging');
  chargeRing.style.setProperty('--cp', 0);
  // 未蓄满 → 视为点击：切换 开始 / 暂停
  if (!cancelled && dur < CHARGE_MS){
    state.running = !state.running;
    updatePlayBtn();
  }
  try { playBtn.releasePointerCapture(e.pointerId); } catch(_){}
}
playBtn.addEventListener('pointerup', e => endCharge(e, false));
playBtn.addEventListener('pointercancel', e => endCharge(e, true));
playBtn.addEventListener('contextmenu', e => e.preventDefault());

/* =========================================================

   模拟速率：单个可拖动进度条（颜色随进度由蓝转红）
   ========================================================= */
const speedRange = document.getElementById('speedRange');
const speedVal = document.getElementById('speedVal');
const SPEED_MIN = 0.01, SPEED_MAX = 3;

function speedToSlider(v){
  return Math.round((Math.log(v/SPEED_MIN) / Math.log(SPEED_MAX/SPEED_MIN)) * 99) + 1;
}
function sliderToSpeed(s){
  return SPEED_MIN * Math.pow(SPEED_MAX/SPEED_MIN, (s-1)/99);
}

function updateSpeedFill(){
  const s = parseFloat(speedRange.value);
  const p = clamp((s - 1) / 99, 0, 1);
  speedRange.style.setProperty('--p', (p*100).toFixed(2) + '%');
  speedRange.style.setProperty('--fill', rampColor(p));
}

function setSpeed(v){
  state.speed = clamp(v, SPEED_MIN, SPEED_MAX);
  speedRange.value = speedToSlider(state.speed);
  speedVal.textContent = state.speed.toFixed(2) + '×';
  updateSpeedFill();
}

speedRange.addEventListener('input', () => {
  setSpeed(sliderToSpeed(parseFloat(speedRange.value)));
});
speedRange.addEventListener('pointerdown', () => speedRange.classList.add('dragging'));
window.addEventListener('pointerup', () => speedRange.classList.remove('dragging'));
setSpeed(0.2);
