/* ==========================================================================
   관리자 콘솔
   ========================================================================== */
import { APP, DEFAULT_SETTINGS, CATEGORY_META, catMeta, TEAMS } from "./config.js";
import {
  getQuestions, saveQuestions, resetQuestions, newQuestionId,
  getSettings, saveSettings, getStats, getCategories,
} from "./data.js";
import { DEFAULT_INDIVIDUAL, DEFAULT_TEAM } from "./questions.data.js";
import { el, esc, fmt, toast, mascot } from "./ui.js";
import { makeQR } from "./qr.js";

const main = document.getElementById("admin-main");
const nav = document.getElementById("nav");

const PAGES = [
  { id: "dashboard", icon: "🏠", label: "대시보드" },
  { id: "questions", icon: "📝", label: "문제 관리" },
  { id: "settings", icon: "⚙️", label: "게임 설정" },
  { id: "live", icon: "📡", label: "라이브 진행" },
  { id: "team", icon: "🎲", label: "팀전 관리" },
  { id: "ranking", icon: "🏆", label: "랭킹 관리" },
  { id: "events", icon: "🎉", label: "이벤트 관리" },
  { id: "stats", icon: "📊", label: "통계" },
  { sep: true },
  { id: "home", icon: "🎮", label: "게임 화면", href: "index.html" },
];

const CAT_KEY = "notl.customcats";
function customCats() { try { return JSON.parse(localStorage.getItem(CAT_KEY) || "[]"); } catch { return []; } }
function addCustomCat(name) { const c = customCats(); if (!c.includes(name)) { c.push(name); localStorage.setItem(CAT_KEY, JSON.stringify(c)); } }
function allCategories(mode) {
  const set = new Set([...getCategories("individual"), ...getCategories("team"), ...customCats()]);
  return [...set];
}
function catTagClass(cat) {
  const m = CATEGORY_META[cat];
  if (!m) return "gray";
  return { "chip--blue": "blue", "chip--green": "green", "chip--gold": "gold", "chip--red": "red", "chip--purple": "purple" }[m.chip] || "gray";
}

/* ---------- 네비게이션 ---------- */
function renderNav(active) {
  nav.innerHTML = "";
  PAGES.forEach((p) => {
    if (p.sep) { nav.append(el("div", { class: "sep" })); return; }
    const a = el("a", {
      href: p.href || ("#" + p.id),
      class: active === p.id ? "active" : "",
    }, el("span", { class: "ni" }, p.icon), el("span", {}, p.label));
    nav.append(a);
  });
}

document.getElementById("menu-toggle")?.addEventListener("click", () => document.getElementById("side").classList.toggle("open"));

function route() {
  const id = (location.hash.replace("#", "") || "dashboard");
  const page = PAGES.find((p) => p.id === id) ? id : "dashboard";
  renderNav(page);
  document.getElementById("side")?.classList.remove("open");
  ({
    dashboard: pageDashboard, questions: pageQuestions, settings: pageSettings,
    live: pageLive, team: pageTeam, ranking: pageRanking, events: pageEvents, stats: pageStats,
  }[page] || pageDashboard)();
}

/* ==========================================================================
   대시보드
   ========================================================================== */
