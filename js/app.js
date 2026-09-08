/* ==========================================================================
   메인 앱 컨트롤러 (참가자 SPA)
   메인 → QR입장 → 개인전(스피드 퀴즈) → 1등 연출 → 리더보드 → 결과 / 팀전 진입
   ========================================================================== */
import { APP, BOT_NAMES } from "./config.js";
import { getSettings, selectQuestions, getPlayer, savePlayer, bumpStat, getStats } from "./data.js";
import { makeBots, simulateBots, scoreRound, rankPlayers, levelFor } from "./engine.js";
import { uid } from "./store.js";
import { $, el, mascot, toast, confetti, setSceneTheme, fmt, esc, vibrate, avatarEmoji } from "./ui.js";
import { audio, sfx } from "./audio.js";
import { makeQR } from "./qr.js";
import { gameHeader, buildQuestion, buildReveal, buildLeaderboard, buildFinal } from "./screens.js";

const app = document.getElementById("app");
function mount(screen) { app.innerHTML = ""; app.append(screen); window.scrollTo(0, 0); }

/* ---------- 오디오: 첫 제스처에 unlock + 플로팅 컨트롤 ---------- */
let audioCtl;
function initAudioControl() {
  audioCtl = el("div", { class: "audio-ctl" },
    el("button", { class: "actl-btn", title: "음소거", onClick: onToggleMute }, audio.muted ? "🔇" : "🔊"),
    el("a", { class: "actl-btn", href: "admin.html", title: "관리자" }, "⚙️")
  );
  document.body.append(audioCtl);
  const unlock = () => { audio.unlock(); };
  window.addEventListener("pointerdown", unlock, { once: true });
}
function onToggleMute() {
  const m = audio.toggleMute();
  audioCtl.querySelector(".actl-btn").textContent = m ? "🔇" : "🔊";
  toast(m ? "🔇 음소거" : "🔊 소리 켜짐");
}

/* ==========================================================================
   1. 메인 화면
   ========================================================================== */
function screenMain() {
  setSceneTheme("hero");
  audio.startMusic("menu");
  const s = el("div", { class: "screen main-screen" });
  s.append(el("div", { class: "main-hero" },
    el("div", { class: "brand" },
      el("div", { class: "brand-eyebrow" }, APP.eyebrow),
      el("div", { class: "brand-title" }, APP.brand),
      el("div", { class: "brand-sub" }, APP.sub)
    ),
    el("div", { html: mascot("point", { class: "idle" }) }),
    el("div", { class: "tagline", html: "내일의 가치를 만드는 <b>토지 투자</b>, 이제 게임으로!" })
  ));
  s.append(el("div", { class: "main-actions" },
    el("button", { class: "btn btn--green btn--lg", onClick: () => { sfx("click"); go("join"); } }, "👤 개인전 시작하기"),
    el("button", { class: "btn btn--blue btn--lg", onClick: () => { sfx("click"); go("team"); } }, "👥 팀전 시작하기"),
    el("button", { class: "btn btn--ghost", onClick: () => { sfx("click"); screenHowTo(); } }, "📖 게임 방법 보기")
  ));
  s.append(el("div", { class: "main-foot" },
    footBtn("🏆", "명예의 전당", screenHall),
    footBtn("💬", "상담 안내", screenContact),
    footBtn("⚙️", "관리자", () => (location.href = "admin.html"))
  ));
  mount(s);
}
function footBtn(ic, label, on) {
  return el("button", { onClick: () => { sfx("click"); on(); } }, el("span", { class: "fic" }, ic), el("span", {}, label));
}

