/* ==========================================================================
   팀전 · 브루마블 3D 보드 (Three.js)
   주사위 → 이동 → 땅 구매 / 함정 퀴즈 / 개발호재 → 팀 총자산 경쟁
   ========================================================================== */
import * as THREE from "three";
import { TEAMS, catMeta } from "./config.js";
import { getQuestions } from "./data.js";
import { shuffle } from "./data.js";
import { el, mascot, toast, confetti, fmt, esc, vibrate } from "./ui.js";
import { audio, sfx } from "./audio.js";

/* ---- 보드 타일 정의 (16칸: 코너 4 + 변 12) ---- */
const TILE_DEFS = [
  { type: "start", name: "START", icon: "🚩" },
  { type: "land", name: "주문진 택지", price: 300, color: "#22c55e" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "속초 상가", price: 350, color: "#3b82f6" },
  { type: "chance", name: "개발 호재", icon: "📈" },
  { type: "land", name: "구기동 주택", price: 400, color: "#7c3aed" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "당진 산업단지", price: 450, color: "#f5b301" },
  { type: "tax", name: "보유세 납부", icon: "🧾" },
  { type: "land", name: "역세권 오피스", price: 500, color: "#3b82f6" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "GTX 역세권", price: 550, color: "#22c55e" },
  { type: "chance", name: "부동산 뉴스", icon: "📰" },
  { type: "land", name: "신도시 아파트", price: 600, color: "#7c3aed" },
  { type: "trap", name: "함정 퀴즈", icon: "⚠️" },
  { type: "land", name: "도심 상업지", price: 650, color: "#f5b301" },
];

const CHANCE_GOOD = [
  { t: "GTX 노선 확정! 인근 땅값 급등", v: 300 },
  { t: "신규 산업단지 유치 성공", v: 250 },
  { t: "택지개발지구 지정, 개발 호재!", v: 350 },
  { t: "역세권 개발계획 발표", v: 300 },
  { t: "임대수익 정산 배당금 지급", v: 200 },
];
const CHANCE_BAD = [
  { t: "그린벨트 편입, 개발 제한", v: -250 },
  { t: "금리 인상으로 대출이자 부담", v: -200 },
  { t: "기획부동산 주의보! 계약 취소 비용", v: -300 },
  { t: "보유세 중과 대상 지정", v: -200 },
];

export function startTeamGame({ teamCount = 2, turns = 15, mount, onExit }) {
  const game = new TeamGame(teamCount, turns, mount, onExit);
  game.build();
  return game;
}

class TeamGame {
  constructor(teamCount, turns, mount, onExit) {
    this.teamCount = Math.max(2, Math.min(4, teamCount));
    this.maxTurns = turns;
    this.mount = mount;
    this.onExit = onExit;
    this.teams = TEAMS.slice(0, this.teamCount).map((t) => ({ ...t, cash: 2000, pos: 0, owned: [] }));
    this.turnTeam = 0;
    this.round = 1;
    this.busy = false;
    this.trapQs = shuffle(getQuestions("team"));
    this.trapPtr = 0;
    this.owners = {}; // tileIndex -> teamId
  }

  asset(team) {
    let v = team.cash;
    for (const ti of team.owned) v += (TILE_DEFS[ti].price || 0);
    return v;
  }

  /* ---------- DOM ---------- */
  build() {
    audio.startMusic("team");
    const root = el("div", { class: "screen team-screen" });

    this.scoreBar = el("div", { class: "team-scores" });
    this.turnPill = el("div", { class: "turn-pill" }, `턴 ${this.round}/${this.maxTurns}`);
    root.append(el("div", { class: "team-top" }, this.scoreBar, this.turnPill));

    this.canvas = el("canvas", { id: "board-canvas" });
    this.logEl = el("div", { class: "board-log" }, "게임을 시작합니다! 주사위를 굴려주세요.");
    this.boardWrap = el("div", { class: "board-wrap" }, this.canvas, this.logEl);
    root.append(this.boardWrap);

    this.rollBtn = el("button", { class: "btn btn--blue", onClick: () => this.roll() },
      el("span", { class: "dice-emoji" }, "🎲"), " 주사위 굴리기");
    root.append(el("div", { class: "team-controls" },
      this.rollBtn,
      el("button", { class: "btn btn--ghost", style: { flex: "0 0 auto", width: "auto" }, onClick: () => this.confirmExit() }, "나가기")
    ));

    this.root = root;
    this.mount(root);
    this.renderScores();
    // three 초기화는 레이아웃 후
    requestAnimationFrame(() => this.initThree());
  }