function pageDashboard() {
  const ind = getQuestions("individual"), team = getQuestions("team");
  const cats = allCategories();
  const st = getStats();
  const acc = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;
  head("대시보드", "게임 콘텐츠와 진행 현황을 한눈에 확인하세요.");

  main.append(el("div", { class: "grid cols-4" },
    stat("g", "📝", ind.length, "개인전 문항"),
    stat("b", "🎲", team.length, "팀전(함정) 문항"),
    stat("p", "🏷️", cats.length, "카테고리"),
    stat("o", "✅", acc + "%", "누적 정답률"),
  ));

  const quick = el("div", { class: "card mt-16" },
    el("h2", {}, "빠른 시작"),
    el("div", { class: "grid cols-3" },
      quickCard("📝", "문제 관리", "문제를 추가·수정·삭제", () => (location.hash = "questions")),
      quickCard("⚙️", "게임 설정", "문항 수·시간·규칙 설정", () => (location.hash = "settings")),
      quickCard("📡", "라이브 진행", "QR로 다같이 접속해 진행", () => (location.hash = "live")),
    ));
  main.append(quick);

  main.append(el("div", { class: "card mt-16" },
    el("h2", {}, "카테고리 분포"),
    catBars([...getQuestions("individual"), ...getQuestions("team")])));

  main.append(el("div", { class: "card mt-16", style: { display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" } },
    el("div", { html: mascot("point", { size: "sm" }), style: { width: "76px" } }),
    el("div", { style: { flex: "1", minWidth: "220px" } },
      el("b", {}, "행사 진행 팁"),
      el("div", { class: "hint", style: { marginTop: "4px" } },
        "① 게임 설정에서 문항 수·카테고리를 고르고 ② 라이브 진행에서 QR을 띄우면 참가자들이 휴대폰으로 접속합니다. ③ 큰 화면에 진행 화면을, 참가자는 각자 휴대폰으로 4지선다를 풉니다."))
  ));
}
function quickCard(ic, t, d, on) {
  return el("button", { class: "card", style: { textAlign: "left", cursor: "pointer", border: "1px solid var(--a-line)" }, onClick: on },
    el("div", { style: { fontSize: "26px" } }, ic),
    el("div", { style: { fontWeight: "800", marginTop: "6px" } }, t),
    el("div", { class: "hint" }, d));
}
function stat(cls, ic, val, label) {
  return el("div", { class: "stat " + cls }, el("span", { class: "si" }, ic), el("div", { class: "sv" }, String(val)), el("div", { class: "sl" }, label));
}
function catBars(list) {
  const by = {};
  list.forEach((q) => (by[q.category] = (by[q.category] || 0) + 1));
  const max = Math.max(1, ...Object.values(by));
  const wrap = el("div", {});
  Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
    wrap.append(el("div", { style: { display: "flex", alignItems: "center", gap: "10px", margin: "7px 0" } },
      el("span", { class: "tag " + catTagClass(c), style: { minWidth: "104px" } }, el("span", { class: "dot" }), (catMeta(c).icon + " " + c)),
      el("div", { style: { flex: "1", height: "10px", background: "#eef2f8", borderRadius: "6px", overflow: "hidden" } },
        el("i", { style: { display: "block", height: "100%", width: (n / max * 100) + "%", background: "linear-gradient(90deg,#34e08a,#22c55e)", borderRadius: "6px" } })),
      el("b", { style: { minWidth: "28px", textAlign: "right" } }, String(n))));
  });
  return wrap;
}

/* ==========================================================================
   문제 관리
   ========================================================================== */
let qTab = "individual";
let qPage = 1;
let qSearch = "";
let qCatFilter = "";
const PER = 8;