/* 게임 방법 */
function screenHowTo() {
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "row spread", style: { marginBottom: "8px" } },
    el("div", { class: "h-title" }, "게임 방법"),
    el("button", { class: "btn btn--ghost btn--sm", onClick: () => { sfx("click"); go("main"); } }, "✕ 닫기")
  ));
  const item = (ic, t, d) => el("div", { class: "panel", style: { marginBottom: "10px" } },
    el("div", { class: "row gap-10" }, el("span", { style: { fontSize: "26px" } }, ic),
      el("div", {}, el("b", {}, t), el("div", { class: "text-mut", style: { fontSize: "13.5px", marginTop: "3px" } }, d))));
  s.append(
    item("📱", "QR로 입장", "QR코드를 스캔하거나 이름을 입력해 바로 참여합니다."),
    item("4️⃣", "4지선다 스피드 퀴즈", "노후 대비 부동산·토지 문제를 20문항 풉니다."),
    item("⚡", "빠를수록 고득점", "정답자 중 가장 빠르게 맞힌 사람이 이번 라운드 1등! 추가 점수를 받습니다."),
    item("🏆", "실시간 랭킹", "매 문제마다 순위가 갱신되고, 마지막에 최종 순위를 발표합니다."),
    item("🎲", "팀전(브루마블)", "주사위를 굴려 땅을 사고, 함정 퀴즈를 풀며 팀 점수를 겨룹니다.")
  );
  s.append(el("button", { class: "btn btn--green mt-auto", onClick: () => { sfx("start"); go("join"); } }, "개인전 시작하기 →"));
  mount(s);
}

/* 명예의 전당 */
function screenHall() {
  const hall = JSON.parse(localStorage.getItem("notl.hall") || "[]");
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "row spread", style: { marginBottom: "12px" } },
    el("div", { class: "h-title" }, "🏆 명예의 전당"),
    el("button", { class: "btn btn--ghost btn--sm", onClick: () => { sfx("click"); go("main"); } }, "✕ 닫기")));
  if (!hall.length) s.append(el("div", { class: "card text-c text-mut" }, "아직 기록이 없습니다. 첫 게임의 주인공이 되어보세요!"));
  else {
    const list = el("div", { class: "lb-table" });
    hall.slice(0, 10).forEach((h, i) => list.append(el("div", { class: "lb-row" + (i < 3 ? " top" + (i + 1) : "") },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "nm" }, `${avatarEmoji(h.name)} ${esc(h.name)}`),
      el("div", { class: "sc" }, fmt(h.score) + "점"),
      el("div", { class: "ac" }, h.date || ""))));
    s.append(el("div", { class: "card", style: { padding: "12px" } }, list));
  }
  mount(s);
}

/* 상담 안내 */
function screenContact() {
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "row spread", style: { marginBottom: "12px" } },
    el("div", { class: "h-title" }, "💬 상담 안내"),
    el("button", { class: "btn btn--ghost btn--sm", onClick: () => { sfx("click"); go("main"); } }, "✕ 닫기")));
  s.append(el("div", { class: "card" },
    el("div", { class: "row gap-12", style: { marginBottom: "10px" } }, el("div", { html: mascot("point", { size: "sm" }) }),
      el("div", {}, el("b", { style: { fontSize: "17px" } }, APP.company), el("div", { class: "text-mut", style: { fontSize: "13px" } }, "토지·택지 개발 전문"))),
    el("div", { class: "text-soft", style: { fontSize: "14px", lineHeight: "1.7" } },
      "노후 대비 토지 투자, 무엇부터 시작해야 할지 막막하신가요? ",
      "전문 상담을 통해 개발 호재 지역과 안전한 토지를 안내해 드립니다."),
    el("div", { class: "panel", style: { marginTop: "12px" } },
      el("div", { class: "row spread" }, el("span", { class: "text-mut" }, "홈페이지"), el("b", {}, "daeyeonpnc.kr")))
  ));
  s.append(el("button", { class: "btn btn--green mt-auto", onClick: () => { sfx("click"); go("main"); } }, "확인"));
  mount(s);
}

/* ==========================================================================
   2. QR 입장 / 아이디 생성
   ========================================================================== */
