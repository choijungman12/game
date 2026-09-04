/* ==========================================================================
   UI 헬퍼 — DOM 유틸, 씬 테마/액센트, 마스코트, 토스트, 아바타
   파티클/화면 연출은 js/fx.js 로 분리 (confetti 는 하위호환으로 재수출)
   ========================================================================== */
import { confetti as _confetti, ripple as _ripple } from "./fx.js";

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

/* 파티클 엔진 재수출 (기존 import 경로 유지) */
export const confetti = _confetti;
export const ripple = _ripple;

/* ==========================================================================
   씬 테마 + 액센트 컬러
   ========================================================================== */
export function setSceneTheme(theme) {
  const s = document.getElementById("bg-scene");
  if (s) s.dataset.theme = theme || "";
  document.documentElement.dataset.scene = theme || "";
}

/* 문항 카테고리 색으로 UI 전체 액센트를 물들임 */
export function setAccent(hex) {
  const root = document.documentElement;
  if (!hex) { root.style.removeProperty("--accent"); root.style.removeProperty("--accent-2"); root.style.removeProperty("--accent-glow"); root.style.removeProperty("--accent-ink"); return; }
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-2", shade(hex, -0.32));
  root.style.setProperty("--accent-glow", rgba(hex, 0.45));
  root.style.setProperty("--accent-ink", luminance(hex) > 0.55 ? "#0b1220" : "#f4f8ff");
}