function pageQuestions() {
  head("문제 관리", "개인전·팀전 문제를 추가하고 수정하세요.");

  const tabs = el("div", { class: "tabs" },
    tabBtn("개인전 문제", qTab === "individual", () => { qTab = "individual"; qPage = 1; pageQuestions(); }),
    tabBtn("팀전 문제", qTab === "team", () => { qTab = "team"; qPage = 1; pageQuestions(); }));

  main.append(el("div", { class: "card" },
    el("div", { class: "row", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" } },
      tabs,
      el("div", { style: { display: "flex", gap: "8px" } },
        el("button", { class: "btn ghost sm", onClick: () => restoreDefaults() }, "↺ 기본문제 복원"),
        el("button", { class: "btn green", onClick: () => openEditor(null) }, "＋ 문제 추가"))),
    searchBar(),
    tableArea()));

  main.append(el("div", { class: "card mt-16" }, el("h2", {}, "카테고리 관리"), catManager()));
}
function tabBtn(label, on, click) { return el("button", { class: on ? "on" : "", onClick: click }, label); }

function searchBar() {
  const cats = allCategories();
  const input = el("input", { class: "inp", placeholder: "🔍 문제 내용 검색", value: qSearch });
  input.addEventListener("input", () => { qSearch = input.value; qPage = 1; refreshTable(); });
  const sel = el("select", { class: "inp", style: { maxWidth: "180px" } },
    el("option", { value: "" }, "전체 카테고리"),
    ...cats.map((c) => el("option", { value: c, selected: c === qCatFilter }, c)));
  sel.addEventListener("change", () => { qCatFilter = sel.value; qPage = 1; refreshTable(); });
  return el("div", { class: "searchbar" }, input, sel, el("span", { class: "hint", id: "q-count" }));
}

let tableHost;
function tableArea() { tableHost = el("div", {}); refreshTableInto(tableHost); return tableHost; }
function refreshTable() { if (tableHost) refreshTableInto(tableHost); }
function filteredQuestions() {
  let list = getQuestions(qTab);
  if (qSearch.trim()) list = list.filter((q) => q.question.includes(qSearch.trim()) || q.options.some((o) => o.includes(qSearch.trim())));
  if (qCatFilter) list = list.filter((q) => q.category === qCatFilter);
  return list;
}
function refreshTableInto(host) {
  host.innerHTML = "";
  const list = filteredQuestions();
  const cntEl = document.getElementById("q-count");
  if (cntEl) cntEl.textContent = `총 ${list.length}문항`;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  qPage = Math.min(qPage, pages);
  const slice = list.slice((qPage - 1) * PER, qPage * PER);

  const table = el("table", { class: "table" },
    el("thead", {}, el("tr", {},
      el("th", { style: { width: "48px" } }, "번호"),
      el("th", {}, "문제 내용"),
      el("th", { style: { width: "60px" } }, "정답"),
      el("th", { style: { width: "120px" } }, "카테고리"),
      el("th", { style: { width: "90px" } }, "관리"))));
  const tb = el("tbody", {});
  const KEYS = ["A", "B", "C", "D"];
  slice.forEach((q, i) => {
    tb.append(el("tr", {},
      el("td", {}, String((qPage - 1) * PER + i + 1)),
      el("td", { class: "qtext" }, el("div", { style: { fontWeight: "600" } }, q.question),
        el("div", { class: "hint", style: { marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
          q.options.map((o, k) => `${KEYS[k]}. ${o}`).join("  ·  "))),
      el("td", {}, el("span", { class: "ans-badge" }, KEYS[q.answerIndex])),
      el("td", {}, el("span", { class: "tag " + catTagClass(q.category) }, el("span", { class: "dot" }), q.category)),
      el("td", {}, el("div", { class: "row-actions" },
        el("button", { class: "icon-btn", title: "수정", onClick: () => openEditor(q) }, "✏️"),
        el("button", { class: "icon-btn del", title: "삭제", onClick: () => delQuestion(q) }, "🗑️")))));
  });
  if (!slice.length) tb.append(el("tr", {}, el("td", { colspan: "5", class: "hint", style: { textAlign: "center", padding: "30px" } }, "문제가 없습니다. ‘문제 추가’로 새 문제를 만들어보세요.")));
  table.append(tb);
  host.append(table);

  const pager = el("div", { class: "pager" });
  for (let p = 1; p <= pages; p++) pager.append(el("button", { class: p === qPage ? "on" : "", onClick: () => { qPage = p; refreshTable(); } }, String(p)));
  if (pages > 1) host.append(pager);
}

function delQuestion(q) {
  if (!confirm("이 문제를 삭제할까요?")) return;
  const list = getQuestions(qTab).filter((x) => x.id !== q.id);
  saveQuestions(qTab, list);
  toast("삭제되었습니다", "ok");
  refreshTable();
}
function restoreDefaults() {
  if (!confirm(`${qTab === "team" ? "팀전" : "개인전"} 문제를 기본값으로 되돌릴까요? 추가/수정한 내용이 사라집니다.`)) return;
  resetQuestions(qTab);
  toast("기본 문제로 복원했습니다", "ok");
  pageQuestions();
}

/* 문제 편집 모달 */
function openEditor(q) {
  const isNew = !q;
  const model = q ? JSON.parse(JSON.stringify(q)) : { id: newQuestionId(qTab), category: allCategories()[0] || "기본개념", difficulty: "중", question: "", options: ["", "", "", ""], answerIndex: 0, explanation: "" };
  const KEYS = ["A", "B", "C", "D"];

  const qInput = el("textarea", { class: "inp", placeholder: "문제 지문을 입력하세요" }, model.question);
  const optInputs = [];
  const optWrap = el("div", {});
  model.options.forEach((o, i) => {
    const radio = el("input", { type: "radio", name: "correct", class: "radio", checked: model.answerIndex === i });
    radio.addEventListener("change", () => { model.answerIndex = i; });
    const inp = el("input", { class: "inp", placeholder: `보기 ${KEYS[i]}`, value: o });
    optInputs.push(inp);
    optWrap.append(el("div", { class: "opt-edit" }, radio, el("span", { class: "klabel" }, KEYS[i]), inp));
  });

  const cats = allCategories();
  const catSel = el("select", { class: "inp" }, ...cats.map((c) => el("option", { value: c, selected: c === model.category }, c)), el("option", { value: "__new" }, "＋ 새 카테고리…"));
  catSel.addEventListener("change", () => {
    if (catSel.value === "__new") {
      const name = prompt("새 카테고리 이름");
      if (name && name.trim()) { addCustomCat(name.trim()); model.category = name.trim(); }
      // rebuild options
      catSel.innerHTML = "";
      allCategories().forEach((c) => catSel.append(el("option", { value: c, selected: c === model.category }, c)));
      catSel.append(el("option", { value: "__new" }, "＋ 새 카테고리…"));
    } else model.category = catSel.value;
  });
  const diffSel = el("select", { class: "inp" }, ...["하", "중", "상"].map((d) => el("option", { value: d, selected: d === model.difficulty }, d)));
  const explain = el("textarea", { class: "inp", placeholder: "정답 해설 (선택)" }, model.explanation);

  const body = el("div", { class: "mb" },
    el("div", { class: "field" }, el("label", {}, "문제 내용"), qInput),
    el("div", { class: "field" }, el("label", {}, "보기 (정답을 선택하세요)"), optWrap),
    el("div", { class: "grid cols-2" },
      el("div", { class: "field" }, el("label", {}, "카테고리"), catSel),
      el("div", { class: "field" }, el("label", {}, "난이도"), diffSel)),
    el("div", { class: "field" }, el("label", {}, "해설"), explain));

  const modal = openModal(isNew ? "문제 추가" : "문제 수정", body, [
    { label: "취소", cls: "ghost", on: closeModal },
    { label: "저장하기", cls: "green", on: () => {
      model.question = qInput.value.trim();
      model.options = optInputs.map((x) => x.value.trim());
      model.explanation = explain.value.trim();
      model.difficulty = diffSel.value;
      if (!model.question) { toast("문제 내용을 입력하세요", "err"); return; }
      if (model.options.some((o) => !o)) { toast("보기 4개를 모두 입력하세요", "err"); return; }
      const list = getQuestions(qTab);
      const idx = list.findIndex((x) => x.id === model.id);
      if (idx >= 0) list[idx] = model; else list.push(model);
      saveQuestions(qTab, list);
      closeModal();
      toast(isNew ? "문제가 추가되었습니다" : "저장되었습니다", "ok");
      refreshTable();
    } },
  ]);
}

/* 카테고리 관리 */
function catManager() {
  const wrap = el("div", {});
  const by = {};
  [...getQuestions("individual"), ...getQuestions("team")].forEach((q) => (by[q.category] = (by[q.category] || 0) + 1));
  const chips = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" } });
  allCategories().forEach((c) => {
    chips.append(el("span", { class: "tag " + catTagClass(c) }, el("span", { class: "dot" }), `${catMeta(c).icon} ${c}`, el("b", { style: { marginLeft: "4px" } }, `(${by[c] || 0})`)));
  });
  const nameInp = el("input", { class: "inp", placeholder: "새 카테고리 이름", style: { maxWidth: "220px" } });
  wrap.append(chips, el("div", { class: "searchbar" }, nameInp,
    el("button", { class: "btn blue sm", onClick: () => { const v = nameInp.value.trim(); if (!v) return; addCustomCat(v); nameInp.value = ""; toast("카테고리 추가됨", "ok"); pageQuestions(); } }, "＋ 카테고리 추가")));
  return wrap;
}

/* ==========================================================================
   게임 설정
   ========================================================================== */
function pageSettings() {
  head("게임 설정", "게임 규칙과 진행 방식을 설정합니다.");
  const s = getSettings();
  const cats = allCategories();

  // 게임 유형
  let mode = s.mode;
  const modeTabs = el("div", { class: "tabs" },
    tabBtn("개인전", mode === "individual", (e) => { mode = "individual"; markTabs(modeTabs, 0); }),
    tabBtn("팀전", mode === "team", (e) => { mode = "team"; markTabs(modeTabs, 1); }));

  const qCount = selField("문제 수", [10, 15, 20, 25, 30], s.questionCount, "문항");
  const tLimit = selField("제한 시간", [10, 15, 20, 30], s.timeLimit, "초");

  // 카테고리 체크박스
  const chosen = new Set(s.categories || []);
  const catBox = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } });
  const allChk = checkPill("전체 선택", chosen.size === 0);
  allChk.querySelector("input").addEventListener("change", (e) => {
    if (e.target.checked) { chosen.clear(); [...catBox.querySelectorAll("input")].forEach((c) => { c.checked = false; c.closest(".check").classList.remove("on"); }); }
  });
  cats.forEach((c) => {
    const pill = checkPill(`${catMeta(c).icon} ${c}`, chosen.has(c));
    pill.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) { chosen.add(c); pill.classList.add("on"); allChk.querySelector("input").checked = false; allChk.classList.remove("on"); }
      else { chosen.delete(c); pill.classList.remove("on"); }
    });
    catBox.append(pill);
  });

  // 진행 방식 토글
  const tSpeed = toggle("정답 시 추가 점수 (빠른 클릭)", "가장 빠른 정답자에게 보너스 점수", s.speedBonus);
  const tWin = toggle("1등 애니메이션", "라운드 1등 축하 연출 표시", s.winnerAnim);
  const tRank = toggle("실시간 랭킹 표시", "매 문제 후 순위 갱신", s.liveRank);
  const tExp = toggle("정답 해설 표시", "정답 공개 시 해설 노출", s.showExplain);

  const nBase = numField("정답 기본 점수", s.basePoints);
  const nBonus = numField("빠른 클릭 보너스(최대)", s.speedBonusMax);
  const nBots = numField("가상 참가자 수(개인전 데모)", s.botCount);

  main.append(el("div", { class: "grid cols-2" },
    el("div", { class: "card" },
      el("h2", {}, "기본 규칙"),
      el("div", { class: "field" }, el("label", {}, "게임 유형"), modeTabs),
      qCount.node, tLimit.node,
      el("div", { class: "grid cols-2" }, nBase.node, nBonus.node),
      nBots.node),
    el("div", {},
      el("div", { class: "card" }, el("h2", {}, "카테고리 선택"), el("p", { class: "hint mb-8" }, "선택하지 않으면 전체 출제됩니다."),
        el("div", { style: { marginBottom: "8px" } }, allChk), catBox),
      el("div", { class: "card mt-16" }, el("h2", {}, "게임 진행 방식"), tSpeed.node, tWin.node, tRank.node, tExp.node))
  ));

  main.append(el("div", { class: "card mt-16", style: { display: "flex", justifyContent: "flex-end", gap: "10px" } },
    el("button", { class: "btn ghost", onClick: () => pageSettings() }, "취소"),
    el("button", { class: "btn green", onClick: () => {
      saveSettings({
        mode, questionCount: qCount.value(), timeLimit: tLimit.value(),
        categories: [...chosen], speedBonus: tSpeed.value(), winnerAnim: tWin.value(),
        liveRank: tRank.value(), showExplain: tExp.value(),
        basePoints: nBase.value(), speedBonusMax: nBonus.value(), botCount: nBots.value(),
      });
      toast("설정을 저장했습니다 ✓", "ok");
    } }, "💾 저장하기")));
}
function markTabs(tabsEl, idx) { [...tabsEl.children].forEach((c, i) => c.classList.toggle("on", i === idx)); }
function selField(label, opts, cur, unit) {
  const sel = el("select", { class: "inp" }, ...opts.map((o) => el("option", { value: o, selected: o === cur }, o + (unit || ""))));
  return { node: el("div", { class: "field" }, el("label", {}, label), sel), value: () => Number(sel.value) };
}
function numField(label, cur) {
  const inp = el("input", { class: "inp", type: "number", value: cur });
  return { node: el("div", { class: "field" }, el("label", {}, label), inp), value: () => Number(inp.value) };
}
function checkPill(label, on) {
  const input = el("input", { type: "checkbox", checked: on });
  const pill = el("label", { class: "check" + (on ? " on" : "") }, input, el("span", {}, label));
  input.addEventListener("change", () => pill.classList.toggle("on", input.checked));
  return pill;
}
function toggle(title, desc, on) {
  const input = el("input", { type: "checkbox", checked: on });
  const node = el("div", { class: "toggle-row" },
    el("div", {}, el("div", { class: "tl" }, title), el("div", { class: "td" }, desc)),
    el("label", { class: "switch" }, input, el("span", { class: "sl" })));
  return { node, value: () => input.checked };
}