  renderScores() {
    this.scoreBar.innerHTML = "";
    this.teams.forEach((t, i) => {
      const box = el("div", { class: "team-score " + t.cls + (i === this.turnTeam ? " active" : ""), style: { color: t.color } },
        el("div", { class: "tn", style: { color: "var(--text)" } }, t.token + " " + t.name),
        el("div", { class: "tv", style: { color: "var(--text)" } }, fmt(this.asset(t)) + "점"));
      this.scoreBar.append(box);
    });
    this.turnPill.textContent = `턴 ${this.round}/${this.maxTurns}`;
  }

  log(msg, dice) {
    this.logEl.innerHTML = "";
    this.logEl.append(el("span", { html: msg }));
    if (dice != null) this.logEl.append(el("span", { class: "dice-val" }, "🎲 " + dice));
  }

  /* ---------- Three.js ---------- */
  initThree() {
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(w, h, false);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1a30, 26, 60);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 200);
    this.camAngle = Math.PI * 0.25;
    this.camRadius = 22;
    this.camHeight = 20;
    this.updateCamera();

    // lights
    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x22314f, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(10, 22, 8);
    this.scene.add(dir);
    const warm = new THREE.PointLight(0xffd27a, 0.6, 60);
    warm.position.set(-8, 12, -6);
    this.scene.add(warm);

    this.buildBoard();
    this.buildTokens();
    this.buildDice();

    // 포인터 드래그로 회전
    this.dragging = false; this.lastX = 0;
    this.canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastX = e.clientX; });
    window.addEventListener("pointerup", () => (this.dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.camAngle -= (e.clientX - this.lastX) * 0.008; this.lastX = e.clientX; this.updateCamera();
    });
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);

    this.animate();
    this.log(`${this.teams[0].token} ${this.teams[0].name} 차례입니다. 주사위를 굴리세요!`);
  }

  updateCamera() {
    if (!this.camera) return;
    this.camera.position.set(Math.sin(this.camAngle) * this.camRadius, this.camHeight, Math.cos(this.camAngle) * this.camRadius);
    this.camera.lookAt(0, 0, 0);
  }
  resize() {
    if (!this.renderer) return;
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  tilePosition(i) {
    // 16칸 정사각형 링. 코너 0,4,8,12
    const per = 4, span = 12; // 한 변 길이
    const step = span / per;
    const half = span / 2;
    let x, z;
    if (i < 4) { x = -half + i * step; z = -half; }
    else if (i < 8) { x = half; z = -half + (i - 4) * step; }
    else if (i < 12) { x = half - (i - 8) * step; z = half; }
    else { x = -half; z = half - (i - 12) * step; }
    return new THREE.Vector3(x, 0, z);
  }

  labelTexture(def, ownerColor) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const g = c.getContext("2d");
    const base = def.type === "land" ? def.color : def.type === "trap" ? "#ef4444" : def.type === "chance" ? "#38bdf8" : def.type === "tax" ? "#f59e0b" : "#eab308";
    g.fillStyle = "#0e1a2e"; g.fillRect(0, 0, 256, 256);
    // color band
    g.fillStyle = base; g.fillRect(0, 0, 256, 64);
    if (ownerColor) { g.fillStyle = ownerColor; g.fillRect(0, 200, 256, 56); }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "bold 34px sans-serif";
    if (def.icon) { g.font = "70px sans-serif"; g.fillText(def.icon, 128, 150); }
    g.fillStyle = "#eaf2ff"; g.font = "bold 26px sans-serif";
    wrapText(g, def.name, 128, def.icon ? 40 : 120, 230, 30);
    if (def.type === "land") { g.fillStyle = "#ffd24a"; g.font = "bold 30px sans-serif"; g.fillText(fmt(def.price), 128, 185); }
    if (ownerColor) { g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("보유", 128, 236); }
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
  }

  buildBoard() {
    // 베이스 플랫폼
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(17, 1, 17),
      new THREE.MeshStandardMaterial({ color: 0x14294a, roughness: 0.8, metalness: 0.1 })
    );
    base.position.y = -0.6; this.scene.add(base);
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.6, 9.5),
      new THREE.MeshStandardMaterial({ color: 0x0e2038, roughness: 0.9 })
    );
    inner.position.y = -0.2; this.scene.add(inner);
    // 중앙 로고 텍스트
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6), new THREE.MeshBasicMaterial({ map: centerLogoTex(), transparent: true }));
    logo.rotation.x = -Math.PI / 2; logo.position.y = 0.12; this.scene.add(logo);

    this.tileMeshes = [];
    TILE_DEFS.forEach((def, i) => {
      const isCorner = i % 4 === 0;
      const size = isCorner ? 2.6 : 2.1;
      const geo = new THREE.BoxGeometry(size, 0.5, size);
      const top = new THREE.MeshStandardMaterial({ map: this.labelTexture(def), roughness: 0.7 });
      const side = new THREE.MeshStandardMaterial({ color: 0x1a2f52, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
      const p = this.tilePosition(i);
      mesh.position.set(p.x, 0.05, p.z);
      mesh.userData = { i, def };
      this.scene.add(mesh);
      this.tileMeshes.push(mesh);
    });
  }

  refreshTile(i) {
    const def = TILE_DEFS[i];
    const ownerId = this.owners[i];
    const ownerColor = ownerId ? this.teams.find((t) => t.id === ownerId).color : null;
    this.tileMeshes[i].material[2].map = this.labelTexture(def, ownerColor);
    this.tileMeshes[i].material[2].needsUpdate = true;
    // 소유 건물
    if (ownerColor && !this.tileMeshes[i].userData.building) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(ownerColor), roughness: 0.5, metalness: 0.2 }));
      const p = this.tilePosition(i); b.position.set(p.x, 0.9, p.z);
      this.scene.add(b); this.tileMeshes[i].userData.building = b;
    }
  }

  buildTokens() {
    this.tokens = this.teams.map((t, i) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 20),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(t.color), roughness: 0.4, metalness: 0.3 }));
      body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(t.color), roughness: 0.3, metalness: 0.35 }));
      head.position.y = 1.25;
      grp.add(body, head);
      const p = this.tilePosition(0);
      const off = tokenOffset(i);
      grp.position.set(p.x + off.x, 0.4, p.z + off.z);
      this.scene.add(grp);
      return grp;
    });
  }

  buildDice() {
    const mats = DICE_FACES.map((n) => new THREE.MeshStandardMaterial({ map: dicePipTex(n), roughness: 0.35 }));
    this.dice = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats);
    this.dice.position.set(0, 3.2, 0);
    this.dice.visible = false;
    this.scene.add(this.dice);
  }

  animate() {
    this._raf = requestAnimationFrame(() => this.animate());
    const t = performance.now() * 0.001;
    // 토큰 부드러운 상하
    if (this.tokens) this.tokens.forEach((tk, i) => { tk.children[1].position.y = 1.25 + Math.sin(t * 2 + i) * 0.06; });
    if (this.dice && this.dice.visible && this._diceSpin) { this.dice.rotation.x += 0.3; this.dice.rotation.y += 0.24; }
    // 아이들 회전
    if (!this.dragging && !this.busy) { this.camAngle += 0.0006; this.updateCamera(); }
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------- 게임 진행 ---------- */
  async roll() {
    if (this.busy) return;
    this.busy = true; this.rollBtn.disabled = true;
    const team = this.teams[this.turnTeam];
    const steps = 1 + Math.floor(Math.random() * 6);
    // 주사위 연출
    this.dice.visible = true; this._diceSpin = true;
    sfx("dice"); vibrate(30);
    this.log(`${team.token} ${team.name} 주사위를 굴립니다...`);
    await wait(900);
    this._diceSpin = false;
    orientDice(this.dice, steps);
    this.log(`${team.token} ${team.name} · 주사위 결과!`, steps);
    await wait(700);
    this.dice.visible = false;

    await this.moveTeam(team, steps);
    await this.resolveTile(team);
    this.endTurn();
  }

  async moveTeam(team, steps) {
    for (let s = 0; s < steps; s++) {
      const next = (team.pos + 1) % TILE_DEFS.length;
      const passedStart = next === 0;
      team.pos = next;
      await this.hopToken(team, next);
      sfx("step");
      if (passedStart && s < steps - 1) { team.cash += 200; this.renderScores(); toast("🚩 START 통과 +200"); }
    }
    // 착지가 START면 급여
    if (team.pos === 0) { team.cash += 200; this.renderScores(); }
  }

  hopToken(team, tileIndex) {
    return new Promise((res) => {
      const idx = this.teams.indexOf(team);
      const tk = this.tokens[idx];
      const off = tokenOffset(idx);
      const p = this.tilePosition(tileIndex);
      const from = tk.position.clone();
      const to = new THREE.Vector3(p.x + off.x, 0.4, p.z + off.z);
      const t0 = performance.now(); const dur = 260;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        tk.position.lerpVectors(from, to, k);
        tk.position.y = 0.4 + Math.sin(k * Math.PI) * 0.9; // 점프 아치
        if (k < 1) requestAnimationFrame(step); else { tk.position.copy(to); res(); }
      };
      step();
    });
  }

  async resolveTile(team) {
    const i = team.pos;
    const def = TILE_DEFS[i];
    if (def.type === "start") { this.log("🚩 START! 배당금 +200을 받았습니다."); sfx("coin"); toast("배당금 +200", "ok"); await wait(700); return; }
    if (def.type === "tax") { const tax = Math.round(this.asset(team) * 0.05); team.cash -= tax; this.renderScores(); this.log(`🧾 보유세 -${fmt(tax)} 납부`); sfx("wrong"); toast(`보유세 -${fmt(tax)}`, "err"); await wait(900); return; }
    if (def.type === "chance") { await this.chance(team, def); return; }
    if (def.type === "trap") { await this.trapQuiz(team); return; }
    if (def.type === "land") { await this.land(team, i, def); return; }
  }

  async chance(team, def) {
    const good = Math.random() < 0.62;
    const ev = (good ? CHANCE_GOOD : CHANCE_BAD)[Math.floor(Math.random() * (good ? CHANCE_GOOD : CHANCE_BAD).length)];
    team.cash += ev.v; this.renderScores();
    this.log(`${def.icon} ${esc(ev.t)} (${ev.v > 0 ? "+" : ""}${fmt(ev.v)})`);
    if (ev.v > 0) { sfx("coin"); confetti.fountain(0.5); toast(`${ev.t} ${ev.v > 0 ? "+" : ""}${fmt(ev.v)}`, "ok"); }
    else { sfx("wrong"); toast(`${ev.t} ${fmt(ev.v)}`, "err"); }
    await wait(1200);
  }

  async land(team, i, def) {
    const ownerId = this.owners[i];
    if (!ownerId) {
      // 구매 제안
      const buy = await this.buyPrompt(team, def);
      if (buy && team.cash >= def.price) {
        team.cash -= def.price; team.owned.push(i); this.owners[i] = team.id;
        this.refreshTile(i); this.renderScores();
        sfx("buy"); confetti.fountain(0.5); toast(`${def.name} 매입 완료! 🏡`, "ok");
        this.log(`${team.token} ${team.name} · ${esc(def.name)} 매입! (-${fmt(def.price)})`);
      } else {
        this.log(`${team.token} ${team.name} · ${esc(def.name)} 매입을 포기했습니다.`);
      }
      await wait(500);
    } else if (ownerId === team.id) {
      this.log(`${team.token} 내 땅 ${esc(def.name)}에 도착. 편안히 쉬어갑니다.`); await wait(700);
    } else {
      // 통행료
      const owner = this.teams.find((t) => t.id === ownerId);
      const toll = Math.round(def.price * 0.5);
      team.cash -= toll; owner.cash += toll; this.renderScores();
      sfx("coin");
      this.log(`💸 ${esc(def.name)}은 ${owner.name}의 땅! 통행료 ${fmt(toll)} 지불`);
      toast(`통행료 -${fmt(toll)} → ${owner.name}`, "err");
      await wait(1100);
    }
  }

  buyPrompt(team, def) {
    return new Promise((res) => {
      const scrim = el("div", { class: "modal-scrim" });
      const canAfford = team.cash >= def.price;
      const card = el("div", { class: "card", style: { width: "min(92vw,420px)", textAlign: "center" } },
        el("div", { style: { fontSize: "46px" } }, "🏡"),
        el("div", { class: "h-title", style: { fontSize: "20px" } }, esc(def.name)),
        el("div", { class: "text-mut", style: { margin: "6px 0 4px" } }, "이 땅을 매입하시겠습니까?"),
        el("div", { style: { fontSize: "26px", fontWeight: "900", color: "var(--gold-300)", margin: "6px 0 14px" } }, fmt(def.price) + "점"),
        el("div", { class: "row gap-10" },
          el("button", { class: "btn btn--ghost", onClick: () => { sfx("click"); scrim.remove(); res(false); } }, "패스"),
          el("button", { class: "btn btn--green", disabled: !canAfford, onClick: () => { sfx("select"); scrim.remove(); res(true); } }, canAfford ? "매입하기" : "자금 부족")
        )
      );
      scrim.append(card); document.body.append(scrim);
    });
  }

  trapQuiz(team) {
    return new Promise((res) => {
      audio.startMusic("trap");
      const q = this.trapQs[this.trapPtr % this.trapQs.length]; this.trapPtr++;
      sfx("trap"); vibrate(40);
      const scrim = el("div", { class: "modal-scrim" });
      const answers = el("div", { class: "answers" });
      const KEYS = ["A", "B", "C", "D"];
      let done = false;
      const finish = (choice) => {
        if (done) return; done = true;
        const correct = choice === q.answerIndex;
        [...answers.children].forEach((b, k) => {
          b.disabled = true;
          if (k === q.answerIndex) b.classList.add("is-correct");
          else if (k === choice) b.classList.add("is-wrong");
        });
        const delta = correct ? 200 : -100;
        team.cash += delta; this.renderScores();
        if (correct) { sfx("correct"); confetti.burst({ count: 60, y: 0.3 }); }
        else { sfx("wrong"); }
        meta.innerHTML = "";
        meta.append(
          el("div", { class: "chip " + (correct ? "chip--green" : "chip--red") }, correct ? `정답! +200` : `오답 -100`),
          el("button", { class: "btn btn--gold btn--sm", onClick: () => { audio.startMusic("team"); scrim.remove(); res(); } }, "계속 →")
        );
      };
      q.options.forEach((opt, i) => answers.append(
        el("button", { class: "ans", onClick: () => finish(i) }, el("span", { class: "key" }, KEYS[i]), el("span", {}, opt))
      ));
      const meta = el("div", { class: "trap-meta" },
        el("div", { class: "mascot-row" }, el("div", { html: mascot("worry", { size: "sm" }) }), el("div", { class: "speech" }, "함정 퀴즈입니다! 신중하게 선택하세요.")));
      const card = el("div", { class: "trap-card" },
        el("div", { class: "trap-banner" }, el("div", { class: "tb-inner" }, el("span", { class: "alarm" }, "🚨"), "함정 퀴즈!", el("span", { class: "alarm" }, "🚨"))),
        el("div", { class: "trap-body" },
          el("div", { class: "row spread", style: { marginBottom: "10px" } },
            el("span", { class: "chip " + catMeta(q.category).chip }, catMeta(q.category).icon + " " + q.category),
            el("span", { class: "chip chip--gold" }, `${team.token} ${team.name}`)),
          el("div", { class: "q-text", style: { fontWeight: "800", marginBottom: "14px" } }, q.question),
          answers, meta)
      );
      scrim.append(card); document.body.append(scrim);
    });
  }

  endTurn() {
    this.busy = false; this.rollBtn.disabled = false;
    this.turnTeam++;
    if (this.turnTeam >= this.teams.length) {
      this.turnTeam = 0; this.round++;
      if (this.round > this.maxTurns) return this.finish();
    }
    this.renderScores();
    const t = this.teams[this.turnTeam];
    this.log(`${t.token} ${t.name} 차례입니다. 주사위를 굴리세요!`);
  }

  finish() {
    this.rollBtn.disabled = true; this.busy = true;
    audio.startMusic("final");
    const ranked = [...this.teams].sort((a, b) => this.asset(b) - this.asset(a));
    const win = ranked[0];
    confetti.rain(); setTimeout(() => confetti.stopRain(), 4500); sfx("win");
    const scrim = el("div", { class: "modal-scrim" });
    const list = el("div", { class: "lb-table", style: { marginTop: "8px" } });
    ranked.forEach((t, i) => list.append(el("div", { class: "lb-row" + (i < 3 ? " top" + (i + 1) : "") },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "nm", style: { color: t.color } }, `${t.token} ${t.name}`),
      el("div", { class: "sc" }, fmt(this.asset(t)) + "점"),
      el("div", { class: "ac" }, `땅 ${t.owned.length}`))));
    const card = el("div", { class: "card", style: { width: "min(94vw,440px)", textAlign: "center" } },
      el("div", { html: mascot("final", { size: "lg", class: "reveal-mascot" }) }),
      el("div", { class: "h-title" }, "🏆 팀전 종료!"),
      el("div", { class: "reveal-title win", style: { fontSize: "24px" } }, `${win.token} ${win.name} 우승!`),
      list,
      el("div", { class: "row gap-10", style: { marginTop: "16px" } },
        el("button", { class: "btn btn--ghost", onClick: () => { sfx("start"); scrim.remove(); this.dispose(); startTeamGame({ teamCount: this.teamCount, turns: this.maxTurns, mount: this.mount, onExit: this.onExit }); } }, "🔄 다시하기"),
        el("button", { class: "btn btn--green", onClick: () => { sfx("click"); scrim.remove(); this.dispose(); this.onExit(); } }, "🏠 메인으로")));
    scrim.append(card); document.body.append(scrim);
  }

  confirmExit() {
    const scrim = el("div", { class: "modal-scrim" });
    const card = el("div", { class: "card", style: { width: "min(90vw,360px)", textAlign: "center" } },
      el("div", { class: "h-title", style: { fontSize: "18px" } }, "게임을 나갈까요?"),
      el("div", { class: "text-mut", style: { margin: "8px 0 14px" } }, "진행 중인 팀전이 종료됩니다."),
      el("div", { class: "row gap-10" },
        el("button", { class: "btn btn--ghost", onClick: () => scrim.remove() }, "계속하기"),
        el("button", { class: "btn btn--red", onClick: () => { scrim.remove(); this.dispose(); this.onExit(); } }, "나가기")));
    scrim.append(card); document.body.append(scrim);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    if (this.renderer) this.renderer.dispose();
  }
}

