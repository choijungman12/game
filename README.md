# 🏞️ 노후의 땅을 찾아라 — 부동산·토지 퀴즈 게임

> 내일의 가치를 만드는 **토지 투자**, 이제 게임으로!
> 전문 토지 분양 회사(대연P&C)의 노후 대비 세미나·이벤트용 3D 인터랙티브 퀴즈 게임입니다.

정적 사이트(HTML/CSS/JS)로 만들어져 **GitHub Pages에서 그대로 동작**하며, 별도 빌드가 필요 없습니다.

---

## ✨ 주요 기능

### 🎮 개인전 (스피드 4지선다)
- QR코드 스캔 또는 이름 입력으로 **바로 입장**
- 노후 대비 부동산·토지 문제를 **20문항** 풀이 (관리자에서 조정 가능)
- **가장 빠르게 정답을 맞힌 사람에게 추가 점수** + **‘이번 라운드 1등’ 애니메이션**
- 문제마다 갱신되는 **실시간 리더보드**, 마지막에 **최종 순위(포디움)** 발표
- 혼자서도 **가상 참가자(봇)** 와 겨루며 모든 연출을 체험

### 🎲 팀전 (브루마블 3D 보드)
- **Three.js 3D 보드**에서 주사위를 굴려 이동
- **땅 구매 / 통행료 / 개발 호재·악재 찬스 / 보유세 / 함정 퀴즈**
- 팀별 **총자산(현금 + 보유 토지)** 경쟁, 우승 팀 발표
- 2~4팀, 한 기기에서 번갈아 진행 (큰 화면 권장)

### 📡 라이브 진행 (여러 명 동시 접속)
- 관리자 → **라이브 진행**에서 QR/방코드 생성 → 참가자들이 휴대폰으로 접속
- 호스트가 문제를 넘기면 모든 참가자가 각자 휴대폰에서 풀이 → 기기별로 측정한 반응속도로 **공정하게 1등 판정**
- 기본은 로컬(같은 브라우저 여러 탭, 테스트용). **여러 휴대폰 접속은 Firebase 설정**으로 활성화 (아래 참고)

### 🛠️ 관리자 페이지
- **대시보드 / 문제 관리(추가·수정·삭제) / 카테고리 / 게임 설정 / 라이브 진행 / 팀전 / 랭킹 / 이벤트 / 통계**
- 문항 수·제한 시간·카테고리·점수·1등 애니메이션·실시간 랭킹 등 **모든 규칙을 화면에서 수정**

### 🎨 연출 (VFX)
- 화면별 **배경음악(BGM)** 과 **효과음(SFX)** — Web Audio API로 실시간 합성(외부 음원 파일 불필요, 오프라인 동작)
- **콘페티**, 1등 왕관 연출, 마스코트 애니메이션, 3D 카메라, 카운트다운 등
- 우측 상단 🔊 버튼으로 소리 On/Off

---

## 📚 문제 콘텐츠

개인전 **65문항** + 팀전 함정 **18문항**, 아래 카테고리를 포함합니다.

`기본개념` · `토지지목` · `부동산법률` · `부동산정책` · `투자전략`
`부동산공법(국토계획·도시계획·개발행위허가)` · `부동산사법(민법 물권/계약)` · `토지공개념`
`정비사업(재개발/재건축/소규모주택정비/주거환경개선/도시개발)` · `교통인프라(국가철도망/GTX/역세권개발/도로망)`
`산업·택지(산업단지/공공택지)` · `농지·산지(농지법/산지법)`

모든 문제는 생성 후 **부동산·토지 법률 사실 검증**을 거쳤습니다. 관리자에서 자유롭게 편집하세요.

---

## 🚀 실행 / 배포

### 로컬에서 열기
ES 모듈을 사용하므로 파일을 직접 여는 대신 **간단한 로컬 서버**로 여세요.
```bash
# Python
python -m http.server 8080
# 또는 Node
npx serve .
```
→ 브라우저에서 `http://localhost:8080` 접속

### GitHub Pages 배포
1. 이 저장소를 GitHub에 push합니다. (원격: `https://github.com/choijungman12/game.git`)
2. GitHub 저장소 → **Settings → Pages → Build and deployment → Source: `Deploy from a branch`**
3. Branch를 **`main` / `(root)`** 로 지정하고 저장
4. 잠시 후 `https://choijungman12.github.io/game/` 에서 접속됩니다.

`.nojekyll` 파일이 포함되어 있어 Jekyll 처리 없이 그대로 서빙됩니다.

---

## 📱 여러 휴대폰으로 라이브 진행 (선택 — Firebase)

기본 상태에서도 **개인전(봇)·팀전**은 완전히 동작합니다. 실제 행사에서 **여러 휴대폰이 동시에 접속**하려면 무료 Firebase Realtime Database를 연결하세요.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 → **Realtime Database** 만들기(테스트 모드)
2. 프로젝트 설정 → 웹 앱 추가 → `firebaseConfig` 복사
3. `js/config.js`의 `FIREBASE`를 아래처럼 채웁니다.
```js
export const FIREBASE = {
  apiKey: "…",
  authDomain: "…",
  databaseURL: "https://<프로젝트>.firebasedatabase.app",
  projectId: "…",
  appId: "…",
};
```
4. 배포 후, 관리자 → 라이브 진행 → QR을 띄우면 참가자들이 휴대폰으로 접속합니다.

> 별도 설정이 없으면 라이브 모드는 ‘같은 브라우저의 여러 탭’으로 테스트할 수 있습니다.

---

## 🗂️ 프로젝트 구조
```
index.html          참가자 게임 (SPA)
admin.html          관리자 콘솔
css/
  tokens.css        디자인 토큰(색/간격/그림자)
  components.css     공용 컴포넌트
  screens.css        게임 화면 스타일 + 배경 씬
  admin.css          관리자(밝은 테마)
js/
  config.js          브랜드·기본설정·카테고리·Firebase 설정
  data.js            문제/설정/참가자 데이터 접근(localStorage)
  questions.data.js  문제 은행(자동 생성)
  engine.js          점수·랭킹·봇 시뮬레이션
  store.js           라이브 Room(Local/Firebase 드라이버)
  audio.js           BGM/SFX 신스(Web Audio)
  ui.js              DOM·마스코트·콘페티·토스트
  qr.js              QR 코드
  screens.js         게임 화면 빌더(솔로/라이브 공용)
  app.js             메인 컨트롤러(라우터·개인전 엔진)
  team.js            팀전 3D 보드(Three.js)
  live.js            라이브 호스트/참가자
tools/
  build-questions.js 문제 데이터 생성 스크립트
data/questions.json  문제 백업(JSON)
```

---

## 🔧 문제 데이터 재생성
`tools/build-questions.js`는 콘텐츠 산출물(JSON)을 병합해 `js/questions.data.js`를 만듭니다.
```bash
node tools/build-questions.js <출력1.json> <출력2.json>
```

---

made for **대연P&C** · 오늘도, 더 나은 내일을 위해.
