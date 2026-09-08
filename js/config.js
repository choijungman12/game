/* ==========================================================================
   전역 설정 — 브랜드, 기본 게임 규칙, 카테고리 메타, 라이브 멀티플레이(선택)
   ========================================================================== */

export const APP = {
  brand: "노후의 땅을 찾아라",
  eyebrow: "내일의 가치를 만드는 토지 투자, 이제 게임으로!",
  sub: "부동산 · 토지 퀴즈 게임",
  company: "대연P&C",
  version: "1.0.0",
};

/* ---- 라이브 멀티플레이(여러 휴대폰 동시 접속) ----
   기본은 firebase: null → "로컬/봇 모드"로 즉시 플레이 가능.
   실제 행사에서 QR로 여러 명이 접속하려면 아래에 Firebase 설정을 붙여넣으세요.
   (Realtime Database, 무료 Spark 요금제로 충분 — README 참고)
   예:
   export const FIREBASE = {
     apiKey: "...", authDomain: "...", databaseURL: "https://xxx.firebasedatabase.app",
     projectId: "...", appId: "..."
   };
*/
export const FIREBASE = null;

/* ---- 기본 게임 설정 (관리자에서 수정 가능) ---- */
export const DEFAULT_SETTINGS = {
  mode: "individual",       // individual | team
  questionCount: 20,        // 출제 문항 수
  timeLimit: 15,            // 문항당 제한 시간(초)
  categories: [],           // 빈 배열 = 전체 카테고리
  basePoints: 100,          // 정답 기본 점수
  speedBonusMax: 50,        // 가장 빠른 정답자 보너스(순위별로 차등 지급)
  speedBonus: true,         // 빠른 클릭 추가 점수
  winnerAnim: true,         // 1등 애니메이션
  liveRank: true,           // 실시간 랭킹 표시
  showExplain: true,        // 정답 해설 표시
  botCount: 6,              // 로컬/봇 모드에서 함께 겨루는 가상 참가자 수
  teamCount: 2,             // 팀전 팀 수 (2~4)
  boardTurns: 15,           // 팀전 총 턴 수
};

/* ---- 로컬/봇 모드 가상 참가자 이름 ---- */
export const BOT_NAMES = [
  "김지현", "박서연", "이민호", "최유정", "정우성", "한소희",
  "오세훈", "윤지훈", "강민경", "임채원", "서동현", "노유진",
];

/* ---- 팀전 팀 정의 ---- */
export const TEAMS = [
  { id: "blue",  name: "청룡팀",   cls: "t-blue",  color: "#3b82f6", token: "🔵" },
  { id: "red",   name: "주작팀",   cls: "t-red",   color: "#ef4444", token: "🔴" },
  { id: "green", name: "백호팀",   cls: "t-green", color: "#22c55e", token: "🟢" },
  { id: "gold",  name: "황룡팀",   cls: "t-gold",  color: "#f5b301", token: "🟡" },
];

/* ---- 카테고리 메타: 색상(chip 클래스) + 아이콘 ---- */
export const CATEGORY_META = {
  "기본개념":   { chip: "chip--blue",   color: "#3b82f6", icon: "🏠", emoji: "🏙️" },
  "토지지목":   { chip: "chip--green",  color: "#22c55e", icon: "🗺️", emoji: "🌄" },
  "부동산법률": { chip: "chip--purple", color: "#7c3aed", icon: "📜", emoji: "📑" },
  "부동산정책": { chip: "chip--gold",   color: "#f5b301", icon: "🏛️", emoji: "🏛️" },
  "투자전략":   { chip: "chip--green",  color: "#22c55e", icon: "📈", emoji: "💰" },
  "부동산공법": { chip: "chip--blue",   color: "#3b82f6", icon: "🏙️", emoji: "🏙️" },
  "부동산사법": { chip: "chip--purple", color: "#7c3aed", icon: "⚖️", emoji: "⚖️" },
  "토지공개념": { chip: "chip--gold",   color: "#f5b301", icon: "🌐", emoji: "🌐" },
  "정비사업":   { chip: "chip--red",    color: "#ef4444", icon: "🏗️", emoji: "🏗️" },
  "교통인프라": { chip: "chip--blue",   color: "#3b82f6", icon: "🚄", emoji: "🚄" },
  "산업·택지":  { chip: "chip--green",  color: "#22c55e", icon: "🏭", emoji: "🏭" },
  "농지·산지":  { chip: "chip--green",  color: "#22c55e", icon: "🌾", emoji: "🌾" },
  "회사소개":   { chip: "chip--gold",   color: "#f5b301", icon: "🏢", emoji: "🏢" },
  "물건지도":   { chip: "chip--green",  color: "#22c55e", icon: "🗺️", emoji: "🗺️" },
  "함정퀴즈":   { chip: "chip--red",    color: "#ef4444", icon: "⚠️", emoji: "⚠️" },
};

export function catMeta(cat) {
  return CATEGORY_META[cat] || { chip: "chip", color: "#8ea1bd", icon: "❓", emoji: "🏞️" };
}

/* ---- 팀전 브루마블 보드 칸 기본값 (관리자에서 수정 가능) ---- */
export const DEFAULT_TEAM_TILES = [
  { type: "start", name: "START", icon: "🚩" },
  { type: "land", name: "주문진 택지", price: 300, color: "#22c55e", emoji: "🌾" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "속초 상가", price: 350, color: "#3b82f6", emoji: "🏪" },
  { type: "chance", name: "개발 호재", icon: "📈" },
  { type: "land", name: "구기동 주택", price: 400, color: "#7c3aed", emoji: "🏡" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "당진 산업단지", price: 450, color: "#f5b301", emoji: "🏭" },
  { type: "tax", name: "보유세 납부", icon: "🧾" },
  { type: "land", name: "역세권 오피스", price: 500, color: "#3b82f6", emoji: "🏢" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "GTX 역세권", price: 550, color: "#22c55e", emoji: "🚄" },
  { type: "chance", name: "부동산 뉴스", icon: "📰" },
  { type: "land", name: "신도시 아파트", price: 600, color: "#7c3aed", emoji: "🏙️" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "도심 상업지", price: 650, color: "#f5b301", emoji: "🏬" },
];

/* 로컬 저장 키 */
export const LS = {
  questions: "notl.questions.v1",
  settings: "notl.settings.v1",
  player: "notl.player.v1",
  stats: "notl.stats.v1",
};
