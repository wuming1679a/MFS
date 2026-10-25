/* =========================================================
   动效图标（morphicons）
   ---------------------------------------------------------
   图标来自 Lucide（24×24 网格），用 morphicons 做两态形变：
   路径插值 + 弹簧动画，切换状态时图标是"长过去"的，不是硬切。
   morphicons 上游是 ESM 包，这里用 vendor/morphicons.js 的本地
   经典脚本版本，保证 file:// 双击可运行、也离线可用。

   对外只暴露三个方法：
     Icon.el(name, size)   创建一个图标元素
     Icon.set(el, name)    形变到另一枚（带动画）
     Icon.flash(el, name)  临时形变后自动回弹
   ========================================================= */
const Icon = (function (){

  /* 没加载成功时的降级字形（保证按钮永远有内容） */
  const FALLBACK = {
    play: '▶', pause: '❙❙', sun: '☀', moon: '☾',
    chevronDown: '▼', chevronRight: '▶', magnet: '⊂',
    trash2: '✕', rotateCcw: '↺', layoutDashboard: '⤢',
    plus: '＋', minus: '－', crosshair: '⊕',
  };

  /* 注意：assets/icons.js 用的是顶层 const，它落在全局「词法环境」而不是
     window 上，所以这里必须直接按名字取，不能写 window.ICON_D */
  function iconData(name){
    if (typeof ICON_D === 'undefined' || !ICON_D) return null;
    return ICON_D[name] || null;
  }

  let ready = false;
  if (window.MorphIcons && typeof window.MorphIcons.defineMorphIcon === 'function'){
    try {
      window.MorphIcons.defineMorphIcon();   // 注册 <morph-icon>，幂等
      ready = true;
    } catch (_){ ready = false; }
  }

  const cache = new Map();   // el -> 当前图标名

  function el(name, size, strokeWidth){
    const d = iconData(name);

    if (!ready || !d){
      const s = document.createElement('span');
      s.className = 'iconGlyph';
      s.textContent = FALLBACK[name] || '•';
      s.style.fontSize = Math.round((size || 18) * 0.86) + 'px';
      cache.set(s, name);
      return s;
    }

    const node = document.createElement('morph-icon');
    node.setAttribute('size', String(size || 20));
    if (strokeWidth) node.setAttribute('stroke-width', String(strokeWidth));
    node.setAttribute('aria-hidden', 'true');
    node.icon = d;                 // 首帧不播放动画
    cache.set(node, name);
    return node;
  }

  function set(node, name){
    if (!node) return;
    const prev = cache.get(node);
    if (prev === name) return;
    cache.set(node, name);

    const d = iconData(name);
    if (node.tagName === 'MORPH-ICON'){
      if (d) node.morphTo(d, 'snappy');
    } else if (node.classList && node.classList.contains('iconGlyph')){
      node.textContent = FALLBACK[name] || '•';
    }
  }

  let flashTimer = 0;
  function flash(node, name, back, ms){
    if (!node) return;
    set(node, name);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set(node, back), ms || 620);
  }

  return { el, set, flash, get ready(){ return ready; } };
})();