function screenJoin() {
  setSceneTheme("hero");
  const prev = getPlayer();
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "brand", style: { marginBottom: "14px" } },
    el("div", { class: "brand-title", style: { fontSize: "26px" } }, "게임에 참여하세요!")));
  s.append(el("div", { class: "text-c text-mut", style: { marginBottom: "10px", fontSize: "14px" } },
    "QR코드를 스캔해 아이디를 생성하면 바로 입장할 수 있어요."));

  const qrBox = el("div", { class: "qr-box" });
  s.append(qrBox);
  s.append(el("div", { class: "qr-hint" }, "QR 스캔 후 아이디 생성"));
  makeQR(qrBox, joinURL());

  s.append(el("div", { class: "divider" }, "또는 직접 아이디를 생성하세요"));

  const name = el("input", { class: "input", placeholder: "이름을 입력하세요", maxlength: "12", value: prev ? prev.name : "" });
  const phone = el("input", { class: "input", placeholder: "휴대폰 번호 (선택)", inputmode: "numeric", value: prev ? prev.phone || "" : "" });
  const form = el("div", {},
    el("div", { class: "field" }, name),
    el("div", { class: "field" }, phone));
  s.append(form);

  s.append(el("button", { class: "btn btn--green btn--lg", onClick: () => {
    const nm = name.value.trim();
    if (!nm) { toast("이름을 입력해주세요", "err"); name.focus(); return; }
    const player = savePlayer({ id: (prev && prev.id) || uid(), name: nm, phone: phone.value.trim() });
    sfx("start"); vibrate(20);
    startSolo();
  } }, "🎮 게임 시작하기"));
  s.append(el("div", { class: "text-c text-mut", style: { fontSize: "12px", marginTop: "10px" } }, "간단한 정보 입력으로 바로 참여할 수 있습니다."));
  s.append(el("button", { class: "btn btn--ghost btn--sm", style: { marginTop: "12px", alignSelf: "center" }, onClick: () => go("main") }, "← 뒤로"));
  mount(s);
  setTimeout(() => name.focus(), 200);
}
function joinURL() {
  const u = new URL(location.href);
  u.hash = "#/join";
  return u.toString();
}

/* ==========================================================================
   개인전 (솔로 + 봇) 엔진
   ========================================================================== */
class SoloGame {
  constructor() {
    this.settings = getSettings();
    this.qs = selectQuestions(this.settings, "individual");
    const p = getPlayer() || { id: uid(), name: "게스트" };
    this.me = { ...p, score: 0, correctCount: 0, answeredCount: 0, isMe: true };
    this.bots = makeBots(BOT_NAMES, this.settings.botCount).map((b) => ({ ...b, answeredCount: 0 }));
    this.idx = -1;
  }
  players() { return [this.me, ...this.bots]; }

  start() { setSceneTheme("hero"); audio.startMusic("quiz"); this.nextQuestion(); }

  nextQuestion() {
    clearInterval(this.timer);
    this.idx++;
    if (this.idx >= this.qs.length) return this.finish();
    this.renderQuestion();
  }

  renderQuestion() {
    if (this.view && this.view.destroy) this.view.destroy();
    const q = this.qs[this.idx];
    this.answered = false; this.myChoice = null; this.myElapsed = null; this._lastTick = null;
    this.view = buildQuestion({
      q, index: this.idx, total: this.qs.length, timeLimit: this.settings.timeLimit,
      header: gameHeader(this.me),
      onAnswer: (i, elapsed) => this.onAnswer(i, elapsed),
    });
    setSceneTheme("hero");
    mount(this.view.screen);
    this.view.resetClock();
    this.startTimer();
  }

