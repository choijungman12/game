/* ==========================================================================
   라이브 멀티플레이 — 호스트(관리자) + 참가자(휴대폰)
   Room 저장소(Local/Firebase) 위에서 실시간 진행.
   ========================================================================== */
import { Room, genCode, uid, driverName } from "./store.js";
import { getSettings, selectQuestions, getPlayer, savePlayer } from "./data.js";
import { scoreRound, rankPlayers } from "./engine.js";
import { el, esc, fmt, toast, confetti, mascot, avatarEmoji, setSceneTheme, setAccent, vibrate } from "./ui.js";
import { fx } from "./fx.js";
import { audio, sfx } from "./audio.js";
import { makeQR } from "./qr.js";
import { catMeta } from "./config.js";
import { buildQuestion, buildReveal, buildFinal } from "./screens.js";

const KEYS = ["A", "B", "C", "D"];

/* ==========================================================================
   호스트 패널 (관리자 콘솔에 마운트)
   ========================================================================== */
const ACTIVE_KEY = "notl.hostcode";

export function mountHostPanel(host) {
  const active = localStorage.getItem(ACTIVE_KEY);
  if (active) { resumeHost(host, active); return; }
  renderStartCard(host);
}

function renderStartCard(host) {
  host.innerHTML = "";
  const settings = getSettings();
  const startCard = el("div", {},
    el("p", { class: "hint mb-8" }, `동기화 방식: ${driverName() === "firebase" ? "Firebase (여러 기기 접속 가능)" : "로컬(같은 브라우저 여러 탭 — 테스트용). 실제 여러 휴대폰 접속은 ‘연동 설정’에서 무료 Firebase를 연결하세요."}`),
    el("div", { class: "grid cols-2", style: { alignItems: "start" } },
      el("div", {},
        el("div", { class: "field" }, el("label", {}, "문제 수"), roLabel(settings.questionCount + "문항")),
        el("div", { class: "field" }, el("label", {}, "제한 시간"), roLabel(settings.timeLimit + "초")),
        el("div", { class: "field" }, el("label", {}, "카테고리"), roLabel((settings.categories && settings.categories.length) ? settings.categories.join(", ") : "전체")),
        el("button", { class: "btn green", onClick: () => startHost(host) }, "📡 라이브 세션 시작")),
      el("div", { class: "hint" }, "‘게임 설정’에서 문항 수·시간·카테고리를 먼저 조정한 뒤 시작하세요. 시작하면 QR과 참가자 대기실이 나타납니다.")));
  host.append(startCard);
}
function roLabel(v) { return el("div", { style: { padding: "10px 12px", background: "#f1f5f9", borderRadius: "10px", fontWeight: "700" } }, v); }
function joinUrlFor(code) { const u = new URL(location.href); u.pathname = u.pathname.replace(/admin\.html$/, "index.html"); u.hash = ""; u.search = "?room=" + code; return u.toString(); }
function clock(ms) { try { return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

async function startHost(host) {
  const settings = getSettings();
  const questions = selectQuestions(settings, "individual");
  const code = genCode();
  const hostId = "host_" + uid();
  const room = await Room.open(code);
  await room.create({
    status: "lobby", mode: "individual", settings, hostId,
    questions: questions.map((q) => ({ id: q.id, category: q.category, question: q.question, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation, difficulty: q.difficulty })),
    currentIndex: -1, questionStartAt: 0, players: {}, roundResults: {},
  });
  localStorage.setItem(ACTIVE_KEY, code);
  openHostSession(host, room, code);
}

async function resumeHost(host, code) {
  host.innerHTML = "";
  host.append(el("div", { class: "hint" }, "진행 중인 세션을 불러오는 중..."));
  const room = await Room.open(code);
  const cur = await room.get();
  if (!cur) { localStorage.removeItem(ACTIVE_KEY); renderStartCard(host); return; }
  openHostSession(host, room, code);
}

function openHostSession(host, room, code) {
  const url = joinUrlFor(code);
  host.innerHTML = "";
  const qrBox = el("div", { class: "qr-admin" });
  const codeEl = el("div", { style: { fontSize: "34px", fontWeight: "900", letterSpacing: "6px", color: "var(--a-brand)" } }, code);
  const lobby = el("div", { class: "roster" });
  const countEl = el("span", { id: "lobby-count", class: "tag blue" }, "0명 입장");
  const controls = el("div", { class: "mt-16", style: { display: "flex", gap: "10px", flexWrap: "wrap" } });
  const stage = el("div", { class: "mt-16" });

  host.append(
    el("div", { class: "grid cols-2", style: { alignItems: "start" } },
      el("div", { style: { textAlign: "center" } },
        qrBox,
        el("div", { class: "hint", style: { marginTop: "8px" } }, "휴대폰으로 QR 스캔 → 이름·휴대폰 입력 → 입장"),
        codeEl,
        el("div", { class: "hint", style: { marginTop: "4px", wordBreak: "break-all" } }, url)),
      el("div", {},
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } },
          el("h2", { style: { margin: 0 } }, "참가자 대기실"), countEl),
        lobby)),
    el("div", { class: "hint", style: { marginTop: "10px" } }, "모든 참가자가 입장하면 아래 ‘게임 시작’을 누르세요. 관리자 페이지를 벗어났다 돌아와도 세션은 유지됩니다."),
    controls, stage);
  makeQR(qrBox, url, { cellSize: 5 });

  let state = null;
  const startBtn = el("button", { class: "btn green", onClick: () => hostStart() }, "▶ 게임 시작");
  const revealBtn = el("button", { class: "btn gold", onClick: () => hostReveal(), disabled: true }, "정답 공개");
  const nextBtn = el("button", { class: "btn blue", onClick: () => hostNext(), disabled: true }, "다음 문제 →");
  const endBtn = el("button", { class: "btn red", onClick: () => hostEnd() }, "종료");
  controls.append(startBtn, revealBtn, nextBtn, endBtn);

  function syncControls() {
    if (!state) return;
    const st = state.status;
    startBtn.disabled = st !== "lobby";
    const revealed = !!(state.roundResults && state.roundResults[state.currentIndex]);
    revealBtn.disabled = st !== "question" || revealed;
    nextBtn.disabled = st !== "reveal";
  }

  room.onChange((s) => { state = s; renderHost(); });

  function renderHost() {
    if (!state) return;
    const players = Object.values(state.players || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    countEl.textContent = players.length + "명 입장";
    syncControls();
    lobby.innerHTML = "";
    if (!players.length) lobby.append(el("div", { class: "roster-empty" }, "아직 입장한 참가자가 없습니다.\nQR을 스캔해 이름·휴대폰을 입력하면 실시간으로 표시됩니다."));
    players.forEach((p, i) => lobby.append(el("div", { class: "roster-item" },
      el("span", { class: "ri-no" }, String(i + 1)),
      el("span", { class: "ri-av" }, avatarEmoji(p.name)),
      el("div", { class: "ri-info" },
        el("div", { class: "ri-name" }, esc(p.name)),
        el("div", { class: "ri-phone" }, p.phone ? ("📞 " + esc(p.phone)) : "번호 미입력")),
      el("span", { class: "ri-time" }, p.joinedAt ? clock(p.joinedAt) : "")
    )));

    if (state.status === "lobby") { stage.innerHTML = ""; return; }
    if (state.status === "ended") {
      stage.innerHTML = "";
      const ranked = rankPlayers(players.map((p) => ({ ...p })));
      stage.append(el("div", { class: "card" }, el("h2", {}, "🏁 최종 순위"),
        el("table", { class: "table" }, el("tbody", {}, ...ranked.map((p, i) =>
          el("tr", {},
            el("td", { style: { width: "40px" } }, ["🥇", "🥈", "🥉"][i] || String(i + 1)),
            el("td", {}, esc(p.name)),
            el("td", { class: "hint" }, p.phone ? esc(p.phone) : ""),
            el("td", { style: { width: "84px" } }, el("b", {}, fmt(p.score) + "점"))))))));
      return;
    }
    const q = state.questions[state.currentIndex];
    if (!q) return;
    stage.innerHTML = "";
    const answered = players.filter((p) => p.answers && p.answers[state.currentIndex]).length;
    const revealed = !!(state.roundResults && state.roundResults[state.currentIndex]);
    stage.append(el("div", { class: "card" },
      el("div", { class: "row", style: { display: "flex", justifyContent: "space-between", marginBottom: "10px" } },
        el("span", { class: "tag " + tagCls(q.category) }, `${state.currentIndex + 1} / ${state.questions.length} · ${q.category}`),
        el("span", { class: "tag blue" }, `응답 ${answered}/${players.length}`)),
      el("div", { style: { fontSize: "18px", fontWeight: "800", marginBottom: "12px" } }, q.question),
      el("div", {}, q.options.map((o, i) => el("div", {
        style: { padding: "10px 14px", borderRadius: "10px", marginBottom: "6px", fontWeight: "700",
          background: revealed && i === q.answerIndex ? "#e7f7ee" : "#f1f5f9",
          border: revealed && i === q.answerIndex ? "2px solid #22c55e" : "1px solid var(--a-line)" } },
        `${KEYS[i]}. ${esc(o)}`)))));

    if (revealed) {
      const rr = state.roundResults[state.currentIndex];
      const winner = rr.winner ? players.find((p) => p.id === rr.winner) : null;
      const ranked = rankPlayers(players.map((p) => ({ ...p })));
      stage.append(el("div", { class: "card mt-16" },
        winner ? el("div", { class: "tag gold", style: { marginBottom: "10px" } }, `🏆 이번 라운드 1등: ${esc(winner.name)}`) : el("div", { class: "hint mb-8" }, "정답자가 없습니다."),
        el("table", { class: "table" }, el("tbody", {}, ...ranked.slice(0, 8).map((p, i) =>
          el("tr", {}, el("td", { style: { width: "40px" } }, ["🥇", "🥈", "🥉"][i] || String(i + 1)), el("td", {}, esc(p.name)), el("td", { style: { width: "80px" } }, el("b", {}, fmt(p.score) + "점"))))))));
    }
  }

  async function hostStart() {
    await room.update((s) => { if (!s) return s; s.status = "question"; s.currentIndex = 0; s.questionStartAt = Date.now(); return s; });
    startBtn.disabled = true; revealBtn.disabled = false; nextBtn.disabled = true;
    autoRevealTimer();
    sfx("start");
  }
  let autoT;
  function autoRevealTimer() {
    clearTimeout(autoT);
    autoT = setTimeout(() => { if (state && !(state.roundResults && state.roundResults[state.currentIndex])) hostReveal(); }, (state.settings.timeLimit + 1) * 1000);
  }
  async function hostReveal() {
    clearTimeout(autoT);
    await room.update((s) => {
      if (!s || (s.roundResults && s.roundResults[s.currentIndex])) return s;
      const q = s.questions[s.currentIndex];
      const players = Object.values(s.players || {});
      const subs = players.map((p) => { const a = (p.answers || {})[s.currentIndex] || {}; return { pid: p.id, choice: a.choice == null ? null : a.choice, elapsed: a.elapsed == null ? null : a.elapsed }; });
      const { results, winner } = scoreRound(q, subs, s.settings);
      players.forEach((p) => {
        const r = results[p.id];
        if (r) { p.score = (p.score || 0) + r.total; if (r.correct) p.correctCount = (p.correctCount || 0) + 1; if (r.answered) p.answeredCount = (p.answeredCount || 0) + 1; }
      });
      s.roundResults = s.roundResults || {};
      s.roundResults[s.currentIndex] = { winner, results };
      s.status = "reveal";
      return s;
    });
    revealBtn.disabled = true; nextBtn.disabled = false;
    sfx("correct");
  }
  async function hostNext() {
    const last = state.currentIndex >= state.questions.length - 1;
    if (last) return hostEnd();
    await room.update((s) => { if (!s) return s; s.currentIndex += 1; s.status = "question"; s.questionStartAt = Date.now(); return s; });
    revealBtn.disabled = false; nextBtn.disabled = true;
    autoRevealTimer();
    sfx("click");
  }
  async function hostEnd() {
    clearTimeout(autoT);
    await room.update((s) => { if (!s) return s; s.status = "ended"; return s; });
    localStorage.removeItem(ACTIVE_KEY);
    revealBtn.disabled = true; nextBtn.disabled = true; startBtn.disabled = true;
    fx.finale(); sfx("win");
    toast("게임을 종료했습니다", "ok");
    controls.innerHTML = "";
    controls.append(el("button", { class: "btn green", onClick: () => renderStartCard(host) }, "🔄 새 세션 시작"));
  }
}
function tagCls(cat) { const m = catMeta(cat); return { "chip--blue": "blue", "chip--green": "green", "chip--gold": "gold", "chip--red": "red", "chip--purple": "purple" }[m.chip] || "gray"; }

