/* ==========================================================================
   UI 헬퍼 — DOM 유틸, 마스코트, 콘페티, 토스트, 아바타
   ========================================================================== */

/* ---- DOM ---- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => (n || 0).toLocaleString("ko-KR");
export function vibrate(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

/* ---- 화면 배경 테마 전환 ---- */
export function setSceneTheme(theme) {
  const s = document.getElementById("bg-scene");
  if (s) s.dataset.theme = theme || "";
}

/* ==========================================================================
   마스코트 — 부동산 매니저 캐릭터 (포즈: idle/cheer/point/worry/final)
   실제 3D 캐릭터 이미지가 있으면 assets/mascot-*.png 로 교체하기 쉽게 분리
   ========================================================================== */
export function mascot(pose = "idle", opts = {}) {
  const cls = "mascot " + (opts.size || "") + (opts.class ? " " + opts.class : "");
  return `<div class="${cls}" data-pose="${pose}">${mascotSVG(pose)}</div>`;
}

function mascotSVG(pose) {
  const face = {
    idle:  { eyeL: eye(76, 92), eyeR: eye(112, 92), mouth: smile(94, 108, 16, 6), brow: "" },
    cheer: { eyeL: eyeHappy(76, 90), eyeR: eyeHappy(112, 90), mouth: smile(94, 106, 22, 12), brow: "" },
    point: { eyeL: eye(78, 92), eyeR: eye(114, 92), mouth: smile(96, 108, 14, 5), brow: "" },
    worry: { eyeL: eye(76, 94), eyeR: eye(112, 94), mouth: `<path d="M86 112 q8 -7 16 0" stroke="#7a3b1e" stroke-width="3" fill="none" stroke-linecap="round"/>`, brow: `<path d="M70 84 l12 3 M118 87 l12 -3" stroke="#5b3a2a" stroke-width="3" stroke-linecap="round"/>` },
    final: { eyeL: eyeHappy(76, 90), eyeR: eyeHappy(112, 90), mouth: smile(94, 106, 20, 10), brow: "" },
  }[pose] || {};

  const accessory = {
    cheer: crown(),
    final: crown(),
    worry: hardhat(),
  }[pose] || "";

  const armR = { point: armPoint(), cheer: armCheer(), final: armThumb() }[pose] || armDown();
  const prop = { point: mapSign() }[pose] || "";

  return `<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="마스코트">
    <defs>
      <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2e4a74"/><stop offset="1" stop-color="#1b2f4d"/>
      </linearGradient>
      <linearGradient id="tie" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#34e08a"/><stop offset="1" stop-color="#16a34a"/>
      </linearGradient>
      <radialGradient id="skin" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" stop-color="#ffe0c2"/><stop offset="1" stop-color="#f4c39b"/>
      </radialGradient>
    </defs>
    <ellipse cx="100" cy="198" rx="52" ry="9" fill="rgba(0,0,0,0.28)"/>
    <!-- body -->
    <path d="M52 205 q-4 -66 22 -84 q26 -8 52 0 q26 18 22 84 z" fill="url(#suit)" stroke="#12233b" stroke-width="2"/>
    <!-- shirt V -->
    <path d="M86 122 l14 20 l14 -20 l-4 46 l-20 0 z" fill="#f4f8ff"/>
    <!-- tie -->
    <path d="M100 128 l7 8 l-4 34 l-6 0 l-4 -34 z" fill="url(#tie)" stroke="#0d7a3e" stroke-width="1"/>
    <!-- lapels -->
    <path d="M84 120 l16 22 l-2 8 l-22 -18 z" fill="#243d61"/>
    <path d="M116 120 l-16 22 l2 8 l22 -18 z" fill="#243d61"/>
    ${armDownLeft()}
    ${armR}
    ${prop}
    <!-- neck -->
    <rect x="92" y="112" width="16" height="14" rx="6" fill="url(#skin)"/>
    <!-- head -->
    <circle cx="94" cy="88" r="34" fill="url(#skin)" stroke="#e6a877" stroke-width="1.5"/>
    <!-- ears -->
    <circle cx="61" cy="90" r="6" fill="url(#skin)"/><circle cx="127" cy="90" r="6" fill="url(#skin)"/>
    <!-- hair -->
    <path d="M61 78 q6 -34 34 -34 q30 0 34 32 q-14 -16 -34 -14 q-22 -2 -34 16 z" fill="#3a2a20"/>
    ${face.brow || ""}
    ${face.eyeL || ""} ${face.eyeR || ""}
    <ellipse cx="72" cy="102" rx="6" ry="4" fill="#ff9e7a" opacity="0.5"/>
    <ellipse cx="118" cy="102" rx="6" ry="4" fill="#ff9e7a" opacity="0.5"/>
    ${face.mouth || ""}
    ${accessory}
  </svg>`;
}
function eye(x, y) { return `<g><circle cx="${x}" cy="${y}" r="6.5" fill="#20304a"/><circle cx="${x + 2}" cy="${y - 2}" r="2" fill="#fff"/></g>`; }
function eyeHappy(x, y) { return `<path d="M${x - 7} ${y + 2} q7 -9 14 0" stroke="#20304a" stroke-width="4" fill="none" stroke-linecap="round"/>`; }
function smile(x, y, w, h) { return `<path d="M${x - w} ${y} q${w} ${h * 2} ${w * 2} 0" stroke="#a34a26" stroke-width="4" fill="#c25a2e" stroke-linecap="round"/>`; }
function crown() {
  return `<g transform="translate(66,34)">
    <path d="M0 20 L6 2 L16 14 L28 -2 L40 14 L50 2 L56 20 Z" fill="#ffd24a" stroke="#e08e00" stroke-width="2"/>
    <rect x="0" y="18" width="56" height="8" rx="3" fill="#f5b301"/>
    <circle cx="6" cy="2" r="3" fill="#fff2c0"/><circle cx="28" cy="-2" r="3.5" fill="#fff2c0"/><circle cx="50" cy="2" r="3" fill="#fff2c0"/>
    <circle cx="16" cy="20" r="2.4" fill="#ef4444"/><circle cx="40" cy="20" r="2.4" fill="#3b82f6"/>
  </g>`;
}
function hardhat() {
  return `<g transform="translate(58,40)">
    <path d="M4 24 q34 -30 68 0 z" fill="#f5b301" stroke="#c47a00" stroke-width="2"/>
    <rect x="-2" y="22" width="76" height="7" rx="3" fill="#ffcf4d" stroke="#c47a00" stroke-width="1.5"/>
    <rect x="33" y="-2" width="8" height="26" rx="3" fill="#ffcf4d"/>
  </g>`;
}
function armDownLeft() { return `<path d="M60 138 q-16 12 -14 34 q1 8 9 8 q7 0 8 -8 q2 -20 10 -30 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="56" cy="182" r="7" fill="url(#skin)"/>`; }
function armDown() { return `<path d="M128 138 q16 12 14 34 q-1 8 -9 8 q-7 0 -8 -8 q-2 -20 -10 -30 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="132" cy="182" r="7" fill="url(#skin)"/>`; }
function armPoint() { return `<path d="M126 140 q26 -6 40 -22 q6 -6 0 -12 q-6 -5 -12 1 q-12 12 -30 15 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="168" cy="104" r="8" fill="url(#skin)"/>`; }
function armCheer() { return `<path d="M126 138 q22 -18 26 -42 q2 -8 -6 -9 q-8 -1 -10 7 q-6 22 -20 34 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="150" cy="86" r="8" fill="url(#skin)"/>`; }
function armThumb() { return `<path d="M126 140 q22 -6 30 -20 q5 -8 -3 -12 q-8 -3 -12 5 q-6 10 -22 15 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><g transform="translate(150,100)"><circle r="9" fill="url(#skin)"/><rect x="-2" y="-16" width="6" height="12" rx="3" fill="#f4c39b"/></g>`; }
function mapSign() {
  return `<g transform="translate(24,150) rotate(-8)">
    <rect x="0" y="0" width="46" height="34" rx="5" fill="#12233b" stroke="#34e08a" stroke-width="2"/>
    <path d="M6 8 h34 M6 16 h26 M6 24 h30" stroke="#34e08a" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
    <circle cx="36" cy="26" r="4" fill="#ffd24a"/>
  </g>`;
}

