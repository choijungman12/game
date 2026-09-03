/* ==========================================================================
   데이터 접근 계층 — 문제/설정/참가자 (localStorage 기반, 관리자 수정 반영)
   ========================================================================== */
import { DEFAULT_INDIVIDUAL, DEFAULT_TEAM } from "./questions.data.js";
import { DEFAULT_SETTINGS, LS } from "./config.js";

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

/* ---- 문제 ---- */
function bankKey(mode) { return LS.questions + "." + (mode === "team" ? "team" : "individual"); }

export function getQuestions(mode) {
  const saved = read(bankKey(mode), null);
  if (saved && Array.isArray(saved) && saved.length) return saved;
  return (mode === "team" ? DEFAULT_TEAM : DEFAULT_INDIVIDUAL).map((q) => ({ ...q }));
}
export function saveQuestions(mode, list) { write(bankKey(mode), list); }
export function resetQuestions(mode) {
  try { localStorage.removeItem(bankKey(mode)); } catch (e) {}
  return getQuestions(mode);
}

let _seq = 1;
export function newQuestionId(mode) {
  const p = mode === "team" ? "t" : "i";
  return p + "x" + Date.now().toString(36) + (_seq++);
}

/* ---- 카테고리 ---- */
export function getCategories(mode) {
  const set = new Set();
  getQuestions(mode).forEach((q) => set.add(q.category));
  return [...set];
}

/* ---- 설정 ---- */
export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(LS.settings, {}) };
}
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(LS.settings, next);
  return next;
}

/* ---- 참가자(로컬 아이디) ---- */
export function getPlayer() { return read(LS.player, null); }
export function savePlayer(p) { write(LS.player, p); return p; }
export function clearPlayer() { try { localStorage.removeItem(LS.player); } catch (e) {} }

/* ---- 문제 선택 (설정에 따라 N문항 추림) ---- */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectQuestions(settings, mode = "individual") {
  let pool = getQuestions(mode);
  const cats = settings.categories || [];
  if (cats.length) pool = pool.filter((q) => cats.includes(q.category));
  if (!pool.length) pool = getQuestions(mode); // 필터 결과가 없으면 전체
  const n = Math.min(settings.questionCount || 20, pool.length);
  return shuffle(pool).slice(0, n);
}

/* ---- 통계(정답률 누적, 로컬 데모용) ---- */
export function getStats() { return read(LS.stats, { games: 0, answers: 0, correct: 0, byCat: {} }); }
export function bumpStat(patch) {
  const s = getStats();
  Object.assign(s, patch);
  write(LS.stats, s);
  return s;
}