function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; }
export function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return "#" + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("");
}
function luminance(hex) { const { r, g, b } = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

/* ==========================================================================
   마스코트 — 부동산 매니저 캐릭터
   포즈: idle / cheer / point / worry / final / think / money
   ========================================================================== */
export function mascot(pose = "idle", opts = {}) {
  const cls = "mascot " + (opts.size || "") + (opts.class ? " " + opts.class : "") + (opts.glow ? " mascot--glow" : "");
  return `<div class="${cls}" data-pose="${pose}">${mascotSVG(pose)}</div>`;
}

/* 마스코트 + 말풍선 한 줄 */
export function mascotSay(text, pose = "point", opts = {}) {
  return el("div", { class: "mascot-row" + (opts.reverse ? " reverse" : "") },
    el("div", { html: mascot(pose, { size: opts.size || "sm", class: "idle" }) }),
    el("div", { class: "speech" }, text)
  );
}

function mascotSVG(pose) {
  const face = {
    idle:  { eyeL: eye(76, 92), eyeR: eye(112, 92), mouth: smile(94, 108, 16, 6), brow: "" },
    cheer: { eyeL: eyeHappy(76, 90), eyeR: eyeHappy(112, 90), mouth: smile(94, 106, 22, 12), brow: "" },
    point: { eyeL: eye(78, 92), eyeR: eye(114, 92), mouth: smile(96, 108, 14, 5), brow: "" },
    think: { eyeL: eyeLook(76, 92), eyeR: eyeLook(112, 92), mouth: `<path d="M88 110 h14" stroke="#a34a26" stroke-width="4" stroke-linecap="round"/>`, brow: `<path d="M68 82 q8 -5 16 -1 M106 81 q8 -4 16 1" stroke="#5b3a2a" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    money: { eyeL: eyeStar(76, 91), eyeR: eyeStar(112, 91), mouth: smile(94, 107, 20, 11), brow: "" },
    worry: { eyeL: eye(76, 94), eyeR: eye(112, 94), mouth: `<path d="M86 112 q8 -7 16 0" stroke="#7a3b1e" stroke-width="3" fill="none" stroke-linecap="round"/>`, brow: `<path d="M70 84 l12 3 M118 87 l12 -3" stroke="#5b3a2a" stroke-width="3" stroke-linecap="round"/>` },
    final: { eyeL: eyeHappy(76, 90), eyeR: eyeHappy(112, 90), mouth: smile(94, 106, 20, 10), brow: "" },
  }[pose] || {};

  const accessory = { cheer: crown(), final: crown(), worry: hardhat() }[pose] || "";
  const armR = { point: armPoint(), cheer: armCheer(), final: armThumb(), money: armCoin(), think: armThink() }[pose] || armDown();
  const prop = { point: mapSign(), think: mapSign() }[pose] || "";
  const spark = (pose === "cheer" || pose === "final" || pose === "money") ? sparkles() : "";

  return `<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="마스코트">
    <defs>
      <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#355480"/><stop offset="1" stop-color="#182b47"/>
      </linearGradient>
      <linearGradient id="tie" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#34e08a"/><stop offset="1" stop-color="#16a34a"/>
      </linearGradient>
      <radialGradient id="skin" cx="0.42" cy="0.34" r="0.75">
        <stop offset="0" stop-color="#ffe8d0"/><stop offset="1" stop-color="#f2bd92"/>
      </radialGradient>
      <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a352a"/><stop offset="1" stop-color="#2b1e17"/>
      </linearGradient>
      <radialGradient id="rim" cx="0.5" cy="0.2" r="0.8">
        <stop offset="0.6" stop-color="rgba(255,255,255,0)"/><stop offset="1" stop-color="rgba(150,200,255,0.35)"/>
      </radialGradient>
    </defs>
    <ellipse cx="100" cy="198" rx="52" ry="9" fill="rgba(0,0,0,0.3)"/>
    <!-- body -->
    <path d="M52 205 q-4 -66 22 -84 q26 -8 52 0 q26 18 22 84 z" fill="url(#suit)" stroke="#12233b" stroke-width="2"/>
    <!-- shirt V -->
    <path d="M86 122 l14 20 l14 -20 l-4 46 l-20 0 z" fill="#f4f8ff"/>
    <!-- tie -->
    <path d="M100 128 l7 8 l-4 34 l-6 0 l-4 -34 z" fill="url(#tie)" stroke="#0d7a3e" stroke-width="1"/>
    <!-- lapels -->
    <path d="M84 120 l16 22 l-2 8 l-22 -18 z" fill="#2a456e"/>
    <path d="M116 120 l-16 22 l2 8 l22 -18 z" fill="#2a456e"/>
    <!-- pocket square -->
    <path d="M124 138 l10 -3 l2 6 l-10 3 z" fill="#ffd24a" opacity="0.9"/>
    ${armDownLeft()}
    ${armR}
    ${prop}
    <!-- neck -->
    <rect x="92" y="112" width="16" height="14" rx="6" fill="#e9b184"/>
    <!-- head -->
    <circle cx="94" cy="88" r="34" fill="url(#skin)" stroke="#e0a074" stroke-width="1.5"/>
    <circle cx="94" cy="88" r="34" fill="url(#rim)"/>
    <!-- ears -->
    <circle cx="61" cy="90" r="6" fill="url(#skin)"/><circle cx="127" cy="90" r="6" fill="url(#skin)"/>
    <!-- hair -->
    <path d="M61 78 q6 -34 34 -34 q30 0 34 32 q-14 -16 -34 -14 q-22 -2 -34 16 z" fill="url(#hair)"/>
    <path d="M70 62 q14 -12 32 -8" stroke="rgba(255,255,255,0.22)" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${face.brow || ""}
    <g class="m-eyes">${face.eyeL || ""} ${face.eyeR || ""}</g>
    <ellipse cx="72" cy="102" rx="6.5" ry="4" fill="#ff9e7a" opacity="0.5"/>
    <ellipse cx="118" cy="102" rx="6.5" ry="4" fill="#ff9e7a" opacity="0.5"/>
    ${face.mouth || ""}
    ${accessory}
    ${spark}
  </svg>`;
}
function eye(x, y) { return `<g><circle cx="${x}" cy="${y}" r="6.8" fill="#1b2a42"/><circle cx="${x + 2.2}" cy="${y - 2.2}" r="2.2" fill="#fff"/><circle cx="${x - 2}" cy="${y + 2.4}" r="1" fill="rgba(255,255,255,0.6)"/></g>`; }
function eyeHappy(x, y) { return `<path d="M${x - 7} ${y + 2} q7 -9 14 0" stroke="#1b2a42" stroke-width="4" fill="none" stroke-linecap="round"/>`; }
function eyeLook(x, y) { return `<g><circle cx="${x}" cy="${y}" r="6.8" fill="#1b2a42"/><circle cx="${x + 3}" cy="${y - 3}" r="2.2" fill="#fff"/></g>`; }
function eyeStar(x, y) {
  return `<g fill="#ffd24a"><path d="M${x} ${y - 8} l2.4 5.2 l5.6 .8 l-4 4 l1 5.6 l-5 -2.6 l-5 2.6 l1 -5.6 l-4 -4 l5.6 -.8 z"/></g>`;
}
function smile(x, y, w, h) { return `<path d="M${x - w} ${y} q${w} ${h * 2} ${w * 2} 0" stroke="#a34a26" stroke-width="4" fill="#c25a2e" stroke-linecap="round"/>`; }
function crown() {
  return `<g transform="translate(66,34)" class="m-crown">
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
function sparkles() {
  return `<g class="m-spark" fill="#ffe27a">
    <path d="M164 44 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" opacity="0.95"/>
    <path d="M34 68 l2.2 5 l5 2.2 l-5 2.2 l-2.2 5 l-2.2 -5 l-5 -2.2 l5 -2.2 z" opacity="0.8"/>
    <path d="M150 128 l1.8 4 l4 1.8 l-4 1.8 l-1.8 4 l-1.8 -4 l-4 -1.8 l4 -1.8 z" opacity="0.7"/>
  </g>`;
}
function armDownLeft() { return `<path d="M60 138 q-16 12 -14 34 q1 8 9 8 q7 0 8 -8 q2 -20 10 -30 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="56" cy="182" r="7" fill="url(#skin)"/>`; }
function armDown() { return `<path d="M128 138 q16 12 14 34 q-1 8 -9 8 q-7 0 -8 -8 q-2 -20 -10 -30 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="132" cy="182" r="7" fill="url(#skin)"/>`; }
function armPoint() { return `<path d="M126 140 q26 -6 40 -22 q6 -6 0 -12 q-6 -5 -12 1 q-12 12 -30 15 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="168" cy="104" r="8" fill="url(#skin)"/>`; }
function armCheer() { return `<path d="M126 138 q22 -18 26 -42 q2 -8 -6 -9 q-8 -1 -10 7 q-6 22 -20 34 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="150" cy="86" r="8" fill="url(#skin)"/>`; }
function armThumb() { return `<path d="M126 140 q22 -6 30 -20 q5 -8 -3 -12 q-8 -3 -12 5 q-6 10 -22 15 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><g transform="translate(150,100)"><circle r="9" fill="url(#skin)"/><rect x="-2" y="-16" width="6" height="12" rx="3" fill="#f4c39b"/></g>`; }
function armThink() { return `<path d="M126 142 q18 -4 22 -18 q3 -9 -5 -11 q-8 -2 -10 6 q-3 9 -16 12 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/><circle cx="120" cy="106" r="8" fill="url(#skin)"/>`; }
function armCoin() {
  return `<path d="M126 138 q22 -14 28 -34 q3 -8 -5 -10 q-8 -2 -11 6 q-5 18 -18 28 z" fill="url(#suit)" stroke="#12233b" stroke-width="1.5"/>
    <circle cx="152" cy="94" r="8" fill="url(#skin)"/>
    <g transform="translate(152,74)"><circle r="11" fill="#ffd24a" stroke="#e08e00" stroke-width="2"/><text x="0" y="5" font-size="13" font-weight="900" text-anchor="middle" fill="#8a5b00">₩</text></g>`;
}
function mapSign() {
  return `<g transform="translate(24,150) rotate(-8)">
    <rect x="0" y="0" width="46" height="34" rx="5" fill="#12233b" stroke="#34e08a" stroke-width="2"/>
    <path d="M6 8 h34 M6 16 h26 M6 24 h30" stroke="#34e08a" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
    <circle cx="36" cy="26" r="4" fill="#ffd24a"/>
  </g>`;
}

/* ==========================================================================
   토스트
   ========================================================================== */
const TOAST_ICON = { ok: "✅", err: "⚠️", info: "💡", gold: "🏆" };
export function toast(msg, type = "", opts = {}) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const icon = opts.icon !== undefined ? opts.icon : TOAST_ICON[type];
  const t = el("div", { class: "toast " + (type ? "toast--" + type : "") });
  if (icon) t.append(el("span", { class: "t-ic" }, icon));
  t.append(el("span", { class: "t-msg", html: msg }));
  root.append(t);
  const life = opts.duration || 2200;
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, life);
  return t;
}

/* ==========================================================================
   아바타 (이름 기반 이모지 + 색)
   ========================================================================== */
const AV_EMOJI = ["🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐰", "🐻", "🦉", "🐧", "🦄", "🐢", "🐶", "🐱"];
export function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export function avatarEmoji(name) { return AV_EMOJI[hashStr(name || "player") % AV_EMOJI.length]; }
export function avatarColor(name) { const h = hashStr(name || "p") % 360; return `hsl(${h} 60% 45%)`; }
/* 이름별 고유 그라데이션 링 — 리더보드/헤더 아바타용 */
export function avatarStyle(name) {
  const h = hashStr(name || "p") % 360;
  return { background: `linear-gradient(140deg, hsl(${h} 62% 42%), hsl(${(h + 48) % 360} 58% 26%))`,
           boxShadow: `0 0 0 1px hsl(${h} 60% 55% / 0.5), 0 6px 16px hsl(${h} 60% 20% / 0.6)` };
}
