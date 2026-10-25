/*!
 * morphicons 2.0.2 — https://www.morphicons.com/
 * MIT © guillermolg.com — 图标形变（morph）引擎
 *
 * 上游是纯 ESM 包；本项目需要在 file:// 下直接双击 index.html 运行，
 * 而浏览器会以 CORS 拦截 file:// 的模块加载，因此把它按原模块边界
 * 打包成一个经典脚本（不改写任何算法，只把 import/export 换成内部
 * 注册表调用）。暴露 window.MorphIcons。
 */
(function (global) {
"use strict";
var __defs = {}, __cache = {};
function __def(n, f){ __defs[n] = f; }
function __r(n){
  var c = __cache[n];
  if (c) return c;
  var d = __defs[n];
  if (!d) throw new Error("morphicons: missing module " + n);
  var e = {}; __cache[n] = e; d(e); return e;
}
__def("spring", function(__e){
//#region src/core/interpolate.ts
/** Preallocated output buffers for a plan (zero allocation per frame). */
function allocOutputs(plan) {
	return plan.items.map(() => new Float64Array(2 * plan.n));
}
function interpPolar(plan, t, out) {
	for (let k = 0; k < plan.items.length; k++) {
		const it = plan.items[k];
		const o = out[k];
		const n = plan.n;
		const s = Math.exp(it.lnSigma * t);
		const ang = it.theta * t;
		const cos = Math.cos(ang) * s;
		const sin = Math.sin(ang) * s;
		let cx;
		let cy;
		if (it.block) {
			const [ox, oy] = it.block.off;
			const [dx, dy] = it.block.drift;
			cx = it.ca[0] + dx * t + (ox * cos - oy * sin - ox);
			cy = it.ca[1] + dy * t + (ox * sin + oy * cos - oy);
		} else {
			cx = it.ca[0] + (it.cb[0] - it.ca[0]) * t;
			cy = it.ca[1] + (it.cb[1] - it.ca[1]) * t;
		}
		const m = it.half === void 0 ? t : Math.min(1, Math.max(0, 2 * t - it.half));
		for (let i = 0; i < n; i++) {
			const px = it.aC[2 * i] + (it.bT[2 * i] - it.aC[2 * i]) * m;
			const py = it.aC[2 * i + 1] + (it.bT[2 * i + 1] - it.aC[2 * i + 1]) * m;
			o[2 * i] = cx + px * cos - py * sin;
			o[2 * i + 1] = cy + px * sin + py * cos;
		}
	}
}
/** Raw coordinate lerp (same correspondence, no decomposition). */
function interpLinear(plan, t, out) {
	for (let k = 0; k < plan.items.length; k++) {
		const it = plan.items[k];
		const o = out[k];
		const n = plan.n;
		for (let i = 0; i < n; i++) {
			o[2 * i] = it.a[2 * i] + (it.bO[2 * i] - it.a[2 * i]) * t;
			o[2 * i + 1] = it.a[2 * i + 1] + (it.bO[2 * i + 1] - it.a[2 * i + 1]) * t;
		}
	}
}
//#endregion
//#region src/core/spring.ts
var Spring = class {
	x = 1;
	v = 0;
	k = 250;
	c = 24;
	config(k, c) {
		this.k = k;
		this.c = c;
	}
	/** Starts (or restarts mid-flight) preserving velocity. */
	start() {
		this.x = 0;
		if (this.v > 14) this.v = 14;
		if (this.v < -14) this.v = -14;
	}
	/** Advances dt seconds. Returns true on settle (|1−x| < 0.001 ∧ |v| < 0.02). */
	step(dt) {
		const steps = Math.max(1, Math.min(16, Math.ceil(dt / (1 / 240))));
		const s = dt / steps;
		for (let i = 0; i < steps; i++) {
			const a = this.k * (1 - this.x) - this.c * this.v;
			this.v += a * s;
			this.x += this.v * s;
		}
		return Math.abs(1 - this.x) < .001 && Math.abs(this.v) < .02;
	}
};
/** Spring presets (ζ = c/(2√k)) with the API's public names. */
const SPRING_PRESETS = {
	/** ζ = 1.00 — critically damped, no overshoot. */
	smooth: {
		k: 170,
		c: 26
	},
	/** ζ = 0.73 — fast, subtle overshoot. */
	snappy: {
		k: 420,
		c: 30
	},
	/** ζ = 0.40 — playful. */
	bouncy: {
		k: 300,
		c: 14
	}
};
//#endregion
  Object.assign(__e, { a: interpPolar, i: interpLinear, n: Spring, r: allocOutputs, t: SPRING_PRESETS });

});

__def("normalize", function(__e){
//#region src/core/parse.ts
const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
function parsePath(d) {
	const subs = [];
	const n = d.length;
	let i = 0;
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;
	let cur = null;
	let cmd = "";
	let px = 0;
	let py = 0;
	let prev = "";
	let started = false;
	const err = (msg) => {
		throw new Error(`morphicons: ${msg} at d[${i}]`);
	};
	const isDigit = (c) => c >= 48 && c <= 57;
	const skip = () => {
		while (i < n) {
			const c = d.charCodeAt(i);
			if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 44) i++;
			else break;
		}
	};
	const num = () => {
		skip();
		const start = i;
		if (i < n && (d[i] === "+" || d[i] === "-")) i++;
		let dig = false;
		while (i < n && isDigit(d.charCodeAt(i))) {
			i++;
			dig = true;
		}
		if (i < n && d[i] === ".") {
			i++;
			while (i < n && isDigit(d.charCodeAt(i))) {
				i++;
				dig = true;
			}
		}
		if (!dig) err("expected number");
		if (i < n && (d[i] === "e" || d[i] === "E")) {
			const save = i;
			i++;
			if (i < n && (d[i] === "+" || d[i] === "-")) i++;
			let ed = false;
			while (i < n && isDigit(d.charCodeAt(i))) {
				i++;
				ed = true;
			}
			if (!ed) i = save;
		}
		return Number(d.slice(start, i));
	};
	const flag = () => {
		skip();
		const c = d[i];
		if (c === "0" || c === "1") {
			i++;
			return c === "1" ? 1 : 0;
		}
		return err("expected arc flag (0|1)");
	};
	const open = () => {
		if (!started) err("path must start with M/m");
		if (!cur) {
			cur = {
				x0: cx,
				y0: cy,
				segs: [],
				closed: false
			};
			subs.push(cur);
		}
		return cur;
	};
	let rel = false;
	const nx = () => num() + (rel ? cx : 0);
	const ny = () => num() + (rel ? cy : 0);
	while (true) {
		skip();
		if (i >= n) break;
		const ch = d[i];
		if (COMMANDS.includes(ch)) {
			cmd = ch;
			i++;
		} else if (cmd === "") err("path must start with M/m");
		else if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
		else if (cmd === "Z" || cmd === "z") err("stray data after Z");
		rel = cmd >= "a";
		switch (rel ? cmd.toUpperCase() : cmd) {
			case "M": {
				started = true;
				const x = nx();
				const y = ny();
				cx = x;
				cy = y;
				sx = x;
				sy = y;
				cur = {
					x0: x,
					y0: y,
					segs: [],
					closed: false
				};
				subs.push(cur);
				prev = "";
				break;
			}
			case "L": {
				const x = nx();
				const y = ny();
				open().segs.push([
					"L",
					x,
					y
				]);
				cx = x;
				cy = y;
				prev = "";
				break;
			}
			case "H": {
				const x = nx();
				open().segs.push([
					"L",
					x,
					cy
				]);
				cx = x;
				prev = "";
				break;
			}
			case "V": {
				const y = ny();
				open().segs.push([
					"L",
					cx,
					y
				]);
				cy = y;
				prev = "";
				break;
			}
			case "C":
			case "S": {
				let x1;
				let y1;
				if (cmd === "C" || cmd === "c") {
					x1 = nx();
					y1 = ny();
				} else {
					x1 = prev === "C" ? 2 * cx - px : cx;
					y1 = prev === "C" ? 2 * cy - py : cy;
				}
				const x2 = nx();
				const y2 = ny();
				const x = nx();
				const y = ny();
				open().segs.push([
					"C",
					x1,
					y1,
					x2,
					y2,
					x,
					y
				]);
				px = x2;
				py = y2;
				cx = x;
				cy = y;
				prev = "C";
				break;
			}
			case "Q":
			case "T": {
				let x1;
				let y1;
				if (cmd === "Q" || cmd === "q") {
					x1 = nx();
					y1 = ny();
				} else {
					x1 = prev === "Q" ? 2 * cx - px : cx;
					y1 = prev === "Q" ? 2 * cy - py : cy;
				}
				const x = nx();
				const y = ny();
				open().segs.push([
					"Q",
					x1,
					y1,
					x,
					y
				]);
				px = x1;
				py = y1;
				cx = x;
				cy = y;
				prev = "Q";
				break;
			}
			case "A": {
				const rx = num();
				const ry = num();
				const rot = num();
				const large = flag();
				const sweep = flag();
				const x = nx();
				const y = ny();
				open().segs.push([
					"A",
					rx,
					ry,
					rot,
					large,
					sweep,
					x,
					y
				]);
				cx = x;
				cy = y;
				prev = "";
				break;
			}
			case "Z":
				if (cur) {
					cur.closed = true;
					cur = null;
				}
				cx = sx;
				cy = sy;
				prev = "";
				break;
			default: err(`unsupported command "${cmd}"`);
		}
	}
	return subs.filter((s) => s.segs.length > 0);
}
//#endregion
//#region src/core/serialize.ts
function fmt(v) {
	return String(Math.round(v * 100) / 100);
}
/** Sampled subpaths → polyline `d` attribute. `closed[k]` appends Z to
*  subpath k (closed loops in flight); without flags everything is open. */
function serialize(subs, closed) {
	let d = "";
	for (let k = 0; k < subs.length; k++) {
		const o = subs[k];
		const n = o.length / 2;
		d += `M${fmt(o[0])} ${fmt(o[1])}`;
		for (let i = 1; i < n; i++) d += `L${fmt(o[2 * i])} ${fmt(o[2 * i + 1])}`;
		if (closed?.[k]) d += "Z";
	}
	return d;
}
function fmtCanon(v) {
	return String(Math.round(v * 1e4) / 1e4);
}
/** Cubic subpaths → canonical `d`, quantized to 4 decimals (engine-stable
*  bytes; see fmtCanon). */
function cubicsToPathD(paths) {
	let d = "";
	for (const { pts, closed } of paths) {
		d += `M${fmtCanon(pts[0])} ${fmtCanon(pts[1])}`;
		for (let i = 2; i < pts.length; i += 6) d += `C${fmtCanon(pts[i])} ${fmtCanon(pts[i + 1])} ${fmtCanon(pts[i + 2])} ${fmtCanon(pts[i + 3])} ${fmtCanon(pts[i + 4])} ${fmtCanon(pts[i + 5])}`;
		if (closed) d += "Z";
	}
	return d;
}
//#endregion
//#region src/core/normalize.ts
/** Control-point offset for a quarter circle: (4/3)·tan(π/8) ≈ 0.5523. */
const KAPPA = 4 / 3 * Math.tan(Math.PI / 8);
const TAU = 2 * Math.PI;
function builder(x0, y0) {
	const pts = [x0, y0];
	let cx = x0;
	let cy = y0;
	const cubic = (x1, y1, x2, y2, x, y) => {
		pts.push(x1, y1, x2, y2, x, y);
		cx = x;
		cy = y;
	};
	const line = (x, y) => {
		if (Math.abs(x - cx) < 1e-12 && Math.abs(y - cy) < 1e-12) return;
		cubic(cx + (x - cx) / 3, cy + (y - cy) / 3, cx + 2 * (x - cx) / 3, cy + 2 * (y - cy) / 3, x, y);
	};
	const quad = (x1, y1, x, y) => {
		cubic(cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy), x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x, y);
	};
	const arc = (rx0, ry0, rotDeg, large, sweep, x, y) => {
		const x1 = cx;
		const y1 = cy;
		if (Math.abs(x - x1) < 1e-12 && Math.abs(y - y1) < 1e-12) return;
		let rx = Math.abs(rx0);
		let ry = Math.abs(ry0);
		if (rx < 1e-12 || ry < 1e-12) {
			line(x, y);
			return;
		}
		const phi = rotDeg * Math.PI / 180;
		const cosP = Math.cos(phi);
		const sinP = Math.sin(phi);
		const hx = (x1 - x) / 2;
		const hy = (y1 - y) / 2;
		const x1p = cosP * hx + sinP * hy;
		const y1p = -sinP * hx + cosP * hy;
		const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
		if (lam > 1) {
			const s = Math.sqrt(lam);
			rx *= s;
			ry *= s;
		}
		const rx2 = rx * rx;
		const ry2 = ry * ry;
		const xp2 = x1p * x1p;
		const yp2 = y1p * y1p;
		let rad = (rx2 * ry2 - rx2 * yp2 - ry2 * xp2) / (rx2 * yp2 + ry2 * xp2);
		if (rad < 0) rad = 0;
		const co = (large === sweep ? -1 : 1) * Math.sqrt(rad);
		const cxp = co * rx * y1p / ry;
		const cyp = -co * ry * x1p / rx;
		const ccx = cosP * cxp - sinP * cyp + (x1 + x) / 2;
		const ccy = sinP * cxp + cosP * cyp + (y1 + y) / 2;
		const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
		let dth = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - th1;
		if (sweep === 0 && dth > 0) dth -= TAU;
		else if (sweep === 1 && dth < 0) dth += TAU;
		const slices = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
		const delta = dth / slices;
		const alpha = 4 / 3 * Math.tan(delta / 4);
		const ex = (t) => ccx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP;
		const ey = (t) => ccy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP;
		const dx = (t) => -rx * Math.sin(t) * cosP - ry * Math.cos(t) * sinP;
		const dy = (t) => -rx * Math.sin(t) * sinP + ry * Math.cos(t) * cosP;
		let t0 = th1;
		let p0x = x1;
		let p0y = y1;
		for (let s = 1; s <= slices; s++) {
			const t1 = th1 + delta * s;
			const p1x = s === slices ? x : ex(t1);
			const p1y = s === slices ? y : ey(t1);
			cubic(p0x + alpha * dx(t0), p0y + alpha * dy(t0), p1x - alpha * dx(t1), p1y - alpha * dy(t1), p1x, p1y);
			t0 = t1;
			p0x = p1x;
			p0y = p1y;
		}
	};
	const finish = (closed) => {
		if (closed) line(pts[0], pts[1]);
		if (pts.length < 8) return null;
		return {
			pts: Float64Array.from(pts),
			closed
		};
	};
	return [
		cubic,
		line,
		quad,
		arc,
		finish
	];
}
function lowerSubpath(raw) {
	const [cubic, line, quad, arc, finish] = builder(raw.x0, raw.y0);
	for (const s of raw.segs) switch (s[0]) {
		case "L":
			line(s[1], s[2]);
			break;
		case "C":
			cubic(s[1], s[2], s[3], s[4], s[5], s[6]);
			break;
		case "Q":
			quad(s[1], s[2], s[3], s[4]);
			break;
		case "A": arc(s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
	}
	return finish(raw.closed);
}
function attrNum(attrs, key, fallback = 0) {
	const v = attrs[key];
	if (v === void 0) return fallback;
	const x = typeof v === "number" ? v : Number(v);
	return Number.isFinite(x) ? x : fallback;
}
function parsePoints(v) {
	const s = String(v ?? "").trim();
	if (!s) return [];
	const nums = s.split(/[\s,]+/).map(Number);
	if (nums.some((x) => !Number.isFinite(x))) throw new Error(`morphicons: invalid points: "${s}"`);
	return nums;
}
function polyPath(nums, closed) {
	if (nums.length < 4) return null;
	const [, line, , , finish] = builder(nums[0], nums[1]);
	for (let i = 2; i + 1 < nums.length; i += 2) line(nums[i], nums[i + 1]);
	return finish(closed);
}
function ellipsePath(cx, cy, rx, ry) {
	if (rx < 1e-12 || ry < 1e-12) return null;
	const kx = KAPPA * rx;
	const ky = KAPPA * ry;
	const e = cx + rx;
	const w = cx - rx;
	const s = cy + ry;
	const n = cy - ry;
	const [cubic, , , , finish] = builder(e, cy);
	cubic(e, cy + ky, cx + kx, s, cx, s);
	cubic(cx - kx, s, w, cy + ky, w, cy);
	cubic(w, cy - ky, cx - kx, n, cx, n);
	cubic(cx + kx, n, e, cy - ky, e, cy);
	return finish(true);
}
function rectPath(attrs) {
	const x = attrNum(attrs, "x");
	const y = attrNum(attrs, "y");
	const w = attrNum(attrs, "width");
	const h = attrNum(attrs, "height");
	if (w < 1e-12 || h < 1e-12) return null;
	let rx = attrNum(attrs, "rx", NaN);
	let ry = attrNum(attrs, "ry", NaN);
	if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
	if (Number.isNaN(ry)) ry = rx;
	rx = Math.min(Math.max(rx, 0), w / 2);
	ry = Math.min(Math.max(ry, 0), h / 2);
	if (rx < 1e-12 || ry < 1e-12) return polyPath([
		x,
		y,
		x + w,
		y,
		x + w,
		y + h,
		x,
		y + h
	], true);
	const xa = x + rx;
	const xb = x + w - rx;
	const xr = x + w;
	const ya = y + ry;
	const yb = y + h - ry;
	const yd = y + h;
	const kx = KAPPA * rx;
	const ky = KAPPA * ry;
	const [cubic, line, , , finish] = builder(xa, y);
	line(xb, y);
	cubic(xb + kx, y, xr, ya - ky, xr, ya);
	line(xr, yb);
	cubic(xr, yb + ky, xb + kx, yd, xb, yd);
	line(xa, yd);
	cubic(xa - kx, yd, x, yb + ky, x, yb);
	line(x, ya);
	cubic(x, ya - ky, xa - kx, y, xa, y);
	return finish(true);
}
/** Icon (IconNode or `d` string) → list of cubic subpaths. */
function iconToCubics(input) {
	const out = [];
	const push = (p) => {
		if (p) out.push(p);
	};
	if (typeof input === "string") {
		for (const s of parsePath(input)) push(lowerSubpath(s));
		return out;
	}
	for (const [tag, attrs] of input) switch (tag) {
		case "path":
			for (const s of parsePath(String(attrs.d ?? ""))) push(lowerSubpath(s));
			break;
		case "line": {
			const [, line, , , finish] = builder(attrNum(attrs, "x1"), attrNum(attrs, "y1"));
			line(attrNum(attrs, "x2"), attrNum(attrs, "y2"));
			push(finish(false));
			break;
		}
		case "circle": {
			const r = attrNum(attrs, "r");
			push(ellipsePath(attrNum(attrs, "cx"), attrNum(attrs, "cy"), r, r));
			break;
		}
		case "ellipse":
			push(ellipsePath(attrNum(attrs, "cx"), attrNum(attrs, "cy"), attrNum(attrs, "rx"), attrNum(attrs, "ry")));
			break;
		case "rect":
			push(rectPath(attrs));
			break;
		case "polyline":
			push(polyPath(parsePoints(attrs.points), false));
			break;
		case "polygon":
			push(polyPath(parsePoints(attrs.points), true));
			break;
		default: throw new Error(`morphicons: unsupported tag <${tag}>`);
	}
	return out;
}
function parseViewBox(vb) {
	const v = typeof vb === "number" ? [
		0,
		0,
		vb,
		vb
	] : typeof vb === "string" ? vb.trim().split(/[\s,]+/).map(Number) : vb;
	const [minX, minY, w, h] = v;
	if (v.length !== 4 || !(w > 0) || !(h > 0) || !Number.isFinite(minX) || !Number.isFinite(minY)) throw new Error(`morphicons: invalid viewBox "${String(vb)}"`);
	return [
		minX,
		minY,
		w,
		h
	];
}
/** Re-grids an icon drawn on `viewBox` onto the shared `grid` (24 by default),
*  centred and preserving aspect ratio — the SVG `xMidYMid meet` rule.
*
*  Both endpoints of a morph must live on the same coordinate space. Lucide and
*  Tabler already draw on 24×24; packs on 20 (Heroicons solid) or 32 (Carbon)
*  do not, and mixing them unfitted makes Procrustes read the scale/offset gap
*  as rotation. Apply once at module scope (not per render) and pass the
*  resulting `d` anywhere an icon is accepted. */
function fitIcon(input, viewBox, grid = 24) {
	const [minX, minY, w, h] = parseViewBox(viewBox);
	const s = Math.min(grid / w, grid / h);
	const tx = (grid - w * s) / 2 - minX * s;
	const ty = (grid - h * s) / 2 - minY * s;
	const paths = iconToCubics(input);
	for (const { pts } of paths) for (let i = 0; i < pts.length; i += 2) {
		pts[i] = pts[i] * s + tx;
		pts[i + 1] = pts[i + 1] * s + ty;
	}
	return cubicsToPathD(paths);
}
//#endregion
  Object.assign(__e, { i: serialize, n: iconToCubics, r: cubicsToPathD, t: fitIcon });

});

__def("resample", function(__e){
const { n: iconToCubics } = __r("normalize");
//#region src/core/plan.ts
/** Weight of |ΔL| in the subpath pairing cost. */
const LEN_WEIGHT = .35;
/** λ of the minimal-rotation tie-break: score = res + λ·|θ|/π.
*  It exists because shapes symmetric under inversion (lines) tie in
*  residual for both traversal orientations yet produce different rotations. */
const LAMBDA = .05;
/** Global residual below which the whole icon counts as congruent and the
*  plan shares (θ, σ) across all items (hybrid variant of Procrustes). */
const GLOBAL_EPS = .005;
/** Bounds for exhaustive matching; above them it falls back to greedy with
*  repair. 8! = 40 320 permutations / 1e5 assignments — both sub-ms. */
const PERM_MAX = 8;
const SURJ_MAX = 1e5;
function centroid(p) {
	const n = p.length / 2;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < n; i++) {
		cx += p[2 * i];
		cy += p[2 * i + 1];
	}
	return [cx / n, cy / n];
}
function polyLen(p) {
	const n = p.length / 2;
	let L = 0;
	for (let i = 1; i < n; i++) L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
	return L;
}
function reversePts(p) {
	const n = p.length / 2;
	const out = new Float64Array(2 * n);
	for (let i = 0; i < n; i++) {
		out[2 * i] = p[2 * (n - 1 - i)];
		out[2 * i + 1] = p[2 * (n - 1 - i) + 1];
	}
	return out;
}
/** Circular re-indexing of a loop: out[i] = p[(i+off) mod n]. Same point
*  set, different cut point — the circular degree of freedom of closed paths. */
function rotatePts(p, off) {
	const n = p.length / 2;
	const out = new Float64Array(2 * n);
	for (let i = 0; i < n; i++) {
		const j = (i + off) % n;
		out[2 * i] = p[2 * j];
		out[2 * i + 1] = p[2 * j + 1];
	}
	return out;
}
/** Optimal similarity (θ, σ) minimizing Σ|σ·R(θ)·(a−c_A) − (b−c_B)|².
*  θ* = atan2(S_xy − S_yx, S_xx + S_yy); σ* by zero derivative.
*  res = RMS residual normalized by b's energy (0 → same shape). */
function procrustes(a, b, ca, cb) {
	const n = a.length / 2;
	let sxx = 0;
	let sxy = 0;
	let syx = 0;
	let syy = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < n; i++) {
		const ax = a[2 * i] - ca[0];
		const ay = a[2 * i + 1] - ca[1];
		const bx = b[2 * i] - cb[0];
		const by = b[2 * i + 1] - cb[1];
		sxx += ax * bx;
		syy += ay * by;
		sxy += ax * by;
		syx += ay * bx;
		na += ax * ax + ay * ay;
		nb += bx * bx + by * by;
	}
	const theta = Math.atan2(sxy - syx, sxx + syy);
	const num = Math.cos(theta) * (sxx + syy) + Math.sin(theta) * (sxy - syx);
	let sigma = na > 1e-12 ? num / na : 1;
	if (!(sigma > 1e-6)) sigma = 1e-6;
	const res2 = Math.max(0, sigma * sigma * na - 2 * sigma * num + nb);
	const res = nb > 1e-12 ? Math.sqrt(res2 / nb) : 0;
	return {
		theta,
		sigma,
		res
	};
}
/** Best index-to-index correspondence between a and b: tries both traversal
*  directions and, if there is a closed loop, its N circular offsets,
*  scoring with score = res + λ·|θ|/π. The freedom is applied to ONE cloud
*  — the closed one (b if both are); varying both at once would be
*  redundant. */
function alignPair(aPts, bPts, aClosed = false, bClosed = false, allowReverse = true, lambda = LAMBDA) {
	const ca = centroid(aPts);
	const cb = centroid(bPts);
	const varyA = aClosed && !bClosed;
	const base = varyA ? aPts : bPts;
	const offs = aClosed || bClosed ? base.length / 2 : 1;
	let bestScore = Number.POSITIVE_INFINITY;
	let best = base;
	let sim = {
		theta: 0,
		sigma: 1,
		res: 0
	};
	for (let dir = 0; dir < (allowReverse ? 2 : 1); dir++) {
		const walk = dir ? reversePts(base) : base;
		for (let off = 0; off < offs; off++) {
			const cand = off ? rotatePts(walk, off) : walk;
			const s = varyA ? procrustes(cand, bPts, ca, cb) : procrustes(aPts, cand, ca, cb);
			const score = s.res + lambda * Math.abs(s.theta) / Math.PI;
			if (score < bestScore) {
				bestScore = score;
				best = cand;
				sim = s;
			}
		}
	}
	return varyA ? {
		ca,
		cb,
		a: best,
		b: bPts,
		...sim
	} : {
		ca,
		cb,
		a: aPts,
		b: best,
		...sim
	};
}
function costMatrix(A, B) {
	const cbs = B.map(centroid);
	const lbs = B.map(polyLen);
	return A.map((a) => {
		const ca = centroid(a);
		const la = polyLen(a);
		return cbs.map((cb, j) => Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) + LEN_WEIGHT * Math.abs(la - lbs[j]));
	});
}
function bestPermutation(C) {
	const n = C.length;
	if (n > PERM_MAX) {
		const pairs = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([
			C[i][j],
			i,
			j
		]);
		pairs.sort((x, y) => x[0] - y[0]);
		const out = new Array(n).fill(-1);
		const used = new Array(n).fill(false);
		for (const [, i, j] of pairs) if (out[i] < 0 && !used[j]) {
			out[i] = j;
			used[j] = true;
		}
		return out;
	}
	const idx = Array.from({ length: n }, (_, i) => i);
	let best = idx.slice();
	let bc = Number.POSITIVE_INFINITY;
	const perm = (arr, k, acc) => {
		if (acc >= bc) return;
		if (k === n) {
			bc = acc;
			best = arr.slice();
			return;
		}
		for (let i = k; i < n; i++) {
			[arr[k], arr[i]] = [arr[i], arr[k]];
			perm(arr, k + 1, acc + C[k][arr[k]]);
			[arr[k], arr[i]] = [arr[i], arr[k]];
		}
	};
	perm(idx, 0, 0);
	return best;
}
function bestSurjection(C) {
	const B = C.length;
	const S = C[0].length;
	if (S ** B > 1e5) {
		const f = C.map((row) => {
			let m = 0;
			for (let j = 1; j < row.length; j++) if (row[j] < row[m]) m = j;
			return m;
		});
		const mult = new Array(S).fill(0);
		for (const s of f) mult[s]++;
		for (let s = 0; s < S; s++) {
			if (mult[s] > 0) continue;
			let bi = -1;
			let bc = Number.POSITIVE_INFINITY;
			for (let i = 0; i < B; i++) {
				if (mult[f[i]] < 2) continue;
				const extra = C[i][s] - C[i][f[i]];
				if (extra < bc) {
					bc = extra;
					bi = i;
				}
			}
			mult[f[bi]]--;
			f[bi] = s;
			mult[s]++;
		}
		return f;
	}
	let best = null;
	let bc = Number.POSITIVE_INFINITY;
	const f = new Array(B);
	const mult = new Array(S).fill(0);
	const rec = (i, acc, covered) => {
		if (acc >= bc || S - covered > B - i) return;
		if (i === B) {
			bc = acc;
			best = f.slice();
			return;
		}
		for (let s = 0; s < S; s++) {
			f[i] = s;
			mult[s]++;
			rec(i + 1, acc + C[i][s], covered + (mult[s] === 1 ? 1 : 0));
			mult[s]--;
		}
	};
	rec(0, 0, 0);
	if (!best) throw new Error("morphicons: no valid surjection (B < S)");
	return best;
}
function applyGlobal(items, n) {
	const T = items.length * n;
	const ga = new Float64Array(2 * T);
	const gb = new Float64Array(2 * T);
	items.forEach((it, k) => {
		ga.set(it.a, 2 * n * k);
		gb.set(it.bO, 2 * n * k);
	});
	const gca = centroid(ga);
	const g = procrustes(ga, gb, gca, centroid(gb));
	if (g.res >= GLOBAL_EPS) return;
	const cos = Math.cos(-g.theta);
	const sin = Math.sin(-g.theta);
	const rc = Math.cos(g.theta);
	const rs = Math.sin(g.theta);
	for (const it of items) {
		let e2 = 0;
		let nb = 0;
		for (let i = 0; i < n; i++) {
			const bx = it.bO[2 * i] - it.cb[0];
			const by = it.bO[2 * i + 1] - it.cb[1];
			it.bT[2 * i] = (bx * cos - by * sin) / g.sigma;
			it.bT[2 * i + 1] = (bx * sin + by * cos) / g.sigma;
			const ex = g.sigma * (rc * it.aC[2 * i] - rs * it.aC[2 * i + 1]) - bx;
			const ey = g.sigma * (rs * it.aC[2 * i] + rc * it.aC[2 * i + 1]) - by;
			e2 += ex * ex + ey * ey;
			nb += bx * bx + by * by;
		}
		it.theta = g.theta;
		it.lnSigma = Math.log(g.sigma);
		it.res = nb > 1e-12 ? Math.sqrt(e2 / nb) : 0;
		const s1 = Math.exp(it.lnSigma);
		const c1 = Math.cos(it.theta) * s1;
		const n1 = Math.sin(it.theta) * s1;
		const ox = it.ca[0] - gca[0];
		const oy = it.ca[1] - gca[1];
		const rx = ox * c1 - oy * n1 - ox;
		const ry = ox * n1 + oy * c1 - oy;
		it.block = {
			off: [ox, oy],
			drift: [it.cb[0] - it.ca[0] - rx, it.cb[1] - it.ca[1] - ry]
		};
	}
}
function pairUp(A, B) {
	const p = A.length;
	const q = B.length;
	const pairs = [];
	if (p === q) {
		const perm = bestPermutation(costMatrix(A, B));
		for (let i = 0; i < p; i++) pairs.push([i, perm[i]]);
	} else if (p < q) {
		const f = bestSurjection(costMatrix(B, A));
		for (let j = 0; j < q; j++) pairs.push([f[j], j]);
	} else {
		const f = bestSurjection(costMatrix(A, B));
		for (let i = 0; i < p; i++) pairs.push([i, f[i]]);
	}
	return pairs;
}
function makeItem(aPts, bPts, aClosed, bClosed, allowReverse, lambda) {
	const n = aPts.length / 2;
	const al = alignPair(aPts, bPts, aClosed, bClosed, allowReverse, lambda);
	const a = al.a;
	const aC = new Float64Array(2 * n);
	const bT = new Float64Array(2 * n);
	const bO = new Float64Array(2 * n);
	const cos = Math.cos(-al.theta);
	const sin = Math.sin(-al.theta);
	for (let i = 0; i < n; i++) {
		aC[2 * i] = a[2 * i] - al.ca[0];
		aC[2 * i + 1] = a[2 * i + 1] - al.ca[1];
		const bx = al.b[2 * i] - al.cb[0];
		const by = al.b[2 * i + 1] - al.cb[1];
		bT[2 * i] = (bx * cos - by * sin) / al.sigma;
		bT[2 * i + 1] = (bx * sin + by * cos) / al.sigma;
		bO[2 * i] = al.b[2 * i];
		bO[2 * i + 1] = al.b[2 * i + 1];
	}
	return {
		a,
		aC,
		bT,
		bO,
		ca: al.ca,
		cb: al.cb,
		theta: al.theta,
		lnSigma: Math.log(al.sigma),
		res: al.res,
		closed: aClosed && bClosed,
		block: null
	};
}
/** Builds the morph plan between two lists of sampled subpaths. The plan is
*  cacheable and serializable; it accepts any list — including intermediate
*  shapes (interruptions). Filled regions use buildRegionPlan (lazy chunk,
*  src/region/plan.ts) instead. */
function buildPlan(srcSubs, dstSubs) {
	const p = srcSubs.length;
	const q = dstSubs.length;
	if (p === 0 || q === 0) throw new Error("morphicons: icon has no subpaths");
	const A = srcSubs.map((s) => s.pts);
	const B = dstSubs.map((s) => s.pts);
	const items = pairUp(A, B).map(([si, di]) => makeItem(A[si], B[di], srcSubs[si].closed, dstSubs[di].closed, true));
	if (items.length > 1) applyGlobal(items, A[0].length / 2);
	return {
		items,
		n: A[0].length / 2
	};
}
//#endregion
//#region src/core/resample.ts
/** Default angular threshold for a segment joint to count as a corner. */
const CORNER_THRESHOLD = Math.PI / 8;
const GX = [
	.18343464249564978,
	.525532409916329,
	.7966664774136267,
	.9602898564975363
];
const GW = [
	.362683783378362,
	.31370664587788727,
	.22238103445337448,
	.10122853629037626
];
function speed(p, k, t) {
	const i = 6 * k;
	const u = 1 - t;
	const c0 = 3 * u * u;
	const c1 = 6 * u * t;
	const c2 = 3 * t * t;
	const dx = c0 * (p[i + 2] - p[i]) + c1 * (p[i + 4] - p[i + 2]) + c2 * (p[i + 6] - p[i + 4]);
	const dy = c0 * (p[i + 3] - p[i + 1]) + c1 * (p[i + 5] - p[i + 3]) + c2 * (p[i + 7] - p[i + 5]);
	return Math.hypot(dx, dy);
}
function segLen(p, k, t1 = 1) {
	const half = t1 / 2;
	let s = 0;
	for (let j = 0; j < 4; j++) s += GW[j] * (speed(p, k, half + half * GX[j]) + speed(p, k, half - half * GX[j]));
	return s * half;
}
function point(p, k, t, out, o) {
	const i = 6 * k;
	const u = 1 - t;
	const b0 = u * u * u;
	const b1 = 3 * u * u * t;
	const b2 = 3 * u * t * t;
	const b3 = t * t * t;
	out[o] = b0 * p[i] + b1 * p[i + 2] + b2 * p[i + 4] + b3 * p[i + 6];
	out[o + 1] = b0 * p[i + 1] + b1 * p[i + 3] + b2 * p[i + 5] + b3 * p[i + 7];
}
function tangent(p, k, atEnd) {
	const i = 6 * k;
	const b = atEnd ? i + 6 : i;
	const s = atEnd ? -1 : 1;
	for (const j of atEnd ? [
		4,
		2,
		0
	] : [
		2,
		4,
		6
	]) {
		const dx = s * (p[i + j] - p[b]);
		const dy = s * (p[i + j + 1] - p[b + 1]);
		if (dx * dx + dy * dy > 1e-18) return [dx, dy];
	}
	return null;
}
/** Segment boundaries (index of the segment starting at the corner) whose
*  tangent discontinuity exceeds the threshold. For closed paths this
*  includes the closing joint (boundary = first active segment). */
function detectCorners(path, threshold = CORNER_THRESHOLD) {
	const p = path.pts;
	const m = (p.length / 2 - 1) / 3;
	const active = [];
	for (let k = 0; k < m; k++) if (segLen(p, k) > 1e-9) active.push(k);
	if (active.length === 0) return [];
	const corners = /* @__PURE__ */ new Set();
	const test = (a, b) => {
		const u = tangent(p, a, true);
		const v = tangent(p, b, false);
		if (!u || !v) return;
		if (Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) > threshold) corners.add(b);
	};
	for (let j = 0; j + 1 < active.length; j++) test(active[j], active[j + 1]);
	if (path.closed && active.length > 1) test(active[active.length - 1], active[0]);
	return [...corners].sort((a, b) => a - b);
}
function invert(p, k, s, ls) {
	if (s <= 0) return 0;
	if (s >= ls) return 1;
	let lo = 0;
	let hi = 1;
	let t = s / ls;
	for (let it = 0; it < 12; it++) {
		const f = segLen(p, k, t) - s;
		if (Math.abs(f) < 1e-10 * ls + 1e-14) break;
		if (f > 0) hi = t;
		else lo = t;
		const sp = speed(p, k, t);
		let nt = sp > 1e-12 ? t - f / sp : (lo + hi) / 2;
		if (!(nt > lo && nt < hi)) nt = (lo + hi) / 2;
		t = nt;
	}
	return t;
}
/** Samples a cubic subpath at N points equidistant by arc length, anchoring
*  corners and endpoints as exact samples. Returns Float64Array(2N). Closed
*  paths distribute N intervals around the loop (without duplicating the
*  first point); the circular start-point freedom is resolved by the plan's
*  circular correspondence. */
function resamplePath(path, N = 64, cornerThreshold = CORNER_THRESHOLD) {
	const p = path.pts;
	const m = (p.length / 2 - 1) / 3;
	const out = new Float64Array(2 * N);
	const fill = () => {
		for (let i = 0; i < N; i++) {
			out[2 * i] = p[0];
			out[2 * i + 1] = p[1];
		}
		return out;
	};
	if (m < 1) return fill();
	const lens = new Array(m);
	let L = 0;
	for (let k = 0; k < m; k++) {
		lens[k] = segLen(p, k);
		L += lens[k];
	}
	if (L < 1e-12) return fill();
	const cs = detectCorners(path, cornerThreshold);
	const anchors = path.closed ? cs.length > 0 ? cs : [0] : [.../* @__PURE__ */ new Set([
		0,
		...cs,
		m
	])].sort((a, b) => a - b);
	const runs = [];
	if (path.closed) for (let j = 0; j < anchors.length; j++) {
		const a = anchors[j];
		const b = j + 1 < anchors.length ? anchors[j + 1] : anchors[0] + m;
		runs.push([a, b]);
	}
	else for (let j = 0; j + 1 < anchors.length; j++) runs.push([anchors[j], anchors[j + 1]]);
	const rl = runs.map(([a, b]) => {
		let s = 0;
		for (let k = a; k < b; k++) s += lens[k % m];
		return s;
	});
	const intervals = path.closed ? N : N - 1;
	if (runs.length > intervals) throw new Error(`morphicons: N=${N} too small (${runs.length} runs)`);
	const total = rl.reduce((a, b) => a + b, 0) || 1;
	const ideal = rl.map((l) => intervals * l / total);
	const counts = ideal.map((q) => Math.max(1, Math.floor(q)));
	let R = intervals - counts.reduce((a, b) => a + b, 0);
	if (R > 0) {
		const order = ideal.map((q, idx) => [Math.round((q - Math.floor(q)) * 1e9), idx]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
		for (let j = 0; j < R; j++) counts[order[j % counts.length][1]]++;
	}
	while (R < 0) {
		let bi = 0;
		for (let idx = 1; idx < counts.length; idx++) if (counts[idx] > counts[bi]) bi = idx;
		if (counts[bi] <= 1) break;
		counts[bi]--;
		R++;
	}
	let w = 0;
	for (let r = 0; r < runs.length; r++) {
		const [k0, k1] = runs[r];
		const cnt = counts[r];
		const Lr = rl[r];
		const vi = 6 * (k0 % m);
		out[2 * w] = p[vi];
		out[2 * w + 1] = p[vi + 1];
		w++;
		let seg = k0;
		let acc = 0;
		for (let j = 1; j < cnt; j++) {
			const target = Lr * j / cnt;
			while (seg < k1 - 1 && acc + lens[seg % m] < target) {
				acc += lens[seg % m];
				seg++;
			}
			const k = seg % m;
			const ls = lens[k];
			point(p, k, ls > 1e-12 ? invert(p, k, target - acc, ls) : 0, out, 2 * w);
			w++;
		}
	}
	if (!path.closed) {
		const vi = 6 * m;
		out[2 * w] = p[vi];
		out[2 * w + 1] = p[vi + 1];
	}
	return out;
}
/** Full input pipeline: icon → cubics → sampled subpaths with their
*  topology (the plan needs to know which subpaths are closed loops). */
function resampleIcon(input, N = 64) {
	return iconToCubics(input).map((path) => ({
		pts: resamplePath(path, N),
		closed: path.closed
	}));
}
//#endregion
  Object.assign(__e, { a: buildPlan, c: makeItem, d: reversePts, f: rotatePts, i: applyGlobal, l: pairUp, n: resamplePath, o: centroid, r: SURJ_MAX, s: costMatrix, t: resampleIcon, u: procrustes });

});

