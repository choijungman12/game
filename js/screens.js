/* ==========================================================================
   게임 화면 빌더 (순수 UI) — 솔로/라이브 공용
   ========================================================================== */
import { el, mascot, mascotSay, fmt, esc, avatarEmoji, avatarStyle, setAccent } from "./ui.js";
import { catMeta, APP } from "./config.js";
import { levelFor, rankPlayers } from "./engine.js";
import { countUp, flip, ripple } from "./fx.js";

const KEYS = ["A", "B", "C", "D"];
const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

/* -------- 상단 플레이어 헤더 -------- */
export function gameHeader(me) {
  const lv = levelFor(me.score);
  return el("div", { class: "row spread game-header", style: { marginBottom: "14px", paddingRight: "86px" } },
    el("div", { class: "row gap-8" },
      el("span", { style: { fontSize: "18px" } }, "🏞️"),
      el("b", { style: { fontSize: "15px", letterSpacing: "-0.02em" } }, APP.brand),
    ),
    el("div", { class: "row gap-8" },
      el("div", { style: { textAlign: "right", lineHeight: "1.15" } },
        el("div", { style: { fontSize: "13px", fontWeight: "800" } }, `${esc(me.name)} 님`),
        el("div", { style: { fontSize: "12px", color: "var(--text-mut)" } },
          el("span", { class: "chip chip--gold", style: { padding: "1px 8px", fontSize: "11px" } }, `Lv.${lv}`),
          el("b", { class: "tabnum", style: { color: "var(--gold-300)", marginLeft: "6px" } }, `${fmt(me.score)}점`)
        )
      ),
      el("div", { class: "gh-avatar", style: avatarStyle(me.name) }, avatarEmoji(me.name))
    )
  );
}

/* -------- 타이머 링 -------- */
function timerRing(seconds) {
  const wrap = el("div", { class: "timer-ring" });
  wrap.innerHTML = `
    <svg viewBox="0 0 54 54" aria-hidden="true">
      <circle class="tr-bg" cx="27" cy="27" r="${RING_R}"></circle>
      <circle class="tr-fg" cx="27" cy="27" r="${RING_R}"
        stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"></circle>
    </svg>
    <div class="tr-num">${seconds}</div>`;
  return wrap;
}