  startTimer() {
    const total = this.settings.timeLimit * 1000;
    const startAt = performance.now();
    this.timer = setInterval(() => {
      const rem = Math.max(0, total - (performance.now() - startAt));
      const sec = Math.ceil(rem / 1000);
      this.view.setTimer(sec, sec <= 5);
      if (sec <= 5 && sec > 0 && sec !== this._lastTick) { this._lastTick = sec; sfx("tick"); }
      if (rem <= 0) { clearInterval(this.timer); this.onTimeUp(); }
    }, 100);
  }

  onAnswer(i, elapsed) {
    if (this.answered) return;
    this.answered = true;
    clearInterval(this.timer);
    this.myChoice = i; this.myElapsed = elapsed;
    sfx("select"); vibrate();
    this.resolve();
  }
  onTimeUp() {
    if (this.answered) return;
    this.answered = true;
    this.view.lock();
    sfx("wrong");
    this.resolve();
  }

  resolve() {
    const q = this.qs[this.idx];
    const subs = [{ pid: this.me.id, choice: this.myChoice, elapsed: this.myElapsed }, ...simulateBots(this.bots, q, this.settings)];
    const { results, winner } = scoreRound(q, subs, this.settings);
    // 점수 반영
    const mr = results[this.me.id];
    if (this.myChoice != null) this.me.answeredCount++;
    if (mr.correct) this.me.correctCount++;
    this.me.score += mr.total;
    this.bots.forEach((b) => {
      const r = results[b.pid];
      if (r.answered) b.answeredCount++;
      if (r.correct) b.correctCount++;
      b.score += r.total;
    });
    this.lastResults = results; this.winner = winner;
    this.view.reveal(q.answerIndex, this.myChoice);
    setTimeout(() => this.renderReveal(), 950);
  }

  renderReveal() {
    const q = this.qs[this.idx];
    const my = this.lastResults[this.me.id];
    const isWinner = this.winner === this.me.id && this.settings.winnerAnim;
    setSceneTheme(isWinner ? "celebrate" : "hero");
    const rankText = my.correct ? `정답자 중 ${my.rank}번째로 빠르게 맞혔어요!` : null;
    const { screen } = buildReveal({
      q, myResult: my, isWinner, settings: this.settings, rankText,
      onNext: () => this.renderLeaderboard(),
    });
    mount(screen);
    if (isWinner) { sfx("win"); confetti.burst({ count: 150 }); confetti.fountain(0.18); confetti.fountain(0.82); }
    else if (my.correct) { sfx("correct"); confetti.burst({ count: 46, y: 0.25, spread: 0.5 }); }
    else { /* already played wrong */ }
  }

  renderLeaderboard() {
    setSceneTheme("hero"); audio.startMusic("quiz");
    const isLast = this.idx >= this.qs.length - 1;
    const { screen } = buildLeaderboard({
      players: this.players(), meId: this.me.id, index: this.idx, total: this.qs.length,
      onNext: () => this.nextQuestion(),
      nextLabel: isLast ? "🏁 최종 결과 보기 →" : "다음 문제로 →",
    });
    mount(screen);
    sfx("coin");
  }

  finish() {
    setSceneTheme("celebrate"); audio.startMusic("final");
    // 명예의 전당 + 통계 저장
    saveHall(this.me);
    const st = getStats();
    bumpStat({ games: (st.games || 0) + 1, answers: (st.answers || 0) + this.me.answeredCount, correct: (st.correct || 0) + this.me.correctCount });
    const { screen } = buildFinal({
      players: this.players(), meId: this.me.id,
      onRestart: () => { sfx("start"); startSolo(); },
      onHome: () => { sfx("click"); go("main"); },
    });
    mount(screen);
    confetti.rain(); setTimeout(() => confetti.stopRain(), 4200);
    sfx("win");
  }
}
function saveHall(me) {
  const hall = JSON.parse(localStorage.getItem("notl.hall") || "[]");
  const d = new Date();
  hall.push({ name: me.name, score: me.score, date: `${d.getMonth() + 1}/${d.getDate()}` });
  hall.sort((a, b) => b.score - a.score);
  localStorage.setItem("notl.hall", JSON.stringify(hall.slice(0, 20)));
}

