/* ==========================================================================
   팀전 · 브루마블 3D 보드 (Three.js)
   주사위 → 이동 → 땅 구매 / 함정 퀴즈 / 개발호재 → 팀 총자산 경쟁
   VFX: 물리형 주사위 투척 · 착지 먼지링 · 토큰 스쿼시 · 건물 상승 · 코인 파티클
        · 타일 펄스 · 카메라 추적/줌 · 함정 적색 경보 · 우승 오빗 카메라
   ========================================================================== */
import * as THREE from "three";
import { TEAMS, catMeta } from "./config.js";
import { getQuestions, shuffle, getTeamTiles } from "./data.js";
import { el, mascot, toast, confetti, fmt, esc, vibrate } from "./ui.js";
import { fx } from "./fx.js";
import { audio, sfx } from "./audio.js";

/* ---- 보드 타일 정의 (16칸) — 관리자에서 지역명/가격 수정 시 override ---- */
let TILE_DEFS = [
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
  TILE_DEFS = getTeamTiles(); // 관리자에서 수정한 지역명/가격 반영
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
    this.owners = {};
    this.fxItems = [];          // 매 프레임 업데이트되는 일회성 연출
    this.camTarget = { angle: Math.PI * 0.25, radius: 22, height: 20, look: new THREE.Vector3(0, 0, 0) };
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

    this.rollBtn = el("button", { class: "btn btn--blue btn--pulse", onClick: (e) => { fx.ripple(e); this.roll(); } },
      el("span", { class: "dice-emoji" }, "🎲"), " 주사위 굴리기");
    root.append(el("div", { class: "team-controls" },
      this.rollBtn,
      el("button", { class: "btn btn--ghost", style: { flex: "0 0 auto", width: "auto" }, onClick: () => this.confirmExit() }, "나가기")
    ));

    this.root = root;
    this.mount(root);
    this.renderScores();
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

  /* 점수판 강조 + 숫자 튀는 연출 */
  bumpScore(team, positive = true) {
    const i = this.teams.indexOf(team);
    const box = this.scoreBar.children[i];
    if (!box) return;
    box.animate(
      [{ transform: "scale(1)" }, { transform: `scale(${positive ? 1.12 : 0.93})` }, { transform: "scale(1)" }],
      { duration: 420, easing: "cubic-bezier(0.34,1.56,0.64,1)" }
    );
  }

  log(msg, dice) {
    this.logEl.innerHTML = "";
    this.logEl.append(el("span", { html: msg }));
    if (dice != null) this.logEl.append(el("span", { class: "dice-val" }, "🎲 " + dice));
    this.logEl.style.animation = "none";
    void this.logEl.offsetWidth;
    this.logEl.style.animation = "";
  }

  /* ---------- Three.js ---------- */
  initThree() {
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(w, h, false);
    if ("outputColorSpace" in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a1728, 30, 68);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 220);
    this.camAngle = Math.PI * 0.25;
    this.camRadius = 22;
    this.camHeight = 20;
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.updateCamera();

    /* ---- 라이팅 ---- */
    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1b2b46, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(12, 24, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 4; key.shadow.camera.far = 62;
    key.shadow.camera.left = -16; key.shadow.camera.right = 16;
    key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
    key.shadow.bias = -0.0008;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x69b6ff, 0.75);
    rim.position.set(-14, 10, -12);
    this.scene.add(rim);
    this.warm = new THREE.PointLight(0xffd27a, 0.85, 70);
    this.warm.position.set(-8, 12, -6);
    this.scene.add(this.warm);
    /* 이벤트용 색 조명 (평소 꺼짐) */
    this.eventLight = new THREE.PointLight(0xff4444, 0, 46);
    this.eventLight.position.set(0, 9, 0);
    this.scene.add(this.eventLight);

    this.buildAmbience();
    this.buildBoard();
    this.buildTokens();
    this.buildDice();
    this.buildTurnRing();

    /* 포인터 드래그로 회전 */
    this.dragging = false; this.lastX = 0;
    this.canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastX = e.clientX; });
    window.addEventListener("pointerup", () => (this.dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.camAngle -= (e.clientX - this.lastX) * 0.008;
      this.camTarget.angle = this.camAngle;
      this.lastX = e.clientX;
    });
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);

    this._lastT = performance.now();
    this.animate();
    this.log(`${this.teams[0].token} ${this.teams[0].name} 차례입니다. 주사위를 굴리세요!`);
    this.introSweep();
  }

  /* 시작 시 카메라가 보드를 한 바퀴 훑는 인트로 */
  introSweep() {
    this.camAngle = Math.PI * 0.25 - 1.5;
    this.camHeight = 34; this.camRadius = 30;
    this.camTarget.angle = Math.PI * 0.25;
    this.camTarget.height = 20; this.camTarget.radius = 22;
  }

  /* ---- 별/바닥 글로우 ---- */
  buildAmbience() {
    // 별
    const N = 420, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 60 + Math.random() * 40;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9 + 0.05);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph) * r) * 0.7 + 4;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbcd8ff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false,
    }));
    this.scene.add(this.stars);

    // 바닥 글로우 디스크
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(26, 64),
      new THREE.MeshBasicMaterial({ map: radialGlowTex("#2b6aa8"), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -1.18;
    this.scene.add(glow);
  }

  updateCamera() {
    if (!this.camera) return;
    this.camera.position.set(
      Math.sin(this.camAngle) * this.camRadius,
      this.camHeight,
      Math.cos(this.camAngle) * this.camRadius
    );
    this.camera.lookAt(this.camLook);
  }
  resize() {
    if (!this.renderer) return;
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  tilePosition(i) {
    const per = 4, span = 12;
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

    // 배경 + 미세 그라데이션
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, "#12213a"); bg.addColorStop(1, "#0a1526");
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);

    // 컬러 밴드 + 광택
    g.fillStyle = base; g.fillRect(0, 0, 256, 64);
    const sh = g.createLinearGradient(0, 0, 0, 64);
    sh.addColorStop(0, "rgba(255,255,255,0.42)"); sh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sh; g.fillRect(0, 0, 256, 64);

    if (ownerColor) {
      g.fillStyle = ownerColor; g.fillRect(0, 200, 256, 56);
      const os = g.createLinearGradient(0, 200, 0, 256);
      os.addColorStop(0, "rgba(255,255,255,0.3)"); os.addColorStop(1, "rgba(0,0,0,0.15)");
      g.fillStyle = os; g.fillRect(0, 200, 256, 56);
    }

    g.textAlign = "center";
    if (def.icon) { g.font = "70px sans-serif"; g.fillStyle = "#fff"; g.fillText(def.icon, 128, 152); }
    g.fillStyle = "#eaf2ff"; g.font = "bold 26px sans-serif";
    wrapText(g, def.name, 128, def.icon ? 40 : 120, 230, 30);
    if (def.type === "land") {
      g.fillStyle = "#ffd24a"; g.font = "bold 30px sans-serif";
      g.fillText(fmt(def.price), 128, 186);
    }
    if (ownerColor) { g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("보유", 128, 236); }

    // 테두리
    g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 4; g.strokeRect(2, 2, 252, 252);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  buildBoard() {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(17, 1, 17),
      new THREE.MeshStandardMaterial({ color: 0x14294a, roughness: 0.82, metalness: 0.12 })
    );
    base.position.y = -0.6; base.receiveShadow = true;
    this.scene.add(base);

    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.6, 9.5),
      new THREE.MeshStandardMaterial({ color: 0x0d1f36, roughness: 0.92 })
    );
    inner.position.y = -0.2; inner.receiveShadow = true;
    this.scene.add(inner);

    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 8.6),
      new THREE.MeshBasicMaterial({ map: centerLogoTex(), transparent: true, depthWrite: false })
    );
    logo.rotation.x = -Math.PI / 2; logo.position.y = 0.13;
    this.scene.add(logo);
    this.logo = logo;

    this.tileMeshes = [];
    TILE_DEFS.forEach((def, i) => {
      const isCorner = i % 4 === 0;
      const size = isCorner ? 2.6 : 2.1;
      const geo = new THREE.BoxGeometry(size, 0.5, size);
      const top = new THREE.MeshStandardMaterial({ map: this.labelTexture(def), roughness: 0.68 });
      const side = new THREE.MeshStandardMaterial({ color: 0x1a2f52, roughness: 0.8, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
      const p = this.tilePosition(i);
      mesh.position.set(p.x, 0.05, p.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { i, def, baseY: 0.05 };
      this.scene.add(mesh);
      this.tileMeshes.push(mesh);

      // 함정 타일은 은은한 적색 링이 맴돎
      if (def.type === "trap") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(size * 0.62, size * 0.72, 40),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, 0.33, p.z);
        this.scene.add(ring);
        mesh.userData.trapRing = ring;
      }
    });
  }

  refreshTile(i) {
    const def = TILE_DEFS[i];
    const ownerId = this.owners[i];
    const ownerColor = ownerId ? this.teams.find((t) => t.id === ownerId).color : null;
    const tile = this.tileMeshes[i];
    tile.material[2].map = this.labelTexture(def, ownerColor);
    tile.material[2].needsUpdate = true;

    if (ownerColor && !tile.userData.building) {
      const col = new THREE.Color(ownerColor);
      const grp = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 1.25, 0.82),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.42, metalness: 0.28, emissive: col.clone().multiplyScalar(0.16) })
      );
      body.position.y = 0.62; body.castShadow = true;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 0.5, 4),
        new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(1.25), roughness: 0.35, metalness: 0.3 })
      );
      roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      grp.add(body, roof);

      const p = this.tilePosition(i);
      grp.position.set(p.x, 0.3, p.z);
      grp.scale.set(0.02, 0.02, 0.02);
      this.scene.add(grp);
      tile.userData.building = grp;

      // 건물 상승(스프링) 연출
      this.addFx(560, (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        const over = 1 + Math.sin(k * Math.PI) * 0.22;
        grp.scale.set(e * over, e * over, e * over);
        grp.rotation.y = (1 - e) * Math.PI;
      });
      this.spawnRing(p, ownerColor, { to: 3.4, dur: 900 });
    }
  }

  buildTokens() {
    this.tokens = this.teams.map((t, i) => {
      const grp = new THREE.Group();
      const col = new THREE.Color(t.color);
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.36, metalness: 0.35, emissive: col.clone().multiplyScalar(0.14) });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 22), mat);
      body.position.y = 0.55; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), mat.clone());
      head.position.y = 1.25; head.castShadow = true;
      // 발광 코어
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialGlowTex(t.color), color: 0xffffff, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.set(2.6, 2.6, 1); halo.position.y = 0.8;
      grp.add(body, head, halo);
      const p = this.tilePosition(0);
      const off = tokenOffset(i);
      grp.position.set(p.x + off.x, 0.4, p.z + off.z);
      grp.userData = { halo, body, head };
      this.scene.add(grp);
      return grp;
    });
  }

  /* 현재 턴 팀 발밑의 회전 링 */
  buildTurnRing() {
    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.position.y = 0.33;
    this.scene.add(this.turnRing);
    this.syncTurnRing();
  }
  syncTurnRing() {
    if (!this.turnRing || !this.tokens) return;
    const tk = this.tokens[this.turnTeam];
    this.turnRing.position.set(tk.position.x, 0.33, tk.position.z);
    this.turnRing.material.color.set(this.teams[this.turnTeam].color);
  }

  buildDice() {
    const mats = DICE_FACES.map((n) => new THREE.MeshStandardMaterial({ map: dicePipTex(n), roughness: 0.3, metalness: 0.08 }));
    this.dice = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats);
    this.dice.castShadow = true;
    this.dice.position.set(0, 3.2, 0);
    this.dice.visible = false;
    this.scene.add(this.dice);
  }

  /* ==========================================================================
     VFX 프리미티브
     ========================================================================== */
  addFx(dur, update, onDone) {
    const item = { t0: performance.now(), dur, update, onDone };
    this.fxItems.push(item);
    return item;
  }

  /* 바닥에서 퍼지는 링 */
  spawnRing(pos, color, o = {}) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, (o.y != null ? o.y : 0.34), pos.z);
    this.scene.add(ring);
    const to = o.to || 2.8;
    this.addFx(o.dur || 700, (k) => {
      const s = 0.6 + k * to;
      ring.scale.set(s, s, s);
      ring.material.opacity = 0.9 * (1 - k);
    }, () => { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
  }

  /* 코인 파티클 (구매/배당/통행료) */
  spawnCoins(pos, n = 12, color = "#ffd24a") {
    const tex = coinTex(color);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const s = 0.42 + Math.random() * 0.28;
      sp.scale.set(s, s, 1);
      sp.position.set(pos.x + rand(-0.5, 0.5), 0.6, pos.z + rand(-0.5, 0.5));
      this.scene.add(sp);
      const vx = rand(-0.05, 0.05), vz = rand(-0.05, 0.05);
      let vy = rand(0.11, 0.2);
      let py = sp.position.y;
      this.addFx(1100 + Math.random() * 400, (k, dt) => {
        vy -= 0.0075 * dt;
        py += vy * dt;
        sp.position.set(sp.position.x + vx * dt, Math.max(0.15, py), sp.position.z + vz * dt);
        sp.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        sp.material.rotation += 0.06 * dt;
      }, () => { this.scene.remove(sp); sp.material.dispose(); });
    }
  }

  /* 먼지 링 (주사위/토큰 착지) */
  spawnDust(pos, color = "#cfe3ff") {
    this.spawnRing(pos, color, { to: 2.2, dur: 520, y: 0.3 });
  }

  /* 이벤트 조명 플래시 */
  lightPulse(color, power = 3.2, dur = 700) {
    this.eventLight.color.set(color);
    this.addFx(dur, (k) => { this.eventLight.intensity = power * (1 - k) * (k < 0.12 ? k / 0.12 : 1); },
      () => { this.eventLight.intensity = 0; });
  }

  /* 카메라를 특정 타일로 부드럽게 이동 */
  focusTile(i, o = {}) {
    const p = this.tilePosition(i);
    this.camTarget.angle = Math.atan2(p.x, p.z) + (o.offset || 0);
    this.camTarget.radius = o.radius || 17;
    this.camTarget.height = o.height || 14;
    this.camTarget.look.set(p.x * 0.42, 0, p.z * 0.42);
  }
  resetCamera() {
    this.camTarget.radius = 22;
    this.camTarget.height = 20;
    this.camTarget.look.set(0, 0, 0);
  }

  animate() {
    this._raf = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min(3, (now - this._lastT) / 16.67);
    this._lastT = now;
    const t = now * 0.001;

    // 일회성 연출 업데이트
    for (let i = this.fxItems.length - 1; i >= 0; i--) {
      const it = this.fxItems[i];
      const k = Math.min(1, (now - it.t0) / it.dur);
      it.update(k, dt);
      if (k >= 1) { this.fxItems.splice(i, 1); it.onDone && it.onDone(); }
    }

    // 토큰 부유 + 후광 숨쉬기
    if (this.tokens) this.tokens.forEach((tk, i) => {
      tk.userData.head.position.y = 1.25 + Math.sin(t * 2 + i) * 0.06;
      const active = i === this.turnTeam;
      tk.userData.halo.material.opacity = (active ? 0.55 : 0.22) + Math.sin(t * 2.4 + i) * 0.08;
      tk.userData.halo.scale.setScalar(active ? 3.1 : 2.3);
    });

    // 턴 링 회전/맥동
    if (this.turnRing) {
      this.turnRing.rotation.z += 0.02 * dt;
      const s = 1 + Math.sin(t * 3.2) * 0.09;
      this.turnRing.scale.set(s, s, s);
      this.turnRing.material.opacity = 0.55 + Math.sin(t * 3.2) * 0.22;
    }

    // 함정 타일 링 맥동
    if (this.tileMeshes) this.tileMeshes.forEach((m) => {
      const r = m.userData.trapRing;
      if (!r) return;
      r.rotation.z -= 0.012 * dt;
      r.material.opacity = 0.22 + Math.abs(Math.sin(t * 1.6 + m.userData.i)) * 0.3;
    });

    // 주사위 스핀
    if (this.dice && this.dice.visible && this._diceSpin) {
      this.dice.rotation.x += 0.34 * dt;
      this.dice.rotation.y += 0.27 * dt;
      this.dice.rotation.z += 0.16 * dt;
    }

    // 별 회전 / 중앙 로고 미세 숨쉬기
    if (this.stars) this.stars.rotation.y += 0.0004 * dt;
    if (this.logo) this.logo.material.opacity = 0.82 + Math.sin(t * 0.9) * 0.14;

    // 유휴 시 천천히 회전
    if (!this.dragging && !this.busy) this.camTarget.angle += 0.0007 * dt;

    // 카메라 이징
    const lerp = (a, b, k) => a + (b - a) * k;
    const kf = 1 - Math.pow(0.86, dt);
    this.camAngle = lerp(this.camAngle, this.camTarget.angle, kf);
    this.camRadius = lerp(this.camRadius, this.camTarget.radius, kf);
    this.camHeight = lerp(this.camHeight, this.camTarget.height, kf);
    this.camLook.lerp(this.camTarget.look, kf);
    this.updateCamera();

    this.renderer.render(this.scene, this.camera);
  }

  /* ==========================================================================
     게임 진행
     ========================================================================== */
  async roll() {
    if (this.busy) return;
    this.busy = true; this.rollBtn.disabled = true;
    const team = this.teams[this.turnTeam];
    const steps = 1 + Math.floor(Math.random() * 6);

    this.log(`${team.token} ${team.name} 주사위를 굴립니다...`);
    sfx("dice"); vibrate(30);
    this.camTarget.radius = 18; this.camTarget.height = 15;

    await this.throwDice(steps);

    this.log(`${team.token} ${team.name} · 주사위 결과!`, steps);
    fx.popAt(this.boardWrap, "🎲 " + steps, { color: "#ffe27a", size: "big", dy: -40 });
    await wait(620);
    this.dice.visible = false;
    this.resetCamera();

    await this.moveTeam(team, steps);
    await this.resolveTile(team);
    this.endTurn();
  }

  /* 주사위 투척: 포물선 + 2회 바운스 + 착지 먼지/셰이크 */
  throwDice(value) {
    return new Promise((res) => {
      const d = this.dice;
      d.visible = true;
      this._diceSpin = true;

      const from = new THREE.Vector3(rand(-6, 6), 11, rand(-6, 6));
      const mid = new THREE.Vector3(rand(-2.5, 2.5), 6, rand(-2.5, 2.5));
      const land = new THREE.Vector3(rand(-1.6, 1.6), 1.05, rand(-1.6, 1.6));
      d.position.copy(from);

      const flight = 780;
      this.addFx(flight, (k) => {
        const e = k * k * (3 - 2 * k);
        // 2차 베지어로 낙하 궤적
        const a = from.clone().lerp(mid, e);
        const b = mid.clone().lerp(land, e);
        d.position.copy(a.lerp(b, e));
      }, () => {
        // 바운스
        this._diceSpin = false;
        sfx("step");
        this.spawnDust(land, "#a9c8ef");
        fx.shake(this.boardWrap, 6, 300);
        const bounces = [{ h: 1.5, t: 220 }, { h: 0.6, t: 170 }];
        let idx = 0;
        const baseRot = { x: d.rotation.x, y: d.rotation.y, z: d.rotation.z };
        const target = diceRotationFor(value);
        const doBounce = () => {
          if (idx >= bounces.length) {
            // 최종 회전 정렬
            this.addFx(220, (k) => {
              const e = 1 - Math.pow(1 - k, 3);
              d.rotation.x = lerpAngle(baseRot.x, target[0], e);
              d.rotation.y = lerpAngle(baseRot.y, target[1], e);
              d.rotation.z = lerpAngle(baseRot.z, target[2], e);
            }, () => {
              d.rotation.set(target[0], target[1], target[2]);
              this.spawnRing(land, "#ffd24a", { to: 3, dur: 620 });
              res();
            });
            return;
          }
          const b = bounces[idx++];
          const y0 = d.position.y;
          this.addFx(b.t, (k) => {
            d.position.y = y0 + Math.sin(k * Math.PI) * b.h;
            d.rotation.x += 0.09; d.rotation.z += 0.06;
          }, () => { baseRot.x = d.rotation.x; baseRot.y = d.rotation.y; baseRot.z = d.rotation.z; doBounce(); });
        };
        doBounce();
      });
    });
  }

  async moveTeam(team, steps) {
    const idx = this.teams.indexOf(team);
    for (let s = 0; s < steps; s++) {
      const next = (team.pos + 1) % TILE_DEFS.length;
      const passedStart = next === 0;
      team.pos = next;
      await this.hopToken(team, next, s === steps - 1);
      sfx("step");
      if (passedStart && s < steps - 1) {
        team.cash += 200; this.renderScores(); this.bumpScore(team);
        toast("START 통과 +200", "ok", { icon: "🚩" });
        this.spawnCoins(this.tilePosition(0), 8);
      }
    }
    if (team.pos === 0) { team.cash += 200; this.renderScores(); this.bumpScore(team); }
    this.syncTurnRing();
    void idx;
  }

  /* 토큰 점프 + 스쿼시/스트레치 + 착지 링 */
  hopToken(team, tileIndex, isLast) {
    return new Promise((res) => {
      const idx = this.teams.indexOf(team);
      const tk = this.tokens[idx];
      const off = tokenOffset(idx);
      const p = this.tilePosition(tileIndex);
      const from = tk.position.clone();
      const to = new THREE.Vector3(p.x + off.x, 0.4, p.z + off.z);
      const dur = isLast ? 320 : 250;

      this.addFx(dur, (k) => {
        tk.position.lerpVectors(from, to, k);
        tk.position.y = 0.4 + Math.sin(k * Math.PI) * 1.0;
        // 스쿼시: 이륙/착지에서 납작, 공중에서 길쭉
        const air = Math.sin(k * Math.PI);
        tk.scale.set(1 - air * 0.12, 1 + air * 0.2, 1 - air * 0.12);
        tk.rotation.y += 0.08;
      }, () => {
        tk.position.copy(to);
        tk.scale.set(1, 1, 1);
        this.syncTurnRing();
        if (isLast) {
          this.spawnDust(to, this.teams[idx].color);
          const tile = this.tileMeshes[tileIndex];
          // 타일이 살짝 눌렸다 튀어오름
          this.addFx(420, (k2) => {
            tile.position.y = tile.userData.baseY - Math.sin(k2 * Math.PI) * 0.16;
          }, () => { tile.position.y = tile.userData.baseY; });
        }
        res();
      });
    });
  }

  async resolveTile(team) {
    const i = team.pos;
    const def = TILE_DEFS[i];
    const p = this.tilePosition(i);

    if (def.type === "start") {
      this.log("🚩 START! 배당금 +200을 받았습니다.");
      sfx("coin"); this.spawnCoins(p, 14); this.lightPulse("#ffd24a", 2.4);
      fx.money(0.5, 0.55, 200);
      toast("배당금 +200", "ok", { icon: "🚩" });
      await wait(760); return;
    }
    if (def.type === "tax") {
      const tax = Math.round(this.asset(team) * 0.05);
      team.cash -= tax; this.renderScores(); this.bumpScore(team, false);
      this.log(`🧾 보유세 -${fmt(tax)} 납부`);
      sfx("wrong"); this.lightPulse("#ef4444", 2.6);
      fx.lose(0.5, 0.55, tax);
      fx.shake(this.boardWrap, 8, 420);
      toast(`보유세 -${fmt(tax)}`, "err");
      await wait(950); return;
    }
    if (def.type === "chance") { await this.chance(team, def, p); return; }
    if (def.type === "trap") { await this.trapQuiz(team, i); return; }
    if (def.type === "land") { await this.land(team, i, def, p); return; }
  }

  async chance(team, def, p) {
    const good = Math.random() < 0.62;
    const pool = good ? CHANCE_GOOD : CHANCE_BAD;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    team.cash += ev.v; this.renderScores(); this.bumpScore(team, good);
    this.log(`${def.icon} ${esc(ev.t)} (${ev.v > 0 ? "+" : ""}${fmt(ev.v)})`);
    if (ev.v > 0) {
      sfx("coin"); this.spawnCoins(p, 16); this.lightPulse("#38bdf8", 2.8);
      this.spawnRing(p, "#38bdf8", { to: 4, dur: 820 });
      confetti.fountain(0.5, { count: 30 });
      fx.money(0.5, 0.5, ev.v);
      toast(ev.t, "ok", { icon: "📈" });
    } else {
      sfx("wrong"); this.lightPulse("#ef4444", 2.6);
      fx.lose(0.5, 0.5, Math.abs(ev.v));
      fx.shake(this.boardWrap, 7, 400);
      toast(ev.t, "err");
    }
    await wait(1250);
  }

  async land(team, i, def, p) {
    const ownerId = this.owners[i];
    if (!ownerId) {
      this.focusTile(i, { radius: 15, height: 12 });
      const buy = await this.buyPrompt(team, def);
      this.resetCamera();
      if (buy && team.cash >= def.price) {
        team.cash -= def.price; team.owned.push(i); this.owners[i] = team.id;
        this.refreshTile(i); this.renderScores(); this.bumpScore(team);
        sfx("buy");
        this.spawnCoins(p, 18, team.color);
        this.lightPulse(team.color, 3.2);
        confetti.fountain(0.5, { count: 34 });
        fx.popAt(this.boardWrap, "🏡 매입 완료!", { color: team.color, size: "big", dy: -30 });
        toast(`${def.name} 매입 완료!`, "ok", { icon: "🏡" });
        this.log(`${team.token} ${team.name} · ${esc(def.name)} 매입! (-${fmt(def.price)})`);
      } else {
        this.log(`${team.token} ${team.name} · ${esc(def.name)} 매입을 포기했습니다.`);
      }
      await wait(620);
    } else if (ownerId === team.id) {
      this.log(`${team.token} 내 땅 ${esc(def.name)}에 도착. 편안히 쉬어갑니다.`);
      this.spawnRing(p, team.color, { to: 2.6, dur: 620 });
      await wait(760);
    } else {
      const owner = this.teams.find((t) => t.id === ownerId);
      const toll = Math.round(def.price * 0.5);
      team.cash -= toll; owner.cash += toll;
      this.renderScores(); this.bumpScore(team, false); this.bumpScore(owner, true);
      sfx("coin");
      this.spawnCoins(p, 14, owner.color);
      this.lightPulse(owner.color, 2.6);
      fx.lose(0.5, 0.52, toll);
      fx.shake(this.boardWrap, 6, 360);
      this.log(`💸 ${esc(def.name)}은 ${owner.name}의 땅! 통행료 ${fmt(toll)} 지불`);
      toast(`통행료 -${fmt(toll)} → ${owner.name}`, "err", { icon: "💸" });
      await wait(1150);
    }
  }

  buyPrompt(team, def) {
    return new Promise((res) => {
      const scrim = el("div", { class: "modal-scrim" });
      const canAfford = team.cash >= def.price;
      const card = el("div", { class: "card", style: { width: "min(92vw,420px)", textAlign: "center" } },
        el("div", { style: { fontSize: "48px", filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))" } }, "🏡"),
        el("div", { class: "h-title", style: { fontSize: "20px" } }, esc(def.name)),
        el("div", { class: "text-mut", style: { margin: "6px 0 4px" } }, "이 땅을 매입하시겠습니까?"),
        el("div", { class: "tabnum", style: { fontSize: "28px", fontWeight: "900", color: "var(--gold-300)", margin: "6px 0 4px", textShadow: "0 0 24px rgba(255,210,74,0.4)" } }, fmt(def.price) + "점"),
        el("div", { class: "text-mut", style: { fontSize: "12.5px", marginBottom: "14px" } }, `보유 현금 ${fmt(team.cash)}점`),
        el("div", { class: "row gap-10" },
          el("button", { class: "btn btn--ghost", onClick: () => { sfx("click"); scrim.remove(); res(false); } }, "패스"),
          el("button", { class: "btn btn--green", disabled: !canAfford, onClick: (e) => { sfx("select"); fx.ripple(e); scrim.remove(); res(true); } }, canAfford ? "매입하기" : "자금 부족")
        )
      );
      scrim.append(card); document.body.append(scrim);
    });
  }

  trapQuiz(team, tileIndex) {
    return new Promise((res) => {
      audio.startMusic("trap");
      const q = this.trapQs[this.trapPtr % this.trapQs.length]; this.trapPtr++;
      sfx("trap"); vibrate(40);

      // 3D 경보 연출
      this.focusTile(tileIndex, { radius: 13, height: 10 });
      this.lightPulse("#ef4444", 4.2, 1200);
      this.spawnRing(this.tilePosition(tileIndex), "#ef4444", { to: 5, dur: 900 });
      fx.trapAlert();

      const scrim = el("div", { class: "modal-scrim" });
      const answers = el("div", { class: "answers" });
      const KEYS = ["A", "B", "C", "D"];
      let done = false;

      const finish = (choice, node) => {
        if (done) return; done = true;
        const correct = choice === q.answerIndex;
        [...answers.children].forEach((b, k) => {
          b.disabled = true;
          if (k === q.answerIndex) b.classList.add("is-correct");
          else if (k === choice) b.classList.add("is-wrong");
        });
        const delta = correct ? 200 : -100;
        team.cash += delta; this.renderScores(); this.bumpScore(team, correct);
        if (correct) {
          sfx("correct");
          fx.correct(answers.children[q.answerIndex], 200);
          this.spawnCoins(this.tilePosition(tileIndex), 14);
          this.lightPulse("#22c55e", 3);
        } else {
          sfx("wrong");
          fx.wrong(node || answers.children[choice]);
          this.lightPulse("#ef4444", 3);
        }
        meta.innerHTML = "";
        meta.append(
          el("div", { class: "chip " + (correct ? "chip--green" : "chip--red") }, correct ? "정답! +200" : "오답 -100"),
          el("button", { class: "btn btn--gold btn--sm", onClick: () => {
            audio.startMusic("team"); scrim.remove(); this.resetCamera(); res();
          } }, "계속 →")
        );
      };

      q.options.forEach((opt, i) => {
        const b = el("button", { class: "ans", onClick: (e) => { fx.ripple(e, b, "rgba(239,68,68,0.5)"); finish(i, b); } },
          el("span", { class: "key" }, KEYS[i]), el("span", { class: "opt" }, opt));
        answers.append(b);
      });

      const meta = el("div", { class: "trap-meta" },
        el("div", { class: "mascot-row" },
          el("div", { html: mascot("worry", { size: "sm" }) }),
          el("div", { class: "speech" }, "함정 퀴즈입니다! 신중하게 선택하세요.")));

      const card = el("div", { class: "trap-card" },
        el("div", { class: "trap-banner" },
          el("div", { class: "tb-inner" }, el("span", { class: "alarm" }, "🚨"), "함정 퀴즈!", el("span", { class: "alarm" }, "🚨"))),
        el("div", { class: "trap-body" },
          el("div", { class: "row spread", style: { marginBottom: "10px" } },
            el("span", { class: "chip " + catMeta(q.category).chip }, catMeta(q.category).icon + " " + q.category),
            el("span", { class: "chip chip--gold" }, `${team.token} ${team.name}`)),
          el("div", { class: "q-text", style: { fontWeight: "800", marginBottom: "14px", fontSize: "16.5px", lineHeight: "1.45" } }, q.question),
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
    this.syncTurnRing();
    const t = this.teams[this.turnTeam];
    this.log(`${t.token} ${t.name} 차례입니다. 주사위를 굴리세요!`);
    fx.popAt(this.boardWrap, `${t.token} ${t.name} 차례`, { color: t.color, size: "sm", dy: -70, dur: 1000 });
  }

  finish() {
    this.rollBtn.disabled = true; this.busy = true;
    audio.startMusic("final");
    const ranked = [...this.teams].sort((a, b) => this.asset(b) - this.asset(a));
    const win = ranked[0];

    // 우승 팀 토큰으로 카메라 오빗 + 조명
    const wi = this.teams.indexOf(win);
    this.focusTile(win.pos, { radius: 12, height: 9 });
    this.lightPulse(win.color, 4, 1600);
    this.spawnCoins(this.tilePosition(win.pos), 26, win.color);
    if (this.tokens && this.tokens[wi]) {
      const tk = this.tokens[wi];
      this.addFx(1600, (k) => { tk.rotation.y += 0.06; tk.position.y = 0.4 + Math.sin(k * Math.PI * 3) * 0.4; },
        () => { tk.position.y = 0.4; });
    }
    fx.finale();
    sfx("win");

    const scrim = el("div", { class: "modal-scrim" });
    const list = el("div", { class: "lb-table", style: { marginTop: "8px" } });
    ranked.forEach((t, i) => list.append(el("div", { class: "lb-row" + (i < 3 ? " top" + (i + 1) : ""), "data-key": t.id },
      el("div", { class: "rk" }, String(i + 1)),
      el("div", { class: "av", style: { background: t.color + "33", boxShadow: `0 0 0 1px ${t.color}88` } }, t.token),
      el("div", { class: "nm", style: { color: t.color } }, t.name),
      el("div", { class: "sc" }, fmt(this.asset(t)) + "점"),
      el("div", { class: "ac" }, `땅 ${t.owned.length}`))));

    const card = el("div", { class: "card", style: { width: "min(94vw,440px)", textAlign: "center" } },
      el("div", { html: mascot("final", { size: "lg", class: "reveal-mascot", glow: true }) }),
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
    this.fxItems.length = 0;
    confetti.stopRain();
    // 캐시된 캔버스 텍스처는 아래 traverse 에서 dispose 되므로 캐시도 함께 비운다
    _glowCache.clear();
    _coinCache.clear();
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((mm) => { mm.map && mm.map.dispose(); mm.dispose(); });
        else if (m) { m.map && m.map.dispose(); m.dispose(); }
      });
    }
    if (this.renderer) this.renderer.dispose();
  }
}

/* ---------- 헬퍼 ---------- */
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function lerpAngle(a, b, k) { return a + (b - a) * k; }
function tokenOffset(i) { const o = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]][i] || [0, 0]; return { x: o[0], z: o[1] }; }

