/* ==========================================================================
   게임 엔진(순수 로직) — 점수 계산 / 라운드 순위 / 봇 시뮬레이션
   반응속도(elapsed)는 각 참가자 기기에서 "문제 표시→클릭"으로 측정 → 시계 오차 무관, 공정.
   ========================================================================== */

/* 정답자 중 빠른 순으로 보너스를 차등 지급. 가장 빠른 정답자가 '이번 라운드 1등'. */
export function scoreRound(question, submissions, settings) {
  const base = settings.basePoints || 100;
  const maxBonus = settings.speedBonus ? (settings.speedBonusMax || 50) : 0;
  const limitMs = (settings.timeLimit || 15) * 1000;

  const results = {};
  const correct = [];
  for (const s of submissions) {
    const isCorrect = s.choice === question.answerIndex;
    results[s.pid] = {
      pid: s.pid,
      choice: s.choice,
      answered: s.choice != null,
      correct: isCorrect,
      elapsed: s.elapsed,
      base: isCorrect ? base : 0,
      speedBonus: 0,
      total: isCorrect ? base : 0,
      rank: null,
    };
    if (isCorrect) correct.push(s);
  }
  // 정답자 빠른 순 정렬
  correct.sort((a, b) => (a.elapsed ?? 9e9) - (b.elapsed ?? 9e9));
  let winner = null;
  correct.forEach((s, i) => {
    const r = results[s.pid];
    r.rank = i + 1;
    // 남은 시간 비율 기반 보너스 + 1위 가중
    const frac = Math.max(0, 1 - (s.elapsed ?? limitMs) / limitMs);
    let bonus = Math.round(maxBonus * frac);
    if (i === 0) bonus = Math.max(bonus, maxBonus); // 최속 정답자는 최대 보너스 보장
    r.speedBonus = bonus;
    r.total = r.base + bonus;
    if (i === 0) winner = s.pid;
  });
  return { results, winner, correctCount: correct.length };
}

/* 봇 프로필 — 이름별로 실력(정답 확률)과 반응속도 경향을 결정 */
export function makeBots(names, count) {
  const bots = [];
  for (let i = 0; i < Math.min(count, names.length); i++) {
    const seed = hash(names[i]);
    bots.push({
      pid: "bot_" + i,
      name: names[i],
      isBot: true,
      skill: 0.55 + ((seed % 100) / 100) * 0.4,      // 0.55 ~ 0.95 정답 확률
      speedBias: 0.6 + ((seed >> 3) % 100) / 100 * 0.8, // 반응속도 편향
      score: 0,
      correctCount: 0,
    });
  }
  return bots;
}

/* 한 문제에 대한 봇들의 제출을 생성 */
export function simulateBots(bots, question, settings) {
  const limitMs = (settings.timeLimit || 15) * 1000;
  const hard = question.difficulty === "상" ? 0.75 : question.difficulty === "중" ? 0.9 : 1.0;
  return bots.map((b) => {
    const willAnswer = Math.random() < 0.97;
    const correct = willAnswer && Math.random() < b.skill * hard;
    // 반응시간: 0.8~ (limit*0.9), 실력 좋을수록 대체로 빠름
    const t = (0.5 + Math.random() * 1.0) * b.speedBias * (correct ? 1 : 1.2);
    const elapsed = Math.min(limitMs - 200, Math.max(600, t * 2600 + Math.random() * 1500));
    let choice;
    if (!willAnswer) choice = null;
    else if (correct) choice = question.answerIndex;
    else {
      const wrong = [0, 1, 2, 3].filter((x) => x !== question.answerIndex);
      choice = wrong[(Math.random() * wrong.length) | 0];
    }
    return { pid: b.pid, choice, elapsed: choice == null ? null : Math.round(elapsed) };
  });
}

export function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/* 리더보드 정렬 */
export function rankPlayers(players) {
  return [...players].sort((a, b) =>
    (b.score - a.score) || (b.correctCount - a.correctCount) || (a.name < b.name ? -1 : 1)
  );
}

/* 레벨(누적 점수 기반, 연출용) */
export function levelFor(score) { return 1 + Math.floor((score || 0) / 300); }
