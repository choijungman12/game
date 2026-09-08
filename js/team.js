/* ==========================================================================
   팀전 · 브루마블 3D 보드 (Three.js) — 프리미엄 리메이크
   그림자 / ACES 톤매핑 / 환경광 / 블룸 / 라운드 타일·폰·주사위 / 카메라 연출
   ========================================================================== */
import * as THREE from "three";
import { TEAMS, catMeta, DEFAULT_TEAM_TILES } from "./config.js";
import { getQuestions, shuffle, getTeamTiles } from "./data.js";
import { el, mascot, toast, confetti, fmt, esc, vibrate } from "./ui.js";
import { audio, sfx } from "./audio.js";

const ADDON = "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/";

/* ---- 보드 타일 정의 (config 기본값, 관리자 수정 시 override) ---- */
let TILE_DEFS = DEFAULT_TEAM_TILES;

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

export function startTeamGame(opts) {
  TILE_DEFS = getTeamTiles(); // 관리자에서 수정한 지역명/가격 반영
  const g = new TeamGame(opts);
  g.build();
  return g;
}

class TeamGame {
  constructor({ teamCount = 2, turns = 15, mount, onExit }) {
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
    this._prevAsset = {};
  }

  asset(team) { let v = team.cash; for (const ti of team.owned) v += (TILE_DEFS[ti].price || 0); return v; }
  leaderId() { return [...this.teams].sort((a, b) => this.asset(b) - this.asset(a))[0].id; }

  /* ---------- DOM ---------- */
  async build() {
    audio.startMusic("team");
    const root = el("div", { class: "screen team-screen" });
    this.scoreBar = el("div", { class: "team-scores" });
    this.turnPill = el("div", { class: "turn-pill" },
      el("div", { class: "tp-round" }, `턴 ${this.round}/${this.maxTurns}`),
      el("div", { class: "tp-bar" }, el("i", { style: { width: "6%" } })));
    root.append(el("div", { class: "team-top" }, this.scoreBar, this.turnPill));

    this.canvas = el("canvas", { id: "board-canvas" });
    this.logEl = el("div", { class: "board-log" }, el("span", { class: "log-ic" }, "🎲"), el("span", { class: "log-tx" }, "게임을 시작합니다! 주사위를 굴려주세요."));
    this.boardWrap = el("div", { class: "board-wrap" }, this.canvas, this.logEl);
    root.append(this.boardWrap);

    this.rollBtn = el("button", { class: "btn btn--blue btn-roll", onClick: () => this.roll() },
      el("span", { class: "dice-emoji" }, "🎲"), " 주사위 굴리기");
    root.append(el("div", { class: "team-controls" },
      this.rollBtn,
      el("button", { class: "btn btn--ghost", style: { flex: "0 0 auto", width: "auto" }, onClick: () => this.confirmExit() }, "나가기")));

    this.root = root;
    // 애드온 로드(그림자·환경광·블룸용)
    this.addons = await loadAddons();
    this.mount(root);
    this.teams.forEach((t) => (this._prevAsset[t.id] = this.asset(t)));
    this.renderScores(true);
    requestAnimationFrame(() => { this.initThree(); this.showTurnBanner(this.teams[0]); });
  }

  renderScores(instant) {
    const leader = this.leaderId();
    this.scoreBar.innerHTML = "";
    this.teams.forEach((t, i) => {
      const val = this.asset(t);
      const tv = el("div", { class: "tv", style: { color: "var(--text)" } }, fmt(instant ? val : this._prevAsset[t.id]) + "점");
      const box = el("div", { class: "team-score " + t.cls + (i === this.turnTeam ? " active" : "") + (t.id === leader ? " leader" : ""), style: { color: t.color } },
        el("div", { class: "crown" }, "👑"),
        el("div", { class: "tn", style: { color: "var(--text)" } }, t.token, t.name),
        tv,
        el("div", { class: "to" }, `보유 토지 ${t.owned.length}`));
      this.scoreBar.append(box);
      if (!instant && this._prevAsset[t.id] !== val) { animateCount(tv, this._prevAsset[t.id], val, "점"); tv.classList.add("bump"); }
      this._prevAsset[t.id] = val;
    });
    this.turnPill.querySelector(".tp-round").textContent = `턴 ${this.round}/${this.maxTurns}`;
    this.turnPill.querySelector(".tp-bar > i").style.width = Math.min(100, (this.round / this.maxTurns) * 100) + "%";
  }

