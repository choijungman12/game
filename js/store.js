/* ==========================================================================
   Room 저장소 — 라이브(여러 명 동시 접속) 세션 동기화
   - LocalDriver : BroadcastChannel + localStorage (같은 브라우저 여러 탭, 데모/테스트용)
   - FirebaseDriver : Realtime Database (실제 여러 휴대폰, config.js의 FIREBASE 설정 시)
   방(room) 상태는 하나의 JSON 객체로 통째 동기화한다.
   ========================================================================== */
import { FIREBASE } from "./config.js";

export function genCode() {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += cs[(Math.random() * cs.length) | 0];
  return s;
}
export function uid() { return "p_" + Math.random().toString(36).slice(2, 9); }

/* ---------------- Local driver ---------------- */
class LocalDriver {
  constructor(code) {
    this.code = code;
    this.key = "notl.room." + code;
    this.chan = ("BroadcastChannel" in window) ? new BroadcastChannel("notl.room." + code) : null;
  }
  _read() { try { return JSON.parse(localStorage.getItem(this.key) || "null"); } catch (e) { return null; } }
  _write(state) { localStorage.setItem(this.key, JSON.stringify(state)); if (this.chan) this.chan.postMessage({ t: Date.now() }); }
  async get() { return this._read(); }
  async set(state) { this._write(state); return state; }
  async update(mutator) {
    const cur = this._read();
    const next = mutator(cur);
    if (next !== undefined) this._write(next);
    return next;
  }
  subscribe(cb) {
    const emit = () => { const s = this._read(); if (s) cb(s); };
    const onStorage = (e) => { if (e.key === this.key) emit(); };
    if (this.chan) this.chan.onmessage = emit;
    window.addEventListener("storage", onStorage);
    emit();
    return () => { window.removeEventListener("storage", onStorage); if (this.chan) this.chan.onmessage = null; };
  }
  dispose() { if (this.chan) this.chan.close(); }
}

/* ---------------- Firebase driver ---------------- */
class FirebaseDriver {
  constructor(code, db, fns) { this.code = code; this.db = db; this.fns = fns; this.ref = fns.ref(db, "rooms/" + code); }
  async get() { const snap = await this.fns.get(this.ref); return snap.exists() ? snap.val() : null; }
  async set(state) { await this.fns.set(this.ref, state); return state; }
  async update(mutator) {
    const res = await this.fns.runTransaction(this.ref, (cur) => {
      const next = mutator(cur);
      return next === undefined ? cur : next;
    });
    return res.snapshot ? res.snapshot.val() : null;
  }
  subscribe(cb) {
    const off = this.fns.onValue(this.ref, (snap) => { const v = snap.val(); if (v) cb(v); });
    return () => off();
  }
  dispose() {}
}

const FB_KEY = "notl.firebase";
const FB_APP_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
const FB_DB_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* 우선순위: 관리자에서 저장한 설정(localStorage) > config.js의 FIREBASE */
export function effectiveFirebase() {
  try {
    const ov = JSON.parse(localStorage.getItem(FB_KEY) || "null");
    if (ov && (ov.databaseURL || ov.apiKey)) return ov;
  } catch (e) {}
  return FIREBASE;
}
export function setFirebaseConfig(cfg) { localStorage.setItem(FB_KEY, JSON.stringify(cfg)); _fb = null; }
export function clearFirebaseConfig() { try { localStorage.removeItem(FB_KEY); } catch (e) {} _fb = null; }

let _fb = null;
async function initFirebase() {
  if (_fb) return _fb;
  const cfg = effectiveFirebase();
  const appMod = await import(FB_APP_URL);
  const dbMod = await import(FB_DB_URL);
  const app = appMod.initializeApp(cfg);
  const db = dbMod.getDatabase(app);
  _fb = { db, fns: dbMod };
  return _fb;
}

export function isLive() { return !!effectiveFirebase(); }
export function driverName() { return effectiveFirebase() ? "firebase" : "local"; }

export async function makeDriver(code) {
  if (effectiveFirebase()) { const { db, fns } = await initFirebase(); return new FirebaseDriver(code, db, fns); }
  return new LocalDriver(code);
}

/* 연결 테스트: 임시 app으로 ping 쓰기/읽기/삭제 */
export async function testFirebaseConfig(cfg) {
  try {
    const appMod = await import(FB_APP_URL);
    const dbMod = await import(FB_DB_URL);
    const name = "notl_test_" + Math.random().toString(36).slice(2, 7);
    const app = appMod.initializeApp(cfg, name);
    const db = dbMod.getDatabase(app);
    const r = dbMod.ref(db, "__notl_ping__/" + name);
    await dbMod.set(r, { ok: true });
    const snap = await dbMod.get(r);
    try { await dbMod.remove(r); } catch (e) {}
    try { await appMod.deleteApp(app); } catch (e) {}
    return { ok: !!(snap && snap.exists()) };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}

/* ---------------- Room (드라이버 위 얇은 API) ---------------- */
export class Room {
  constructor(driver, code) { this.driver = driver; this.code = code; this._unsub = null; }
  static async open(code) { return new Room(await makeDriver(code), code); }

  async create(state) { return this.driver.set({ ...state, code: this.code, createdAt: Date.now() }); }
  async get() { return this.driver.get(); }
  async update(mutator) { return this.driver.update(mutator); }
  onChange(cb) { this._unsub = this.driver.subscribe(cb); return this._unsub; }
  dispose() { if (this._unsub) this._unsub(); this.driver.dispose && this.driver.dispose(); }

  /* 참가자 입장 */
  async join(player) {
    return this.update((room) => {
      if (!room) return room;
      room.players = room.players || {};
      room.players[player.id] = {
        id: player.id, name: player.name, phone: player.phone || "",
        joinedAt: Date.now(), score: 0, correctCount: 0, answers: {},
      };
      return room;
    });
  }
  /* 답안 제출 (플레이어) */
  async submit(pid, qIndex, choice, elapsed) {
    return this.update((room) => {
      if (!room || !room.players || !room.players[pid]) return room;
      room.players[pid].answers = room.players[pid].answers || {};
      if (room.players[pid].answers[qIndex]) return room; // 중복 방지(첫 클릭만)
      room.players[pid].answers[qIndex] = { choice, elapsed, at: Date.now() };
      return room;
    });
  }
}
