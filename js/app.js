/* ==========================================================================
   메인 앱 컨트롤러 (참가자 SPA)
   메인 → QR입장 → 개인전(스피드 퀴즈) → 1등 연출 → 리더보드 → 결과 / 팀전 진입
   ========================================================================== */
import { APP, BOT_NAMES } from "./config.js";
import { getSettings, selectQuestions, getPlayer, savePlayer, bumpStat, getStats } from "./data.js";
import { makeBots, simulateBots, scoreRound, rankPlayers, levelFor } from "./engine.js";
import { uid } from "./store.js";
import { $, el, mascot, mascotSay, toast, confetti, setSceneTheme, setAccent, fmt, esc, vibrate, avatarEmoji } from "./ui.js";
import { fx } from "./fx.js";
import { audio, sfx } from "./audio.js";
import { makeQR } from "./qr.js";
import { gameHeader, buildQuestion, buildReveal, buildLeaderboard, buildFinal } from "./screens.js";

const app = document.getElementById("app");
function mount(screen, opts = {}) {
  if (opts.wipe) fx.wipe(opts.wipe === true ? "#0b1220" : opts.wipe);
  app.innerHTML = "";
  app.append(screen);
  window.scrollTo(0, 0);
}

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
  toast(m ? "음소거" : "소리 켜짐", "", { icon: m ? "🔇" : "🔊" });
}

/* ==========================================================================
   1. 메인 화면
   ========================================================================== */
