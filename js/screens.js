/* ==========================================================================
   게임 화면 빌더 (순수 UI) — 솔로/라이브 공용
   ========================================================================== */
import { el, mascot, fmt, esc, avatarEmoji } from "./ui.js";
import { catMeta, APP } from "./config.js";
import { levelFor, rankPlayers } from "./engine.js";

const KEYS = ["A", "B", "C", "D"];

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
          el("b", { style: { color: "var(--gold-300)", marginLeft: "6px" } }, `${fmt(me.score)}점`)
        )
      ),
      el("div", { class: "emoji-av", style: { width: "38px", height: "38px", fontSize: "20px" } }, avatarEmoji(me.name))
    )
  );
}

/* -------- 문제 화면 -------- */
export function buildQuestion({ q, index, total, timeLimit, trap = false, onAnswer, header }) {
  const meta = catMeta(q.category);
  const screen = el("div", { class: "screen q-screen" });
  if (header) screen.append(header);

  const timerEl = el("div", { class: "timer" }, el("span", {}, "⏱"), el("b", {}, String(timeLimit)), "초");
  screen.append(el("div", { class: "topbar" },
    el("div", { class: "qcount" }, el("b", {}, String(index + 1)), ` / ${total}`),
    timerEl
  ));

  const image = el("div", { class: "q-image" },
    el("span", { class: "chip " + meta.chip + " q-cat" }, meta.icon + " " + q.category),
    el("span", { class: "q-emoji" }, meta.emoji)
  );

  const answers = el("div", { class: "answers" });
  const btns = [];
  q.options.forEach((opt, i) => {
    const b = el("button", {
      class: "ans", type: "button",
      onClick: () => { if (!locked) pick(i); },
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
      el("span", { class: "fast" }, "⚡ 빠른 클릭 시 추가 점수!")
    )
  );

  const body = el("div", { class: "grow" }, image, card);
  screen.append(body);

  let locked = false;
  let shownAt = performance.now();
  function pick(i) {
    if (locked) return;
    locked = true;
    const elapsed = Math.round(performance.now() - shownAt);
    btns.forEach((b) => (b.disabled = true));
    btns[i].classList.add("is-selected");
    onAnswer && onAnswer(i, elapsed);
  }

  return {
    screen, timerEl, btns,
    resetClock() { shownAt = performance.now(); },
    setTimer(sec, danger) { timerEl.querySelector("b").textContent = String(sec); timerEl.classList.toggle("is-danger", !!danger); },
    lock() { locked = true; btns.forEach((b) => (b.disabled = true)); },
    forceChoice(i) { if (i != null && !locked) pick(i); else locked = true; },
    reveal(correctIdx, myChoice) {
      locked = true;
      btns.forEach((b) => (b.disabled = true));
      btns[correctIdx].classList.add("is-correct");
      if (myChoice != null && myChoice !== correctIdx) btns[myChoice].classList.add("is-wrong");
    },
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

  screen.append(el("div", { class: "reveal-mascot" + (isWinner ? "" : "") , html: mascot(pose, { size: isWinner ? "lg" : "" }) }));

  if (isWinner) {
    screen.append(el("div", { class: "reveal-rankwrap" },
      el("div", { class: "reveal-laurel" }, "🏆"),
      el("div", { class: "reveal-rank" }, "1등")
    ));
    screen.append(el("div", { class: "reveal-title win" }, "축하합니다!"));
    screen.append(el("div", { class: "reveal-sub" }, "가장 빠르게 정답을 맞춘 당신은 이번 라운드 1등입니다!"));
  } else {
    screen.append(el("div", { class: "reveal-title " + titleCls }, title));
    if (correct) screen.append(el("div", { class: "reveal-sub" }, rankText || "정답을 맞혔습니다."));
    else if (answered) screen.append(el("div", { class: "reveal-sub" }, `정답은 ${["A", "B", "C", "D"][q.answerIndex]}. ${esc(q.options[q.answerIndex])}`));
    else screen.append(el("div", { class: "reveal-sub" }, `정답은 ${["A", "B", "C", "D"][q.answerIndex]}. ${esc(q.options[q.answerIndex])}`));
  }

  // 점수 브레이크다운
  if (myResult && myResult.total > 0) {
    screen.append(el("div", { class: "score-break" },
      el("div", { class: "sb" }, el("div", { class: "lab" }, "기본 점수"), el("div", { class: "val" }, fmt(myResult.base))),
      settings.speedBonus ? el("div", { class: "op" }, "+") : null,
      settings.speedBonus ? el("div", { class: "sb bonus" }, el("div", { class: "lab" }, "빠른 클릭 보너스"), el("div", { class: "val" }, "+" + fmt(myResult.speedBonus))) : null,
      el("div", { class: "op" }, "="),
      el("div", { class: "sb total" }, el("div", { class: "lab" }, "총점"), el("div", { class: "val" }, fmt(myResult.total)))
    ));
  } else {
    screen.append(el("div", { class: "score-break" },
      el("div", { class: "sb" }, el("div", { class: "lab" }, "획득 점수"), el("div", { class: "val" }, "0"))
    ));
  }

  if (settings.showExplain && q.explanation) {
    screen.append(el("div", { class: "reveal-explain", html: `<b>해설</b> · ${esc(q.explanation)}` }));
  }

  screen.append(el("button", { class: "btn btn--gold", style: { marginTop: "18px", maxWidth: "320px" }, onClick: onNext }, "리더보드 보기 →"));
  return { screen };
}

/* -------- 리더보드 화면 -------- */
export function buildLeaderboard({ players, meId, index, total, timeLeft, onNext, header, nextLabel }) {
  const screen = el("div", { class: "screen lb-screen" });
  if (header) screen.append(header);
  const ranked = rankPlayers(players);
  const me = ranked.find((p) => p.id === meId);

  screen.append(el("div", { class: "topbar" },
    el("div", { class: "qcount" }, el("b", {}, String(index + 1)), ` / ${total}`),
    el("span", { class: "chip chip--gold" }, "실시간 랭킹")
  ));
  screen.append(el("div", { class: "progress", style: { marginBottom: "16px" } }, el("i", { style: { width: ((index + 1) / total * 100) + "%" } })));

  const list = el("div", { class: "lb-table" });
  ranked.slice(0, 8).forEach((p, i) => {
    const answered = p.answeredCount || 0;
    const acc = answered ? Math.round((p.correctCount / answered) * 100) : 0;
    const row = el("div", { class: "lb-row" + (i < 3 ? " top" + (i + 1) : "") + (p.id === meId ? " me" : "") },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "nm" }, `${avatarEmoji(p.name)} ${esc(p.name)}`, p.isBot ? el("small", {}, " ") : null),
      el("div", { class: "sc" }, fmt(p.score)),
      el("div", { class: "ac" }, acc + "%")
    );
    list.append(row);
  });
  screen.append(el("div", { class: "card", style: { padding: "12px" } }, list));

  screen.append(el("div", { class: "mascot-row reverse", style: { marginTop: "14px", justifyContent: "flex-end" } },
    el("div", { html: mascot("point", { size: "sm" }) }),
    el("div", { class: "speech" }, "빠른 정답일수록 더 많은 점수를 얻을 수 있어요!")
  ));

  if (onNext) screen.append(el("button", { class: "btn btn--green", style: { marginTop: "16px" }, onClick: onNext }, nextLabel || "다음 문제로 →"));
  return { screen, me };
}

/* -------- 최종 결과 화면 -------- */
export function buildFinal({ players, meId, onRestart, onHome }) {
  const screen = el("div", { class: "screen final-screen" });
  const ranked = rankPlayers(players);
  const top3 = ranked.slice(0, 3);

  screen.append(el("div", { class: "final-hero", html: mascot("final", { size: "lg", class: "reveal-mascot" }) }));
  screen.append(el("div", { class: "final-title" }, "수고하셨습니다!"));
  screen.append(el("div", { class: "final-sub" }, "지금까지의 여정이 여러분의 더 나은 노후를 위한 소중한 한 걸음이 되길 바랍니다."));

  // 포디움
  const order = [top3[1], top3[0], top3[2]];
  const cls = ["p2", "p1", "p3"];
  const medal = ["🥈", "🥇", "🥉"];
  const podium = el("div", { class: "podium" });
  order.forEach((p, i) => {
    if (!p) return;
    podium.append(el("div", { class: "pcol " + cls[i] },
      el("div", { class: "pav" }, medal[i]),
      el("div", { class: "pname" }, esc(p.name)),
      el("div", { class: "pscore" }, fmt(p.score) + "점"),
      el("div", { class: "pbar" }, String(i === 1 ? 1 : (i === 0 ? 2 : 3)))
    ));
  });
  screen.append(podium);

  const list = el("div", { class: "lb-table final-list" });
  ranked.slice(0, 10).forEach((p, i) => {
    list.append(el("div", { class: "lb-row" + (p.id === meId ? " me" : "") + (i < 3 ? " top" + (i + 1) : "") },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "nm" }, `${avatarEmoji(p.name)} ${esc(p.name)}`),
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