function wrapText(g, text, x, y, maxW, lh) {
  const chars = text.split(""); let line = ""; let yy = y;
  for (const ch of chars) {
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
  g.shadowColor = "rgba(255,210,74,0.55)"; g.shadowBlur = 26;
  g.fillStyle = "rgba(255,210,74,0.95)"; g.font = "bold 62px sans-serif";
  g.fillText("노후의 땅을", 0, -20); g.fillText("찾아라", 0, 50);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(200,220,255,0.55)"; g.font = "28px sans-serif";
  g.fillText("BLUE MARBLE", 0, 110);
  const tex = new THREE.CanvasTexture(c);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 방사형 글로우 스프라이트 텍스처 */
const _glowCache = new Map();
function radialGlowTex(hex) {
  if (_glowCache.has(hex)) return _glowCache.get(hex);
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, hex);
  grd.addColorStop(0.35, hexA(hex, 0.5));
  grd.addColorStop(1, hexA(hex, 0));
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  _glowCache.set(hex, tex);
  return tex;
}
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* 코인 스프라이트 */
const _coinCache = new Map();
function coinTex(hex) {
  if (_coinCache.has(hex)) return _coinCache.get(hex);
  const c = document.createElement("canvas"); c.width = c.height = 96;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(38, 32, 6, 48, 48, 46);
  grd.addColorStop(0, "#fff6d8");
  grd.addColorStop(0.5, hex);
  grd.addColorStop(1, "#8a5b00");
  g.fillStyle = grd;
  g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 3;
  g.beginPath(); g.arc(48, 48, 36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "rgba(90,60,0,0.85)"; g.font = "900 44px sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("₩", 48, 51);
  const tex = new THREE.CanvasTexture(c);
  _coinCache.set(hex, tex);
  return tex;
}

const DICE_FACES = [1, 6, 2, 5, 3, 4]; // +x,-x,+y,-y,+z,-z
function dicePipTex(n) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 128, 128);
  grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#dde5f5");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(29,78,216,0.25)"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
  g.fillStyle = "#1d4ed8";
  const P = {
    1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[32, 32], [64, 64], [96, 96]],
    4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
    6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
  };
  (P[n] || []).forEach(([x, y]) => {
    g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
    g.save(); g.globalAlpha = 0.35; g.fillStyle = "#fff";
    g.beginPath(); g.arc(x - 3.5, y - 3.5, 4, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = "#1d4ed8";
  });
  const tex = new THREE.CanvasTexture(c);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/* 해당 숫자가 위(+y)를 향하는 회전값 */
function diceRotationFor(value) {
  const map = { 1: [0, 0, -Math.PI / 2], 6: [0, 0, Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [Math.PI / 2, 0, 0], 4: [-Math.PI / 2, 0, 0] };
  return map[value] || [0, 0, 0];
}