let solo = null;
function startSolo() { solo = new SoloGame(); solo.start(); }

/* ==========================================================================
   팀전 진입 (브루마블) — team.js 동적 로드
   ========================================================================== */
async function screenTeam() {
  setSceneTheme("team");
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "brand", style: { marginBottom: "8px" } },
    el("div", { class: "brand-title", style: { fontSize: "26px" } }, "팀전 · 브루마블")));
  s.append(el("div", { class: "text-c text-mut", style: { marginBottom: "14px", fontSize: "14px" } },
    "주사위를 굴려 땅을 사고, 함정 퀴즈를 풀며 팀 점수를 겨루세요!"));

  const settings = getSettings();
  let teamCount = settings.teamCount || 2;
  let turns = settings.boardTurns || 15;

  const teamPick = el("div", { class: "row gap-8", style: { justifyContent: "center", marginBottom: "16px" } });
  [2, 3, 4].forEach((n) => {
    teamPick.append(el("button", { class: "btn btn--ghost btn--sm" + (n === teamCount ? " sel" : ""), onClick: (e) => {
      teamCount = n; [...teamPick.children].forEach((c) => c.classList.remove("btn--blue")); e.currentTarget.classList.add("btn--blue"); sfx("click");
    } }, `${n}팀`));
  });
  teamPick.children[teamCount - 2].classList.add("btn--blue");

  s.append(el("div", { class: "card" },
    el("div", { class: "text-mut", style: { fontSize: "13px", marginBottom: "8px", textAlign: "center" } }, "참가 팀 수 선택"),
    teamPick,
    el("div", { class: "row gap-12", style: { justifyContent: "center" } }, el("div", { html: mascot("point", { size: "sm" }) }),
      el("div", { class: "speech" }, "한 기기로 팀끼리 번갈아 진행해요. 큰 화면에 띄우면 더 좋아요!"))
  ));

  s.append(el("button", { class: "btn btn--blue btn--lg", style: { marginTop: "16px" }, onClick: async () => {
    sfx("start"); vibrate(20);
    const loading = el("div", { class: "screen center" }, el("div", { html: mascot("idle", { class: "idle" }) }), el("div", { class: "text-mut", style: { marginTop: "12px" } }, "3D 보드를 준비하는 중..."));
    mount(loading);
    try {
      const mod = await import("./team.js");
      mod.startTeamGame({ teamCount, turns, mount, onExit: () => go("main") });
    } catch (e) {
      console.error(e);
      toast("보드를 불러오지 못했습니다. 네트워크를 확인하세요.", "err");
      go("main");
    }
  } }, "🎲 팀전 시작하기"));
  s.append(el("button", { class: "btn btn--ghost btn--sm", style: { marginTop: "12px", alignSelf: "center" }, onClick: () => go("main") }, "← 뒤로"));
  mount(s);
}

/* ==========================================================================
   라우터
   ========================================================================== */
function go(route) { location.hash = "#/" + route; }
function router() {
  // 라이브 방 입장 (?room=CODE) → live.js
  const params = new URLSearchParams(location.search);
  if (params.get("room")) {
    import("./live.js").then((m) => m.startLivePlayer({ code: params.get("room"), mount, go })).catch((e) => { console.error(e); screenMain(); });
    return;
  }
  const route = (location.hash.replace(/^#\/?/, "") || "main").split("?")[0];
  confetti.clear();
  switch (route) {
    case "join": screenJoin(); break;
    case "team": screenTeam(); break;
    case "how": screenHowTo(); break;
    case "main":
    default: screenMain(); break;
  }
}

let _booted = false;
function boot() { if (_booted) return; _booted = true; initAudioControl(); router(); }
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", boot);
if (document.readyState !== "loading") boot();