/* ==========================================================================
   라이브 진행 (호스트)
   ========================================================================== */
async function pageLive() {
  head("라이브 진행", "참가자들이 QR로 접속해 다같이 진행하는 실시간 모드입니다.");
  const host = el("div", { class: "card" });
  host.append(el("div", { class: "hint" }, "불러오는 중..."));
  main.append(host);
  try {
    const live = await import("./live.js");
    live.mountHostPanel(host);
  } catch (e) {
    console.error(e);
    host.innerHTML = "";
    host.append(el("div", { class: "hint" }, "라이브 모듈을 불러오지 못했습니다."));
  }
}

/* ==========================================================================
   팀전 관리
   ========================================================================== */
function pageTeam() {
  head("팀전 관리", "브루마블 팀전 규칙을 설정합니다.");
  const s = getSettings();
  const teamCount = selField("참가 팀 수", [2, 3, 4], s.teamCount, "팀");
  const turns = selField("총 턴 수", [10, 15, 20, 25], s.boardTurns, "턴");
  main.append(el("div", { class: "grid cols-2" },
    el("div", { class: "card" }, el("h2", {}, "규칙"), teamCount.node, turns.node,
      el("button", { class: "btn green", onClick: () => { saveSettings({ teamCount: teamCount.value(), boardTurns: turns.value() }); toast("팀전 설정 저장됨", "ok"); } }, "💾 저장")),
    el("div", { class: "card" }, el("h2", {}, "팀 구성"),
      el("div", {}, TEAMS.map((t) => el("div", { class: "toggle-row" },
        el("div", { class: "tl", style: { color: t.color } }, `${t.token} ${t.name}`),
        el("span", { class: "hint" }, "시작 자본 2,000점"))))),
  ));
  main.append(el("div", { class: "card mt-16" }, el("h2", {}, "함정 퀴즈"),
    el("p", { class: "hint" }, "팀전 함정 칸에서 출제되는 문제입니다. ‘문제 관리 → 팀전 문제’ 탭에서 수정할 수 있습니다."),
    el("button", { class: "btn blue sm", onClick: () => { qTab = "team"; location.hash = "questions"; } }, "팀전 문제 편집 →")));
}