__def("region-core", function(__e){
//#region src/core/region.ts
/** Attribute that marks an IconNode as an already-normalized region (the
*  output of `toRegion`): one `<path>` of non-overlapping closed contours,
*  outers positive, holes negative. Normalization skips it. */
const REGION_ATTR = "data-region";
/** A paint attribute that paints (not absent, not `none`). */
const painted = (v) => v !== void 0 && String(v).trim().toLowerCase() !== "none";
/** Paint of an icon. Raw `d` strings and IconNodes that never declare a
*  painted fill are stroke icons — the historical contract, so every
*  existing input keeps its meaning. One element with a painted `fill` makes
*  the whole icon a fill icon (mixed stroke+fill icons need the region path
*  too: their silhouette is not a set of centerlines). */
function paintOf(icon) {
	if (typeof icon === "string") return "stroke";
	for (const [, a] of icon) if (painted(a.fill)) return "fill";
	return "stroke";
}
/** A duotone background layer (Phosphor: opacity 0.2) is not part of a
*  monochrome silhouette: one path can't paint it translucent, so it is
*  dropped from a fill icon rather than painted opaque. */
const translucent = (a) => Number.parseFloat(String(a.opacity)) < .5 || Number.parseFloat(String(a["fill-opacity"])) < .5;
/** The elements a fill icon actually draws: its translucent layers out. */
function solid(icon) {
	return typeof icon === "string" || paintOf(icon) === "stroke" ? icon : icon.filter(([, a]) => !translucent(a));
}
/** True when the icon is already a normalized region (no work left). */
function isRegion(icon) {
	return typeof icon !== "string" && icon.length === 1 && "data-region" in icon[0][1];
}
/** Even-odd point-in-polygon against a closed point cloud. */
function inside(px, py, p) {
	const n = p.length / 2;
	let c = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const yi = p[2 * i + 1];
		const yj = p[2 * j + 1];
		if (yi > py !== yj > py && px < (p[2 * j] - p[2 * i]) * (py - yi) / (yj - yi) + p[2 * i]) c = !c;
	}
	return c;
}
/** Distance from (px, py) to the segment ab. */
function distSeg(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const ex = px - ax - t * dx;
	const ey = py - ay - t * dy;
	return Math.sqrt(ex * ex + ey * ey);
}
/** Shoelace signed area of a closed point cloud (SVG axes: y down). */
function signedArea(p) {
	const n = p.length / 2;
	let a = 0;
	for (let i = 0, j = n - 1; i < n; j = i++) a += p[2 * j] * p[2 * i + 1] - p[2 * i] * p[2 * j + 1];
	return a / 2;
}
//#endregion
  Object.assign(__e, { a: paintOf, c: solid, i: isRegion, l: translucent, n: distSeg, o: painted, r: inside, s: signedArea, t: REGION_ATTR });

});