/* -------- 문제 화면 -------- */
export function buildQuestion({ q, index, total, timeLimit, trap = false, onAnswer, header }) {
  const meta = catMeta(q.category);
  setAccent(meta.color);

  const screen = el("div", { class: "screen q-screen" });
  if (header) screen.append(header);

  const ring = timerRing(timeLimit);
  const ringFg = ring.querySelector(".tr-fg");
  const ringNum = ring.querySelector(".tr-num");

  screen.append(el("div", { class: "topbar" },
    el("div", { class: "qcount" }, el("b", {}, String(index + 1)), el("small", {}, ` / ${total}`)),
    ring
  ));

  const image = el("div", { class: "q-image" },
    el("span", { class: "chip " + meta.chip + " q-cat" }, meta.icon + " " + q.category),
    q.difficulty ? el("span", { class: "chip q-diff" }, "난이도 " + q.difficulty) : null,
    el("span", { class: "q-emoji" }, meta.emoji)
  );

  const answers = el("div", { class: "answers" });
  const btns = [];
  q.options.forEach((opt, i) => {
    const b = el("button", {
      class: "ans", type: "button",
      onClick: (ev) => { if (locked) return; ripple(ev, b, "rgba(255,210,74,0.5)"); pick(i); },
    }, el("span", { class: "key" }, KEYS[i]), el("span", { class: "opt" }, opt));
    btns.push(b);
    answers.append(b);
  });

  const speed = el("div", { class: "speed-track" }, el("i", { style: { animationDuration: timeLimit + "s" } }));

  const card = el("div", { class: "card q-card" + (trap ? " trap-mode" : "") },
    el("div", { class: "q-prompt" },
      el("div", { class: "q-badge" }, "Q"),
      el("div", { class: "q-text" }, q.question)
    ),
    answers,
    speed,
    el("div", { class: "q-foot" },
      el("span", { class: "rate" }, `제한 ${timeLimit}초`),
      el("span", { class: "fast" }, el("span", { class: "bolt" }, "⚡"), "빠른 클릭 시 추가 점수!")
    )
  );

  screen.append(el("div", { class: "grow" }, image, card));

  /* ---- 링 애니메이션 (rAF, setTimer 호출과 무관하게 부드럽게) ---- */
  let raf = 0, ringOn = false, ringStart = 0;
  function ringTick() {
    if (!ringOn) return;
    const rem = Math.max(0, timeLimit * 1000 - (performance.now() - ringStart));
    const k = rem / (timeLimit * 1000);
    ringFg.style.strokeDashoffset = (RING_C * (1 - k)).toFixed(2);
    ring.classList.toggle("is-warn", k <= 0.5 && k > 0.28);
    ring.classList.toggle("is-danger", k <= 0.28);
    if (rem > 0) raf = requestAnimationFrame(ringTick);
    else ringOn = false;
  }
  function startRing() {
    ringStart = performance.now();
    if (ringOn) return;
    ringOn = true;
    raf = requestAnimationFrame(ringTick);
  }
  function stopRing() { ringOn = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  let locked = false;
  let shownAt = performance.now();
  function pick(i) {
    if (locked) return;
    locked = true;
    stopRing();
    const elapsed = Math.round(performance.now() - shownAt);
    btns.forEach((b) => (b.disabled = true));
    btns[i].classList.add("is-selected");
    onAnswer && onAnswer(i, elapsed);
  }

  return {
    screen, timerEl: ring, btns, card, answers,
    resetClock() { shownAt = performance.now(); startRing(); },
    setTimer(sec, danger) {
      ringNum.textContent = String(sec);
      if (danger) ring.classList.add("is-danger");
    },
    lock() { locked = true; stopRing(); btns.forEach((b) => (b.disabled = true)); },
    forceChoice(i) { if (i != null && !locked) pick(i); else { locked = true; stopRing(); } },
    reveal(correctIdx, myChoice) {
      locked = true; stopRing();
      btns.forEach((b) => (b.disabled = true));
      btns[correctIdx].classList.add("is-correct");
      if (myChoice != null && myChoice !== correctIdx) btns[myChoice].classList.add("is-wrong");
    },
    /* 정답 버튼 노드 — 연출 앵커로 사용 */
    nodeFor(i) { return btns[i]; },
  };
}

/* -------- 1등/정답 연출 화면 -------- */
export function buildReveal({ q, myResult, winnerName, isWinner, settings, rankText, onNext, header }) {
  const screen = el("div", { class: "screen reveal-screen" });
  const correct = myResult && myResult.correct;
  const answered = myResult && myResult.answered;

  let pose = "worry", titleCls = "wrong", title = "아쉬워요!";
  if (isWinner) { pose = "cheer"; titleCls = "win"; title = ""; }
  else if (correct) { pose = "cheer"; titleCls = "correct"; title = "정답입니다!"; }
  else if (!answered) { pose = "worry"; titleCls = "wrong"; title = "시간 초과!"; }

  screen.append(el("div", {
    class: "reveal-mascot",
    html: mascot(pose, { size: isWinner ? "lg" : "", glow: isWinner }),
  }));

  if (isWinner) {
    screen.append(el("div", { class: "reveal-rankwrap fx-aura" },
      el("div", { class: "reveal-laurel" }, "🏆"),
      el("div", { class: "reveal-rank" }, "1등")
    ));
    screen.append(el("div", { class: "reveal-title win" }, "축하합니다!"));
    screen.append(el("div", { class: "reveal-sub" }, "가장 빠르게 정답을 맞춘 당신은 이번 라운드 1등입니다!"));
  } else {
    screen.append(el("div", { class: "reveal-title " + titleCls }, title));
    if (correct) screen.append(el("div", { class: "reveal-sub" }, rankText || "정답을 맞혔습니다."));
    else screen.append(el("div", { class: "reveal-sub" }, `정답은 ${KEYS[q.answerIndex]}. ${esc(q.options[q.answerIndex])}`));
  }

  // 점수 브레이크다운 (총점은 카운트업)
  if (myResult && myResult.total > 0) {
    const totalVal = el("div", { class: "val" }, "0");
    screen.append(el("div", { class: "score-break" },
      el("div", { class: "sb" }, el("div", { class: "lab" }, "기본 점수"), el("div", { class: "val" }, fmt(myResult.base))),
      settings.speedBonus ? el("div", { class: "op" }, "+") : null,
      settings.speedBonus ? el("div", { class: "sb bonus" }, el("div", { class: "lab" }, "빠른 클릭 보너스"), el("div", { class: "val" }, "+" + fmt(myResult.speedBonus))) : null,
      el("div", { class: "op" }, "="),
      el("div", { class: "sb total" }, el("div", { class: "lab" }, "총점"), totalVal)
    ));
    setTimeout(() => countUp(totalVal, 0, myResult.total, 780), 260);
  } else {
    screen.append(el("div", { class: "score-break" },
      el("div", { class: "sb" }, el("div", { class: "lab" }, "획득 점수"), el("div", { class: "val" }, "0"))
    ));
  }

  if (settings.showExplain && q.explanation) {
    screen.append(el("div", { class: "reveal-explain", html: `<b>해설</b> · ${esc(q.explanation)}` }));
  }

  screen.append(el("button", {
    class: "btn btn--gold", style: { marginTop: "18px", maxWidth: "320px" }, onClick: onNext,
  }, "리더보드 보기 →"));
  return { screen };
}

/* -------- 리더보드 화면 -------- */
export function buildLeaderboard({ players, meId, index, total, onNext, header, nextLabel, prevOrder }) {
  const screen = el("div", { class: "screen lb-screen" });
  if (header) screen.append(header);
  const ranked = rankPlayers(players);
  const me = ranked.find((p) => p.id === meId || p.pid === meId);
  const idOf = (p) => p.id || p.pid;

  screen.append(el("div", { class: "topbar" },
    el("div", { class: "qcount" }, el("b", {}, String(index + 1)), el("small", {}, ` / ${total}`)),
    el("span", { class: "chip chip--gold", style: { marginLeft: "auto" } }, "🔥 실시간 랭킹")
  ));
  screen.append(el("div", { class: "progress", style: { marginBottom: "16px" } },
    el("i", { style: { width: ((index + 1) / total * 100) + "%" } })));

  const prevIdx = new Map((prevOrder || []).map((id, i) => [id, i]));
  const list = el("div", { class: "lb-table" });
  const top = ranked.slice(0, 8);

  const rowOf = (p, i) => {
    const answered = p.answeredCount || 0;
    const acc = answered ? Math.round((p.correctCount / answered) * 100) : 0;
    const pid = idOf(p);
    const was = prevIdx.has(pid) ? prevIdx.get(pid) : null;
    const delta = was == null ? null : was - i;
    const row = el("div", {
      class: "lb-row" + (i < 3 ? " top" + (i + 1) : "") + (pid === meId ? " me" : ""),
      "data-key": pid,
    },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "av", style: avatarStyle(p.name) }, avatarEmoji(p.name)),
      el("div", { class: "nm" },
        el("span", {}, esc(p.name)),
        delta ? el("span", { class: "rank-delta " + (delta > 0 ? "up" : "down") }, (delta > 0 ? "▲" : "▼") + Math.abs(delta)) : null,
        was == null && prevOrder && prevOrder.length ? el("span", { class: "rank-delta new" }, "NEW") : null
      ),
      el("div", { class: "sc" }, fmt(p.score)),
      el("div", { class: "ac" }, acc + "%")
    );
    return row;
  };

  /* 이전 순서로 먼저 그린 뒤 → 새 순서로 미끄러지듯 재정렬 (FLIP) */
  const initial = prevOrder && prevOrder.length
    ? [...top].sort((a, b) => {
        const ai = prevIdx.has(idOf(a)) ? prevIdx.get(idOf(a)) : 99;
        const bi = prevIdx.has(idOf(b)) ? prevIdx.get(idOf(b)) : 99;
        return ai - bi;
      })
    : top;

  const rowByKey = new Map();
  initial.forEach((p) => {
    const i = top.indexOf(p);
    const row = rowOf(p, i);
    rowByKey.set(idOf(p), row);
    list.append(row);
  });
  screen.append(el("div", { class: "card", style: { padding: "12px" } }, list));

  screen.append(el("div", { class: "mascot-row reverse", style: { marginTop: "14px", justifyContent: "flex-end" } },
    el("div", { html: mascot("point", { size: "sm" }) }),
    el("div", { class: "speech" }, "빠른 정답일수록 더 많은 점수를 얻을 수 있어요!")
  ));

  if (onNext) screen.append(el("button", { class: "btn btn--green", style: { marginTop: "16px" }, onClick: onNext }, nextLabel || "다음 문제로 →"));

  /* 마운트 이후 호출 — 순위 재배치 애니메이션 + 점수 카운트업 */
  function animate() {
    top.forEach((p) => {
      const row = rowByKey.get(idOf(p));
      const sc = row && row.querySelector(".sc");
      if (sc) countUp(sc, Math.max(0, (p.score || 0) - (p.lastGain || 0)), p.score || 0, 700);
    });
    if (!prevOrder || !prevOrder.length) return;
    setTimeout(() => {
      flip(list, ".lb-row", () => {
        top.forEach((p) => list.append(rowByKey.get(idOf(p))));
      });
    }, 420);
  }

  return { screen, me, animate, order: top.map(idOf) };
}