/* ==========================================================================
   참가자 (index.html?room=CODE)
   ========================================================================== */
export async function startLivePlayer({ code, mount, go }) {
  setSceneTheme("hero");
  setAccent(null);
  const prev = getPlayer();
  const me = { id: (prev && prev.id) || uid(), name: prev ? prev.name : "", phone: prev ? prev.phone : "" };

  // 입장 폼
  await new Promise((res) => {
    const s = el("div", { class: "screen" });
    s.append(el("div", { class: "brand", style: { marginBottom: "12px" } }, el("div", { class: "brand-title", style: { fontSize: "24px" } }, "게임에 참여하세요!")));
    s.append(el("div", { class: "text-c text-mut", style: { marginBottom: "14px" } }, `방 코드 `, el("b", { style: { color: "var(--gold-300)", letterSpacing: "3px" } }, code)));
    const name = el("input", { class: "input", placeholder: "이름을 입력하세요", maxlength: "12", value: me.name });
    const phone = el("input", { class: "input", placeholder: "휴대폰 번호 (선택)", value: me.phone });
    s.append(el("div", { class: "card" }, el("div", { class: "field" }, name), el("div", { class: "field" }, phone),
      el("button", { class: "btn btn--green btn--lg", onClick: () => {
        if (!name.value.trim()) { toast("이름을 입력해주세요", "err"); return; }
        me.name = name.value.trim(); me.phone = phone.value.trim();
        savePlayer(me); sfx("start"); res();
      } }, "🎮 입장하기")));
    mount(s);
  });

  const room = await Room.open(code);
  await room.join(me);
  audio.startMusic("quiz");

  let lastIndex = -2, lastStatus = "", view = null, timer = null, myAnswered = false;

  room.onChange((state) => {
    if (!state) { showWaiting("호스트를 기다리는 중..."); return; }
    if (state.status === "lobby") { showWaiting("곧 게임이 시작됩니다!"); lastStatus = "lobby"; return; }
    if (state.status === "question") {
      if (state.currentIndex !== lastIndex) { lastIndex = state.currentIndex; myAnswered = false; renderQ(state); }
      lastStatus = "question"; return;
    }
    if (state.status === "reveal") {
      if (lastStatus !== "reveal" || state.currentIndex !== lastIndex) { lastStatus = "reveal"; lastIndex = state.currentIndex; renderReveal(state); }
      return;
    }
    if (state.status === "ended") { if (lastStatus !== "ended") { lastStatus = "ended"; renderFinal(state); } }
  });

  function showWaiting(msg) {
    const s = el("div", { class: "screen center" },
      el("div", { html: mascot("idle", { class: "idle" }) }),
      el("div", { class: "h-title", style: { marginTop: "12px", fontSize: "20px" } }, `${esc(me.name)} 님 입장 완료!`),
      el("div", { class: "text-mut", style: { marginTop: "6px" } }, msg),
      el("div", { class: "chip chip--blue", style: { marginTop: "14px" } }, "방 코드 " + code));
    mount(s);
  }
  function renderQ(state) {
    clearInterval(timer);
    fx.championEnd();
    const q = state.questions[state.currentIndex];
    view = buildQuestion({
      q, index: state.currentIndex, total: state.questions.length, timeLimit: state.settings.timeLimit,
      onAnswer: (i, elapsed) => {
        if (myAnswered) return;
        myAnswered = true; sfx("select"); vibrate();
        room.submit(me.id, state.currentIndex, i, elapsed);
      },
    });
    mount(view.screen); view.resetClock();
    const total = state.settings.timeLimit * 1000; const t0 = performance.now(); let lastTick = null;
    timer = setInterval(() => {
      const rem = Math.max(0, total - (performance.now() - t0));
      const sec = Math.ceil(rem / 1000);
      view.setTimer(sec, sec <= 5);
      if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; sfx("tick"); }
      if (rem <= 0) { clearInterval(timer); if (!myAnswered) { myAnswered = true; view.lock(); room.submit(me.id, state.currentIndex, null, null); } }
    }, 100);
  }
  function renderReveal(state) {
    clearInterval(timer);
    const q = state.questions[state.currentIndex];
    const rr = state.roundResults[state.currentIndex];
    const my = rr.results[me.id] || { correct: false, total: 0, base: 0, speedBonus: 0, answered: false };
    const isWinner = rr.winner === me.id && state.settings.winnerAnim;
    setSceneTheme(isWinner ? "celebrate" : "hero");
    const rankText = my.correct ? `정답자 중 ${my.rank}번째로 빠르게 맞혔어요!` : null;
    const { screen } = buildReveal({ q, myResult: my, isWinner, settings: state.settings, rankText, onNext: () => showWaiting("다음 문제를 기다리는 중...") });
    mount(screen);
    if (isWinner) { sfx("win"); fx.champion(); }
    else if (my.correct) { sfx("correct"); fx.flash("rgba(52,224,138,0.7)", { peak: 0.3, dur: 420 }); confetti.burst({ count: 48, y: 0.25 }); }
    else { sfx("wrong"); fx.wrong(null); }
  }
  function renderFinal(state) {
    clearInterval(timer);
    setSceneTheme("celebrate"); audio.startMusic("final");
    const players = Object.values(state.players || {});
    const { screen } = buildFinal({ players, meId: me.id, onRestart: () => (location.search = "?room=" + code), onHome: () => { location.search = ""; location.hash = "#/main"; } });
    mount(screen);
    fx.finale(); sfx("win");
  }
}