/* ==========================================================================
   랭킹 관리
   ========================================================================== */
function pageRanking() {
  head("랭킹 관리", "명예의 전당(누적 최고 기록)을 관리합니다.");
  const hall = JSON.parse(localStorage.getItem("notl.hall") || "[]");
  const card = el("div", { class: "card" }, el("div", { class: "row", style: { display: "flex", justifyContent: "space-between", marginBottom: "10px" } },
    el("h2", { style: { margin: 0 } }, "🏆 명예의 전당"),
    el("button", { class: "btn red sm", onClick: () => { if (confirm("모든 기록을 삭제할까요?")) { localStorage.removeItem("notl.hall"); toast("초기화됨", "ok"); pageRanking(); } } }, "기록 초기화")));
  if (!hall.length) card.append(el("div", { class: "hint" }, "아직 기록이 없습니다."));
  else {
    const table = el("table", { class: "table" }, el("thead", {}, el("tr", {}, el("th", {}, "순위"), el("th", {}, "이름"), el("th", {}, "점수"), el("th", {}, "날짜"))));
    const tb = el("tbody", {});
    hall.slice(0, 20).forEach((h, i) => tb.append(el("tr", {}, el("td", {}, ["🥇", "🥈", "🥉"][i] || String(i + 1)), el("td", {}, esc(h.name)), el("td", {}, el("b", {}, fmt(h.score) + "점")), el("td", { class: "hint" }, h.date || ""))));
    table.append(tb); card.append(table);
  }
  main.append(card);
}

