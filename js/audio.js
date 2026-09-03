/* ==========================================================================
   오디오 엔진 — Web Audio API로 SFX/BGM을 실시간 합성
   외부 음원 파일 없이 동작(오프라인/GitHub Pages OK). 첫 사용자 제스처에 unlock.
   ========================================================================== */

const MUTE_KEY = "notl.muted";
const MUSIC_KEY = "notl.music";

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    this.musicOn = localStorage.getItem(MUSIC_KEY) !== "0"; // default on
    this._musicTimer = null;
    this._musicTheme = null;
    this._nextNoteTime = 0;
    this._step = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.master);
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  setMusicOn(on) {
    this.musicOn = on;
    localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
    if (!on) this.stopMusic();
    else if (this._musicTheme) this.startMusic(this._musicTheme);
  }

  /* ---------- 저수준 신스 ---------- */
  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(o = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = (o.at || this._now()) + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + (o.dur || 0.2));
    const peak = (o.gain == null ? 0.3 : o.gain);
    const a = o.attack == null ? 0.005 : o.attack;
    const d = o.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }

  noise(o = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = (o.at || this._now()) + (o.delay || 0);
    const dur = o.dur || 0.2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = o.filter || "bandpass";
    filt.frequency.value = o.freq || 1400;
    filt.Q.value = o.q || 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.25, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  chord(freqs, o = {}) { freqs.forEach((f, i) => this.tone({ ...o, freq: f, delay: (o.stagger || 0) * i })); }

  /* ---------- SFX 라이브러리 ---------- */
  play(name) {
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "click": this.tone({ freq: 320, dur: 0.06, type: "triangle", gain: 0.16 }); break;
      case "select": this.tone({ freq: 520, slideTo: 720, dur: 0.1, type: "triangle", gain: 0.22 }); break;
      case "hover": this.tone({ freq: 660, dur: 0.04, type: "sine", gain: 0.08 }); break;
      case "tick": this.tone({ freq: 900, dur: 0.05, type: "square", gain: 0.09 }); break;
      case "tickLow": this.tone({ freq: 1200, dur: 0.07, type: "square", gain: 0.14 }); break;
      case "correct":
        this.tone({ freq: 660, dur: 0.12, type: "triangle", gain: 0.28 });
        this.tone({ freq: 880, dur: 0.16, type: "triangle", gain: 0.28, delay: 0.1 });
        this.tone({ freq: 1320, dur: 0.22, type: "sine", gain: 0.22, delay: 0.2 });
        break;
      case "wrong":
        this.tone({ freq: 220, slideTo: 130, dur: 0.32, type: "sawtooth", gain: 0.24 });
        this.tone({ freq: 160, slideTo: 90, dur: 0.34, type: "square", gain: 0.14 });
        break;
      case "reveal": this.tone({ freq: 440, slideTo: 660, dur: 0.14, type: "sine", gain: 0.2 }); break;
      case "win": this._fanfare(); break;
      case "coin":
        this.tone({ freq: 988, dur: 0.06, type: "square", gain: 0.18 });
        this.tone({ freq: 1319, dur: 0.16, type: "square", gain: 0.18, delay: 0.06 });
        break;
      case "start":
        this.chord([523, 659, 784], { dur: 0.5, type: "triangle", gain: 0.2, stagger: 0.06 });
        this.tone({ freq: 1046, dur: 0.4, type: "sine", gain: 0.18, delay: 0.24 });
        break;
      case "whoosh": this.noise({ dur: 0.3, filter: "highpass", freq: 500, gain: 0.16 }); break;
      case "dice":
        for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, filter: "bandpass", freq: 500 + i * 120, gain: 0.14, delay: i * 0.06 });
        break;
      case "step": this.tone({ freq: 400 + Math.random() * 120, dur: 0.07, type: "triangle", gain: 0.16 }); break;
      case "buy":
        this.tone({ freq: 784, dur: 0.1, type: "triangle", gain: 0.2 });
        this.tone({ freq: 1047, dur: 0.12, type: "triangle", gain: 0.2, delay: 0.09 });
        this.tone({ freq: 1568, dur: 0.2, type: "sine", gain: 0.16, delay: 0.18 });
        break;
      case "trap":
        for (let i = 0; i < 3; i++) this.tone({ freq: 740, dur: 0.14, type: "sawtooth", gain: 0.22, delay: i * 0.18 });
        break;
      case "levelup":
        this.chord([392, 494, 587, 784], { dur: 0.5, type: "triangle", gain: 0.18, stagger: 0.08 });
        break;
      default: break;
    }
  }

  _fanfare() {
    const seq = [
      [523, 0.0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.16], [1046, 0.38, 0.5],
      [784, 0.5, 0.2], [1046, 0.66, 0.6],
    ];
    seq.forEach(([f, d, dur]) => {
      this.tone({ freq: f, dur, type: "triangle", gain: 0.28, delay: d });
      this.tone({ freq: f * 2, dur, type: "sine", gain: 0.1, delay: d });
    });
  }

  /* ---------- 절차적 BGM ---------- */
  startMusic(theme = "menu") {
    this._musicTheme = theme;
    if (!this.musicOn) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx) return;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    // fade music bus in
    const targetGain = theme === "trap" ? 0.09 : theme === "team" ? 0.1 : theme === "quiz" ? 0.085 : 0.1;
    this.musicBus.gain.cancelScheduledValues(this._now());
    this.musicBus.gain.setTargetAtTime(targetGain, this._now(), 0.4);

    const themes = {
      menu:  { root: 261.63, scale: [0, 2, 4, 7, 9, 12], bpm: 84, prog: [0, 5, 3, 4] },
      quiz:  { root: 293.66, scale: [0, 2, 3, 5, 7, 10], bpm: 104, prog: [0, 3, 4, 0] },
      team:  { root: 261.63, scale: [0, 2, 4, 7, 9], bpm: 96, prog: [0, 4, 5, 3] },
      trap:  { root: 220.0,  scale: [0, 1, 3, 5, 6, 8], bpm: 120, prog: [0, 0, 5, 6] },
      final: { root: 261.63, scale: [0, 4, 7, 11, 12], bpm: 76, prog: [0, 5, 3, 4] },
    };
    const cfg = themes[theme] || themes.menu;
    const spb = 60 / cfg.bpm;
    const stepDur = spb / 2; // 8th notes
    this._nextNoteTime = this._now() + 0.1;
    this._step = 0;

    const semis = (n) => cfg.root * Math.pow(2, n / 12);

    const scheduleStep = () => {
      const step = this._step;
      const barPos = step % 16;
      const chordIdx = cfg.prog[Math.floor(step / 16) % cfg.prog.length];
      const t = this._nextNoteTime;

      // pad chord on bar start
      if (barPos === 0) {
        const base = cfg.scale[chordIdx % cfg.scale.length];
        [0, 4, 7].forEach((iv, k) => {
          this._pad(semis(base + iv) / 1, t, spb * 4, 0.05 - k * 0.008);
        });
        // bass
        this._bass(semis(base - 12), t, spb * 2);
      }
      if (barPos === 8) this._bass(semis(cfg.scale[chordIdx % cfg.scale.length] - 5), t, spb * 2);

      // arpeggio / melody
      if (theme !== "trap" ? (barPos % 2 === 0) : true) {
        const deg = cfg.scale[(barPos + chordIdx) % cfg.scale.length];
        const oct = theme === "trap" ? 0 : 12;
        this._pluck(semis(deg + oct), t, stepDur * 0.9, theme);
      }

      this._step++;
      this._nextNoteTime += stepDur;
    };

    // lookahead scheduler
    this._musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (this._nextNoteTime < this._now() + 0.2) scheduleStep();
    }, 60);
  }

  _pad(freq, t, dur, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _bass(freq, t, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _pluck(freq, t, dur, theme) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = theme === "trap" ? "square" : "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(theme === "trap" ? 0.05 : 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  stopMusic() {
    this._musicTheme = null;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(0.0, this._now(), 0.3);
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }
}

export const audio = new AudioEngine();
export const sfx = (name) => audio.play(name);