__def("region", function(__e){
const { n: iconToCubics } = __r("normalize");
const { c: makeItem, d: reversePts, f: rotatePts, i: applyGlobal, l: pairUp, n: resamplePath, o: centroid, s: costMatrix, u: procrustes } = __r("resample");
const { a: paintOf, i: isRegion, l: translucent, n: distSeg, r: inside, s: signedArea, t: REGION_ATTR } = __r("region-core");
//#region src/region/plan.ts
const REGION_THRESHOLDS = [
	Math.PI / 4,
	Math.PI / 3,
	Math.PI / 2,
	Math.PI
];
const FINE = .3;
function coarse(path, s) {
	const n = s.length / 2;
	let j = 0;
	for (let v = 0; v < path.length; v += 6) for (let k = 0;; k++) {
		if (k === n) return true;
		const a = (j + k) % n;
		const b = (a + 1) % n;
		if (distSeg(path[v], path[v + 1], s[2 * a], s[2 * a + 1], s[2 * b], s[2 * b + 1]) <= FINE) {
			j = a;
			break;
		}
	}
	return false;
}
/** Samples a normalized region: one Sampled per contour, every one closed,
*  `hole` read from the winding (outers positive, holes negative). N per
*  contour: 64, or 128 for every contour of an icon that 64 can't follow
*  (snowflake tips, spiral turns: the landing would snap). */
function resampleRegion(icon, N) {
	const paths = iconToCubics(icon);
	const at = (n) => paths.map((path) => {
		let pts;
		for (const th of REGION_THRESHOLDS) try {
			pts = resamplePath({
				pts: path.pts,
				closed: true
			}, n, th);
			break;
		} catch {}
		const s = pts;
		return {
			pts: s,
			closed: true,
			hole: signedArea(s) < 0
		};
	});
	const s = at(N ?? 64);
	return N || !paths.some((p, k) => coarse(p.pts, s[k].pts)) ? s : at(128);
}
const REGION_LAMBDA = .3;
const FOLD_SLACK = .1;
const FOLD_TRIES = 16;
function folds(a, b) {
	const L = a.length;
	const p = new Float64Array(L);
	for (let i = 0; i < L; i++) p[i] = (a[i] + b[i]) / 2;
	for (let i = 0; i < L; i += 2) {
		const ax = p[i];
		const ay = p[i + 1];
		const ux = p[(i + 2) % L] - ax;
		const uy = p[(i + 3) % L] - ay;
		for (let j = i + 4; j < L - (i ? 0 : 2); j += 2) {
			const cx = p[j];
			const cy = p[j + 1];
			const vx = p[(j + 2) % L] - cx;
			const vy = p[(j + 3) % L] - cy;
			if ((ux * (cy - ay) - uy * (cx - ax)) * (ux * (cy + vy - ay) - uy * (cx + vx - ax)) >= 0) continue;
			if ((vx * (ay - cy) - vy * (ax - cx)) * (vx * (ay + uy - cy) - vy * (ax + ux - cx)) < 0) return true;
		}
	}
	return false;
}
function outerItem(a, b) {
	const n = a.length / 2;
	const k = n > 64 ? 2 : 1;
	const half = (p, o) => k > 1 ? p.filter((_, i) => (i >> 1) % 2 === o) : p;
	const as = half(a, 0);
	const ca = centroid(as);
	const bs = [half(b, 0), half(b, 1)];
	const cbs = bs.map(centroid);
	const offs = [];
	for (let off = 0; off < n; off++) {
		const j = off % k;
		const s = procrustes(as, rotatePts(bs[j], (off - j) / k), ca, cbs[j]);
		offs.push([off, s.res + REGION_LAMBDA * Math.abs(s.theta) / Math.PI]);
	}
	offs.sort((x, y) => x[1] - y[1]);
	let best;
	for (const [off, score] of offs.slice(0, FOLD_TRIES)) {
		if (score > offs[0][1] + FOLD_SLACK) break;
		const it = makeItem(a, rotatePts(b, off), false, false, false, REGION_LAMBDA);
		it.closed = true;
		best ??= it;
		if (!folds(half(it.aC, 0), half(it.bT, 0))) return it;
	}
	return best;
}
function parentOf(hole, subs) {
	const n = hole.length / 2;
	let best = -1;
	let bestArea = Infinity;
	subs.forEach((s, k) => {
		if (s.hole) return;
		let votes = 0;
		for (const v of [
			0,
			Math.floor(n / 3),
			Math.floor(2 * n / 3)
		]) if (inside(hole[2 * v], hole[2 * v + 1], s.pts)) votes++;
		if (votes < 2) return;
		const ar = Math.abs(signedArea(s.pts));
		if (ar < bestArea) {
			bestArea = ar;
			best = k;
		}
	});
	return best;
}
function assign(C, skip, one, cover) {
	const L = C.length;
	const S = one.length;
	const f = new Array(L).fill(-1);
	const mult = new Array(S).fill(0);
	if ((S + 1) ** L > 1e5) {
		const pairs = [];
		for (let i = 0; i < L; i++) for (let j = 0; j < S; j++) if (C[i][j] < Infinity) pairs.push([
			C[i][j],
			i,
			j
		]);
		pairs.sort((x, y) => x[0] - y[0]);
		for (const [, i, j] of pairs) if (f[i] < 0 && !mult[j]) {
			f[i] = j;
			mult[j] = 1;
		}
		for (let i = 0; i < L; i++) {
			if (f[i] >= 0) continue;
			for (let j = 0; j < S; j++) if (!one[j] && (f[i] < 0 || C[i][j] < C[i][f[i]])) f[i] = j;
		}
		return f;
	}
	let best = f.slice();
	let bc = Infinity;
	const rec = (i, acc, covered) => {
		if (acc >= bc || cover && S - covered > L - i) return;
		if (i === L) {
			bc = acc;
			best = f.slice();
			return;
		}
		for (let j = 0; j < S; j++) {
			if (one[j] && mult[j] || !(C[i][j] < Infinity)) continue;
			f[i] = j;
			mult[j]++;
			rec(i + 1, acc + C[i][j], covered + (mult[j] === 1 ? 1 : 0));
			mult[j]--;
		}
		f[i] = -1;
		rec(i + 1, acc + skip[i], covered);
	};
	rec(0, 0, 0);
	return best;
}
const SKIP = 1e6;
function carry(x, y, from, to, theta, s) {
	const c = Math.cos(theta) * s;
	const n = Math.sin(theta) * s;
	const dx = x - from[0];
	const dy = y - from[1];
	return [to[0] + dx * c - dy * n, to[1] + dx * n + dy * c];
}
function dots(c, n) {
	const d = new Float64Array(2 * n);
	for (let i = 0; i < 2 * n; i += 2) {
		d[i] = c[0];
		d[i + 1] = c[1];
	}
	return d;
}
function inFrame(a, b, f, hole, half) {
	const n = a.length / 2;
	const s = Math.exp(f.lnSigma);
	const aC = new Float64Array(2 * n);
	const bt = new Float64Array(2 * n);
	let nb = 0;
	for (let i = 0; i < 2 * n; i += 2) {
		aC[i] = a[i] - f.ca[0];
		aC[i + 1] = a[i + 1] - f.ca[1];
		[bt[i], bt[i + 1]] = carry(b[i], b[i + 1], f.cb, [0, 0], -f.theta, 1 / s);
		nb += (b[i] - f.cb[0]) ** 2 + (b[i + 1] - f.cb[1]) ** 2;
	}
	let off = 0;
	let be = Infinity;
	for (let o = 0; o < n && be > 0; o++) {
		let e = 0;
		for (let i = 0; i < n && e < be; i++) {
			const j = (i + o) % n;
			e += (aC[2 * i] - bt[2 * j]) ** 2 + (aC[2 * i + 1] - bt[2 * j + 1]) ** 2;
		}
		if (e < be) {
			be = e;
			off = o;
		}
	}
	return {
		a,
		aC,
		bT: rotatePts(bt, off),
		bO: rotatePts(b, off),
		ca: f.ca,
		cb: f.cb,
		theta: f.theta,
		lnSigma: f.lnSigma,
		res: nb > 1e-12 ? Math.sqrt(s * s * be / nb) : 0,
		closed: true,
		hole,
		half,
		block: f.block
	};
}
function vanishingHole(pts, outer, grow) {
	const s = Math.exp(outer.lnSigma);
	let [x, y] = centroid(pts);
	const { aC, bT } = outer;
	const near = grow ? outer.bO : outer.a;
	let w = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < aC.length; i += 2) {
		const k = 1 / ((near[i] - x) ** 2 + (near[i + 1] - y) ** 2 + 1e-9);
		w += k;
		dx += k * (bT[i] - aC[i]);
		dy += k * (bT[i + 1] - aC[i + 1]);
	}
	w = (grow ? -.5 : .5) / w;
	if (grow) [x, y] = carry(x, y, outer.cb, outer.ca, -outer.theta, 1 / s);
	x += w * dx;
	y += w * dy;
	const dot = dots(grow ? [x, y] : carry(x, y, outer.ca, outer.cb, outer.theta, s), pts.length / 2);
	return grow ? inFrame(dot, pts, outer, true, 1) : inFrame(pts, dot, outer, true, 0);
}
const weight = (it, t) => Math.min(1, Math.max(0, 2 * t - (it.half ?? t)));
function strays(h, o, holes) {
	let k = 0;
	for (const t of [
		.25,
		.5,
		.75
	]) {
		if (!(weight(h, t) % 1)) continue;
		const [H, O, ...G] = [
			h,
			o,
			...holes.filter((g) => g !== h)
		].map((it) => it.aC.map((v, i) => v + weight(it, t) * (it.bT[i] - v)));
		for (let i = 0; i < H.length; i += 2) if (!inside(H[i], H[i + 1], O) || G.some((p) => inside(H[i], H[i + 1], p))) k++;
	}
	return k;
}
function vanishingPiece(outer, holes, grow) {
	const c = centroid(outer);
	const f = {
		ca: c,
		cb: c,
		theta: 0,
		lnSigma: 0,
		block: null
	};
	const dot = dots(c, outer.length / 2);
	return [outer, ...holes].map((p, k) => grow ? inFrame(dot, p, f, k > 0) : inFrame(p, dot, f, k > 0));
}
const vanishCost = (pts) => costMatrix([pts], [dots(centroid(pts), pts.length / 2)])[0][0];
function bbox(p) {
	const b = [
		p[0],
		p[1],
		p[0],
		p[1]
	];
	for (let i = 2; i < p.length; i += 2) {
		b[0] = Math.min(b[0], p[i]);
		b[1] = Math.min(b[1], p[i + 1]);
		b[2] = Math.max(b[2], p[i]);
		b[3] = Math.max(b[3], p[i + 1]);
	}
	return b;
}
const HOLE_IOU = .25;
function holeCosts(HA, HB, outer) {
	const s = Math.exp(outer.lnSigma);
	const C = costMatrix(HA, HB);
	const inA = HB.map((h) => {
		const q = new Float64Array(h.length);
		for (let i = 0; i < h.length; i += 2) [q[i], q[i + 1]] = carry(h[i], h[i + 1], outer.cb, outer.ca, -outer.theta, 1 / s);
		return bbox(q);
	});
	HA.forEach((h, i) => {
		const a = bbox(h);
		inA.forEach((b, j) => {
			const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
			const v = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
			const inter = w > 0 && v > 0 ? w * v : 0;
			const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
			if (!(inter >= HOLE_IOU * union)) C[i][j] = Infinity;
		});
	});
	return C;
}
function piecesOf(subs) {
	const idx = [];
	subs.forEach((s, k) => {
		if (!s.hole) idx.push(k);
	});
	const holes = idx.map(() => []);
	subs.forEach((s) => {
		if (!s.hole) return;
		let k = idx.indexOf(parentOf(s.pts, subs));
		if (k < 0) {
			const [hx, hy] = centroid(s.pts);
			let bd = Infinity;
			idx.forEach((o, m) => {
				const [ox, oy] = centroid(subs[o].pts);
				const d = Math.hypot(ox - hx, oy - hy);
				if (d < bd) {
					bd = d;
					k = m;
				}
			});
		}
		holes[k].push(s.pts);
	});
	return {
		outers: idx.map((k) => subs[k].pts),
		holes
	};
}
function doubled(p) {
	const m = p.length;
	const q = new Float64Array(2 * m);
	for (let i = 0; i < m; i += 2) {
		const j = (i + 2) % m;
		q[2 * i] = p[i];
		q[2 * i + 1] = p[i + 1];
		q[2 * i + 2] = (p[i] + p[j]) / 2;
		q[2 * i + 3] = (p[i + 1] + p[j + 1]) / 2;
	}
	return q;
}
/** Region plan: outers ↔ outers (holed contours never duplicated), holes ↔
*  overlapping holes of the paired outer, direction locked; whatever has no
*  partner collapses/grows without ever breaking the nesting (rules above).
*  Every item flies closed. */
function buildRegionPlan(srcSubs, dstSubs) {
	const n = Math.max(srcSubs[0].pts.length, dstSubs[0].pts.length) / 2;
	const fit = (s) => s[0].pts.length / 2 < n ? s.map((c) => ({
		...c,
		pts: doubled(c.pts)
	})) : s;
	const A = piecesOf(fit(srcSubs));
	const B = piecesOf(fit(dstSubs));
	if (A.outers.length === 0 || B.outers.length === 0) throw new Error("morphicons: region has no outer contour");
	let pairs;
	const p = A.outers.length;
	const q = B.outers.length;
	const [large, small] = p < q ? [B, A] : [A, B];
	if (p === q || small.holes.every((h) => h.length === 0)) pairs = pairUp(A.outers, B.outers);
	else pairs = assign(costMatrix(large.outers, small.outers), large.outers.map((o) => SKIP + vanishCost(o)), small.holes.map((h) => h.length > 0), true).map((s, l) => p < q ? [s, l] : [l, s]);
	const items = [];
	let partial = false;
	for (const [i, j] of pairs) {
		if (i < 0 || j < 0) {
			partial = true;
			items.push(...i < 0 ? vanishingPiece(B.outers[j], B.holes[j], true) : vanishingPiece(A.outers[i], A.holes[i], false));
			continue;
		}
		const it = outerItem(A.outers[i], B.outers[j]);
		it.hole = false;
		items.push(it);
		const HA = A.holes[i];
		const HB = B.holes[j];
		const f = assign(holeCosts(HA, HB, it), HA.map(() => SKIP), HB.map(() => true), false);
		const holes = HA.map((h, k) => f[k] < 0 ? vanishingHole(h, it, false) : inFrame(h, HB[f[k]], it, true));
		HB.forEach((h, k) => {
			if (!f.includes(k)) holes.push(vanishingHole(h, it, true));
		});
		for (let k = 0; k < holes.length; k++) {
			const h = holes[k];
			if (h.half !== void 0) {
				partial = true;
				continue;
			}
			const c = strays(h, it, holes);
			if (!c) continue;
			holes.splice(k, 1, vanishingHole(h.a, it, false), vanishingHole(h.bO, it, true));
			if (strays(holes[k], it, holes) + strays(holes[k + 1], it, holes) >= c) holes.splice(k, 2, h);
		}
		items.push(...holes);
	}
	if (items.length > 1 && !partial) applyGlobal(items, n);
	return {
		items,
		n
	};
}
//#endregion
//#region src/region/index.ts
const BIG = 1e9;
const painted = (v) => v !== void 0 && String(v).trim().toLowerCase() !== "none";
const num = (v, fallback) => {
	const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
	return Number.isFinite(x) ? x : fallback;
};
function flatten(input, tol) {
	const lines = [];
	const closed = [];
	for (const { pts, closed: c } of iconToCubics(input)) {
		const out = [pts[0], pts[1]];
		for (let i = 0; i + 7 < pts.length; i += 6) {
			const x0 = pts[i];
			const y0 = pts[i + 1];
			const x1 = pts[i + 2];
			const y1 = pts[i + 3];
			const x2 = pts[i + 4];
			const y2 = pts[i + 5];
			const x3 = pts[i + 6];
			const y3 = pts[i + 7];
			const dd = Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
			const k = Math.min(128, Math.max(1, Math.ceil(Math.sqrt(6 * dd / (8 * tol)))));
			for (let s = 1; s <= k; s++) {
				const t = s / k;
				const u = 1 - t;
				out.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
			}
		}
		lines.push(Float64Array.from(out));
		closed.push(c);
	}
	return {
		lines,
		closed
	};
}
function partsOf(input, width, tol) {
	if (typeof input === "string") return [{
		...flatten(input, tol),
		half: width / 2,
		fill: 0
	}];
	const fillIcon = paintOf(input) === "fill";
	const parts = [];
	for (const el of input) {
		const a = el[1];
		if (translucent(a)) continue;
		const strokeOn = fillIcon ? painted(a.stroke) : a.stroke === void 0 || painted(a.stroke);
		const fillOn = fillIcon && (painted(a.fill) || a.fill === void 0 && !strokeOn);
		if (!strokeOn && !fillOn) continue;
		parts.push({
			...flatten([el], tol),
			half: strokeOn ? num(a["stroke-width"], width) / 2 : 0,
			fill: fillOn ? String(a["fill-rule"] ?? "").trim() === "evenodd" ? 2 : 1 : 0
		});
	}
	return parts;
}
function eachNear(g, ax, ay, bx, by, r, fn) {
	const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - g.x0) / g.h));
	const i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + r - g.x0) / g.h));
	const j0 = Math.max(0, Math.floor((Math.min(ay, by) - r - g.y0) / g.h));
	const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(ay, by) + r - g.y0) / g.h));
	for (let j = j0; j <= j1; j++) {
		const y = g.y0 + j * g.h;
		for (let i = i0; i <= i1; i++) fn(j * g.nx + i, g.x0 + i * g.h, y);
	}
}
function eachSeg(p, close, fn) {
	const n = p.length / 2;
	if (n === 1) fn(p[0], p[1], p[0], p[1]);
	for (let i = 0; i + 1 < n; i++) fn(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]);
	if (close && n > 2) fn(p[2 * n - 2], p[2 * n - 1], p[0], p[1]);
}
function field(parts, g) {
	const F = new Float32Array(g.nx * g.ny).fill(BIG);
	const band = 2 * g.h;
	let D = null;
	for (const part of parts) {
		if (part.half > 0) {
			const r = part.half + band;
			part.lines.forEach((p, li) => {
				eachSeg(p, part.closed[li], (ax, ay, bx, by) => eachNear(g, ax, ay, bx, by, r, (k, x, y) => {
					const d = distSeg(x, y, ax, ay, bx, by) - part.half;
					if (d < F[k]) F[k] = d;
				}));
			});
		}
		if (part.fill) {
			D ??= new Float32Array(g.nx * g.ny);
			const Dm = D;
			Dm.fill(BIG);
			for (const p of part.lines) eachSeg(p, true, (ax, ay, bx, by) => eachNear(g, ax, ay, bx, by, band, (k, x, y) => {
				const d = distSeg(x, y, ax, ay, bx, by);
				if (d < Dm[k]) Dm[k] = d;
			}));
			const xs = [];
			const ws = [];
			for (let j = 0; j < g.ny; j++) {
				const y = g.y0 + j * g.h;
				const cross = [];
				for (const p of part.lines) eachSeg(p, true, (ax, ay, bx, by) => {
					if (ay <= y !== by <= y) cross.push([ax + (y - ay) * (bx - ax) / (by - ay), by > ay ? 1 : -1]);
				});
				cross.sort((u, v) => u[0] - v[0]);
				xs.length = 0;
				ws.length = 0;
				for (const [x, w] of cross) {
					xs.push(x);
					ws.push(w);
				}
				let c = 0;
				let wind = 0;
				for (let i = 0; i < g.nx; i++) {
					const x = g.x0 + i * g.h;
					while (c < xs.length && xs[c] < x) wind += ws[c++];
					const isIn = part.fill === 1 ? wind !== 0 : (wind & 1) === 1;
					const k = j * g.nx + i;
					const v = isIn ? -Dm[k] : Dm[k];
					if (v < F[k]) F[k] = v;
				}
			}
		}
	}
	return F;
}
function trace(F, g) {
	const { nx, ny, h, x0, y0 } = g;
	const pt = /* @__PURE__ */ new Map();
	const crossing = (key) => {
		if (pt.has(key)) return key;
		const node = key >> 1;
		const i = node % nx;
		const j = (node - i) / nx;
		const other = key & 1 ? node + nx : node + 1;
		const fa = F[node];
		const t = Math.min(Math.max(fa / (fa - F[other]), 1e-5), .99999);
		pt.set(key, key & 1 ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h]);
		return key;
	};
	const adj = /* @__PURE__ */ new Map();
	const link = (a, b) => {
		const ka = crossing(a);
		const kb = crossing(b);
		const la = adj.get(ka);
		if (la) la.push(kb);
		else adj.set(ka, [kb]);
		const lb = adj.get(kb);
		if (lb) lb.push(ka);
		else adj.set(kb, [ka]);
	};
	for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
		const a = j * nx + i;
		const b = a + 1;
		const c = a + nx + 1;
		const d = a + nx;
		const ia = F[a] < 0;
		const ib = F[b] < 0;
		const ic = F[c] < 0;
		const id = F[d] < 0;
		const top = 2 * a;
		const right = 2 * b + 1;
		const bottom = 2 * d;
		const left = 2 * a + 1;
		const edges = [];
		if (ia !== ib) edges.push(top);
		if (ib !== ic) edges.push(right);
		if (id !== ic) edges.push(bottom);
		if (ia !== id) edges.push(left);
		if (edges.length === 2) link(edges[0], edges[1]);
		else if (edges.length === 4) {
			if ((F[a] + F[b] + F[c] + F[d]) / 4 < 0 === ia) {
				link(top, right);
				link(bottom, left);
			} else {
				link(left, top);
				link(right, bottom);
			}
		}
	}
	const loops = [];
	const seen = /* @__PURE__ */ new Set();
	for (const start of adj.keys()) {
		if (seen.has(start)) continue;
		const ring = [];
		let prev = -1;
		let cur = start;
		while (!seen.has(cur)) {
			seen.add(cur);
			const p = pt.get(cur);
			ring.push(p[0], p[1]);
			const nb = adj.get(cur);
			const next = nb[0] !== prev ? nb[0] : nb[1];
			prev = cur;
			cur = next;
		}
		if (ring.length >= 6) loops.push(Float64Array.from(ring));
	}
	return loops;
}
function rdp(p, i0, i1, tol, keep) {
	const n = p.length / 2;
	const ax = p[2 * (i0 % n)];
	const ay = p[2 * (i0 % n) + 1];
	const bx = p[2 * (i1 % n)];
	const by = p[2 * (i1 % n) + 1];
	let worst = -1;
	let wd = tol;
	for (let i = i0 + 1; i < i1; i++) {
		const d = distSeg(p[2 * (i % n)], p[2 * (i % n) + 1], ax, ay, bx, by);
		if (d > wd) {
			wd = d;
			worst = i;
		}
	}
	if (worst < 0) return;
	keep[worst % n] = 1;
	rdp(p, i0, worst, tol, keep);
	rdp(p, worst, i1, tol, keep);
}
function simplify(p, tol) {
	const n = p.length / 2;
	if (n < 4) return p;
	let far = 0;
	let fd = -1;
	for (let i = 1; i < n; i++) {
		const d = Math.hypot(p[2 * i] - p[0], p[2 * i + 1] - p[1]);
		if (d > fd) {
			fd = d;
			far = i;
		}
	}
	const keep = new Uint8Array(n);
	keep[0] = 1;
	keep[far] = 1;
	rdp(p, 0, far, tol, keep);
	rdp(p, far, n, tol, keep);
	const out = [];
	for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
	return Float64Array.from(out);
}
function recoverCorners(p, h) {
	const n = p.length / 2;
	if (n < 4) return p;
	const len = (k) => {
		const a = k % n;
		const b = (k + 1) % n;
		return Math.hypot(p[2 * b] - p[2 * a], p[2 * b + 1] - p[2 * a + 1]);
	};
	const long = [];
	for (let k = 0; k < n; k++) if (len(k) >= 2.5 * h) long.push(k);
	if (long.length < 2) return p;
	const drop = new Uint8Array(n);
	const moved = /* @__PURE__ */ new Map();
	for (let q = 0; q < long.length; q++) {
		const k1 = long[q];
		const k2 = long[(q + 1) % long.length];
		const gap = (k2 - k1 - 1 + n) % n;
		if (gap < 1 || gap > 3) continue;
		let gl = 0;
		for (let s = 1; s <= gap; s++) gl += len(k1 + s);
		if (gl > 3 * h) continue;
		const a0 = k1 % n;
		const a1 = (k1 + 1) % n;
		const b0 = k2 % n;
		const b1 = (k2 + 1) % n;
		const d1x = p[2 * a1] - p[2 * a0];
		const d1y = p[2 * a1 + 1] - p[2 * a0 + 1];
		const d2x = p[2 * b1] - p[2 * b0];
		const d2y = p[2 * b1 + 1] - p[2 * b0 + 1];
		const cr = d1x * d2y - d1y * d2x;
		if (Math.abs(Math.atan2(cr, d1x * d2x + d1y * d2y)) < Math.PI / 12) continue;
		const t = ((p[2 * b0] - p[2 * a0]) * d2y - (p[2 * b0 + 1] - p[2 * a0 + 1]) * d2x) / cr;
		const X = [p[2 * a0] + t * d1x, p[2 * a0 + 1] + t * d1y];
		const mx = (p[2 * a1] + p[2 * b0]) / 2;
		const my = (p[2 * a1 + 1] + p[2 * b0 + 1]) / 2;
		if (Math.hypot(X[0] - mx, X[1] - my) > 2 * h) continue;
		moved.set(a1, X);
		for (let s = 2; s <= gap + 1; s++) drop[(k1 + s) % n] = 1;
	}
	if (moved.size === 0) return p;
	const out = [];
	for (let i = 0; i < n; i++) {
		if (drop[i]) continue;
		const m = moved.get(i);
		if (m) out.push(m[0], m[1]);
		else out.push(p[2 * i], p[2 * i + 1]);
	}
	return Float64Array.from(out);
}
const fmt = (v) => String(Math.round(v * 1e3) / 1e3);
/** Contours of the visible surface: closed, non-overlapping, outers
*  positive / holes negative (nesting depth decides which is which). */
function regionContours(input, options) {
	const h = options?.cell ?? .125;
	const parts = partsOf(input, options?.strokeWidth ?? 2, .004);
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let pad = 0;
	for (const part of parts) {
		pad = Math.max(pad, part.half);
		for (const p of part.lines) for (let i = 0; i < p.length; i += 2) {
			minX = Math.min(minX, p[i]);
			maxX = Math.max(maxX, p[i]);
			minY = Math.min(minY, p[i + 1]);
			maxY = Math.max(maxY, p[i + 1]);
		}
	}
	if (!(maxX >= minX)) return [];
	pad += 3 * h;
	const g = {
		x0: minX - pad,
		y0: minY - pad,
		h,
		nx: Math.ceil((maxX - minX + 2 * pad) / h) + 1,
		ny: Math.ceil((maxY - minY + 2 * pad) / h) + 1
	};
	const loops = trace(field(parts, g), g).filter((l) => Math.abs(signedArea(l)) > .01);
	return loops.map((l) => {
		let depth = 0;
		for (const o of loops) if (o !== l && inside(l[0], l[1], o)) depth++;
		const hole = depth % 2 === 1;
		return recoverCorners(simplify(signedArea(l) > 0 === !hole ? l : reversePts(l), h * .08), h);
	});
}
/** Any icon → its canonical region: one `<path>` (nonzero) whose contours
*  are the visible surface. Idempotent on regions. Stroke icons outline at
*  `strokeWidth` (round caps and joins — Lucide, Tabler, Feather,
*  Heroicons outline); fill icons honor each element's fill rule. */
function toRegion(input, options) {
	if (isRegion(input)) return input;
	let d = "";
	for (const p of regionContours(input, options)) {
		d += `M${fmt(p[0])} ${fmt(p[1])}`;
		for (let i = 2; i < p.length; i += 2) d += `L${fmt(p[i])} ${fmt(p[i + 1])}`;
		d += "Z";
	}
	if (!d) throw new Error("morphicons: icon has no visible surface");
	return [["path", {
		d,
		fill: "currentColor",
		stroke: "none",
		"fill-rule": "nonzero",
		[REGION_ATTR]: "1"
	}]];
}
const forms = /* @__PURE__ */ new WeakMap();
const byContent = /* @__PURE__ */ new Map();
const samples = /* @__PURE__ */ new WeakMap();
const plans = /* @__PURE__ */ new WeakMap();
/** The region the driver draws for an icon (cached): a stroke icon
*  outlined at the element's stroke width, a fill icon as is. */
function regionOf(icon, strokeWidth) {
	if (isRegion(icon)) return icon;
	const width = paintOf(icon) === "fill" && !icon.some(([, a]) => painted(a.stroke) && a["stroke-width"] === void 0) ? 0 : strokeWidth;
	let byWidth = typeof icon === "string" ? void 0 : forms.get(icon);
	let r = byWidth?.get(width);
	if (r) return r;
	const key = `${width}|${typeof icon === "string" ? icon : JSON.stringify(icon)}`;
	r = byContent.get(key);
	if (r) byContent.delete(key);
	else r = toRegion(icon, { strokeWidth });
	byContent.set(key, r);
	if (byContent.size > 64) byContent.delete(byContent.keys().next().value);
	if (typeof icon !== "string") {
		if (!byWidth) {
			byWidth = /* @__PURE__ */ new Map();
			forms.set(icon, byWidth);
		}
		byWidth.set(width, r);
	}
	return r;
}
function sampledOf(region) {
	let s = samples.get(region);
	if (!s) {
		s = resampleRegion(region);
		samples.set(region, s);
	}
	return s;
}
/** Region plan from `src` at rest to `dst` (cached by reference). */
function regionPlan(src, dst, strokeWidth) {
	const a = regionOf(src, strokeWidth);
	const b = regionOf(dst, strokeWidth);
	let inner = plans.get(a);
	if (!inner) {
		inner = /* @__PURE__ */ new WeakMap();
		plans.set(a, inner);
	}
	let p = inner.get(b);
	if (!p) {
		p = buildRegionPlan(sampledOf(a), sampledOf(b));
		inner.set(b, p);
	}
	return p;
}
/** Region plan from the shape in flight to `dst` (never cached): region
*  samples as they are, or a centerline `d` (a stroke morph interrupted
*  toward a fill icon), outlined as it is. */
function regionPlanFrom(shape, dst, strokeWidth) {
	return buildRegionPlan(typeof shape === "string" ? resampleRegion(regionOf(shape, strokeWidth)) : shape, sampledOf(regionOf(dst, strokeWidth)));
}
globalThis[Symbol.for("morphicons.region")] = {
	regionOf,
	regionPlan,
	regionPlanFrom
};
//#endregion
  Object.assign(__e, { buildRegionPlan: buildRegionPlan, isRegion: isRegion, paintOf: paintOf, regionContours: regionContours, regionOf: regionOf, regionPlan: regionPlan, regionPlanFrom: regionPlanFrom, resampleRegion: resampleRegion, toRegion: toRegion });

});