/* ==========================================================================
   콘페티 엔진 (canvas)
   ========================================================================== */
class Confetti {
  constructor() {
    this.canvas = document.getElementById("fx-confetti");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.parts = [];
    this.raining = false;
    this.running = false;
    this.colors = ["#ffd24a", "#34e08a", "#3b82f6", "#ef4444", "#c4b5fd", "#fff2c0"];
    window.addEventListener("resize", () => this._resize());
    this._resize();
  }
  _resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
  }
  _spawn(n, opts = {}) {
    const W = this.canvas.width, cx = (opts.x != null ? opts.x : 0.5) * W;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: cx + (Math.random() - 0.5) * W * (opts.spread || 0.5),
        y: (opts.y != null ? opts.y : -0.05) * this.canvas.height,
        vx: (Math.random() - 0.5) * 8 * devicePixelRatio,
        vy: (Math.random() * 4 + (opts.up ? -14 : 2)) * devicePixelRatio,
        g: (0.18 + Math.random() * 0.12) * devicePixelRatio,
        size: (5 + Math.random() * 7) * devicePixelRatio,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: this.colors[(Math.random() * this.colors.length) | 0],
        life: opts.life || 200,
        shape: Math.random() < 0.5 ? "rect" : "circle",
      });
    }
    this._start();
  }
  burst(opts = {}) { this._spawn(opts.count || 90, { up: true, spread: 0.7, ...opts }); }
  fountain(x = 0.5) { this._spawn(40, { x, up: true, spread: 0.1, y: 0.9 }); }
  rain() { this.raining = true; this._start(); }
  stopRain() { this.raining = false; }
  _start() { if (!this.running && this.ctx) { this.running = true; requestAnimationFrame(() => this._tick()); } }
  _tick() {
    const c = this.ctx; if (!c) return;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.raining && this.parts.length < 120 && Math.random() < 0.5) this._spawn(2, { y: -0.05, spread: 1, x: Math.random() });
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.995; p.life--;
      if (p.y > this.canvas.height + 40 || p.life <= 0) { this.parts.splice(i, 1); continue; }
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.globalAlpha = Math.min(1, p.life / 40);
      if (p.shape === "rect") c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      else { c.beginPath(); c.arc(0, 0, p.size / 2, 0, 7); c.fill(); }
      c.restore();
    }
    if (this.parts.length || this.raining) requestAnimationFrame(() => this._tick());
    else { this.running = false; c.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  }
  clear() { this.parts = []; this.raining = false; if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
}
export const confetti = new Confetti();

/* ==========================================================================
   토스트
   ========================================================================== */
export function toast(msg, type = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const t = el("div", { class: "toast " + (type ? "toast--" + type : ""), html: msg });
  root.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 2200);
}

/* ==========================================================================
   아바타 (이름 기반 이모지 + 색)
   ========================================================================== */
const AV_EMOJI = ["🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐰", "🐻", "🦉", "🐧", "🦄", "🐢", "🐶", "🐱"];
export function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export function avatarEmoji(name) { return AV_EMOJI[hashStr(name || "player") % AV_EMOJI.length]; }
export function avatarColor(name) { const h = hashStr(name || "p") % 360; return `hsl(${h} 60% 45%)`; }
