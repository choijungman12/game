/* ==========================================================================
   VFX 엔진 — 파티클(콘페티/코인/리본/별) + 화면 연출(플래시·충격파·점수팝업·
   시네마틱 광선·콤보·화면 흔들림·카운트업·FLIP 순위 이동)
   외부 라이브러리 없음. 캔버스 1장 + DOM 오버레이 1장으로 동작.
   ========================================================================== */

const RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const reduced = () => !!RM.matches;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ==========================================================================
   0. FX 오버레이 레이어 (DOM 연출이 붙는 곳)
   ========================================================================== */
let _over = null;
function overlay() {
  if (_over && _over.isConnected) return _over;
  _over = document.getElementById("fx-over");
  if (!_over) {
    _over = document.createElement("div");
    _over.id = "fx-over";
    _over.className = "fx-layer fx-layer--over";
    _over.setAttribute("aria-hidden", "true");
    document.body.append(_over);
  }
  return _over;
}
function addTemp(node, ms) {
  overlay().append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

/* ==========================================================================
   1. 파티클 엔진
   ========================================================================== */
const PALETTE = ["#ffd24a", "#ffe27a", "#34e08a", "#22c55e", "#4b9bff", "#3b82f6", "#ff6b6b", "#c4b5fd", "#fff2c0"];
const GOLD = ["#ffd24a", "#ffe27a", "#f5b301", "#fff3c4", "#e08e00"];

class Particles {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.parts = [];
    this.raining = false;
    this.running = false;
    this.wind = 0;
    this.windT = Math.random() * 100;
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this._start(); });
  }

  _mount() {
    if (this.canvas && this.canvas.isConnected) return true;
    this.canvas = document.getElementById("fx-confetti");
    if (!this.canvas) return false;
    this.ctx = this.canvas.getContext("2d");
    this._resize();
    return true;
  }
  _resize() {
    if (!this.canvas) return;
    const d = DPR();
    this.canvas.width = Math.floor(window.innerWidth * d);
    this.canvas.height = Math.floor(window.innerHeight * d);
  }
  get W() { return this.canvas ? this.canvas.width : 0; }
  get H() { return this.canvas ? this.canvas.height : 0; }

  /* 캡: 저사양/모션 최소화에서 파티클 수를 자동으로 줄임 */
  _cap(n) {
    if (reduced()) return Math.min(n, 12);
    const max = window.innerWidth < 480 ? 260 : 460;
    const room = Math.max(0, max - this.parts.length);
    return Math.min(n, room);
  }

  spawn(n, o = {}) {
    if (!this._mount()) return;
    const d = DPR();
    const count = this._cap(n | 0);
    const colors = o.colors || PALETTE;
    const shapes = o.shapes || ["rect", "circle", "ribbon"];
    const cx = (o.x != null ? o.x : 0.5) * this.W;
    const cy = (o.y != null ? o.y : -0.05) * this.H;
    const spreadX = (o.spread != null ? o.spread : 0.5) * this.W;

    for (let i = 0; i < count; i++) {
      const shape = o.shape || pick(shapes);
      const ang = o.angle != null ? o.angle + rnd(-0.5, 0.5) * (o.arc || 0.9) : rnd(0, Math.PI * 2);
      const spd = (o.speed != null ? o.speed : rnd(4, 13)) * d;
      const useDir = o.angle != null;
      this.parts.push({
        x: cx + (useDir ? rnd(-8, 8) * d : rnd(-0.5, 0.5) * spreadX),
        y: cy + (useDir ? rnd(-8, 8) * d : rnd(-0.02, 0.02) * this.H),
        vx: useDir ? Math.cos(ang) * spd : rnd(-4, 4) * d,
        vy: useDir ? Math.sin(ang) * spd : (o.up ? rnd(-16, -7) : rnd(1.5, 5)) * d,
        g: (o.gravity != null ? o.gravity : rnd(0.16, 0.3)) * d,
        drag: o.drag != null ? o.drag : 0.988,
        size: (o.size != null ? o.size : rnd(5, 12)) * d,
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-0.34, 0.34),
        flut: rnd(0, Math.PI * 2),
        flutV: rnd(0.08, 0.2),
        color: o.color || pick(colors),
        life: o.life || rnd(150, 260),
        maxLife: 0,
        shape,
        text: o.text || null,
        glow: !!o.glow,
      });
      const p = this.parts[this.parts.length - 1];
      p.maxLife = p.life;
    }
    this._start();
  }

  /* ---- 프리셋 ---- */
  burst(o = {}) { this.spawn(o.count || 90, { up: true, spread: 0.7, ...o }); }
  fountain(x = 0.5, o = {}) {
    this.spawn(o.count || 44, { x, y: 0.95, angle: -Math.PI / 2, arc: 0.7, speed: rnd(11, 17), spread: 0.06, ...o });
  }
  /* 좌/우 대포 — 결과 화면용 */
  cannon(side = "left", o = {}) {
    const left = side === "left";
    this.spawn(o.count || 70, {
      x: left ? 0.02 : 0.98, y: 0.86,
      angle: left ? -Math.PI / 3.2 : -Math.PI + Math.PI / 3.2,
      arc: 0.5, speed: rnd(15, 23), size: rnd(6, 13), ...o,
    });
  }
  /* 금화 분수 — 매입/배당/통행료 */
  coins(x = 0.5, y = 0.6, o = {}) {
    this.spawn(o.count || 26, {
      x, y, angle: -Math.PI / 2, arc: 1.1, speed: rnd(9, 15),
      shape: "coin", colors: GOLD, gravity: 0.34, size: rnd(9, 15), glow: true, ...o,
    });
  }
  /* 반짝임 — 1등/레벨업 */
  sparkles(x = 0.5, y = 0.4, o = {}) {
    this.spawn(o.count || 30, { x, y, shape: "star", colors: GOLD, speed: rnd(3, 9), gravity: 0.06, drag: 0.94, size: rnd(7, 15), glow: true, life: 90, ...o });
  }
  rain() { this.raining = true; this._start(); }
  stopRain() { this.raining = false; }
  clear() {
    this.parts.length = 0; this.raining = false;
    if (this.ctx) this.ctx.clearRect(0, 0, this.W, this.H);
  }

  /* 화면 좌표(px)에서 터뜨리기 */
  burstAtPx(px, py, o = {}) {
    if (!this._mount()) return;
    this.spawn(o.count || 30, { x: px / window.innerWidth, y: py / window.innerHeight, up: true, spread: 0.08, ...o });
  }
  burstAtEl(node, o = {}) {
    if (!node || !node.getBoundingClientRect) return;
    const r = node.getBoundingClientRect();
    this.burstAtPx(r.left + r.width / 2, r.top + r.height / 2, o);
  }

  _start() {
    if (this.running || !this.ctx) return;
    this.running = true;
    requestAnimationFrame(() => this._tick());
  }

  _tick() {
    const c = this.ctx;
    if (!c) { this.running = false; return; }
    if (document.hidden) { this.running = false; return; }
    c.clearRect(0, 0, this.W, this.H);

    this.windT += 0.006;
    this.wind = Math.sin(this.windT) * 0.35 * DPR();

    if (this.raining && this.parts.length < 150 && Math.random() < 0.55) {
      this.spawn(2, { y: -0.05, spread: 1, x: Math.random(), size: rnd(5, 11) });
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.vy += p.g;
      p.vx = (p.vx + this.wind * 0.06) * p.drag;
      p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vr; p.flut += p.flutV;
      p.life--;

      if (p.y > this.H + 60 || p.life <= 0 || p.x < -120 || p.x > this.W + 120) { this.parts.splice(i, 1); continue; }

      const fade = Math.min(1, p.life / 42);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = fade;
      if (p.glow) { c.shadowColor = p.color; c.shadowBlur = 12 * DPR(); }
      c.fillStyle = p.color;
      drawShape(c, p);
      c.restore();
    }

    if (this.parts.length || this.raining) requestAnimationFrame(() => this._tick());
    else { this.running = false; c.clearRect(0, 0, this.W, this.H); }
  }
}