/* -------- 최종 결과 화면 -------- */
export function buildFinal({ players, meId, onRestart, onHome }) {
  const screen = el("div", { class: "screen final-screen" });
  const ranked = rankPlayers(players);
  const top3 = ranked.slice(0, 3);
  const idOf = (p) => p.id || p.pid;

  screen.append(el("div", { class: "final-hero", html: mascot("final", { size: "lg", class: "reveal-mascot", glow: true }) }));
  screen.append(el("div", { class: "final-title" }, "수고하셨습니다!"));
  screen.append(el("div", { class: "final-sub" }, "지금까지의 여정이 여러분의 더 나은 노후를 위한 소중한 한 걸음이 되길 바랍니다."));

  // 포디움 (2 - 1 - 3)
  const order = [top3[1], top3[0], top3[2]];
  const cls = ["p2", "p1", "p3"];
  const medal = ["🥈", "🥇", "🥉"];
  const podium = el("div", { class: "podium" });
  const scoreNodes = [];
  order.forEach((p, i) => {
    if (!p) return;
    const sc = el("div", { class: "pscore" }, "0점");
    scoreNodes.push([sc, p.score]);
    podium.append(el("div", { class: "pcol " + cls[i] },
      el("div", { class: "pav", style: i === 1 ? {} : avatarStyle(p.name) }, medal[i]),
      el("div", { class: "pname" }, esc(p.name)),
      sc,
      el("div", { class: "pbar" }, String(i === 1 ? 1 : (i === 0 ? 2 : 3)))
    ));
  });
  screen.append(podium);
  scoreNodes.forEach(([node, val], i) => setTimeout(() => countUp(node, 0, val, 900, (v) => Math.round(v).toLocaleString("ko-KR") + "점"), 500 + i * 160));

  const list = el("div", { class: "lb-table final-list" });
  ranked.slice(0, 10).forEach((p, i) => {
    list.append(el("div", { class: "lb-row" + (idOf(p) === meId ? " me" : "") + (i < 3 ? " top" + (i + 1) : ""), "data-key": idOf(p) },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "av", style: avatarStyle(p.name) }, avatarEmoji(p.name)),
      el("div", { class: "nm" }, esc(p.name)),
      el("div", { class: "sc" }, fmt(p.score) + "점"),
      el("div", { class: "ac" }, (p.answeredCount ? Math.round(p.correctCount / p.answeredCount * 100) : 0) + "%")
    ));
  });
  screen.append(el("div", { class: "card", style: { padding: "12px", marginTop: "8px" } }, list));

  screen.append(el("div", { class: "final-actions" },
    el("button", { class: "btn btn--ghost", onClick: onRestart }, "🔄 다시하기"),
    el("button", { class: "btn btn--green", onClick: onHome }, "🏠 메인으로")
  ));
  return { screen, ranked };
}