  log(msg, kind, icon) {
    this.logEl.className = "board-log enter" + (kind ? " evt-" + kind : "");
    this.logEl.innerHTML = "";
    this.logEl.append(el("span", { class: "log-ic" }, icon || "🎯"), el("span", { class: "log-tx", html: msg }));
    setTimeout(() => this.logEl.classList.remove("enter"), 420);
  }

  showTurnBanner(team) {
    const b = el("div", { class: "turn-banner-fx", style: { color: team.color } },
      el("span", { class: "tbf-token" }, team.token), el("span", {}, `${team.name} 차례!`));
    document.body.append(b);
    setTimeout(() => b.remove(), 1900);
    sfx("whoosh");
  }
  showDiceResult(n) {
    const d = el("div", { class: "dice-result" }, el("div", { class: "num" }, String(n)), el("div", { class: "lbl" }, "DICE"));
    this.boardWrap.append(d);
    setTimeout(() => d.remove(), 950);
  }

  /* ---------- Three.js ---------- */
  initThree() {
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a1728, 26, 72);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 200);
    this.camAngle = Math.PI * 0.22; this.camAngleTarget = this.camAngle;
    this.camRadius = 23; this.camHeight = 21;
    this.introT = 0; // 0→1 fly-in
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this.lookEased = new THREE.Vector3(0, 0, 0);
    this.updateCamera();

    // 환경광(반사) — RoomEnvironment
    try {
      if (this.addons.RoomEnvironment) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const env = new this.addons.RoomEnvironment();
        scene.environment = pmrem.fromScene(env, 0.04).texture;
      }
    } catch (e) { /* 무시 */ }

    // 조명
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2740, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(13, 27, 11); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -16; key.shadow.camera.right = 16; key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 1; key.shadow.camera.far = 70; key.shadow.bias = -0.0004; key.shadow.radius = 5;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.55); fill.position.set(-12, 10, -10); scene.add(fill);
    const rim = new THREE.PointLight(0xffcf8a, 0.9, 60); rim.position.set(-9, 14, -5); scene.add(rim);

    this.buildBoard();
    this.buildTokens();
    this.buildDice();
    this.buildParticles();
    this.setupComposer(w, h);

    // 착지 하이라이트 링
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; scene.add(ring); this.hlRing = ring;

    // 포인터 드래그(관성)
    this.dragging = false; this.lastX = 0;
    this.canvas.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastX = e.clientX; });
    window.addEventListener("pointerup", () => (this.dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.camAngleTarget -= (e.clientX - this.lastX) * 0.008; this.lastX = e.clientX;
    });
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);

    this._clock = performance.now();
    this.animate();
  }

  setupComposer(w, h) {
    const a = this.addons;
    if (!a.EffectComposer) { this.composer = null; return; }
    try {
      const composer = new a.EffectComposer(this.renderer);
      composer.setPixelRatio(Math.min(2, devicePixelRatio));
      composer.setSize(w, h);
      composer.addPass(new a.RenderPass(this.scene, this.camera));
      const bloom = new a.UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.5, 0.86);
      composer.addPass(bloom);
      if (a.OutputPass) composer.addPass(new a.OutputPass());
      this.composer = composer; this.bloom = bloom;
    } catch (e) { this.composer = null; }
  }

  updateCamera() {
    const ease = easeOutCubic(this.introT);
    const r = 42 - (42 - this.camRadius) * ease;
    const hgt = 34 - (34 - this.camHeight) * ease;
    this.camera.position.set(Math.sin(this.camAngle) * r, hgt, Math.cos(this.camAngle) * r);
    this.camera.lookAt(this.lookEased);
  }
  resize() {
    if (!this.renderer) return;
    const w = this.boardWrap.clientWidth, h = this.boardWrap.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
  }

  tilePosition(i) {
    const per = 4, span = 12, step = span / per, half = span / 2;
    let x, z;
    if (i < 4) { x = -half + i * step; z = -half; }
    else if (i < 8) { x = half; z = -half + (i - 4) * step; }
    else if (i < 12) { x = half - (i - 8) * step; z = half; }
    else { x = -half; z = half - (i - 12) * step; }
    return new THREE.Vector3(x, 0, z);
  }

  buildBoard() {
    const rb = (w, h, d, r) => roundedBox(this.addons, w, h, d, r);
    // 베이스(3단)
    const base = new THREE.Mesh(rb(18, 1.3, 18, 0.4), new THREE.MeshStandardMaterial({ color: 0x12233f, roughness: 0.85, metalness: 0.15 }));
    base.position.y = -0.7; base.receiveShadow = true; this.scene.add(base);
    const lip = new THREE.Mesh(rb(16.6, 0.5, 16.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a3358, roughness: 0.6, metalness: 0.35 }));
    lip.position.y = -0.05; lip.receiveShadow = true; this.scene.add(lip);
    const inner = new THREE.Mesh(rb(9.4, 0.5, 9.4, 0.25), new THREE.MeshStandardMaterial({ color: 0x0c1e38, roughness: 0.5, metalness: 0.5 }));
    inner.position.y = 0.05; inner.receiveShadow = true; this.scene.add(inner);

    // 중앙 로고
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4), new THREE.MeshBasicMaterial({ map: centerLogoTex(), transparent: true }));
    logo.rotation.x = -Math.PI / 2; logo.position.y = 0.32; this.scene.add(logo);
    // 네온 프레임(블룸)
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(15.2, 15.2), new THREE.MeshBasicMaterial({ map: frameTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    frame.rotation.x = -Math.PI / 2; frame.position.y = 0.34; this.scene.add(frame);

    this.tileMeshes = [];
    TILE_DEFS.forEach((def, i) => {
      const corner = i % 4 === 0;
      const size = corner ? 2.7 : 2.15;
      const bandColor = tileBase(def);
      const body = new THREE.Mesh(rb(size, 0.55, size, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x16294a, roughness: 0.6, metalness: 0.32, emissive: new THREE.Color(bandColor), emissiveIntensity: 0.08 }));
      const p = this.tilePosition(i);
      body.position.set(p.x, 0.1, p.z);
      body.castShadow = true; body.receiveShadow = true;
      const topMat = new THREE.MeshStandardMaterial({ map: this.labelTexture(def), roughness: 0.62, metalness: 0.0, transparent: true });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, size * 0.9), topMat);
      top.rotation.x = -Math.PI / 2; top.position.set(p.x, 0.39, p.z); top.receiveShadow = true;
      body.userData = { i, def, topMat };
      this.scene.add(body, top);
      this.tileMeshes.push(body);
    });
  }

  refreshTile(i) {
    const def = TILE_DEFS[i];
    const ownerId = this.owners[i];
    const ownerColor = ownerId ? this.teams.find((t) => t.id === ownerId).color : null;
    const mat = this.tileMeshes[i].userData.topMat;
    mat.map = this.labelTexture(def, ownerColor); mat.needsUpdate = true;
    if (ownerColor && !this.tileMeshes[i].userData.building) {
      const p = this.tilePosition(i);
      const col = new THREE.Color(ownerColor);
      const mk = (bw, bh, bd, x, z, y) => {
        const b = new THREE.Mesh(roundedBox(this.addons, bw, bh, bd, 0.06),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.35, emissive: col, emissiveIntensity: 0.35 }));
        b.position.set(p.x + x, y, p.z + z); b.castShadow = true; this.scene.add(b);
        // grow anim
        b.scale.y = 0.01; b.userData.grow = { t0: performance.now(), h: bh };
        this._growing = this._growing || []; this._growing.push(b);
        return b;
      };
      const f = 0.7 + Math.max(0, (def.price - 300)) / 350 * 1.1; // 고가일수록 높은 빌딩
      mk(0.6, 1.4 * f, 0.6, -0.28, -0.28, 0);
      mk(0.46, 0.95 * f, 0.46, 0.3, 0.28, 0);
      if (def.price >= 500) mk(0.34, 0.7 * f, 0.34, 0.06, -0.06, 0);
      this.tileMeshes[i].userData.building = true;
    }
  }

  labelTexture(def, ownerColor) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const g = c.getContext("2d");
    const base = tileBase(def);
    // 배경 그라디언트
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, "#12233f"); bg.addColorStop(1, "#0c1a30");
    g.fillStyle = bg; roundRect(g, 6, 6, 244, 244, 20); g.fill();
    // 상단 색 밴드
    const bandGrad = g.createLinearGradient(0, 0, 256, 0);
    bandGrad.addColorStop(0, shade(base, -10)); bandGrad.addColorStop(1, shade(base, 25));
    g.fillStyle = bandGrad; roundRectTop(g, 10, 10, 236, 58, 16); g.fill();
    // 하단 소유 표시
    if (ownerColor) { g.fillStyle = ownerColor; roundRectBottom(g, 10, 196, 236, 50, 16); g.fill(); }
    // 아이콘 / 텍스트
    g.textAlign = "center";
    if (def.type === "land") {
      g.font = "60px sans-serif"; g.fillText(def.emoji || "🏠", 128, 148);
      g.fillStyle = "#eaf2ff"; g.font = "bold 25px sans-serif"; wrapText(g, def.name, 128, 40, 230, 28);
      g.fillStyle = "#ffe27a"; g.font = "900 30px sans-serif"; g.fillText(fmt(def.price), 128, 186);
      if (ownerColor) { g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("● 보유", 128, 230); }
    } else {
      g.font = "76px sans-serif"; g.fillText(def.icon, 128, 158);
      g.fillStyle = "#fff"; g.font = "bold 26px sans-serif"; wrapText(g, def.name, 128, 44, 230, 30);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
  }

  buildTokens() {
    const profile = [
      [0.0, 0.0], [0.58, 0.0], [0.55, 0.1], [0.34, 0.22], [0.3, 0.42], [0.44, 0.56],
      [0.34, 0.72], [0.18, 0.82], [0.28, 0.96], [0.22, 1.12], [0.0, 1.2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.tokens = this.teams.map((t, i) => {
      const grp = new THREE.Group();
      const col = new THREE.Color(t.color);
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.45, emissive: col, emissiveIntensity: 0.14 });
      const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), mat);
      body.castShadow = true; body.scale.setScalar(1.15);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), mat);
      head.position.y = 1.5; head.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 12, 32),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
      grp.add(body, head, ring);
      const p = this.tilePosition(0), off = tokenOffset(i);
      grp.position.set(p.x + off.x, 0.35, p.z + off.z);
      grp.userData = { baseY: 0.35 };
      this.scene.add(grp);
      return grp;
    });
  }

  buildDice() {
    const mats = DICE_FACES.map((n) => new THREE.MeshStandardMaterial({ map: dicePipTex(n), roughness: 0.3, metalness: 0.05 }));
    this.dice = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats);
    this.dice.castShadow = true; this.dice.visible = false; this.dice.position.set(0, 4, 0);
    this.scene.add(this.dice);
  }

  buildParticles() {
    const N = 120; const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = Math.random() * 12 + 1; pos[i * 3 + 2] = (Math.random() - 0.5) * 26; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9fc6ff, size: 0.12, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(geo, mat); this.scene.add(this.particles);
  }

  animate() {
    this._raf = requestAnimationFrame(() => this.animate());
    const now = performance.now(); const dt = Math.min(0.05, (now - this._clock) / 1000); this._clock = now;
    const t = now * 0.001;

    if (this.introT < 1) this.introT = Math.min(1, this.introT + dt * 0.9);
    // 카메라 관성 + 아이들 회전
    if (!this.dragging && !this.busy) this.camAngleTarget += 0.0009;
    this.camAngle += (this.camAngleTarget - this.camAngle) * 0.08;
    // 시선: 활성 토큰 쪽으로 살짝
    const at = this.tokens && this.tokens[this.turnTeam] ? this.tokens[this.turnTeam].position : new THREE.Vector3();
    this.lookTarget.set(at.x * 0.18, 0.4, at.z * 0.18);
    this.lookEased.lerp(this.lookTarget, 0.05);
    this.updateCamera();

    // 토큰 애니메이션
    if (this.tokens) this.tokens.forEach((tk, i) => {
      tk.children[1].position.y = 1.5 + Math.sin(t * 2 + i) * 0.05;
      if (i === this.turnTeam) tk.rotation.y += dt * 0.8; // 활성 팀 회전
      tk.children[2].material.emissiveIntensity = i === this.turnTeam ? 0.7 + Math.sin(t * 4) * 0.5 : 0.5;
    });
    // 건물 성장
    if (this._growing && this._growing.length) {
      this._growing = this._growing.filter((b) => {
        const k = Math.min(1, (now - b.userData.grow.t0) / 500);
        b.scale.y = easeOutBack(k); b.position.y = b.userData.grow.h * 0.5 * b.scale.y + 0.35;
        return k < 1;
      });
    }
    // 주사위 텀블
    if (this.dice && this.dice.visible) {
      if (this._diceState === "roll") {
        this.dice.rotation.x += this._diceVel.x * dt; this.dice.rotation.y += this._diceVel.y * dt; this.dice.rotation.z += this._diceVel.z * dt;
        this._diceVel.multiplyScalar(0.985);
        this.dice.position.y = 3 + Math.abs(Math.sin(t * 8)) * 0.8;
      } else if (this._diceState === "settle") {
        this.dice.quaternion.slerp(this._diceTarget, 0.18);
        this.dice.position.y += (2.2 - this.dice.position.y) * 0.2;
      }
    }
    // 착지 링 펄스
    if (this.hlRing) {
      const s = 1 + Math.sin(t * 4) * 0.08; this.hlRing.scale.setScalar(s);
      this.hlRing.material.opacity = this._ringOn ? 0.35 + Math.sin(t * 4) * 0.2 : Math.max(0, this.hlRing.material.opacity - dt);
    }
    if (this.particles) { this.particles.rotation.y += dt * 0.02; this.particles.position.y = Math.sin(t * 0.5) * 0.3; }

    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  moveRing(tileIndex) { const p = this.tilePosition(tileIndex); this.hlRing.position.set(p.x, 0.32, p.z); this._ringOn = true; }

  /* ---------- 게임 진행 ---------- */
  async roll() {
    if (this.busy) return;
    this.busy = true; this.rollBtn.disabled = true; this.rollBtn.classList.add("rolling");
    const team = this.teams[this.turnTeam];
    const steps = 1 + Math.floor(Math.random() * 6);
    sfx("dice"); vibrate(30);
    this.log(`${team.token} ${esc(team.name)} 주사위를 굴립니다...`, "info", "🎲");
    // 주사위 굴리기
    this.dice.visible = true; this.dice.position.set(0, 3.4, 0);
    this._diceState = "roll";
    this._diceVel = new THREE.Vector3((Math.random() * 6 + 8), (Math.random() * 6 + 8), (Math.random() * 6 + 6));
    await wait(950);
    this._diceState = "settle";
    this._diceTarget = new THREE.Quaternion().setFromEuler(diceEuler(steps));
    await wait(450);
    this.showDiceResult(steps);
    this.log(`${team.token} ${esc(team.name)} · 주사위 <b>${steps}</b>칸 이동!`, "info", "🎲");
    sfx("coin");
    await wait(650);
    this.dice.visible = false;
    this.rollBtn.classList.remove("rolling");

    await this.moveTeam(team, steps);
    await this.resolveTile(team);
    this.endTurn();
  }

  async moveTeam(team, steps) {
    for (let s = 0; s < steps; s++) {
      const next = (team.pos + 1) % TILE_DEFS.length;
      const passedStart = next === 0;
      team.pos = next;
      this.moveRing(next);
      await this.hopToken(team, next);
      sfx("step");
      if (passedStart && s < steps - 1) { team.cash += 200; this.renderScores(); toast("🚩 START 통과 +200", "ok"); }
    }
    if (team.pos === 0) { team.cash += 200; this.renderScores(); }
  }

  hopToken(team, tileIndex) {
    return new Promise((res) => {
      const idx = this.teams.indexOf(team);
      const tk = this.tokens[idx], off = tokenOffset(idx);
      const p = this.tilePosition(tileIndex);
      const from = tk.position.clone();
      const to = new THREE.Vector3(p.x + off.x, 0.35, p.z + off.z);
      const t0 = performance.now(), dur = 300;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        tk.position.lerpVectors(from, to, k);
        tk.position.y = 0.35 + Math.sin(k * Math.PI) * 1.0;
        const sq = 1 + Math.sin(k * Math.PI) * 0.12; tk.scale.set(2 - sq, sq, 2 - sq); // squash & stretch (base scale 1)
        tk.scale.multiplyScalar(1); // keep near 1
        if (k < 1) requestAnimationFrame(step); else { tk.position.copy(to); tk.scale.set(1, 1, 1); res(); }
      };
      step();
    });
  }

  async resolveTile(team) {
    const i = team.pos, def = TILE_DEFS[i];
    if (def.type === "start") { this.log("🚩 START! 배당금 <b>+200</b>", "good", "🚩"); sfx("coin"); confetti.fountain(0.5); toast("배당금 +200", "ok"); await wait(750); return; }
    if (def.type === "tax") { const tax = Math.round(this.asset(team) * 0.05); team.cash -= tax; this.renderScores(); this.log(`🧾 보유세 <b>-${fmt(tax)}</b> 납부`, "bad", "🧾"); sfx("wrong"); toast(`보유세 -${fmt(tax)}`, "err"); await wait(950); return; }
    if (def.type === "chance") { await this.chance(team, def); return; }
    if (def.type === "trap") { await this.trapQuiz(team); return; }
    if (def.type === "land") { await this.land(team, i, def); return; }
  }

  async chance(team, def) {
    const good = Math.random() < 0.62;
    const pool = good ? CHANCE_GOOD : CHANCE_BAD;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    team.cash += ev.v; this.renderScores();
    this.log(`${def.icon} ${esc(ev.t)} <b>(${ev.v > 0 ? "+" : ""}${fmt(ev.v)})</b>`, good ? "good" : "bad", def.icon);
    if (ev.v > 0) { sfx("coin"); confetti.fountain(0.5); toast(`${ev.t} +${fmt(ev.v)}`, "ok"); }
    else { sfx("wrong"); toast(`${ev.t} ${fmt(ev.v)}`, "err"); }
    await wait(1250);
  }

  async land(team, i, def) {
    const ownerId = this.owners[i];
    if (!ownerId) {
      const buy = await this.buyPrompt(team, def);
      if (buy && team.cash >= def.price) {
        team.cash -= def.price; team.owned.push(i); this.owners[i] = team.id;
        this.refreshTile(i); this.renderScores();
        sfx("buy"); confetti.fountain(0.5); toast(`${def.name} 매입 완료! 🏡`, "ok");
        this.log(`${team.token} ${esc(team.name)} · ${esc(def.name)} 매입! <b>(-${fmt(def.price)})</b>`, "good", "🏡");
      } else this.log(`${team.token} ${esc(team.name)} · ${esc(def.name)} 매입 포기`, "info", "🏳️");
      await wait(500);
    } else if (ownerId === team.id) {
      this.log(`${team.token} 내 땅 ${esc(def.name)}에서 편히 쉬어갑니다.`, "info", "🏡"); await wait(700);
    } else {
      const owner = this.teams.find((t) => t.id === ownerId);
      const toll = Math.round(def.price * 0.5);
      team.cash -= toll; owner.cash += toll; this.renderScores();
      sfx("coin");
      this.log(`💸 ${esc(def.name)}은 ${esc(owner.name)}의 땅! 통행료 <b>${fmt(toll)}</b> 지불`, "bad", "💸");
      toast(`통행료 -${fmt(toll)} → ${owner.name}`, "err");
      await wait(1100);
    }
  }

  buyPrompt(team, def) {
    return new Promise((res) => {
      const m = catMeta("투자전략");
      const scrim = el("div", { class: "modal-scrim" });
      const canAfford = team.cash >= def.price;
      const toll = Math.round(def.price * 0.5);
      const card = el("div", { class: "prop-card" },
        el("div", { class: "pc-head", style: { background: `linear-gradient(135deg, ${def.color}, ${shade(def.color, -30)})` } },
          el("span", { class: "chip chip--gold pc-cat" }, "매물"),
          el("span", { class: "pc-emoji" }, def.emoji || "🏡")),
        el("div", { class: "pc-body" },
          el("div", { class: "pc-name" }, esc(def.name)),
          el("div", { class: "pc-price" }, fmt(def.price) + "점"),
          el("div", { class: "pc-stats" },
            el("div", { class: "pc-stat" }, el("div", { class: "l" }, "통행료 수입"), el("div", { class: "v", style: { color: "var(--green-400)" } }, "+" + fmt(toll))),
            el("div", { class: "pc-stat" }, el("div", { class: "l" }, "보유 자산 반영"), el("div", { class: "v", style: { color: "var(--gold-300)" } }, fmt(def.price)))),
          el("div", { class: "row gap-10" },
            el("button", { class: "btn btn--ghost", onClick: () => { sfx("click"); scrim.remove(); res(false); } }, "패스"),
            el("button", { class: "btn btn--green", disabled: !canAfford, onClick: () => { sfx("select"); scrim.remove(); res(true); } }, canAfford ? "🏡 매입하기" : "자금 부족"))));
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
      const meta = el("div", { class: "trap-meta" },
        el("div", { class: "mascot-row" }, el("div", { html: mascot("worry", { size: "sm" }) }), el("div", { class: "speech" }, "함정 퀴즈입니다! 신중하게 선택하세요.")));
      const finish = (choice) => {
        if (done) return; done = true;
        const correct = choice === q.answerIndex;
        [...answers.children].forEach((b, k) => { b.disabled = true; if (k === q.answerIndex) b.classList.add("is-correct"); else if (k === choice) b.classList.add("is-wrong"); });
        const delta = correct ? 200 : -100;
        team.cash += delta; this.renderScores();
        if (correct) { sfx("correct"); confetti.burst({ count: 70, y: 0.35 }); } else sfx("wrong");
        meta.innerHTML = "";
        meta.append(el("div", { class: "chip " + (correct ? "chip--green" : "chip--red") }, correct ? "정답! +200" : "오답 -100"),
          el("button", { class: "btn btn--gold btn--sm", onClick: () => { audio.startMusic("team"); scrim.remove(); res(); } }, "계속 →"));
      };
      q.options.forEach((opt, i) => answers.append(el("button", { class: "ans", onClick: () => finish(i) }, el("span", { class: "key" }, KEYS[i]), el("span", {}, opt))));
      const card = el("div", { class: "trap-card" },
        el("div", { class: "trap-banner" }, el("div", { class: "tb-inner" }, el("span", { class: "alarm" }, "🚨"), "함정 퀴즈!", el("span", { class: "alarm" }, "🚨"))),
        el("div", { class: "trap-body" },
          el("div", { class: "row spread", style: { marginBottom: "10px" } },
            el("span", { class: "chip " + catMeta(q.category).chip }, catMeta(q.category).icon + " " + q.category),
            el("span", { class: "chip chip--gold" }, `${team.token} ${team.name}`)),
          el("div", { class: "q-text", style: { fontWeight: "800", marginBottom: "14px" } }, q.question),
          answers, meta));
      scrim.append(card); document.body.append(scrim);
    });
  }

  endTurn() {
    this.busy = false; this.rollBtn.disabled = false;
    this._ringOn = false;
    this.turnTeam++;
    if (this.turnTeam >= this.teams.length) { this.turnTeam = 0; this.round++; if (this.round > this.maxTurns) return this.finish(); }
    this.renderScores();
    const t = this.teams[this.turnTeam];
    this.showTurnBanner(t);
    this.log(`${t.token} ${esc(t.name)} 차례입니다. 주사위를 굴리세요!`, "info", "🎯");
  }

  finish() {
    this.rollBtn.disabled = true; this.busy = true; this._ringOn = false;
    audio.startMusic("final");
    const ranked = [...this.teams].sort((a, b) => this.asset(b) - this.asset(a));
    const win = ranked[0];
    confetti.rain(); setTimeout(() => confetti.stopRain(), 5000); sfx("win");
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
    try { if (this.composer) this.composer.dispose(); } catch (e) {}
    if (this.renderer) this.renderer.dispose();
  }
}