/* ==========================================================================
   이벤트 관리
   ========================================================================== */
function pageEvents() {
  head("이벤트 관리", "팀전 보드의 개발 호재/악재 이벤트 카드입니다.");
  main.append(el("div", { class: "card" }, el("h2", {}, "🎉 진행 연출"),
    el("div", { class: "toggle-row" }, el("div", {}, el("div", { class: "tl" }, "콘페티 & 효과음"), el("div", { class: "td" }, "정답·1등·구매 시 자동 재생")), el("span", { class: "tag green" }, "활성")),
    el("div", { class: "toggle-row" }, el("div", {}, el("div", { class: "tl" }, "배경 음악(BGM)"), el("div", { class: "td" }, "화면별 자동 전환 (게임 화면 우측 상단 🔊로 켜고 끔)")), el("span", { class: "tag green" }, "활성")),
    el("div", { class: "toggle-row" }, el("div", {}, el("div", { class: "tl" }, "1등 애니메이션"), el("div", { class: "td" }, "게임 설정에서 켜고 끌 수 있습니다")), el("span", { class: "tag green" }, "활성"))));
  main.append(el("div", { class: "card mt-16" }, el("h2", {}, "개발 호재 / 악재 카드"),
    el("p", { class: "hint" }, "팀전 보드의 찬스 칸에서 무작위로 등장합니다."),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } },
      ...["GTX 노선 확정", "산업단지 유치", "택지지구 지정", "역세권 개발", "그린벨트 편입", "금리 인상", "보유세 중과"].map((t) => el("span", { class: "tag " + (t.includes("인상") || t.includes("중과") || t.includes("그린벨트") ? "red" : "green") }, el("span", { class: "dot" }), t)))));
}