function screenMain() {
  setSceneTheme("hero");
  setAccent(null);
  audio.startMusic("menu");
  const s = el("div", { class: "screen main-screen" });
  s.append(el("div", { class: "main-hero" },
    el("div", { class: "brand" },
      el("div", { class: "brand-eyebrow" }, APP.eyebrow),
      el("div", { class: "brand-title fx-sheen" }, APP.brand),
      el("div", { class: "brand-sub" }, APP.sub)
    ),
    el("div", { html: mascot("point", { class: "idle" }) }),
    el("div", { class: "tagline", html: "내일의 가치를 만드는 <b>토지 투자</b>, 이제 게임으로!" })
  ));
  s.append(el("div", { class: "main-actions" },
    el("button", { class: "btn btn--green btn--lg btn--pulse", onClick: (e) => { sfx("start"); fx.ripple(e); go("join"); } }, "👤 개인전 시작하기"),
    el("button", { class: "btn btn--blue btn--lg", onClick: (e) => { sfx("click"); fx.ripple(e); go("team"); } }, "👥 팀전 시작하기"),
    el("button", { class: "btn btn--ghost", onClick: () => { sfx("click"); screenHowTo(); } }, "📖 게임 방법 보기")
  ));

  // 로컬 누적 기록 스트립
  const st = getStats();
  const acc = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;
  const best = (JSON.parse(localStorage.getItem("notl.hall") || "[]")[0] || {}).score || 0;
  s.append(el("div", { class: "stat-strip" },
    el("div", { class: "st" }, el("div", { class: "sv" }, fmt(st.games || 0)), el("div", { class: "sl" }, "플레이")),
    el("div", { class: "st" }, el("div", { class: "sv" }, acc + "%"), el("div", { class: "sl" }, "정답률")),
    el("div", { class: "st" }, el("div", { class: "sv" }, fmt(best)), el("div", { class: "sl" }, "최고점"))
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
    item("🔥", "연속 정답 콤보", "3문제 이상 연속으로 맞히면 콤보 연출이 터집니다."),
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
    hall.slice(0, 10).forEach((h, i) => list.append(el("div", { class: "lb-row" + (i < 3 ? " top" + (i + 1) : ""), "data-key": "h" + i },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "av" }, avatarEmoji(h.name)),
      el("div", { class: "nm" }, esc(h.name)),
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
    el("div", { class: "row gap-12", style: { marginBottom: "10px" } }, el("div", { html: mascot("money", { size: "sm" }) }),
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
  setAccent(null);
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
  s.append(el("div", {}, el("div", { class: "field" }, name), el("div", { class: "field" }, phone)));

  s.append(el("button", { class: "btn btn--green btn--lg", onClick: (e) => {
    const nm = name.value.trim();
    if (!nm) { toast("이름을 입력해주세요", "err"); name.focus(); fx.shake(null, 6, 340); return; }
    savePlayer({ id: (prev && prev.id) || uid(), name: nm, phone: phone.value.trim() });
    sfx("start"); vibrate(20);
    fx.ripple(e);
    fx.flash("rgba(52,224,138,0.6)", { peak: 0.3, dur: 420 });
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
    this.bots = makeBots(BOT_NAMES, this.settings.botCount).map((b) => ({ ...b, id: b.pid, answeredCount: 0 }));
    this.idx = -1;
    this.streak = 0;
    this.bestStreak = 0;
    this.prevOrder = [];
  }
  players() { return [this.me, ...this.bots]; }

  start() { setSceneTheme("quiz"); audio.startMusic("quiz"); this.nextQuestion(); }

  nextQuestion() {
    clearInterval(this.timer);
    fx.championEnd();
    this.idx++;
    if (this.idx >= this.qs.length) return this.finish();
    this.renderQuestion();
  }

  renderQuestion() {
    const q = this.qs[this.idx];
    this.answered = false; this.myChoice = null; this.myElapsed = null; this._lastTick = null;
    this.view = buildQuestion({
      q, index: this.idx, total: this.qs.length, timeLimit: this.settings.timeLimit,
      header: gameHeader(this.me),
      onAnswer: (i, elapsed) => this.onAnswer(i, elapsed),
    });
    setSceneTheme("quiz");
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
    fx.timeout();
    this.resolve();
  }

  resolve() {
    const q = this.qs[this.idx];
    const subs = [{ pid: this.me.id, choice: this.myChoice, elapsed: this.myElapsed }, ...simulateBots(this.bots, q, this.settings)];
    const { results, winner } = scoreRound(q, subs, this.settings);

    const mr = results[this.me.id];
    if (this.myChoice != null) this.me.answeredCount++;
    if (mr.correct) this.me.correctCount++;
    this.me.score += mr.total;
    this.me.lastGain = mr.total;
    this.bots.forEach((b) => {
      const r = results[b.pid];
      if (r.answered) b.answeredCount++;
      if (r.correct) b.correctCount++;
      b.score += r.total;
      b.lastGain = r.total;
    });
    this.lastResults = results; this.winner = winner;

    // 연속 정답 카운트
    if (mr.correct) { this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
    else this.streak = 0;

    this.view.reveal(q.answerIndex, this.myChoice);

    /* ---- 즉시 피드백 VFX (보기 버튼에 앵커) ---- */
    const correctNode = this.view.nodeFor(q.answerIndex);
    if (mr.correct) {
      fx.correct(correctNode, mr.total);
      if (this.streak >= 3) setTimeout(() => { fx.combo(this.streak); sfx("levelup"); }, 220);
    } else if (this.myChoice != null) {
      fx.wrong(this.view.nodeFor(this.myChoice));
      vibrate(60);
    }

    setTimeout(() => this.renderReveal(), 1050);
  }

  renderReveal() {
    const q = this.qs[this.idx];
    const my = this.lastResults[this.me.id];
    const isWinner = this.winner === this.me.id && this.settings.winnerAnim;
    setSceneTheme(isWinner ? "celebrate" : "quiz");
    const rankText = my.correct ? `정답자 중 ${my.rank}번째로 빠르게 맞혔어요!` : null;
    const { screen } = buildReveal({
      q, myResult: my, isWinner, settings: this.settings, rankText,
      onNext: () => this.renderLeaderboard(),
    });
    mount(screen);
    if (isWinner) { sfx("win"); fx.champion(); }
    else if (my.correct) { sfx("correct"); confetti.burst({ count: 48, y: 0.28, spread: 0.5 }); }
  }

  renderLeaderboard() {
    fx.championEnd();
    setSceneTheme("quiz"); audio.startMusic("quiz");
    const isLast = this.idx >= this.qs.length - 1;
    const lb = buildLeaderboard({
      players: this.players(), meId: this.me.id, index: this.idx, total: this.qs.length,
      prevOrder: this.prevOrder,
      onNext: () => this.nextQuestion(),
      nextLabel: isLast ? "🏁 최종 결과 보기 →" : "다음 문제로 →",
    });
    mount(lb.screen);
    lb.animate();
    this.prevOrder = lb.order;
    sfx("coin");
  }

  finish() {
    fx.championEnd();
    setSceneTheme("celebrate"); audio.startMusic("final");
    saveHall(this.me);
    const st = getStats();
    bumpStat({ games: (st.games || 0) + 1, answers: (st.answers || 0) + this.me.answeredCount, correct: (st.correct || 0) + this.me.correctCount });
    const { screen, ranked } = buildFinal({
      players: this.players(), meId: this.me.id,
      onRestart: () => { sfx("start"); startSolo(); },
      onHome: () => { sfx("click"); go("main"); },
    });
    mount(screen, { wipe: "#241a4a" });
    sfx("win");
    fx.finale();
    const myRank = ranked.findIndex((p) => (p.id || p.pid) === this.me.id) + 1;
    setTimeout(() => {
      if (myRank === 1) toast("최종 1위! 축하합니다 🎉", "gold", { duration: 3200 });
      else if (this.bestStreak >= 3) toast(`최고 ${this.bestStreak}연속 정답!`, "ok", { duration: 3000 });
    }, 900);
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
  setAccent("#4b9bff");
  const s = el("div", { class: "screen" });
  s.append(el("div", { class: "brand", style: { marginBottom: "8px" } },
    el("div", { class: "brand-title", style: { fontSize: "26px" } }, "팀전 · 브루마블")));
  s.append(el("div", { class: "text-c text-mut", style: { marginBottom: "14px", fontSize: "14px" } },
    "주사위를 굴려 땅을 사고, 함정 퀴즈를 풀며 팀 점수를 겨루세요!"));

  const settings = getSettings();
  let teamCount = settings.teamCount || 2;
  const turns = settings.boardTurns || 15;

  const teamPick = el("div", { class: "row gap-8", style: { justifyContent: "center", marginBottom: "16px" } });
  [2, 3, 4].forEach((n) => {
    teamPick.append(el("button", { class: "btn btn--ghost btn--sm", onClick: (e) => {
      teamCount = n;
      [...teamPick.children].forEach((c) => c.classList.remove("btn--blue"));
      e.currentTarget.classList.add("btn--blue");
      sfx("click"); fx.ripple(e);
    } }, `${n}팀`));
  });
  teamPick.children[teamCount - 2].classList.add("btn--blue");

  s.append(el("div", { class: "card" },
    el("div", { class: "text-mut", style: { fontSize: "13px", marginBottom: "8px", textAlign: "center" } }, "참가 팀 수 선택"),
    teamPick,
    el("div", { class: "row gap-12", style: { justifyContent: "center" } },
      mascotSay("한 기기로 팀끼리 번갈아 진행해요. 큰 화면에 띄우면 더 좋아요!", "point"))
  ));

  s.append(el("button", { class: "btn btn--blue btn--lg btn--pulse", style: { marginTop: "16px" }, onClick: async (e) => {
    sfx("start"); vibrate(20); fx.ripple(e);
    const loading = el("div", { class: "screen center" },
      el("div", { html: mascot("think", { class: "idle" }) }),
      el("div", { class: "text-mut", style: { marginTop: "12px" } }, "3D 보드를 준비하는 중..."),
      el("div", { class: "progress", style: { width: "180px", marginTop: "14px" } }, el("i", { style: { width: "35%" } })));
    mount(loading, { wipe: "#0d1626" });
    try {
      const mod = await import("./team.js");
      mod.startTeamGame({ teamCount, turns, mount, onExit: () => go("main") });
    } catch (err) {
      console.error(err);
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
  const params = new URLSearchParams(location.search);
  if (params.get("room")) {
    import("./live.js").then((m) => m.startLivePlayer({ code: params.get("room"), mount, go })).catch((e) => { console.error(e); screenMain(); });
    return;
  }
  const route = (location.hash.replace(/^#\/?/, "") || "main").split("?")[0];
  confetti.clear();
  fx.championEnd();
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