function drawShape(c, p) {
  const s = p.size;
  switch (p.shape) {
    case "circle":
      c.beginPath(); c.arc(0, 0, s / 2, 0, Math.PI * 2); c.fill(); break;
    case "ribbon": {
      const w = s * 0.42, h = s * 2.4;
      c.scale(1, Math.cos(p.flut) * 0.8 + 0.25);
      c.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case "coin": {
      const sq = Math.abs(Math.cos(p.flut));
      c.scale(Math.max(0.12, sq), 1);
      c.beginPath(); c.arc(0, 0, s / 2, 0, Math.PI * 2); c.fill();
      c.globalAlpha *= 0.55; c.fillStyle = "#fff6d8";
      c.beginPath(); c.arc(0, 0, s / 3.4, 0, Math.PI * 2); c.fill();
      break;
    }
    case "star": {
      const R = s / 2, r = R * 0.42;
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rad = k % 2 ? r : R;
        const a = (Math.PI / 5) * k - Math.PI / 2;
        k ? c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      c.closePath(); c.fill();
      break;
    }
    case "text":
      c.font = `900 ${s * 1.5}px system-ui, sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(p.text || "?", 0, 0);
      break;
    default: {
      const sq = Math.cos(p.flut) * 0.85 + 0.15;
      c.scale(1, Math.max(0.1, Math.abs(sq)));
      c.fillRect(-s / 2, -s / 2, s, s * 0.66);
    }
  }
}

export const confetti = new Particles();

/* ==========================================================================
   2. 화면 연출 (DOM)
   ========================================================================== */

/* 플래시 — 정답/1등 순간 화면 전체를 살짝 밝힘 */
export function flash(color = "rgba(255,255,255,0.9)", { dur = 480, peak = 0.55 } = {}) {
  if (reduced()) return;
  const n = document.createElement("div");
  n.className = "fx-flash";
  n.style.setProperty("--fx-color", color);
  n.style.setProperty("--fx-dur", dur + "ms");
  n.style.setProperty("--fx-peak", String(peak));
  addTemp(n, dur + 60);
}

/* 비네트 — 오답/함정/보유세 등 부정적 이벤트 */
export function vignette(color = "rgba(239,68,68,0.6)", { dur = 700 } = {}) {
  if (reduced()) return;
  const n = document.createElement("div");
  n.className = "fx-vignette";
  n.style.setProperty("--fx-color", color);
  n.style.setProperty("--fx-dur", dur + "ms");
  addTemp(n, dur + 60);
}

/* 충격파 링 */
export function shockwave(x, y, o = {}) {
  if (reduced()) return;
  const rings = o.rings || 1;
  for (let i = 0; i < rings; i++) {
    const n = document.createElement("div");
    n.className = "fx-shock";
    n.style.left = x + "px"; n.style.top = y + "px";
    n.style.setProperty("--fx-color", o.color || "#ffe27a");
    n.style.setProperty("--fx-size", (o.size || 44) + "px");
    n.style.setProperty("--fx-scale", String(o.scale || 8));
    n.style.setProperty("--fx-w", (o.width || 3) + "px");
    n.style.setProperty("--fx-dur", (o.dur || 720) + "ms");
    n.style.animationDelay = i * 140 + "ms";
    addTemp(n, (o.dur || 720) + i * 140 + 80);
  }
}
export function shockwaveAt(node, o = {}) {
  if (!node || !node.getBoundingClientRect) return;
  const r = node.getBoundingClientRect();
  shockwave(r.left + r.width / 2, r.top + r.height / 2, o);
}

/* 점수 팝업 */
export function pop(text, x, y, o = {}) {
  const n = document.createElement("div");
  n.className = "fx-pop" + (o.size === "big" ? " fx-pop--big" : o.size === "sm" ? " fx-pop--sm" : "");
  n.textContent = text;
  n.style.left = x + "px"; n.style.top = y + "px";
  if (o.color) { n.style.setProperty("--fx-color", o.color); n.style.setProperty("--fx-glow", o.glow || o.color); }
  const dur = o.dur || 1150;
  n.style.setProperty("--fx-dur", dur + "ms");
  addTemp(n, dur + 80);
}
export function popAt(node, text, o = {}) {
  if (!node || !node.getBoundingClientRect) return;
  const r = node.getBoundingClientRect();
  pop(text, r.left + r.width / 2 + (o.dx || 0), r.top + r.height / 2 + (o.dy || 0), o);
}

/* 여러 개를 시차를 두고 올려보내기 (통행료 등) */
export function popSeries(texts, x, y, o = {}) {
  texts.forEach((t, i) => setTimeout(() => pop(t, x + rnd(-24, 24), y, o), i * 130));
}

/* 화면 흔들림 */
export function shake(target, amp = 7, dur = 420) {
  if (reduced()) return;
  const node = target || document.getElementById("app");
  if (!node) return;
  node.style.setProperty("--fx-amp", amp + "px");
  node.style.setProperty("--fx-dur", dur + "ms");
  node.classList.remove("fx-shake");
  void node.offsetWidth;
  node.classList.add("fx-shake");
  setTimeout(() => node.classList.remove("fx-shake"), dur + 40);
}

/* 정답/오답 스탬프 — 카드 위에 도장처럼 찍힘 */
export function stamp(host, text, color) {
  if (!host) return;
  const n = document.createElement("div");
  n.className = "fx-stamp";
  n.textContent = text;
  if (color) n.style.setProperty("--fx-color", color);
  const prevPos = getComputedStyle(host).position;
  if (prevPos === "static") host.style.position = "relative";
  host.append(n);
  setTimeout(() => n.remove(), 960);
}

/* 콤보 배지 */
export function combo(n, label = "COMBO") {
  const box = document.createElement("div");
  box.className = "fx-combo";
  const num = document.createElement("div");
  num.className = "cn"; num.textContent = n + "연속!";
  const lab = document.createElement("div");
  lab.className = "cl"; lab.textContent = label;
  box.append(num, lab);
  document.body.append(box);
  setTimeout(() => box.remove(), 1460);
}

/* 클릭 리플 — 버튼/보기 선택 */
export function ripple(ev, node, color) {
  if (reduced()) return;
  const host = node || ev.currentTarget;
  if (!host) return;
  const r = host.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.1;
  const n = document.createElement("span");
  n.className = "fx-ripple";
  n.style.width = n.style.height = size + "px";
  n.style.left = ((ev.clientX || r.left + r.width / 2) - r.left) + "px";
  n.style.top = ((ev.clientY || r.top + r.height / 2) - r.top) + "px";
  if (color) n.style.setProperty("--fx-color", color);
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.append(n);
  setTimeout(() => n.remove(), 660);
}

/* ---- 시네마틱: 광선 + 스포트라이트 ---- */
let _cine = null;
export function cinematic(on, o = {}) {
  if (!on) {
    if (_cine) {
      _cine.forEach((n) => { n.classList.add("out"); setTimeout(() => n.remove(), 560); });
      _cine = null;
    }
    return;
  }
  if (_cine || reduced()) return;
  const rays = document.createElement("div");
  rays.className = "fx-rays";
  if (o.color) rays.style.setProperty("--fx-color", o.color);
  if (o.y) rays.style.setProperty("--fx-y", o.y);
  const spot = document.createElement("div");
  spot.className = "fx-spot";
  if (o.spotColor) spot.style.setProperty("--fx-color", o.spotColor);
  const layer = overlay();
  layer.append(spot, rays);
  _cine = [rays, spot];
}

/* 화면 전환 와이프 */
export function wipe(color = "#0b1220", dur = 720) {
  if (reduced()) return;
  const n = document.createElement("div");
  n.className = "fx-wipe";
  n.style.setProperty("--fx-color", color);
  n.style.animationDuration = dur + "ms";
  addTemp(n, dur + 60);
}

/* ==========================================================================
   3. 숫자 카운트업 / 순위 FLIP
   ========================================================================== */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function countUp(node, from, to, dur = 900, format) {
  if (!node) return;
  const fmt = format || ((v) => Math.round(v).toLocaleString("ko-KR"));
  if (reduced() || dur <= 0) { node.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    node.textContent = fmt(from + (to - from) * easeOutCubic(k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* FLIP — 리스트 순서가 바뀔 때 행이 미끄러지듯 이동 */
export function flip(container, itemSelector, mutate, o = {}) {
  if (!container) { mutate && mutate(); return; }
  const key = o.key || "key";
  const before = new Map();
  container.querySelectorAll(itemSelector).forEach((n) => {
    const k = n.dataset[key];
    if (k != null) before.set(k, n.getBoundingClientRect().top);
  });
  mutate && mutate();
  if (reduced()) return;
  container.querySelectorAll(itemSelector).forEach((n) => {
    const k = n.dataset[key];
    const y0 = before.get(k);
    if (y0 == null) {
      n.animate([{ opacity: 0, transform: "translateY(14px) scale(0.97)" }, { opacity: 1, transform: "none" }],
        { duration: 380, easing: "cubic-bezier(0.22,1,0.36,1)" });
      return;
    }
    const dy = y0 - n.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    n.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { duration: o.dur || 620, easing: "cubic-bezier(0.22,1,0.36,1)" });
  });
}

/* ==========================================================================
   4. 조합 프리셋 — 게임 이벤트 한 줄 호출
   ========================================================================== */
export const fx = {
  confetti, flash, vignette, shockwave, shockwaveAt, pop, popAt, popSeries,
  shake, stamp, combo, ripple, cinematic, wipe, countUp, flip, reduced,

  /* 정답 */
  correct(node, points) {
    flash("rgba(52,224,138,0.75)", { peak: 0.32, dur: 420 });
    if (node) {
      shockwaveAt(node, { color: "#34e08a", scale: 6, dur: 640 });
      confetti.burstAtEl(node, { count: 26, colors: ["#34e08a", "#7ef0b2", "#ffd24a", "#fff2c0"], speed: 9 });
      if (points) popAt(node, "+" + points, { color: "#7ef0b2", glow: "rgba(34,197,94,0.6)", dy: -26 });
    }
  },
  /* 오답 */
  wrong(node) {
    vignette("rgba(239,68,68,0.55)", { dur: 640 });
    shake(null, 9, 460);
    if (node) shockwaveAt(node, { color: "#ef4444", scale: 4, dur: 520, width: 2 });
  },
  /* 시간 초과 */
  timeout() {
    vignette("rgba(148,163,184,0.5)", { dur: 720 });
    shake(null, 5, 380);
  },
  /* 라운드 1등 */
  champion() {
    cinematic(true, { color: "rgba(255,226,122,0.24)", spotColor: "rgba(255,226,122,0.32)" });
    flash("rgba(255,226,122,0.9)", { peak: 0.5, dur: 620 });
    confetti.burst({ count: 130, colors: GOLD.concat(PALETTE) });
    confetti.cannon("left"); confetti.cannon("right");
    setTimeout(() => confetti.sparkles(0.5, 0.32, { count: 34 }), 260);
  },
  championEnd() { cinematic(false); },
  /* 최종 결과 */
  finale() {
    cinematic(true, { color: "rgba(255,226,122,0.18)", y: "26%" });
    confetti.rain();
    confetti.cannon("left", { count: 90 });
    confetti.cannon("right", { count: 90 });
    setTimeout(() => confetti.stopRain(), 5200);
    setTimeout(() => cinematic(false), 6000);
  },
  /* 돈이 들어옴 */
  money(x = 0.5, y = 0.62, amount) {
    confetti.coins(x, y, { count: 24 });
    if (amount != null) pop("+" + Number(amount).toLocaleString("ko-KR"), x * window.innerWidth, y * window.innerHeight, { color: "#ffd24a" });
  },
  /* 돈이 나감 */
  lose(x = 0.5, y = 0.62, amount) {
    vignette("rgba(239,68,68,0.45)", { dur: 560 });
    if (amount != null) pop("-" + Number(amount).toLocaleString("ko-KR"), x * window.innerWidth, y * window.innerHeight, { color: "#ff6b6b", glow: "rgba(239,68,68,0.55)" });
  },
  /* 함정 등장 */
  trapAlert() {
    vignette("rgba(239,68,68,0.75)", { dur: 900 });
    flash("rgba(239,68,68,0.7)", { peak: 0.38, dur: 380 });
    shake(null, 12, 520);
  },
};

export default fx;