/* ==========================================================================
   통계
   ========================================================================== */
function pageStats() {
  head("통계", "누적 플레이 데이터(로컬 기준)입니다.");
  const st = getStats();
  const acc = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;
  main.append(el("div", { class: "grid cols-4" },
    stat("b", "🎮", st.games || 0, "누적 게임"),
    stat("g", "🖊️", st.answers || 0, "총 응답 수"),
    stat("o", "✅", st.correct || 0, "정답 수"),
    stat("p", "🎯", acc + "%", "정답률")));
  main.append(el("div", { class: "card mt-16" }, el("h2", {}, "문항 카테고리 분포"), catBars([...getQuestions("individual"), ...getQuestions("team")])));
}

/* ==========================================================================
   공용 UI
   ========================================================================== */
function head(title, sub) {
  main.innerHTML = "";
  main.append(el("div", { class: "page-head" },
    el("div", {}, el("h1", {}, title), el("div", { class: "sub" }, sub || "")),
    el("div", {}, el("a", { class: "btn ghost sm", href: "index.html" }, "🎮 게임 화면 열기"))));
}
let _modal;
function openModal(title, bodyNode, buttons) {
  closeModal();
  const mf = el("div", { class: "mf" });
  buttons.forEach((b) => mf.append(el("button", { class: "btn " + (b.cls || "ghost"), onClick: b.on }, b.label)));
  const modal = el("div", { class: "modal" },
    el("div", { class: "mh" }, el("h3", {}, title), el("button", { class: "icon-btn", onClick: closeModal }, "✕")),
    bodyNode, mf);
  _modal = el("div", { class: "scrim", onClick: (e) => { if (e.target === _modal) closeModal(); } }, modal);
  document.body.append(_modal);
  return modal;
}
function closeModal() { if (_modal) { _modal.remove(); _modal = null; } }

window.addEventListener("hashchange", route);
route();