/* ---------- 헬퍼 ---------- */
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function tokenOffset(i) { const o = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]][i] || [0, 0]; return { x: o[0], z: o[1] }; }
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(""); let line = ""; let yy = y;
  for (const ch of words) {
    if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, x, yy); line = ch; yy += lh; }
    else line += ch;
  }
  g.fillText(line, x, yy);
}
function centerLogoTex() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  g.translate(256, 256); g.rotate(-Math.PI / 4);
  g.textAlign = "center";
  g.fillStyle = "rgba(255,210,74,0.9)"; g.font = "bold 62px sans-serif";
  g.fillText("노후의 땅을", 0, -20); g.fillText("찾아라", 0, 50);
  g.fillStyle = "rgba(200,220,255,0.5)"; g.font = "28px sans-serif";
  g.fillText("BLUE MARBLE", 0, 110);
  return new THREE.CanvasTexture(c);
}
const DICE_FACES = [1, 6, 2, 5, 3, 4]; // +x,-x,+y,-y,+z,-z
function dicePipTex(n) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#f6f8ff"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#1d4ed8";
  const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[32, 32], [64, 64], [96, 96]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] };
  (P[n] || []).forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); });
  return new THREE.CanvasTexture(c);
}
function orientDice(dice, value) {
  // 해당 숫자가 위(+y)를 향하도록 대략 회전
  const map = { 1: [0, 0, -Math.PI / 2], 6: [0, 0, Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [Math.PI / 2, 0, 0], 4: [-Math.PI / 2, 0, 0] };
  const r = map[value] || [0, 0, 0];
  dice.rotation.set(r[0], r[1], r[2]);
}