/* ---------- 애드온 로더 ---------- */
async function loadAddons() {
  const out = {};
  try { out.RoundedBoxGeometry = (await import(ADDON + "geometries/RoundedBoxGeometry.js")).RoundedBoxGeometry; } catch (e) {}
  try { out.RoomEnvironment = (await import(ADDON + "environments/RoomEnvironment.js")).RoomEnvironment; } catch (e) {}
  try {
    out.EffectComposer = (await import(ADDON + "postprocessing/EffectComposer.js")).EffectComposer;
    out.RenderPass = (await import(ADDON + "postprocessing/RenderPass.js")).RenderPass;
    out.UnrealBloomPass = (await import(ADDON + "postprocessing/UnrealBloomPass.js")).UnrealBloomPass;
    try { out.OutputPass = (await import(ADDON + "postprocessing/OutputPass.js")).OutputPass; } catch (e) {}
  } catch (e) { out.EffectComposer = null; }
  return out;
}

/* ---------- 기하/헬퍼 ---------- */
function roundedBox(addons, w, h, d, r) {
  if (addons && addons.RoundedBoxGeometry) { try { return new addons.RoundedBoxGeometry(w, h, d, 4, r); } catch (e) {} }
  return new THREE.BoxGeometry(w, h, d);
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function tokenOffset(i) { const o = [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]][i] || [0, 0]; return { x: o[0], z: o[1] }; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeOutBack(x) { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
function tileBase(def) { return def.type === "land" ? def.color : def.type === "trap" ? "#ef4444" : def.type === "chance" ? "#38bdf8" : def.type === "tax" ? "#f59e0b" : "#eab308"; }

function animateCount(node, from, to, suffix) {
  const t0 = performance.now(), dur = 600;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const v = Math.round(from + (to - from) * easeOutCubic(k));
    node.textContent = fmt(v) + (suffix || "");
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function roundRectTop(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); }
function roundRectBottom(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r); g.arcTo(x, y + h, x, y + h - r, r); g.closePath(); }
function shade(hex, amt) {
  const c = hex.replace("#", ""); let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function wrapText(g, text, x, y, maxW, lh) {
  let line = "", yy = y;
  for (const ch of text.split("")) { if (g.measureText(line + ch).width > maxW && line) { g.fillText(line, x, yy); line = ch; yy += lh; } else line += ch; }
  g.fillText(line, x, yy);
}
function centerLogoTex() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512; const g = c.getContext("2d");
  g.translate(256, 256); g.rotate(-Math.PI / 4); g.textAlign = "center";
  g.shadowColor = "rgba(255,210,74,0.5)"; g.shadowBlur = 24;
  g.fillStyle = "#ffd24a"; g.font = "900 64px sans-serif"; g.fillText("노후의 땅을", 0, -18); g.fillText("찾아라", 0, 52);
  g.shadowBlur = 0; g.fillStyle = "rgba(200,220,255,0.55)"; g.font = "700 28px sans-serif"; g.fillText("B L U E   M A R B L E", 0, 112);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function frameTex() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512; const g = c.getContext("2d");
  g.strokeStyle = "rgba(255,210,74,0.9)"; g.lineWidth = 6; g.shadowColor = "rgba(255,210,74,0.9)"; g.shadowBlur = 18;
  roundRect(g, 26, 26, 460, 460, 40); g.stroke();
  g.strokeStyle = "rgba(120,180,255,0.5)"; g.lineWidth = 2; g.shadowBlur = 6;
  roundRect(g, 40, 40, 432, 432, 34); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const DICE_FACES = [1, 6, 2, 5, 3, 4]; // +x,-x,+y,-y,+z,-z
function dicePipTex(n) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128; const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 128, 128); bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#dfe6f5");
  g.fillStyle = bg; roundRect(g, 6, 6, 116, 116, 22); g.fill();
  g.fillStyle = "#1d4ed8";
  const P = { 1: [[64, 64]], 2: [[38, 38], [90, 90]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[38, 38], [90, 38], [38, 90], [90, 90]], 5: [[38, 38], [90, 38], [64, 64], [38, 90], [90, 90]], 6: [[38, 32], [90, 32], [38, 64], [90, 64], [38, 96], [90, 96]] };
  (P[n] || []).forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function diceEuler(value) {
  const map = { 1: [0, 0, -Math.PI / 2], 6: [0, 0, Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [Math.PI / 2, 0, 0], 4: [-Math.PI / 2, 0, 0] };
  const r = map[value] || [0, 0, 0]; return new THREE.Euler(r[0], r[1], r[2]);
}