__def("dom", function(__e){
const { a: interpPolar, n: Spring, r: allocOutputs, t: SPRING_PRESETS } = __r("spring");
const { i: serialize, n: iconToCubics, r: cubicsToPathD } = __r("normalize");
const { a: buildPlan, d: reversePts, n: resamplePath, o: centroid, t: resampleIcon } = __r("resample");
const { a: paintOf, c: solid, o: painted, r: inside, s: signedArea } = __r("region-core");
//#region src/dom/index.ts
const tickers = /* @__PURE__ */ new Set();
let rafId = 0;
let last = -1;
function loop(ts) {
	const dt = last < 0 ? 0 : Math.min(Math.max((ts - last) / 1e3, 0), .1);
	last = ts;
	for (const tick of [...tickers]) tick(dt);
	if (tickers.size > 0) rafId = requestAnimationFrame(loop);
	else {
		rafId = 0;
		last = -1;
	}
}
function addTicker(tick) {
	tickers.add(tick);
	if (rafId === 0) {
		last = -1;
		rafId = requestAnimationFrame(loop);
	}
}
function removeTicker(tick) {
	tickers.delete(tick);
	if (tickers.size === 0 && rafId !== 0) {
		cancelAnimationFrame(rafId);
		rafId = 0;
		last = -1;
	}
}
const samples = /* @__PURE__ */ new WeakMap();
const canon = /* @__PURE__ */ new WeakMap();
const plans = /* @__PURE__ */ new WeakMap();
function cubicsOf(icon) {
	if (typeof icon === "string" || paintOf(icon) === "stroke") return iconToCubics(icon);
	return solid(icon).flatMap((el) => {
		const ps = iconToCubics([el]);
		const odd = String(el[1]["fill-rule"]).trim() === "evenodd";
		let sum = 0;
		for (const p of ps) sum += signedArea(p.pts);
		for (const p of ps) {
			let flip = sum < 0;
			if (odd) {
				let pos = true;
				for (const o of ps) if (o !== p && inside(p.pts[0], p.pts[1], o.pts)) pos = !pos;
				flip = signedArea(p.pts) > 0 !== pos;
			}
			if (flip) p.pts = reversePts(p.pts);
		}
		return ps;
	});
}
function sampledOf(icon) {
	if (typeof icon === "string") return resampleIcon(icon);
	let s = samples.get(icon);
	if (!s) {
		s = cubicsOf(icon).map((p) => ({
			pts: resamplePath(p, 64),
			closed: p.closed
		}));
		samples.set(icon, s);
	}
	return s;
}
/** Canonical `d` of an icon: the input string verbatim, or the real cubics
*  quantized to 4 decimals (the at-rest snap; engine-stable bytes so SSR
*  hydration matches, see fmtCanon in core/serialize). Exported because it
*  is what a binding renders at SSR/rest before any runtime exists. A fill
*  icon's translucent duotone layer is left out (one path can't paint it). */
function canonicalD(icon) {
	if (typeof icon === "string") return icon;
	let d = canon.get(icon);
	if (!d) {
		d = cubicsToPathD(cubicsOf(icon));
		canon.set(icon, d);
	}
	return d;
}
function planBetween(src, dst) {
	if (typeof src === "string" || typeof dst === "string") return buildPlan(sampledOf(src), sampledOf(dst));
	let inner = plans.get(src);
	if (!inner) {
		inner = /* @__PURE__ */ new WeakMap();
		plans.set(src, inner);
	}
	let p = inner.get(dst);
	if (!p) {
		p = buildPlan(sampledOf(src), sampledOf(dst));
		inner.set(dst, p);
	}
	return p;
}
let regionMod = null;
let regionLoading = null;
let regionSince = 0;
let regionFailed = false;
let regionUrl;
let regionGen = 0;
let regionLoader = () => Promise.resolve(__r("region"));
/** Replaces how the region normalizer is loaded (default: dynamic import of
*  the bundled chunk). E.g. `setRegionLoader(async () => region)` after a
*  static `import * as region from "morphicons/region"` to never touch the
*  network mid-interaction. The next need loads through the new loader. */
function setRegionLoader(loader) {
	regionLoader = loader;
	regionGen++;
	regionLoading = null;
	regionMod = null;
	regionFailed = false;
	regionUrl = void 0;
}
const reload = (url) => new Promise((ok, ko) => {
	const s = document.createElement("script");
	s.type = "module";
	s.onload = s.onerror = () => {
		s.remove();
		const m = globalThis[Symbol.for("morphicons.region")];
		m ? ok(m) : ko(new Error(url));
	};
	s.src = `${url}#${Date.now()}`;
	document.head.append(s);
});
const fromSource = () => {
	const spec = /import\(\s*["'`]([^"'`]+)/.exec(String(regionLoader))?.[1];
	const here = /\w+:\/\/[^\s)]+?(?=:\d+:\d+)/.exec(String((/* @__PURE__ */ new Error()).stack))?.[0];
	try {
		return spec && new URL(spec, here).href;
	} catch {}
};
/** Starts (or joins) loading the region normalizer. Call it early — on
*  idle, on hover — to keep the first stroke↔fill morph off the network. */
function preloadRegion() {
	if (regionMod) return Promise.resolve(regionMod);
	if (!regionLoading) {
		regionSince = Date.now();
		const url = regionUrl;
		const gen = regionGen;
		regionLoading = regionLoader().catch((e) => url ? reload(url) : Promise.reject(e)).then((m) => {
			if (gen === regionGen) regionMod = m;
			return m;
		}, (e) => {
			if (gen !== regionGen) throw e;
			regionLoading = null;
			regionFailed = true;
			regionUrl ??= /dynamically imported module:?\s*(\S+)/i.exec(String(e?.message))?.[1] ?? fromSource();
			throw e;
		});
	}
	return regionLoading;
}
const quietPreload = () => new Promise((ok, ko) => {
	if (typeof navigator === "undefined" ? false : navigator.connection?.saveData) return;
	const go = () => {
		regionFailed ? ko() : preloadRegion().then(ok, ko);
	};
	typeof requestIdleCallback === "function" ? requestIdleCallback(go, { timeout: 2e3 }) : setTimeout(go, 200);
});
/** How long a morph waits for the region chunk before flying the fallback
*  (RAIL's 100 ms response budget). A slow, failed or hanging load never
*  leaves the icon stuck on the old shape; the load goes on in the
*  background and the next morph flies. A load already older than the
*  budget isn't waited for again. */
const REGION_WAIT_MS = 100;
const paintAttrs = (p) => p === "stroke" ? {
	fill: "none",
	stroke: "inherit"
} : {
	fill: "currentColor",
	stroke: p === "fill" ? "none" : "inherit",
	"fill-rule": "nonzero"
};
const looks = /* @__PURE__ */ new WeakMap();
const paintedEls = /* @__PURE__ */ new WeakSet();
function restLook(icon) {
	if (typeof icon === "string" || paintOf(icon) === "stroke") return "stroke";
	let look = looks.get(icon);
	if (look) return look;
	let filled = 0;
	let enclosed = -1;
	look = "fill";
	for (const el of solid(icon)) {
		const s = painted(el[1].stroke);
		const f = painted(el[1].fill) || el[1].fill === void 0 && !s;
		if (s) look = "both";
		let a = 0;
		for (const p of iconToCubics([el])) a += Math.abs(signedArea(p.pts));
		if (f) filled += a;
		else if (s) enclosed = Math.max(enclosed, 0) + a;
	}
	if (enclosed > 1.5 * filled) look = "stroke";
	looks.set(icon, look);
	return look;
}
/** The paint attributes a binding renders on the `<path>` with its first
*  icon (SSR included), so a fill icon is filled before any script runs.
*  None for a stroke icon: it inherits the `<svg>`'s stroke as always. */
function restAttrs(icon) {
	if (icon === void 0 || paintOf(icon) === "stroke") return void 0;
	return paintAttrs(restLook(icon));
}
function popPlan(from, to) {
	const n = 64;
	const item = ({ pts, closed }, half) => {
		if (pts.length > 128) pts = pts.filter((_, i) => i % 4 < 2);
		const c = centroid(pts);
		const p = pts.map((v, i) => v - c[i & 1]);
		const z = /* @__PURE__ */ new Float64Array(128);
		return {
			aC: half ? z : p,
			bT: half ? p : z,
			ca: c,
			cb: c,
			theta: 0,
			lnSigma: 0,
			closed,
			half,
			block: null
		};
	};
	return {
		n,
		items: [...from.map((s) => item(s, 0)), ...to.map((s) => item(s, 1))]
	};
}
function resolveSpring(s) {
	if (typeof s === "string") return SPRING_PRESETS[s];
	const d = SPRING_PRESETS.snappy;
	return {
		k: s?.stiffness ?? d.k,
		c: s?.damping ?? d.c
	};
}
/** Creates the morph instance over a `<path>` and paints the initial icon. */
function createMorph(el, icon, options) {
	const spring = new Spring();
	let reducedMotion = options?.reducedMotion ?? "never";
	let strokeWidth = options?.strokeWidth ?? 2;
	let target = icon;
	let rest = true;
	let plan = null;
	let out = null;
	let closed = null;
	let t = 1;
	let flying = false;
	let dead = false;
	let regionFlight = false;
	let drawn = false;
	let pending = null;
	let paint = "stroke";
	let known = !paintedEls.has(el);
	let split = 0;
	let popFrom = "stroke";
	let popBase = null;
	const paintAs = (p) => {
		if (p === paint && known) return;
		for (const [k, v] of Object.entries(paintAttrs(p))) el.setAttribute(k, v);
		paint = p;
		known = true;
		paintedEls.add(el);
	};
	const paintRest = (ic) => {
		const r = regionMod && paintOf(ic) === "fill" ? regionMod.regionOf(ic, strokeWidth) : ic;
		el.setAttribute("d", canonicalD(r));
		paintAs(restLook(r));
	};
	const upgrade = (load) => {
		const icon = target;
		load.then(() => {
			if (!dead && rest && target === icon && pending === null) paintRest(icon);
		}, () => {});
	};
	paintRest(icon);
	if (paintOf(icon) === "fill" && !regionMod) upgrade(quietPreload());
	const shown = (tt) => !split ? [0, plan?.items.length ?? 0] : tt < .5 ? [0, split] : [split, plan?.items.length ?? 0];
	const render = (tt) => {
		const p = plan;
		const o = out;
		const cl = closed;
		if (!p || !o || !cl) return;
		t = tt;
		interpPolar(p, tt, o);
		drawn = true;
		const [lo, hi] = shown(tt);
		if (split) paintAs(tt < .5 ? popFrom : restLook(target));
		el.setAttribute("d", serialize(o.slice(lo, hi), cl.slice(lo, hi)));
	};
	const stop = () => {
		if (!flying) return;
		flying = false;
		removeTicker(tick);
	};
	const tick = (dt) => {
		const settled = spring.step(dt);
		render(spring.x);
		if (settled) {
			stop();
			settle();
		}
	};
	const settle = () => {
		rest = true;
		plan = null;
		out = null;
		closed = null;
		t = 1;
		spring.x = 1;
		spring.v = 0;
		regionFlight = false;
		split = 0;
		paintRest(target);
		if (paintOf(target) === "fill" && !regionMod && (regionLoading || !regionFailed)) upgrade(preloadRegion());
	};
	/** The current shape as plan source: the at-rest icon, or the rendered
	*  buffers (already N points per subpath). */
	const snapshot = () => {
		const p = plan;
		const o = out;
		if (rest || !p || !o) return sampledOf(target);
		const [lo, hi] = shown(t);
		return o.slice(lo, hi).map((buf, k) => ({
			pts: Float64Array.from(buf),
			closed: p.items[lo + k].closed,
			hole: p.items[lo + k].hole
		}));
	};
	/** A morph from the current shape to `icon` needs regions when either
	*  side is filled, or when the shape in flight already is a region. */
	const needsRegion = (icon) => !rest && regionFlight || paintOf(icon) === "fill" || paintOf(target) === "fill";
	const retarget = (icon, pop) => {
		if (!rest && plan && out && !drawn) {
			t = 0;
			interpPolar(plan, 0, out);
		}
		if (pop || !rest && split) {
			const from = snapshot();
			popBase = rest ? target : null;
			popFrom = paint;
			plan = popPlan(from, sampledOf(icon));
			split = from.length;
			regionFlight = false;
		} else if (needsRegion(icon)) {
			const mod = regionMod;
			plan = rest || !out ? mod.regionPlan(target, icon, strokeWidth) : mod.regionPlanFrom(regionFlight ? snapshot() : serialize(out, closed ?? void 0), icon, strokeWidth);
			regionFlight = true;
			split = 0;
			paintAs("fill");
		} else {
			plan = rest ? planBetween(target, icon) : buildPlan(snapshot(), sampledOf(icon));
			regionFlight = false;
		}
		out = allocOutputs(plan);
		drawn = false;
		closed = plan.items.map((it) => it.closed);
		target = icon;
		rest = false;
	};
	const whenRegion = (icon, run, fallback) => {
		if (regionMod || !rest && split || !needsRegion(icon)) return false;
		const req = {};
		pending = req;
		const give = () => {
			if (dead || pending !== req) return;
			pending = null;
			fallback();
		};
		const load = preloadRegion();
		if (Date.now() - regionSince > REGION_WAIT_MS) {
			give();
			return true;
		}
		const timer = setTimeout(give, REGION_WAIT_MS - (Date.now() - regionSince));
		load.then(() => {
			clearTimeout(timer);
			if (dead || pending !== req) return;
			pending = null;
			run();
		}, () => {
			clearTimeout(timer);
			give();
		});
		return true;
	};
	const setNow = (icon) => {
		stop();
		pending = null;
		target = icon;
		settle();
	};
	/** True when the policy says this morphTo must jump instead of flying. */
	const motionOff = () => {
		if (reducedMotion === "always") return true;
		if (reducedMotion !== "user") return false;
		if (typeof matchMedia === "undefined") return false;
		return matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	};
	const seek = (icon, tt, pop = false) => {
		if (dead) return;
		if (!pop && whenRegion(icon, () => seek(icon, tt), () => seek(icon, tt, true))) return;
		pending = null;
		let reuse = !rest && plan !== null && icon === target;
		if (reuse && split && regionMod && popBase !== null) {
			target = popBase;
			rest = true;
			reuse = false;
		}
		stop();
		spring.v = 0;
		if (!reuse) retarget(icon, pop);
		render(tt);
	};
	const fly = (icon, sp, pop) => {
		if (dead) return;
		if (icon === target && (rest || flying)) {
			pending = null;
			return;
		}
		if (motionOff()) {
			setNow(icon);
			return;
		}
		if (!pop && whenRegion(icon, () => fly(icon, sp, false), () => fly(icon, sp, true))) return;
		pending = null;
		const { k, c } = resolveSpring(sp);
		spring.config(k, c);
		retarget(icon, pop);
		spring.start();
		if (!flying) {
			flying = true;
			addTicker(tick);
		}
	};
	return {
		morphTo: (icon, sp) => fly(icon, sp, false),
		set(icon) {
			if (dead) return;
			setNow(icon);
		},
		seek,
		get progress() {
			return rest ? 1 : t;
		},
		set progress(v) {
			if (!dead) seek(target, v);
		},
		get reducedMotion() {
			return reducedMotion;
		},
		set reducedMotion(v) {
			reducedMotion = v;
		},
		get strokeWidth() {
			return strokeWidth;
		},
		set strokeWidth(v) {
			strokeWidth = v;
		},
		destroy() {
			stop();
			dead = true;
			pending = null;
			plan = null;
			out = null;
			closed = null;
		}
	};
}
//#endregion
  Object.assign(__e, { canonicalD: canonicalD, createMorph: createMorph, preloadRegion: preloadRegion, restAttrs: restAttrs, setRegionLoader: setRegionLoader });

});

__def("controller", function(__e){
const { a: interpPolar, r: allocOutputs } = __r("spring");
const { i: serialize } = __r("normalize");
const { a: buildPlan, t: resampleIcon } = __r("resample");
const { a: paintOf } = __r("region-core");
const { canonicalD: canonicalD, createMorph: createMorph, restAttrs: restAttrs } = __r("dom");
//#region src/dom/controller.ts
/** The endpoint a frozen controlled pair renders at rest at `t` (SSR
*  included), or null mid-way for a stroke pair, interpolated with the pure
*  core. A pair with a fill endpoint scrubs as a region morph, which only the
*  lazy chunk draws: mid-way it renders `from` until the client's first seek. */
function frozenEnd(from, to, t) {
	if (t >= 1) return to;
	if (t <= 0 || paintOf(from) === "fill" || paintOf(to) === "fill") return from;
	return null;
}
/** Frozen shape of the from→to pair at t, using the pure core (SSR-safe).
*  At exact endpoints returns the canonical `d` (real curves, not polyline). */
function frozenD(from, to, t) {
	const end = frozenEnd(from, to, t);
	if (end !== null) return canonicalD(end);
	const plan = buildPlan(resampleIcon(from), resampleIcon(to));
	const out = allocOutputs(plan);
	interpPolar(plan, t, out);
	return serialize(out, plan.items.map((it) => it.closed));
}
/** The initial d is a constant for every binding: computed once from the
*  mount-time props (server and client produce the same string → hydration
*  without mismatch) and from then on only the driver mutates it outside the
*  template. */
function computeInitialD({ icon, from, to, progress }) {
	if (from !== void 0 && to !== void 0) return frozenD(from, to, progress ?? 0);
	const first = icon ?? from ?? to;
	return first !== void 0 ? canonicalD(first) : "";
}
/** Paint attributes of the initial `<path>` (SSR included), a constant like
*  the initial d: a fill icon is filled before any script runs. A frozen
*  stroke pair paints as the endpoint it is nearer to; one with a fill
*  endpoint rests on `from` mid-way, like its d (frozenEnd). */
function computeInitialPaint({ icon, from, to, progress }) {
	if (from !== void 0 && to !== void 0) {
		const t = progress ?? 0;
		return restAttrs(frozenEnd(from, to, t) ?? (t < .5 ? from : to));
	}
	return restAttrs(icon ?? from ?? to);
}
/** Per-instance driver state — the exact logic of the React/Vue bindings
*  (mount, mode watch, controlled seek with re-basing, imperative). Takes the
*  init-time props: they seed the watch baselines so a watcher that fires on
*  mount (Svelte's $effect, unlike Vue's watch) is a no-op. All change
*  detection lives HERE, under tsc — the shells only wire their reactive
*  surface to these methods.
*
*  Lifecycle contract (shared verbatim by the bindings):
*  - Lazy driver: an iconless mount keeps the element and births the driver
*    on the FIRST icon that shows up (prop or imperative). `morphTo` with no
*    driver behaves as `set` — there is nothing to fly from.
*  - Controlled wins: while `from` and `to` are both present the pair owns
*    the path and `icon` changes are ignored; dropping the pair hands the
*    path back to `icon`.
*  - Every exit from controlled mode (imperative call or icon takeover)
*    invalidates the frozen pair, so returning to it re-bases on `from`. */
function createController({ icon, from, to, progress, reducedMotion, strokeWidth }) {
	let el = null;
	let dead = false;
	let morph = null;
	let rm = reducedMotion ?? "never";
	let sw = Number(strokeWidth ?? 2);
	let based = false;
	let pair = null;
	let prevIcon = icon;
	let prevControlled = from !== void 0 && to !== void 0;
	let prevFrom = from;
	let prevTo = to;
	let prevProgress = progress;
	/** Driver birth, lazy included: the first icon to show up creates it. */
	const ensure = (birth) => {
		if (morph) return morph;
		if (dead || !el) return null;
		morph = createMorph(el, birth, {
			reducedMotion: rm,
			strokeWidth: sw
		});
		return morph;
	};
	/** Controlled mode: freeze the pair at `progress` via seek (no spring). */
	const applyPair = (from, to, progress) => {
		const m = morph;
		if (!m) return;
		const t = progress ?? 0;
		if (!pair || pair[0] !== from || pair[1] !== to) {
			pair = [from, to];
			based = false;
		}
		if (t <= 0) {
			m.set(from);
			based = false;
		} else if (t >= 1) {
			m.set(to);
			based = false;
		} else {
			if (!based) {
				m.set(from);
				based = true;
			}
			m.seek(to, t);
		}
	};
	return {
		mount(mountEl, { icon, from, to, progress, reducedMotion, strokeWidth }) {
			el = mountEl;
			rm = reducedMotion ?? rm;
			sw = Number(strokeWidth ?? sw);
			const controlled = from !== void 0 && to !== void 0;
			const initialIcon = icon ?? from ?? to;
			if (initialIcon === void 0) return;
			const m = createMorph(el, controlled ? from : initialIcon, {
				reducedMotion: rm,
				strokeWidth: sw
			});
			morph = m;
			if (controlled) {
				pair = [from, to];
				const t = progress ?? 0;
				if (t <= 0) m.set(from);
				else if (t >= 1) m.set(to);
				else {
					m.seek(to, t);
					based = true;
				}
			}
		},
		destroy() {
			dead = true;
			el = null;
			morph?.destroy();
			morph = null;
			based = false;
			pair = null;
		},
		/** Prop watcher: ONE owner decides per run — the controlled pair while it
		*  is fully present, `icon` otherwise (mount doesn't fire thanks to the
		*  init-time baselines). */
		watch({ icon, from, to, progress, spring, reducedMotion, strokeWidth }) {
			rm = reducedMotion ?? "never";
			sw = Number(strokeWidth ?? 2);
			if (morph) {
				morph.reducedMotion = rm;
				morph.strokeWidth = sw;
			}
			const controlled = from !== void 0 && to !== void 0;
			const left = prevControlled && !controlled;
			const iconChanged = icon !== prevIcon;
			const pairChanged = from !== prevFrom || to !== prevTo || progress !== prevProgress;
			prevControlled = controlled;
			prevIcon = icon;
			prevFrom = from;
			prevTo = to;
			prevProgress = progress;
			if (controlled) {
				if (!pairChanged) return;
				if (!(morph ?? ensure(from))) return;
				applyPair(from, to, progress);
				return;
			}
			if (icon === void 0 || !iconChanged && !left) return;
			pair = null;
			based = false;
			if (morph) morph.morphTo(icon, spring);
			else ensure(icon);
		},
		morphTo(icon, spring) {
			pair = null;
			based = false;
			if (morph) morph.morphTo(icon, spring);
			else ensure(icon);
		},
		set(icon) {
			pair = null;
			based = false;
			if (morph) morph.set(icon);
			else ensure(icon);
		}
	};
}
//#endregion
  Object.assign(__e, { i: frozenEnd, n: computeInitialPaint, r: createController, t: computeInitialD });

});

__def("element", function(__e){
const { n: computeInitialPaint, r: createController, t: computeInitialD } = __r("controller");
//#region src/element/index.ts
const SVG_NS = "http://www.w3.org/2000/svg";
const REACTIVE = [
	"icon",
	"from",
	"to",
	"progress",
	"spring",
	"reducedMotion"
];
const PRESENTATION = /* @__PURE__ */ new Set([
	"size",
	"color",
	"stroke-width",
	"absolute-stroke-width",
	"label"
]);
const Base = typeof HTMLElement === "undefined" ? class {} : HTMLElement;
var MorphIconElement = class extends Base {
	static observedAttributes = [
		"icon",
		"from",
		"to",
		"progress",
		"spring",
		"reduced-motion",
		"size",
		"color",
		"stroke-width",
		"absolute-stroke-width",
		"label"
	];
	#props = {};
	#ctrl = null;
	#path = null;
	#target = null;
	#adopted = false;
	#preConnectDirty = false;
	#size = "24";
	#color = "currentColor";
	#strokeWidth = "2";
	#absoluteStrokeWidth = false;
	#label = null;
	get icon() {
		return this.#props.icon;
	}
	set icon(v) {
		this.#props.icon = v;
		this.#watch();
	}
	get from() {
		return this.#props.from;
	}
	set from(v) {
		this.#props.from = v;
		this.#watch();
	}
	get to() {
		return this.#props.to;
	}
	set to(v) {
		this.#props.to = v;
		this.#watch();
	}
	get progress() {
		return this.#props.progress;
	}
	set progress(v) {
		this.#props.progress = v;
		this.#watch();
	}
	get spring() {
		return this.#props.spring;
	}
	set spring(v) {
		this.#props.spring = v;
		this.#watch();
	}
	get reducedMotion() {
		return this.#props.reducedMotion;
	}
	set reducedMotion(v) {
		this.#props.reducedMotion = v;
		this.#watch();
	}
	morphTo(icon, spring) {
		const ctrl = this.#ctrl;
		if (!ctrl) {
			this.#imperativeBeforeDriver(icon);
			return;
		}
		ctrl.morphTo(icon, spring ?? this.#props.spring);
	}
	set(icon) {
		const ctrl = this.#ctrl;
		if (!ctrl) {
			this.#imperativeBeforeDriver(icon);
			return;
		}
		ctrl.set(icon);
	}
	connectedCallback() {
		for (const key of REACTIVE) this.#upgradeProperty(key);
		if (!this.#path) this.#adoptOrRender();
		if (this.style.display === "") this.style.display = "contents";
		if (this.#path && !this.#ctrl) {
			const path = this.#path;
			const adopted = this.#adopted;
			const gate = adopted && !this.#preConnectDirty;
			this.#adopted = false;
			this.#props.strokeWidth = this.#sw();
			this.#ctrl = createController(this.#props);
			if (gate) {
				let armed = false;
				const gated = { setAttribute(name, value) {
					if (armed) path.setAttribute(name, value);
				} };
				this.#target = gated;
				try {
					this.#ctrl.mount(gated, this.#props);
				} finally {
					armed = true;
				}
			} else {
				if (adopted) for (const k of [
					"fill",
					"stroke",
					"fill-rule"
				]) path.removeAttribute(k);
				this.#ctrl.mount(this.#target ?? path, this.#props);
			}
		}
	}
	disconnectedCallback() {
		this.#ctrl?.destroy();
		this.#ctrl = null;
	}
	attributeChangedCallback(name, _old, value) {
		switch (name) {
			case "icon":
				this.#props.icon = value ?? void 0;
				break;
			case "from":
				this.#props.from = value ?? void 0;
				break;
			case "to":
				this.#props.to = value ?? void 0;
				break;
			case "progress": {
				const n = value === null ? NaN : Number(value);
				this.#props.progress = Number.isFinite(n) ? n : void 0;
				break;
			}
			case "spring":
				this.#props.spring = value ?? void 0;
				break;
			case "reduced-motion":
				this.#props.reducedMotion = value ?? void 0;
				break;
			case "size":
				this.#size = value ?? "24";
				break;
			case "color":
				this.#color = value ?? "currentColor";
				break;
			case "stroke-width":
				this.#strokeWidth = value ?? "2";
				break;
			case "absolute-stroke-width":
				this.#absoluteStrokeWidth = value !== null;
				break;
			case "label": this.#label = value;
		}
		if (!this.#path) return;
		if (PRESENTATION.has(name)) {
			const svg = this.querySelector("svg");
			if (svg) this.#applyPresentation(svg);
			this.#props.strokeWidth = this.#sw();
			this.#ctrl?.watch(this.#props);
			return;
		}
		this.#watch();
	}
	/** A property assigned before the element was defined lands as an own
	*  value that shadows the accessor; re-route it through the setter. */
	#upgradeProperty(key) {
		if (Object.hasOwn(this, key)) {
			const self = this;
			const v = self[key];
			delete self[key];
			self[key] = v;
		}
	}
	#watch() {
		const ctrl = this.#ctrl;
		if (!ctrl) {
			this.#preConnectDirty = true;
			return;
		}
		ctrl.watch(this.#props);
	}
	/** Imperative call before the controller exists: adopt the icon as the
	*  mount state AND exit controlled mode — "every imperative call
	*  invalidates the frozen pair" must hold pre-connect too, or a pending
	*  pair would win the mount and silently discard this call. */
	#imperativeBeforeDriver(icon) {
		this.#props.icon = icon;
		this.#props.from = void 0;
		this.#props.to = void 0;
		this.#preConnectDirty = true;
	}
	/** SSR markup is adopted verbatim (the element never rewrites server bytes
	*  at rest); without it, the element renders its own <svg> like the
	*  framework shells do. */
	#adoptOrRender() {
		const existing = this.querySelector("path");
		if (existing) {
			this.#path = existing;
			this.#adopted = true;
			const p = this.#props;
			if (p.icon === void 0 && p.from === void 0 && p.to === void 0) {
				const d = existing.getAttribute("d");
				const fill = existing.getAttribute("fill");
				if (d) p.icon = fill && fill !== "none" ? [["path", {
					d,
					fill,
					"fill-rule": existing.getAttribute("fill-rule") ?? "nonzero"
				}]] : d;
			}
			return;
		}
		const doc = this.ownerDocument;
		const svg = doc.createElementNS(SVG_NS, "svg");
		svg.setAttribute("xmlns", SVG_NS);
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		this.#applyPresentation(svg);
		const path = doc.createElementNS(SVG_NS, "path");
		path.setAttribute("d", computeInitialD(this.#props));
		for (const [k, v] of Object.entries(computeInitialPaint(this.#props) ?? {})) path.setAttribute(k, v);
		svg.appendChild(path);
		this.appendChild(svg);
		this.#path = path;
	}
	/** The stroke width on the 24 grid, absolute-stroke-width resolved. */
	#sw() {
		return this.#absoluteStrokeWidth ? String(Number(this.#strokeWidth) * 24 / Number(this.#size)) : this.#strokeWidth;
	}
	#applyPresentation(svg) {
		svg.setAttribute("width", this.#size);
		svg.setAttribute("height", this.#size);
		svg.setAttribute("stroke", this.#color);
		svg.setAttribute("color", this.#color);
		svg.setAttribute("stroke-width", this.#sw());
		const label = this.#label;
		let title = svg.querySelector("title");
		if (label) {
			svg.setAttribute("role", "img");
			svg.removeAttribute("aria-hidden");
			if (!title) {
				title = this.ownerDocument.createElementNS(SVG_NS, "title");
				svg.insertBefore(title, svg.firstChild);
			}
			title.textContent = label;
		} else {
			svg.removeAttribute("role");
			svg.setAttribute("aria-hidden", "true");
			title?.remove();
		}
	}
};
let registered = false;
/** Defines `<morph-icon>` (or a custom tag). Idempotent per tag; a no-op
*  without a DOM (safe to call from code that also runs during SSR). */
function defineMorphIcon(tag = "morph-icon") {
	if (typeof customElements === "undefined" || customElements.get(tag)) return;
	customElements.define(tag, registered ? class extends MorphIconElement {} : MorphIconElement);
	registered = true;
}
//#endregion
  Object.assign(__e, { MorphIconElement: MorphIconElement, computeInitialD: computeInitialD, computeInitialPaint: computeInitialPaint, defineMorphIcon: defineMorphIcon });

});

var __element = __r("element");
var __dom = __r("dom");
global.MorphIcons = {
  defineMorphIcon: __element.defineMorphIcon,
  MorphIconElement: __element.MorphIconElement,
  createMorph: __dom.createMorph,
  _version: "2.0.2"
};
})(typeof window !== "undefined" ? window : this);
