// Merge the two content-workflow outputs into js/questions.data.js
// Run: node tools/build-questions.js
const fs = require("fs");
const path = require("path");

const OUT_FILES = process.argv.slice(2);
if (OUT_FILES.length === 0) {
  console.error("Usage: node build-questions.js <output1.json> [output2.json ...]");
  process.exit(1);
}

let individual = [];
let team = [];
for (const f of OUT_FILES) {
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  const r = raw.result || raw;
  if (Array.isArray(r.individual)) individual.push(...r.individual);
  if (Array.isArray(r.team)) team.push(...r.team);
}

function clean(list, prefix) {
  const seen = new Set();
  const out = [];
  let n = 0;
  for (const q of list) {
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length !== 4) continue;
    if (typeof q.answerIndex !== "number" || q.answerIndex < 0 || q.answerIndex > 3) continue;
    const key = q.question.trim().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
    out.push({
      id: prefix + String(n).padStart(3, "0"),
      category: String(q.category || "기본개념").trim(),
      difficulty: ["하", "중", "상"].includes(q.difficulty) ? q.difficulty : "중",
      question: q.question.trim(),
      options: q.options.map((o) => String(o).trim()),
      answerIndex: q.answerIndex,
      explanation: String(q.explanation || "").trim(),
    });
  }
  return out;
}

const ind = clean(individual, "i");
const tm = clean(team, "t");

const header = `/* ==========================================================================
   문제 은행 (자동 생성 — tools/build-questions.js)
   개인전 ${ind.length}문항 · 팀전(함정) ${tm.length}문항
   생성 방식: Opus 4.8 병렬 출제 → 부동산·토지 법률 팩트체크 검증
   관리자 페이지에서 자유롭게 추가/수정/삭제할 수 있습니다.
   ========================================================================== */
`;

const body =
  header +
  "export const DEFAULT_INDIVIDUAL = " +
  JSON.stringify(ind, null, 2) +
  ";\n\nexport const DEFAULT_TEAM = " +
  JSON.stringify(tm, null, 2) +
  ";\n";

const target = path.join(__dirname, "..", "js", "questions.data.js");
fs.writeFileSync(target, body, "utf8");

// also write a plain JSON for reference / admin export
fs.writeFileSync(
  path.join(__dirname, "..", "data", "questions.json"),
  JSON.stringify({ individual: ind, team: tm }, null, 2),
  "utf8"
);

// category summary
const bycat = {};
for (const q of [...ind, ...tm]) bycat[q.category] = (bycat[q.category] || 0) + 1;
console.log("Wrote js/questions.data.js");
console.log("individual:", ind.length, "team:", tm.length);
console.log("categories:", JSON.stringify(bycat, null, 0));
