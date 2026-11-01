/* Dovşan Qaçışı — Chrome T-Rex oyununun hərəkət modeli, təbii mənzərə fonu ilə.
   Xarici kitabxana yoxdur: xalis canvas + WebAudio. */
(() => {
  'use strict';

  // ───────────── Sabitlər (Chrome Dino dəyərləri × K) ─────────────
  const K = 1.4;                       // Chrome ölçülərinə nisbətən böyütmə
  const FRAME = 1000 / 60;             // 1 "Chrome kadrı" (ms)
  const SPEED_START = 6 * K;
  const SPEED_MAX = 13 * K;
  const ACCEL = 0.001 * K;             // kadr başına
  const GRAVITY = 0.6 * K;
  const JUMP_V = 10 * K;               // + sürət/10 bonusu
  const DROP_V = 5 * K;                // düyməni buraxanda yuxarı sürət limiti
  const MIN_JUMP = 30 * K;             // bu hündürlükdən əvvəl kəsilmir
  const FAST_FALL = 3;                 // ↓ basılı olanda cazibə vuruğu
  const SCORE_COEF = 0.025;
  const CLEAR_TIME = 1900;             // ilk maneəyə qədər (ms)
  const GAP_COEF = 0.6;
  const MIN_GAP = 140 * K;
  const MAX_GAP_MULT = 1.5;
  const OVER_DELAY = 600;              // oyun bitəndən sonra restart gözləməsi (ms)
  const CYCLE_SCORE = 900;             // gün-gecə dövrünün uzunluğu (xal)

  const BASE_H = 420;                  // məntiqi hündürlük
  const MIN_W = 640;                   // məntiqi minimum en
  const BUNNY_X = 84;
  const BUNNY_H = 84;

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const AUTO = params.has('auto');     // avtopilot (test / demo)

  // ───────────── Kanvas ─────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 900, H = BASE_H, scale = 1, dpr = 1, groundY = 300, baseY = 304;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = window.innerWidth, ch = window.innerHeight;
    scale = Math.min(ch / BASE_H, cw / MIN_W);
    W = cw / scale;
    H = ch / scale;
    groundY = Math.round(Math.min(H * (H > BASE_H * 1.6 ? 0.64 : 0.74), H - 90));
    baseY = groundY + 4;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ───────────── Köməkçilər ─────────────
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c, a) => a === undefined
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const shade = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
  function seeded(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function circ(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283); }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ───────────── Rəngli paletlər (gün → qürub → gecə → səhər) ─────────────
  const DAY = {
    skyTop: [12, 88, 192], skyBot: [132, 198, 244], far: [104, 166, 188], mid: [76, 160, 76], lit: [178, 214, 88],
    tree: [52, 138, 70], grass: [86, 176, 62], grassTop: [156, 214, 84], soil: [132, 88, 54], soilDark: [98, 63, 39],
    sun: 1.0, moon: -0.4, stars: 0, dark: 0, cDay: 1, cDusk: 0, cNight: 0,
  };
  const DUSK = {
    skyTop: [90, 78, 156], skyBot: [255, 176, 120], far: [150, 116, 150], mid: [98, 122, 92], lit: [226, 172, 112],
    tree: [62, 96, 80], grass: [86, 152, 66], grassTop: [140, 172, 80], soil: [108, 72, 52], soilDark: [80, 52, 38],
    sun: 0.12, moon: -0.4, stars: 0.1, dark: 0.08, cDay: 0, cDusk: 1, cNight: 0,
  };
  const NIGHT = {
    skyTop: [12, 20, 56], skyBot: [52, 66, 118], far: [44, 60, 98], mid: [34, 72, 82], lit: [70, 118, 104],
    tree: [22, 56, 58], grass: [42, 100, 64], grassTop: [66, 128, 84], soil: [64, 46, 40], soilDark: [44, 32, 30],
    sun: -0.4, moon: 0.9, stars: 1, dark: 0.22, cDay: 0, cDusk: 0, cNight: 1,
  };
  const DAWN = {
    skyTop: [120, 130, 204], skyBot: [255, 200, 172], far: [150, 150, 180], mid: [104, 146, 120], lit: [214, 196, 120],
    tree: [66, 112, 88], grass: [90, 166, 70], grassTop: [146, 192, 84], soil: [118, 80, 54], soilDark: [88, 58, 40],
    sun: 0.1, moon: -0.4, stars: 0.15, dark: 0.06, cDay: 0, cDusk: 1, cNight: 0,
  };
  const KEYS = [
    { at: 0.00, ...DAY },
    { at: 0.42, ...DAY, sun: 0.85 },
    { at: 0.55, ...DUSK },
    { at: 0.68, ...NIGHT },
    { at: 0.88, ...NIGHT, moon: 0.6 },
    { at: 0.95, ...DAWN },
    { at: 1.00, ...DAY },
  ];
  const COLOR_FIELDS = ['skyTop', 'skyBot', 'far', 'mid', 'lit', 'tree', 'grass', 'grassTop', 'soil', 'soilDark'];
  const NUM_FIELDS = ['sun', 'moon', 'stars', 'dark', 'cDay', 'cDusk', 'cNight'];

  function paletteAt(c) {
    let i = 0;
    while (i < KEYS.length - 2 && c > KEYS[i + 1].at) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((c - a.at) / (b.at - a.at), 0, 1);
    const e = t * t * (3 - 2 * t);
    const p = {};
    for (const f of COLOR_FIELDS) p[f] = mixC(a[f], b[f], e);
    for (const f of NUM_FIELDS) p[f] = lerp(a[f], b[f], e);
    return p;
  }

  // ───────────── Mənzərə məlumatları (seed ilə sabit) ─────────────
  const STRIP = 2400;
  const trees = [];
  {
    const r = seeded(11);
    let x = 0;
    while (x < STRIP) {
      const k = r();
      trees.push({ x, kind: k < 0.58 ? 'round' : k < 0.68 ? 'pine' : 'bush', s: 0.75 + r() * 0.65, tone: r() });
      x += 70 + r() * 130;
    }
  }
  const tufts = [];
  {
    const r = seeded(23);
    let x = 0;
    const flowerCols = ['#ffffff', '#ffd84d', '#ff8fb1', '#c9a7ff', '#ffb36b'];
    while (x < 1600) {
      const flower = r() < 0.3;
      tufts.push({ x, h: 5 + r() * 8, flower, col: flowerCols[Math.floor(r() * flowerCols.length)], tilt: r() - 0.5 });
      x += 14 + r() * 38;
    }
  }
  const specks = [];
  {
    const r = seeded(37);
    for (let i = 0; i < 70; i++) specks.push({ x: r() * 1400, y: r(), r: 0.8 + r() * 2.6, light: r() < 0.4 });
  }
  const stars = [];
  {
    const r = seeded(51);
    for (let i = 0; i < 90; i++) stars.push({ x: r(), y: r(), s: 0.6 + r() * 1.4, ph: r() * 6.28 });
  }

  // ───────────── Şəkillər ─────────────
  const img = { ask: new Image(), sad: new Image() };
  img.ask.src = 'assets/bunny-ask.webp';
  img.sad.src = 'assets/bunny-sad.webp';
  const imagesReady = Promise.all(Object.values(img).map(i => i.decode ? i.decode().catch(() => {}) : Promise.resolve()));

  // ───────────── Səs ─────────────
  let audio = null;
  let muted = localStorage.getItem('dq-muted') === '1';
  function ensureAudio() {
    if (audio) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audio = new AC();
    return audio;
  }
  function tone(freq, dur, type = 'square', vol = 0.06, delay = 0, slideTo = null) {
    if (muted) return;
    const a = ensureAudio();
    if (!a) return;
    if (a.state === 'suspended') a.resume();
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    jump: () => tone(420, 0.13, 'square', 0.05, 0, 820),
    point: () => { tone(880, 0.07, 'square', 0.045); tone(1320, 0.1, 'square', 0.045, 0.08); },
    die: () => { tone(330, 0.32, 'sawtooth', 0.07, 0, 70); tone(160, 0.35, 'square', 0.04, 0.05, 50); },
  };

  // ───────────── Oyun vəziyyəti ─────────────
  const S = {
    state: 'idle',            // idle | running | over
    paused: false,
    time: 0,
    runTime: 0,
    speed: SPEED_START,
    dist: 0,
    score: 0,
    hi: parseInt(localStorage.getItem('dq-hi') || '0', 10) || 0,
    newRecord: false,
    scroll: 0,
    overAt: 0,
    flashUntil: 0,
    lastFlashScore: 0,
    obstacles: [],
    clouds: [],
    pal: paletteAt(0),
    cycle: 0,
    shake: 0,
    petals: [],
  };

  const bunny = {
    lift: 0, vy: 0, jumping: false, ducking: false,
    holding: false, reachedMin: false,
    phase: 0, squash: 0, w: BUNNY_H * 0.6, h: BUNNY_H,
  };

  const CLOUD_LAYOUT = [
    { shape: 0, s: 0.74, par: 0.04, yb: -112 },
    { shape: 0, s: 0.54, par: 0.06, yb: -104 },
    { shape: 1, s: 0.62, par: 0.07, yb: -158 },
    { shape: 2, s: 0.56, par: 0.09, yb: -205 },
    { shape: 3, s: 0.8, par: 0.11, yb: -250 },
    { shape: 3, s: 0.6, par: 0.13, yb: -222 },
    { shape: 2, s: 0.42, par: 0.10, yb: -240 },
  ];
  function initClouds() {
    S.clouds = CLOUD_LAYOUT.map((l, i) => ({
      ...l, x: (i / CLOUD_LAYOUT.length) * (W + 300) - 60 + rand(-40, 40), v: rand(0.08, 0.2),
    }));
  }
  initClouds();

  // ───────────── Maneələr: torpaqdan çıxan kök bitkilər ─────────────
  const VEG = ['carrot', 'radish', 'beet'];
  const SIZES = {
    small: { sc: 0.74, allowGroupAt: 0 },
    large: { sc: 1.05, allowGroupAt: 7 * K },
  };
  const ITEM_PITCH = 38;   // vahid miqyasda maneə elementləri arası məsafə
  const ITEM_W = 46;       // bir elementin görünən eni (vahid miqyasda)

  function spawnObstacle() {
    const sizeName = Math.random() < 0.5 ? 'small' : 'large';
    const size = SIZES[sizeName];
    const maxGroup = S.speed >= size.allowGroupAt ? (S.speed >= 9 * K ? 3 : 2) : 1;
    const count = randInt(1, maxGroup);
    const sc = size.sc;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        dx: i * ITEM_PITCH * sc,
        type: VEG[randInt(0, VEG.length - 1)],
        sc: sc * rand(0.94, 1.06),
        ph: rand(0, 6.28),
        hue: rand(-1, 1),
      });
    }
    const w = (count - 1) * ITEM_PITCH * sc + ITEM_W * sc;
    const o = { x: W + 30, w, items, gap: 0 };
    const minGap = Math.round(w * S.speed + MIN_GAP * GAP_COEF);
    o.gap = rand(minGap, minGap * MAX_GAP_MULT);
    S.obstacles.push(o);
  }

  // ───────────── Oyun idarəsi ─────────────
  function resetRun() {
    S.obstacles.length = 0;
    S.speed = SPEED_START;
    S.dist = 0;
    S.score = 0;
    S.runTime = 0;
    S.lastFlashScore = 0;
    S.flashUntil = 0;
    S.newRecord = false;
    S.shake = 0;
    S.petals.length = 0;
    Object.assign(bunny, { lift: 0, vy: 0, jumping: false, ducking: false, holding: false, reachedMin: false, phase: 0, squash: 0 });
  }

  function startRun() {
    ensureAudio();
    resetRun();
    S.state = 'running';
    bunny.holding = true;
    jumpStart();
  }

  function jumpStart() {
    if (bunny.jumping) return;
    bunny.jumping = true;
    bunny.reachedMin = false;
    bunny.vy = JUMP_V + S.speed / 10;
    bunny.squash = -0.6;           // yuxarı dartılma
    sfx.jump();
  }

  function jumpEnd() {
    bunny.holding = false;
    if (bunny.jumping && bunny.reachedMin && bunny.vy > DROP_V) bunny.vy = DROP_V;
  }

  function press() {
    if (S.paused) return;
    if (S.state === 'idle') { startRun(); return; }
    if (S.state === 'over') {
      if (S.time - S.overAt > OVER_DELAY) startRun();
      return;
    }
    bunny.holding = true;
    jumpStart();
  }
  function release() { if (S.state === 'running') jumpEnd(); else bunny.holding = false; }

  function setDuck(on) { bunny.ducking = on; }

  function die() {
    S.state = 'over';
    S.overAt = S.time;
    S.shake = 1;
    sfx.die();
    if (S.score > S.hi) {
      S.hi = S.score;
      S.newRecord = true;
      try { localStorage.setItem('dq-hi', String(S.hi)); } catch (e) { /* sakit */ }
    }
  }

  // ───────────── Toqquşma ─────────────
  function bunnyBoxes() {
    const w = bunny.w, hgt = bunny.ducking && !bunny.jumping ? BUNNY_H * 0.66 : BUNNY_H;
    const x = BUNNY_X;
    const top = groundY - bunny.lift - hgt;
    return [
      { x: x + 8, y: top + 3, w: w - 16, h: hgt * 0.42 },           // baş + qulaq
      { x: x + 10, y: top + hgt * 0.42, w: w - 20, h: hgt * 0.58 - 2 }, // bədən
    ];
  }
  function obstacleBoxes(o) {
    return o.items.map(it => ({
      x: o.x + it.dx + (ITEM_W / 2 - 14) * it.sc,
      y: groundY - 64 * it.sc,
      w: 28 * it.sc,
      h: 64 * it.sc,
    }));
  }
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function checkCollision() {
    const bb = bunnyBoxes();
    for (const o of S.obstacles) {
      if (o.x > BUNNY_X + 120 || o.x + o.w < BUNNY_X - 20) continue;
      for (const ob of obstacleBoxes(o)) {
        for (const b of bb) if (hit(b, ob)) return true;
      }
    }
    return false;
  }

  // ───────────── Yeniləmə ─────────────
  function update(f, dt) {
    S.time += dt;

    // buludlar həmişə axır (parallax: böyük/uzaq buludlar yavaş)
    const running = S.state === 'running';
    for (const c of S.clouds) {
      c.x -= (c.v + (running ? S.speed * c.par : 0)) * f;
      const sw = CLOUD_SHAPES[c.shape].w * c.s;
      if (c.x + sw < -20) c.x = W + rand(20, 260);
    }

    S.cycle = ((S.dist * SCORE_COEF) / CYCLE_SCORE) % 1;
    S.pal = paletteAt(S.cycle);
    S.shake = Math.max(0, S.shake - 0.06 * f);
    bunny.squash *= Math.pow(0.84, f);

    // ləçək/yarpaq zərrəcikləri
    for (let i = S.petals.length - 1; i >= 0; i--) {
      const p = S.petals[i];
      p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.04 * f; p.life -= f;
      if (p.life <= 0) S.petals.splice(i, 1);
    }

    if (S.state === 'idle') {
      bunny.phase += 0.05 * f;
      return;
    }
    if (S.state !== 'running') return;

    S.runTime += dt;
    if (S.speed < SPEED_MAX) S.speed = Math.min(SPEED_MAX, S.speed + ACCEL * f);
    S.dist += (S.speed / K) * f;
    S.scroll += S.speed * f;
    S.score = Math.floor(S.dist * SCORE_COEF);

    // xal mərhələsi (hər 100)
    if (S.score > 0 && S.score % 100 === 0 && S.score !== S.lastFlashScore) {
      S.lastFlashScore = S.score;
      S.flashUntil = S.time + 900;
      sfx.point();
    }

    // avtopilot
    if (AUTO && !bunny.jumping) {
      for (const o of S.obstacles) {
        const d = o.x - (BUNNY_X + bunny.w);
        if (d > -10 && d < S.speed * (9 + o.w / 40)) { jumpStart(); bunny.holding = true; break; }
      }
    }

    // tullanma fizikası (sabit təcil üçün dəqiq inteqrasiya)
    if (bunny.jumping) {
      const g = GRAVITY * (bunny.ducking ? FAST_FALL : 1);
      bunny.lift += bunny.vy * f - 0.5 * g * f * f;
      bunny.vy -= g * f;
      if (bunny.lift > MIN_JUMP) bunny.reachedMin = true;
      if (!bunny.holding && bunny.reachedMin && bunny.vy > DROP_V) bunny.vy = DROP_V;
      if (bunny.lift <= 0) {
        bunny.lift = 0; bunny.vy = 0; bunny.jumping = false;
        bunny.squash = 0.7;        // yerə enmə əzilməsi
        for (let i = 0; i < 5; i++) {
          S.petals.push({ x: BUNNY_X + bunny.w / 2 + rand(-12, 12), y: baseY - 2, vx: rand(-1.4, 0.4), vy: rand(-1.6, -0.4), life: rand(18, 30), c: 0 });
        }
      }
    } else {
      bunny.phase += (0.19 * f) * Math.sqrt(S.speed / SPEED_START);
    }

    // maneələr
    for (const o of S.obstacles) o.x -= S.speed * f;
    while (S.obstacles.length && S.obstacles[0].x + S.obstacles[0].w < -40) S.obstacles.shift();
    const last = S.obstacles[S.obstacles.length - 1];
    if (S.runTime > CLEAR_TIME && (!last || last.x + last.w + last.gap < W)) spawnObstacle();

    if (checkCollision()) die();
  }

  // ───────────── Çəkmə: mənzərə ─────────────
  function drawSky(t) {
    const p = S.pal;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, rgb(p.skyTop));
    g.addColorStop(1, rgb(p.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    // ulduzlar
    if (p.stars > 0.01) {
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * 0.002 + s.ph);
        ctx.globalAlpha = p.stars * tw;
        ctx.fillRect(s.x * W, s.y * groundY * 0.7, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }

    // günəş
    const sx = W * 0.8;
    if (p.sun > -0.3) {
      const sy = groundY - 30 - p.sun * 190;
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
      const warm = p.sun < 0.5 ? [255, 160, 90] : [255, 236, 170];
      glow.addColorStop(0, rgb(warm, 0.55));
      glow.addColorStop(1, rgb(warm, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 140, sy - 140, 280, 280);
      ctx.fillStyle = p.sun < 0.5 ? '#ffb070' : '#fff3b0';
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 6.283); ctx.fill();
    }
    // ay
    if (p.moon > -0.3) {
      const mx = W * 0.22, my = groundY - 40 - p.moon * 200;
      const glow = ctx.createRadialGradient(mx, my, 6, mx, my, 90);
      glow.addColorStop(0, 'rgba(200,215,255,.35)');
      glow.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 100, my - 100, 200, 200);
      ctx.fillStyle = '#eef1ff';
      ctx.beginPath(); ctx.arc(mx, my, 24, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(160,170,210,.45)';
      ctx.beginPath(); circ(mx - 8, my - 5, 5); circ(mx + 8, my + 7, 3.4); circ(mx + 5, my - 10, 2.6); ctx.fill();
    }
  }

  // Buludlar: əvvəlcədən çəkilmiş qabarıq (cumulus) sprite-lar — krem işıqlı üst, mavi-boz kölgəli alt
  const CLOUD_STATES = {
    day: { shade: [142, 172, 226], mid: [204, 224, 250], lit: [255, 244, 214] },
    dusk: { shade: [122, 98, 158], mid: [232, 166, 172], lit: [255, 218, 176] },
    night: { shade: [34, 44, 88], mid: [56, 70, 120], lit: [102, 118, 174] },
  };
  const CLOUD_SHAPES = [
    { w: 380, h: 290, n: 56, seed: 5, tall: true },
    { w: 300, h: 210, n: 40, seed: 9 },
    { w: 240, h: 150, n: 28, seed: 14 },
    { w: 190, h: 64, n: 14, seed: 21, wisp: true },
  ];
  const RS = 2.5;
  const cloudSprites = {};

  function makeCloud(shape, st) {
    const c = document.createElement('canvas');
    c.width = shape.w * RS; c.height = shape.h * RS;
    const g = c.getContext('2d');
    g.scale(RS, RS);
    const r = seeded(shape.seed);
    const { w, h } = shape;
    const baseY = h - 6;
    const blobs = [];
    for (let i = 0; i < shape.n; i++) {
      const x = 0.1 * w + r() * 0.8 * w;
      const u = (x / w - 0.5) * 2;
      const dome = Math.sqrt(Math.max(0, 1 - u * u * 0.92));
      const rad = (shape.wisp ? 6 + r() * 9 : 11 + r() * (shape.tall ? 34 : 24)) * (0.55 + 0.45 * dome);
      const room = Math.max(0, h - 10 - rad * 1.7) * dome;
      const y = i < shape.n * 0.28 ? baseY - rad * 0.5 : baseY - rad * 0.8 - r() * room;
      blobs.push({ x, y, rad });
    }
    blobs.sort((a, b) => b.y - a.y);   // aşağıdan yuxarı: yuxarı pufcuqlar altdakıların kölgəsini üstələyir
    g.save();
    g.beginPath(); g.rect(0, 0, w, baseY + 2); g.clip();   // düz alt
    if ('filter' in g) g.filter = `blur(${RS * 0.6}px)`;
    const disc = (x, y, r, col, alpha = 1) => { g.fillStyle = rgb(col, alpha); g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
    for (const b of blobs) {
      const r0 = b.rad;
      // kölgə yalnız aşağı-sağda görünür, yuxarı-solda krem işıq yumşaq keçir
      disc(b.x + r0 * 0.1, b.y + r0 * 0.13, r0 * 0.95, st.shade);
      const gm = g.createRadialGradient(b.x - r0 * 0.18, b.y - r0 * 0.26, r0 * 0.1, b.x - r0 * 0.04, b.y - r0 * 0.06, r0 * 0.98);
      gm.addColorStop(0, rgb(mixC(st.mid, st.lit, 0.5)));
      gm.addColorStop(0.7, rgb(st.mid));
      gm.addColorStop(1, rgb(mixC(st.mid, st.shade, 0.45)));
      g.fillStyle = gm;
      g.beginPath(); g.arc(b.x - r0 * 0.04, b.y - r0 * 0.06, r0 * 0.94, 0, 6.283); g.fill();
      const lx = b.x - r0 * 0.22, ly = b.y - r0 * 0.3;
      const gl = g.createRadialGradient(lx, ly, 0, lx, ly, r0 * 0.7);
      gl.addColorStop(0, rgb(st.lit));
      gl.addColorStop(0.6, rgb(st.lit, 0.8));
      gl.addColorStop(1, rgb(st.lit, 0));
      g.fillStyle = gl;
      g.beginPath(); g.arc(lx, ly, r0 * 0.7, 0, 6.283); g.fill();
    }
    g.restore();
    if ('filter' in g) g.filter = 'none';
    // alt tərəfə yumşaq kölgə
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, baseY - h * 0.38, 0, baseY + 2);
    gr.addColorStop(0, rgb(st.shade, 0));
    gr.addColorStop(1, rgb(st.shade, 0.6));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // düz altı yumşalt
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, baseY - 16, 0, baseY + 2);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = fade;
    g.fillRect(0, baseY - 16, w, 20);
    return c;
  }
  for (const [name, st] of Object.entries(CLOUD_STATES)) {
    cloudSprites[name] = CLOUD_SHAPES.map(sh => makeCloud(sh, st));
  }

  function drawClouds() {
    const p = S.pal;
    const k = groundY / 311;
    const layers = [['day', p.cDay], ['dusk', p.cDusk], ['night', p.cNight]];
    for (const c of S.clouds) {
      const sh = CLOUD_SHAPES[c.shape];
      const sw = sh.w * c.s, shh = sh.h * c.s;
      if (c.x > W || c.x + sw < 0) continue;
      const y = groundY + c.yb * k - shh;
      let cum = 0;
      for (const [name, wt] of layers) {
        cum += wt;
        if (wt < 0.003) continue;
        ctx.globalAlpha = wt / cum;
        ctx.drawImage(cloudSprites[name][c.shape], c.x, y, sw, shh);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Təpələr: yaşıl-sarı işıqlı yamac + kölgəli alt
  const HILLS = {
    far: { base: 128, amp: 34, f1: 0.0042, f2: 0.0113, par: 0.05, ph: 40 },
    mid: { base: 70, amp: 26, f1: 0.0068, f2: 0.0161, par: 0.14, ph: 310 },
  };
  function hillH(wx, L) {
    return L.base
      + Math.sin(wx * L.f1) * L.amp
      + Math.sin(wx * L.f2 + 1.7) * L.amp * 0.45
      + Math.sin(wx * L.f1 * 2.7 + 0.6) * L.amp * 0.15;
  }
  function hillPath(L) {
    ctx.beginPath();
    ctx.moveTo(-6, groundY + 2);
    for (let x = -6; x <= W + 6; x += 6) ctx.lineTo(x, groundY - hillH(x + S.scroll * L.par + L.ph, L));
    ctx.lineTo(W + 6, groundY + 2);
    ctx.closePath();
  }
  function crestStroke(L) {
    ctx.beginPath();
    for (let x = -6; x <= W + 6; x += 6) {
      const y = groundY - hillH(x + S.scroll * L.par + L.ph, L);
      if (x === -6) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  function drawHill(L, top, bottom, lit, litA) {
    hillPath(L);
    const g = ctx.createLinearGradient(0, groundY - L.base - L.amp * 1.6, 0, groundY);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bottom));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    hillPath(L); ctx.clip();
    ctx.lineJoin = 'round';
    crestStroke(L); ctx.strokeStyle = rgb(lit, litA); ctx.lineWidth = 22; ctx.stroke();
    crestStroke(L); ctx.strokeStyle = rgb(shade(lit, 1.12), litA); ctx.lineWidth = 7; ctx.stroke();
    ctx.restore();
  }

  // yamacdakı vəhşi çiçəklər
  const HSTRIP = 1800;
  const dabs = [];
  {
    const r = seeded(71);
    const cols = ['#ffffff', '#fff3a8', '#ffd84d', '#ff9fc0', '#c9a7ff', '#ffffff'];
    for (let i = 0; i < 130; i++) dabs.push({ x: r() * HSTRIP, d: 0.12 + r() * 0.8, col: cols[Math.floor(r() * cols.length)], r: 0.8 + r() * 1.1 });
  }
  function drawDabs(L) {
    const off = S.scroll * L.par + L.ph;
    for (const d of dabs) {
      const sx = ((d.x - off) % HSTRIP + HSTRIP) % HSTRIP;
      if (sx > W + 4) continue;
      const crest = groundY - hillH(sx + off, L);
      const y = crest + 6 + d.d * (groundY - crest - 12);
      ctx.fillStyle = d.col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(sx, y, d.r * (0.7 + d.d * 0.7), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // təpədəki ev + cığır
  const cabinCache = new Map();
  const CABIN_SPAN = 1900;
  function cabinAt(k) {
    let c = cabinCache.get(k);
    if (!c) {
      const r = seeded(k * 977 + 13);
      const wx0 = k * CABIN_SPAN + 300 + r() * 900;
      let best = wx0, bh = -1e9;
      for (let j = -140; j <= 140; j += 10) {
        const h = hillH(wx0 + j, HILLS.mid);
        if (h > bh) { bh = h; best = wx0 + j; }
      }
      c = { wx: best, s: 0.95 + r() * 0.3, dir: r() < 0.5 ? -1 : 1, ph: r() * 6 };
      cabinCache.set(k, c);
    }
    return c;
  }
  function drawCabin(c, x, y) {
    const p = S.pal, s = c.s;
    // cığır (evdən aşağı qıvrılır)
    const len = groundY + 2 - (y + 2);
    const L = [], R = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const cx = x + 4 * s + c.dir * (Math.sin(t * 5.4 + c.ph) * 16 * (0.25 + t) + t * 26) * s;
      const cy = y + 3 + t * len;
      const hw = (2.5 + t * 15) * s;
      L.push([cx - hw, cy]); R.push([cx + hw, cy]);
    }
    ctx.beginPath();
    L.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    R.reverse().forEach(([px, py]) => ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fillStyle = rgb(mixC([200, 148, 126], p.soil, p.dark * 2.2), 0.92);
    ctx.fill();

    // yan ağaclar
    drawTree({ kind: 'round', s: 0.5 * s, tone: 0.3 }, x - 30 * s, 0.3, y + 3);
    drawTree({ kind: 'round', s: 0.42 * s, tone: 0.7 }, x + 29 * s, 0.7, y + 4);

    // gövdə
    const wall = [232, 208, 164], roof = [150, 64, 50];
    ctx.fillStyle = rgb(wall); ctx.fillRect(x - 17 * s, y - 19 * s, 34 * s, 20 * s);
    ctx.fillStyle = rgb(shade(wall, 0.84)); ctx.fillRect(x + 6 * s, y - 19 * s, 11 * s, 20 * s);
    // dam
    ctx.fillStyle = rgb(roof);
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, y - 17 * s); ctx.lineTo(x - 11 * s, y - 36 * s); ctx.lineTo(x + 13 * s, y - 36 * s); ctx.lineTo(x + 24 * s, y - 17 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(shade(roof, 1.22));
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, y - 17 * s); ctx.lineTo(x - 11 * s, y - 36 * s); ctx.lineTo(x - 2 * s, y - 36 * s); ctx.lineTo(x - 8 * s, y - 17 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(shade(roof, 0.7)); ctx.fillRect(x - 24 * s, y - 18 * s, 48 * s, 2.5 * s);
    // baca
    ctx.fillStyle = rgb(shade(roof, 0.8)); ctx.fillRect(x + 5 * s, y - 43 * s, 5 * s, 10 * s);
    // pəncərə və qapı
    const lit = clamp(p.stars * 1.2, 0, 1);
    ctx.fillStyle = rgb(mixC([150, 180, 210], [255, 214, 120], lit));
    ctx.fillRect(x - 12 * s, y - 14 * s, 6 * s, 6 * s);
    ctx.fillRect(x + 7 * s, y - 14 * s, 6 * s, 6 * s);
    ctx.fillStyle = rgb(mixC([96, 60, 44], [255, 200, 110], lit * 0.8));
    ctx.fillRect(x - 3 * s, y - 11 * s, 6 * s, 12 * s);
    if (lit > 0.1) {
      const gl = ctx.createRadialGradient(x, y - 10 * s, 2, x, y - 10 * s, 46 * s);
      gl.addColorStop(0, `rgba(255,210,120,${0.28 * lit})`);
      gl.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x - 50 * s, y - 56 * s, 100 * s, 90 * s);
    }
  }
  function drawCabins() {
    const L = HILLS.mid;
    const off = S.scroll * L.par + L.ph;
    const k0 = Math.floor((off - 160) / CABIN_SPAN) - 1, k1 = Math.ceil((off + W + 160) / CABIN_SPAN);
    for (let k = k0; k <= k1; k++) {
      const c = cabinAt(k);
      const sx = c.wx - off;
      if (sx < -90 || sx > W + 90) continue;
      drawCabin(c, sx, groundY - hillH(c.wx, L));
    }
  }

  function drawTree(t, x, tone, by = groundY + 2) {
    const p = S.pal;
    const s = t.s;
    const crown = shade(p.tree, 0.78 + tone * 0.3);
    const mid = mixC(crown, p.lit, 0.32);
    const hi = mixC(crown, p.lit, 0.72);
    const trunk = shade(mixC([110, 74, 48], p.soilDark, 0.35), 0.85);
    const lumps = (list) => {
      for (const [dx, dy, r] of list) { ctx.fillStyle = rgb(crown); ctx.beginPath(); circ(x + dx * s, by + dy * s, r * s); ctx.fill(); }
      for (const [dx, dy, r] of list) { ctx.fillStyle = rgb(mid); ctx.beginPath(); circ(x + (dx - r * 0.16) * s, by + (dy - r * 0.2) * s, r * 0.78 * s); ctx.fill(); }
      for (const [dx, dy, r] of list) { ctx.fillStyle = rgb(hi, 0.85); ctx.beginPath(); circ(x + (dx - r * 0.3) * s, by + (dy - r * 0.38) * s, r * 0.42 * s); ctx.fill(); }
    };
    if (t.kind === 'round') {
      ctx.fillStyle = rgb(trunk);
      ctx.fillRect(x - 3 * s, by - 34 * s, 6 * s, 36 * s);
      lumps([[-19, -40, 17], [19, -41, 17], [0, -54, 25], [-3, -36, 19]]);
    } else if (t.kind === 'pine') {
      ctx.fillStyle = rgb(trunk);
      ctx.fillRect(x - 2.5 * s, by - 14 * s, 5 * s, 16 * s);
      for (let i = 0; i < 3; i++) {
        const y0 = by - (12 + i * 22) * s;
        const w = (26 - i * 5) * s;
        ctx.fillStyle = rgb(shade(crown, 0.9 + i * 0.1));
        ctx.beginPath();
        ctx.moveTo(x - w, y0); ctx.lineTo(x, y0 - 34 * s); ctx.lineTo(x + w, y0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(mid, 0.6);
        ctx.beginPath();
        ctx.moveTo(x - w, y0); ctx.lineTo(x, y0 - 34 * s); ctx.lineTo(x - w * 0.2, y0);
        ctx.closePath(); ctx.fill();
      }
    } else {
      lumps([[-15, -7, 10], [15, -7, 10], [0, -12, 14]]);
    }
  }

  function drawTrees() {
    const off = S.scroll * 0.34;
    for (const t of trees) {
      let x = ((t.x - off) % STRIP + STRIP) % STRIP;
      if (x > W + 80) x -= STRIP;
      if (x < -80) continue;
      drawTree(t, x, t.tone);
    }
  }

  function drawGround() {
    const p = S.pal;
    // ot qatı
    ctx.fillStyle = rgb(p.grass);
    ctx.fillRect(0, groundY, W, 16);
    ctx.fillStyle = rgb(p.grassTop);
    ctx.fillRect(0, groundY, W, 3);
    // torpaq
    const g = ctx.createLinearGradient(0, groundY + 16, 0, H);
    g.addColorStop(0, rgb(p.soil));
    g.addColorStop(1, rgb(p.soilDark));
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY + 16, W, H - groundY - 16 + 2);
    // ot–torpaq keçidi
    ctx.fillStyle = rgb(shade(p.soil, 0.9), 0.7);
    for (let x = -((S.scroll) % 22); x < W; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 15); ctx.lineTo(x + 11, groundY + 21); ctx.lineTo(x + 22, groundY + 15);
      ctx.fill();
    }
    // torpaq dənəcikləri
    const soilH = Math.max(10, H - groundY - 24);
    for (const s of specks) {
      let x = ((s.x - S.scroll) % 1400 + 1400) % 1400;
      if (x > W + 10) continue;
      ctx.fillStyle = s.light ? rgb(shade(p.soil, 1.2), 0.7) : rgb(p.soilDark, 0.8);
      ctx.beginPath();
      ctx.ellipse(x, groundY + 26 + s.y * soilH, s.r * 1.5, s.r, 0, 0, 6.283);
      ctx.fill();
    }
    // ot qılları və çiçəklər
    const bladeCol = shade(p.grassTop, 0.8);
    for (const t of tufts) {
      let x = ((t.x - S.scroll) % 1600 + 1600) % 1600;
      if (x > W + 10) continue;
      const sw = Math.sin(S.time * 0.003 + t.x) * 1.2;
      if (t.flower) {
        ctx.strokeStyle = rgb(bladeCol); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, groundY + 3); ctx.quadraticCurveTo(x + t.tilt * 4, groundY - t.h * 0.5, x + t.tilt * 6 + sw, groundY - t.h - 2); ctx.stroke();
        ctx.fillStyle = t.col;
        ctx.beginPath(); ctx.arc(x + t.tilt * 6 + sw, groundY - t.h - 3, 3.1, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#f4b400';
        ctx.beginPath(); ctx.arc(x + t.tilt * 6 + sw, groundY - t.h - 3, 1.1, 0, 6.283); ctx.fill();
      } else {
        ctx.strokeStyle = rgb(bladeCol); ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 3, groundY + 3); ctx.quadraticCurveTo(x - 3, groundY - t.h * 0.5, x - 5 + sw, groundY - t.h);
        ctx.moveTo(x, groundY + 3); ctx.quadraticCurveTo(x + 1, groundY - t.h * 0.6, x + sw, groundY - t.h - 3);
        ctx.moveTo(x + 3, groundY + 3); ctx.quadraticCurveTo(x + 3, groundY - t.h * 0.5, x + 5 + sw, groundY - t.h);
        ctx.stroke();
      }
    }
  }

  // ───────────── Çəkmə: kök bitkilər ─────────────
  function frond(len, wid, col, colHi) {
    // saplaq + yarpaqcıqlar
    ctx.strokeStyle = rgb(col); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2, -len * 0.5, 0, -len); ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const y = -len * (0.22 + j * 0.17);
      const s = wid * (1 - j * 0.12);
      ctx.fillStyle = rgb(j % 2 ? colHi : col);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 1.5, y);
        ctx.rotate(side * 0.75);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.32, s * 0.62, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = rgb(colHi);
    ctx.beginPath(); ctx.ellipse(0, -len - 1, wid * 0.28, wid * 0.55, 0, 0, 6.283); ctx.fill();
  }

  function broadLeaf(len, wid, col, vein) {
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid * 1.1, -len * 0.25, wid * 0.9, -len * 0.85, 0, -len);
    ctx.bezierCurveTo(-wid * 0.9, -len * 0.85, -wid * 1.1, -len * 0.25, 0, 0);
    ctx.fill();
    ctx.strokeStyle = rgb(vein); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -len * 0.92); ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let j = 1; j <= 3; j++) {
      const y = -len * j * 0.22;
      ctx.moveTo(0, y); ctx.lineTo(wid * 0.55, y - len * 0.12);
      ctx.moveTo(0, y); ctx.lineTo(-wid * 0.55, y - len * 0.12);
    }
    ctx.stroke();
  }

  function drawVeg(type, x, sc, ph, hue, t) {
    const sw = Math.sin(t * 0.0032 + ph) * 0.05;
    ctx.save();
    ctx.translate(x + ITEM_W * sc / 2, baseY);
    ctx.scale(sc, sc);

    if (type === 'carrot') {
      const g = ctx.createLinearGradient(-14, 0, 14, 0);
      g.addColorStop(0, '#ff8a2b'); g.addColorStop(0.5, '#ffa84e'); g.addColorStop(1, '#e5621a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-14, 3);
      ctx.bezierCurveTo(-15, -14, -12, -26, -6, -30);
      ctx.quadraticCurveTo(0, -33, 6, -30);
      ctx.bezierCurveTo(12, -26, 15, -14, 14, 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(150,56,0,.38)'; ctx.lineWidth = 1.2;
      for (const y of [-8, -15, -22]) { ctx.beginPath(); ctx.moveTo(-9, y); ctx.quadraticCurveTo(0, y + 3, 9, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.ellipse(-6, -17, 2.4, 8, 0.1, 0, 6.283); ctx.fill();
      const angs = [-0.78, -0.4, 0, 0.4, 0.78];
      const col = [58 + hue * 10, 150, 58], hi = [110, 196, 84];
      angs.forEach((a, i) => {
        ctx.save();
        ctx.translate(0, -30);
        ctx.rotate(a + sw * (1 + i * 0.25));
        frond(36 - Math.abs(a) * 9, 7.5, col, hi);
        ctx.restore();
      });
    } else if (type === 'radish') {
      const g = ctx.createRadialGradient(-5, -16, 2, 0, -12, 18);
      g.addColorStop(0, '#ff6f93'); g.addColorStop(0.6, '#e83a6b'); g.addColorStop(1, '#b81f4f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -12, 15, 17, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.beginPath(); ctx.ellipse(-6, -18, 3.2, 6, 0.4, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -27, 5, 3.6, 5.8); ctx.stroke();
      const col = [52 + hue * 8, 140, 62], vein = [150, 214, 120];
      [[-0.9, 30], [-0.35, 36], [0.3, 36], [0.85, 30]].forEach(([a, len], i) => {
        ctx.save();
        ctx.translate(0, -27);
        ctx.rotate(a + sw * (1 + i * 0.2));
        broadLeaf(len, 10.5, shade(col, 0.9 + (i % 2) * 0.18), vein);
        ctx.restore();
      });
    } else {
      const g = ctx.createRadialGradient(-5, -14, 2, 0, -11, 17);
      g.addColorStop(0, '#b5436f'); g.addColorStop(0.6, '#7f1f52'); g.addColorStop(1, '#5b1239');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -11, 14, 16, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -11, 9.5, 3.4, 5.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -11, 5, 3.4, 5.5); ctx.stroke();
      ctx.fillStyle = '#5b1239';
      ctx.beginPath(); ctx.moveTo(-4, -24); ctx.lineTo(0, -29); ctx.lineTo(4, -24); ctx.fill();
      [[-0.55, 34], [0, 40], [0.55, 34]].forEach(([a, len], i) => {
        ctx.save();
        ctx.translate(0, -26);
        ctx.rotate(a + sw * (1 + i * 0.3));
        ctx.strokeStyle = '#c42a58'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.6); ctx.stroke();
        ctx.translate(0, -len * 0.55);
        broadLeaf(len * 0.62, 9.5, [48 + hue * 8, 132, 66], [214, 70, 100]);
        ctx.restore();
      });
    }

    // torpaq təpəciyi — kök torpaqdan çıxır
    const soil = S.pal.soil, dark = S.pal.soilDark;
    ctx.fillStyle = rgb(shade(soil, 1.08));
    ctx.beginPath();
    ctx.moveTo(-24, 5);
    ctx.bezierCurveTo(-18, -2, -12, -7, -4, -6);
    ctx.bezierCurveTo(4, -8, 14, -4, 24, 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(dark, 0.55);
    ctx.beginPath(); circ(-13, 0, 1.6); circ(8, -1, 1.3); circ(17, 2, 1.8); circ(-4, 1, 1.1); ctx.fill();
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of S.obstacles) {
      for (const it of o.items) drawVeg(it.type, o.x + it.dx, it.sc, it.ph, it.hue, S.time);
    }
  }

  // ───────────── Çəkmə: dovşan ─────────────
  function drawBunny() {
    const dead = S.state === 'over';
    const im = dead ? img.sad : img.ask;
    if (!im.complete || !im.naturalWidth) return;
    const ratio = im.naturalWidth / im.naturalHeight;
    const idle = S.state === 'idle';
    const ducking = bunny.ducking && !bunny.jumping && S.state === 'running';

    let h = BUNNY_H, w = h * ratio;
    let hop = 0, tilt = 0, sx = 1, sy = 1;

    if (idle) {
      sy = 1 + Math.sin(bunny.phase) * 0.018;
      sx = 1 - Math.sin(bunny.phase) * 0.01;
    } else if (!dead) {
      if (bunny.jumping) {
        tilt = clamp(-bunny.vy * 0.012, -0.16, 0.2);   // yuxarı gedəndə arxaya, düşəndə irəli
        const stretch = clamp(Math.abs(bunny.vy) / (JUMP_V * 1.6), 0, 0.22);
        sy = 1 + stretch; sx = 1 - stretch * 0.55;
      } else {
        const s = Math.sin(bunny.phase);
        hop = Math.abs(s) * 6;
        tilt = s * 0.07;
        sy = 1 + (Math.abs(s) - 0.5) * 0.07;
        sx = 1 - (Math.abs(s) - 0.5) * 0.04;
      }
      // enmə/qalxma əzilməsi
      sy *= 1 - bunny.squash * 0.18;
      sx *= 1 + bunny.squash * 0.12;
      if (ducking) { sy *= 0.66; sx *= 1.14; }
    }

    const cx = BUNNY_X + bunny.w / 2;
    const footY = groundY + 4 - bunny.lift - hop;

    // kölgə
    const air = bunny.lift + hop;
    ctx.fillStyle = `rgba(0,0,0,${clamp(0.24 - air / 700, 0.06, 0.24)})`;
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 5, (22 - air * 0.06) * (dead ? 1.2 : 1), 4.6, 0, 0, 6.283);
    ctx.fill();

    ctx.save();
    if (dead && S.shake > 0) ctx.translate(Math.sin(S.time * 0.08) * S.shake * 3, 0);
    ctx.translate(cx, footY);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();

    if (DEBUG) {
      ctx.strokeStyle = 'rgba(255,0,0,.9)';
      for (const b of bunnyBoxes()) ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,255,.9)';
      for (const o of S.obstacles) for (const b of obstacleBoxes(o)) ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  function drawPetals() {
    for (const p of S.petals) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(p.life / 20, 0, 0.8)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.4, 1.6, 0.5, 0, 6.283); ctx.fill();
    }
  }

  // ───────────── Çəkmə: interfeys ─────────────
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function outlinedText(text, x, y, size, fill, align = 'center', weight = '800') {
    ctx.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.strokeStyle = 'rgba(20,40,60,.55)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  const pad = (n) => String(n).padStart(5, '0');

  function drawHUD() {
    // xal lövhəsi
    const flashing = S.time < S.flashUntil && Math.floor((S.flashUntil - S.time) / 140) % 2 === 1;
    const cur = pad(S.score);
    const hi = 'HI ' + pad(S.hi);
    ctx.font = '700 20px Consolas, "Courier New", ui-monospace, monospace';
    const curW = ctx.measureText(cur).width;
    const hiW = ctx.measureText(hi + '  ').width;
    const boxW = curW + hiW + 28;
    const bx = W - boxW - 14, by = 12;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    rr(bx, by, boxW, 36, 12); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(hi, bx + 14, by + 19);
    if (!flashing) {
      ctx.fillStyle = '#fff';
      ctx.fillText(cur, bx + 14 + hiW, by + 19);
    }

    const cx = W / 2;
    const top = Math.max(70, groundY * 0.34);
    if (S.state === 'idle') {
      outlinedText('Dovşan Qaçışı', cx, top - 8, 38, '#fff');
      outlinedText('tərəvəzlərin üstündən tullan!', cx, top + 28, 17, '#fff6d8', 'center', '700');
      const blink = 0.55 + 0.45 * Math.sin(S.time * 0.004);
      ctx.globalAlpha = blink;
      outlinedText(isTouch ? 'Başlamaq üçün ekrana toxun' : 'Başlamaq üçün BOŞLUQ düyməsinə bas', cx, top + 64, 18, '#fff');
      ctx.globalAlpha = 1;
      if (!isTouch) outlinedText('↑ / BOŞLUQ — tullan (uzun bas = yüksək)    ↓ — əyil / sürətli en    P — fasilə    M — səs', cx, H - 22, 13, 'rgba(255,255,255,.88)', 'center', '600');
    } else if (S.state === 'over') {
      outlinedText('OYUN BİTDİ', cx, top, 42, '#fff');
      if (S.newRecord) outlinedText('🏆 Yeni rekord: ' + S.score, cx, top + 40, 20, '#ffe27a');
      // yenidən başla nişanı
      const ry = top + (S.newRecord ? 90 : 76);
      const ready = S.time - S.overAt > OVER_DELAY;
      ctx.globalAlpha = ready ? 1 : 0.45;
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.arc(cx, ry, 24, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, ry, 11, -0.6, 4.9); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(cx + 12, ry - 14); ctx.lineTo(cx + 15, ry - 2); ctx.lineTo(cx + 4, ry - 6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      outlinedText(isTouch ? 'Yenidən başlamaq üçün toxun' : 'Yenidən: BOŞLUQ / ENTER', cx, ry + 42, 16, '#fff', 'center', '700');
    }

    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, 0, W, H);
      outlinedText('FASİLƏ', cx, H * 0.4, 44, '#fff');
      outlinedText('Davam etmək üçün P / toxun', cx, H * 0.4 + 44, 16, '#fff', 'center', '700');
    }
  }

  // ───────────── Əsas çəkmə ─────────────
  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawSky(S.time);
    drawClouds();
    drawHill(HILLS.far, S.pal.far, mixC(S.pal.far, S.pal.skyBot, 0.6), mixC(S.pal.far, S.pal.skyBot, 0.5), 0.35);
    drawHill(HILLS.mid, mixC(S.pal.mid, S.pal.lit, 0.55), shade(S.pal.mid, 0.78), S.pal.lit, 0.5);
    drawDabs(HILLS.mid);
    drawCabins();
    drawTrees();
    drawGround();
    drawObstacles();
    drawPetals();
    if (S.pal.dark > 0.005) {
      ctx.fillStyle = `rgba(8,14,46,${S.pal.dark})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawBunny();
    drawHUD();
  }

  // ───────────── Döngü ─────────────
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 120) dt = 120;
    if (!S.paused) update(Math.min(dt / FRAME, 3), dt);
    render();
  }

  // ───────────── Giriş ─────────────
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
  const DUCK_KEYS = new Set(['ArrowDown', 'KeyS']);
  window.addEventListener('keydown', (e) => {
    if (JUMP_KEYS.has(e.code) || e.code === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Enter' && S.state !== 'over') return;
      press();
    } else if (DUCK_KEYS.has(e.code)) {
      e.preventDefault();
      setDuck(true);
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.has(e.code)) release();
    else if (DUCK_KEYS.has(e.code)) setDuck(false);
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (S.paused) { togglePause(); return; }
    press();
  });
  window.addEventListener('pointerup', () => release());
  window.addEventListener('pointercancel', () => release());

  const duckBtn = document.getElementById('duckBtn');
  duckBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setDuck(true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => duckBtn.addEventListener(ev, () => setDuck(false)));

  const muteBtn = document.getElementById('muteBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  function syncMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('dq-muted', muted ? '1' : '0'); } catch (e) { /* sakit */ }
    syncMute();
  }
  function togglePause() {
    if (S.state !== 'running' && !S.paused) return;
    S.paused = !S.paused;
    last = 0;
    pauseBtn.textContent = S.paused ? '▶' : '⏸';
  }
  muteBtn.addEventListener('click', (e) => { e.currentTarget.blur(); toggleMute(); });
  pauseBtn.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
  pauseBtn.addEventListener('pointerdown', e => e.stopPropagation());
  syncMute();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.state === 'running' && !S.paused) togglePause();
    last = 0;
  });
  window.addEventListener('blur', () => { setDuck(false); bunny.holding = false; });

  // test / demo üçün
  window.__game = { S, bunny, press, release, startRun };

  imagesReady.then(() => requestAnimationFrame(frame));
})();
