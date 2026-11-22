// IBE MOTION · hero met dot-portret.
// 1. Opening: zwart doek met de leeuw in het dotpatroon (zelfde opbouw als in het Command Center: vullen, grijs, twee rode pulsen).
// 2. Het doek schuift van onder naar boven weg, de deeltjes spuiten van onderaf omhoog en vormen het portret.
// 3. Cursor of vinger is een lichtbron die de dots laat oplichten en wijken.
// 4. Scrollen: het portret valt uiteen en wordt de leeuw.
// Silhouet wisselen: klik of tik op de hero (portret <-> figuur), of ?v=figuur in de url. Opening overslaan: klik, Esc, spatie of Enter (of ?snel).
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - (1 - x) ** 3;
  const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const smooth = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
  const mixA = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const RED = [232, 52, 66], WHITE = [255, 236, 228], GREY = [96, 99, 110], DARK = [52, 55, 63], DEEP = [112, 20, 32];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  const hero = document.getElementById('hero'), stage = document.getElementById('stage');
  const canvas = document.getElementById('fx'), ctx = canvas.getContext('2d');
  const curtain = document.getElementById('curtain'), endEl = document.getElementById('end');
  const root = document.documentElement;

  try { history.scrollRestoration = 'manual'; } catch (e) {}
  scrollTo(0, 0);


  // ---------- Vormen inlezen ----------
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  // Kiest N punten uit een plaatje, dichter waar het lichter is. Geeft posities terug in eenheden van de vormhoogte, rond het midden.
  function sample(img, N, kind) {
    const w = img.width, h = img.height;
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 0, 0);
    const px = o.getImageData(0, 0, w, h).data;
    const cum = new Float64Array(w * h), lum = new Float32Array(w * h);
    let total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, k = i * 4;
      let wt = 0, l = 0;
      if (kind === 'leeuw') {
        const b = (px[k] + px[k + 1] + px[k + 2]) / 765;
        if (b > 0.2) { wt = b; l = 0.5 + 0.3 * b; }
      } else if (px[k + 3] > 128) {
        const yn = y / h, e = px[k + 1] / 255;
        l = px[k] / 255;
        const fade = kind === 'portret' ? 1 - smooth(0.72, 1, yn) : 1 - smooth(0.9, 1, yn) * 0.85;
        wt = (0.07 + l ** 1.6 + e * 0.8) * fade;
        l = Math.max(l, e * 0.7);
      }
      total += wt; cum[i] = total; lum[i] = l;
    }
    const X = new Float32Array(N), Y = new Float32Array(N), B = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      const u = ((n + Math.random()) / N) * total;
      let lo = 0, hi = w * h - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
      const x = lo % w, y = (lo / w) | 0;
      X[n] = (x + Math.random() - w / 2) / h;
      Y[n] = (y + Math.random()) / h - 0.5;
      B[n] = lum[lo];
    }
    return { X, Y, B, ar: w / h, cx: 0, cy: 0, h: 0 };
  }

  // ---------- Toestand ----------
  let W = 0, H = 0, dpr = 1, N = 0, dotK = 1;
  const shapes = {};
  let cur = params.get('v') === 'figuur' ? 'figuur' : 'portret', prev = cur, switchT = -1e9;
  let px, py, vx, vy, seed, delay;
  let started = false, startT = 0, raf = 0, last = 0;
  let mx = -1e4, my = -1e4, tmx = -1e4, tmy = -1e4, pointerOn = false, tilt = 0;
  let prog = 0;
  const dust = [];
  const PAL = [];
  for (let i = 0; i < 16; i++) { const t = i / 15; PAL.push(`rgb(${(t < 0.55 ? mixA(DEEP, RED, t / 0.55) : mixA(RED, WHITE, (t - 0.55) / 0.45)).join(',')})`); }
  let level = null, order = null; const counts = new Int32Array(17);

  function layout() {
    const r = hero.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    dotK = clamp(Math.min(W, H) / 820, 0.58, 1); // kleinere dots op een telefoon, anders wordt het portret te grof
    const p = shapes.portret, f = shapes.figuur, l = shapes.leeuw;
    if (!p) return;
    p.h = Math.min(H * 0.9, (W * 1.08) / p.ar);
    const desk = clamp((p.h / H - 0.5) / 0.4);
    p.cx = W / 2; p.cy = H * 0.47 + H * 0.13 * desk;
    f.h = Math.min(H * (0.68 + 0.18 * desk), (W * 1.12) / f.ar);
    f.cx = W / 2; f.cy = H * 0.56;
    l.h = Math.min(H * 0.5, (W * 0.74) / l.ar);
    l.cx = W / 2; l.cy = H * 0.42;
  }

  function init(imgs) {
    const r = hero.getBoundingClientRect();
    N = Math.round(clamp((r.width * r.height) / 95, 9000, 15000));
    shapes.leeuw = sample(imgs[0], N, 'leeuw');
    shapes.portret = sample(imgs[1], N, 'portret');
    shapes.figuur = sample(imgs[2], N, 'figuur');
    px = new Float32Array(N); py = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    seed = new Float32Array(N); delay = new Float32Array(N); level = new Uint8Array(N); order = new Int32Array(N);
    for (let i = 0; i < N; i++) { seed[i] = Math.random(); delay[i] = Math.random() * 520; }
    layout();
    for (let i = 0; i < 140; i++) dust.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, v: 0.004 + Math.random() * 0.012, a: 0.15 + Math.random() * 0.45, ph: Math.random() * 6.28 });
  }

  // De deeltjes staan onder het beeld klaar en schieten omhoog zodra het doek opent.
  function explode(now) {
    const k = H / 800;
    for (let i = 0; i < N; i++) {
      px[i] = W / 2 + (Math.random() - 0.5) * W * 0.3;
      py[i] = H + 10 + Math.random() * H * 0.25;
      vx[i] = (Math.random() - 0.5) * 16 * k;
      vy[i] = -(16 + Math.random() * 28) * k;
    }
    started = true; startT = now;
  }
  function settle(now) { // zonder animatie meteen op de plek
    const s = shapes[cur];
    for (let i = 0; i < N; i++) { px[i] = s.cx + s.X[i] * s.h; py[i] = s.cy + s.Y[i] * s.h; vx[i] = vy[i] = 0; delay[i] = 0; }
    started = true; startT = now - 5000;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 16.7, 0.4, 2.2); last = now;
    const time = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // stof in de lucht
    ctx.fillStyle = PAL[11];
    for (const d of dust) {
      d.y -= d.v * 0.016 * dt; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      ctx.globalAlpha = d.a * (0.6 + 0.4 * Math.sin(time * 0.7 + d.ph));
      ctx.fillRect(d.x * W + Math.sin(time * 0.2 + d.ph) * 14, d.y * H, d.s, d.s);
    }
    if (!started) { ctx.globalAlpha = 1; return; }

    const A = shapes[prev], B2 = shapes[cur], L = shapes.leeuw;
    const sRaw = clamp((now - switchT) / 1500), s = easeIO(sRaw);
    const m = still ? (prog > 0.5 ? 1 : 0) : smooth(0.1, 0.8, prog);
    const scat = Math.sin(Math.PI * m) * H * 0.22 + Math.sin(Math.PI * sRaw) * H * 0.07;
    const since = now - startT;
    mx += (tmx - mx) * 0.18; my += (tmy - my) * 0.18;
    tilt += ((pointerOn ? (tmx / W - 0.5) * 2 : Math.sin(time * 0.35) * 0.5) - tilt) * 0.04;
    const R = Math.max(90, Math.min(W, H) * 0.17), R2 = R * R;
    // twee lichtvlekken die over de vorm dwalen
    const hh = B2.h * (1 - m) + L.h * m, ccx = B2.cx, ccy = B2.cy * (1 - m) + L.cy * m;
    const s1x = ccx + Math.cos(time * 0.55) * hh * 0.16, s1y = ccy + Math.sin(time * 0.8) * hh * 0.22 - hh * 0.1;
    const s2x = ccx + Math.cos(time * 0.4 + 2.4) * hh * 0.22, s2y = ccy + Math.sin(time * 0.6 + 1.2) * hh * 0.2;
    const SR2 = (hh * 0.11) ** 2;

    for (let i = 0; i < N; i++) {
      const g = still ? 1 : clamp((since - delay[i]) / 950);
      let tx = A.cx + A.X[i] * A.h, ty = A.cy + A.Y[i] * A.h, tb = A.B[i];
      if (s > 0) { tx += (B2.cx + B2.X[i] * B2.h - tx) * s; ty += (B2.cy + B2.Y[i] * B2.h - ty) * s; tb += (B2.B[i] - tb) * s; }
      tx += (tb - 0.5) * tilt * B2.h * 0.035 * (1 - m);
      if (m > 0) { tx += (L.cx + L.X[i] * L.h - tx) * m; ty += (L.cy + L.Y[i] * L.h - ty) * m; tb += (L.B[i] - tb) * m; }
      const sd = seed[i];
      if (scat > 0.5) { const an = sd * 44 + time * 0.25; tx += Math.cos(an) * scat * (0.25 + sd); ty += Math.sin(an * 1.3) * scat * (0.25 + sd); }
      tx += Math.sin(time * 0.9 + sd * 40) * 1.1; ty += Math.cos(time * 0.7 + sd * 31) * 1.1;

      let light = 0;
      if (!still) {
        const kk = 0.05 * g * g;
        vx[i] += (tx - px[i]) * kk * dt; vy[i] += (ty - py[i]) * kk * dt;
        const dx = px[i] - mx, dy = py[i] - my, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) + 0.01, f = 1 - d / R; vx[i] += (dx / d) * f * f * 2.4 * dt; vy[i] += (dy / d) * f * f * 2.4 * dt; light += f * 0.9; }
        const damp = 0.968 - 0.118 * g;
        vx[i] *= damp; vy[i] *= damp;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      } else { px[i] = tx; py[i] = ty; }

      const x = px[i], y = py[i];
      let q = (x - s1x) ** 2 + (y - s1y) ** 2; if (q < SR2) light += (1 - q / SR2) * 0.55;
      q = (x - s2x) ** 2 + (y - s2y) ** 2; if (q < SR2) light += (1 - q / SR2) * 0.45;
      const sh = Math.sin(x * 0.011 + time * 1.1) * Math.cos(y * 0.013 - time * 0.8);
      if (sh > 0) light += sh * sh * sh * 0.35;
      light += (1 - g) * 0.9 + Math.min(0.5, (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.03); // heet tijdens de vlucht
      level[i] = (clamp(tb * 0.72 + 0.06 + light) * 15.99) | 0;
    }

    // sorteer op helderheid (counting sort), dan per kleur in een keer tekenen
    counts.fill(0);
    for (let i = 0; i < N; i++) counts[level[i] + 1]++;
    for (let b = 1; b < 17; b++) counts[b] += counts[b - 1];
    for (let i = 0; i < N; i++) order[counts[level[i]]++] = i;
    let k = 0;
    for (let b = 0; b < 16; b++) {
      const t = b / 15, sz = (0.9 + t * 1.5) * dotK, end = counts[b];
      ctx.fillStyle = PAL[b]; ctx.globalAlpha = 0.34 + 0.66 * t;
      for (; k < end; k++) { const i = order[k]; ctx.fillRect(px[i], py[i], sz, sz); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- Opening: doek met de leeuw ----------
  function intro() {
    return new Promise((resolve) => {
      const T = { fill: 1300, grey: 450, pulse: 1100 }, S = { fill: 0, grey: 1300, pulse: 1750, end: 2850 };
      const cv = curtain.querySelector('canvas'), c = cv.getContext('2d');
      const cw = innerWidth, ch = innerHeight, d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = cw * d; cv.height = ch * d;
      const gap = Math.max(11, Math.round(Math.min(cw, ch) / 62));
      const dots = []; let lion = { x: cw / 2, y: ch / 2, size: Math.min(cw, ch) * 0.64 };
      let t0 = 0, r2 = 0, lifted = false, over = false;
      root.classList.add('intro-on');

      const img = new Image();
      img.onload = () => { build(); t0 = performance.now(); r2 = requestAnimationFrame(draw); };
      img.onerror = lift;
      img.src = window.IBE_LION_MASK;

      function build() {
        const cols = Math.ceil(cw / gap) + 1, rows = Math.ceil(ch / gap) + 1;
        const size = lion.size, ar = img.width / img.height;
        const lw = ar >= 1 ? size : size * ar, lh = ar >= 1 ? size / ar : size;
        const lx = (cw - lw) / 2, ly = (ch - lh) / 2 - ch * 0.02;
        lion = { x: lx + lw / 2, y: ly + lh / 2, size };
        const off = document.createElement('canvas'); off.width = cols; off.height = rows;
        const o = off.getContext('2d');
        o.drawImage(img, lx / gap, ly / gap, lw / gap, lh / gap);
        const p = o.getImageData(0, 0, cols, rows).data;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4, b = (p[k] + p[k + 1] + p[k + 2]) / 765, x = i * gap, y = j * gap;
          dots.push({ x, y, b: b > 0.2 ? b : 0, delay: ((cw - x) + y) / (cw + ch) });
        }
      }

      function draw(now) {
        if (over) return;
        const e = now - t0;
        c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, cw, ch);
        const pFill = clamp(e / T.fill), pGrey = clamp((e - S.grey) / T.grey), eP = e - S.pulse, time = e / 1000;
        const pulse = eP > 0 && eP < T.pulse ? Math.max(0, Math.sin((eP / T.pulse) * Math.PI * 4 - Math.PI / 2) * 0.5 + 0.5) ** 1.6 : 0;
        const glitch = e > S.end - 170 && e < S.end + 120, gSeed = Math.floor(e / 45);
        for (const o of dots) {
          const appear = clamp((pFill * 1.35 - o.delay) / 0.35);
          if (appear <= 0) continue;
          const z = Math.sin(o.x * 0.012 + time * 1.6) * Math.cos(o.y * 0.016 - time * 1.1), lift = (z + 1) / 2;
          let x = o.x; const y = o.y - z * gap * 0.35 * (1 - pGrey * 0.7);
          let r = gap * (o.b ? 0.2 + o.b * 0.22 : 0.1 + lift * 0.09) * ease(appear);
          let col, alpha = o.b ? 1 : 0.28 + lift * 0.42;
          if (o.b) {
            r *= 1 + pulse * 0.5;
            if (pGrey < 1) col = mixA(mixA(RED, WHITE, clamp((lift - 0.25) * 1.3 * o.b)), GREY, pGrey);
            else if (eP < T.pulse) col = mixA(GREY, mixA(RED, WHITE, pulse * 0.25), pulse);
            else col = mixA(RED, WHITE, 0.1);
          } else {
            col = mixA(mixA([110, 20, 30], RED, lift * 0.8), DARK, pGrey);
            alpha = alpha * (1 - pGrey) + (0.45 + lift * 0.25) * pGrey;
          }
          if (glitch) { const sl = Math.floor(y / (gap * 2.5)); if (hash(sl * 7.3 + gSeed) > 0.62) x += (hash(sl + gSeed * 3.1) - 0.5) * gap * 6; }
          c.globalAlpha = alpha; c.fillStyle = `rgb(${col.join(',')})`;
          c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
        }
        // vizier rond de leeuw
        const a = clamp((e - S.grey + 250) / 400);
        if (a > 0) {
          const Rr = lion.size * 0.6, ring = mixA([255, 255, 255], RED, pulse);
          c.globalAlpha = a; c.lineWidth = 1; c.strokeStyle = `rgba(${ring.join(',')},${0.16 + pulse * 0.25})`;
          for (let i = 0; i < 72; i++) {
            const ang = (i / 72) * Math.PI * 2, l = i % 6 ? 4 : 9;
            c.beginPath(); c.moveTo(lion.x + Math.cos(ang) * Rr, lion.y + Math.sin(ang) * Rr); c.lineTo(lion.x + Math.cos(ang) * (Rr + l), lion.y + Math.sin(ang) * (Rr + l)); c.stroke();
          }
          c.lineWidth = 2; c.strokeStyle = `rgba(${ring.join(',')},${0.5 + pulse * 0.4})`;
          for (const [a0, len, dir, rr] of [[0, 0.9, 1, Rr - 10], [2.4, 0.5, 1, Rr - 10], [4.1, 1.2, 1, Rr - 10], [1, 0.7, -1, Rr + 18], [3.8, 1.4, -1, Rr + 18]]) {
            const st = a0 + time * 0.7 * dir; c.beginPath(); c.arc(lion.x, lion.y, Math.max(1, rr), st, st + len); c.stroke();
          }
        }
        c.globalAlpha = 1;
        if (e >= S.end && !lifted) lift();
        r2 = requestAnimationFrame(draw);
      }

      function lift() {
        if (lifted) return; lifted = true;
        curtain.classList.add('lift');
        document.body.classList.add('is-open');
        root.classList.remove('intro-on');
        removeEventListener('keydown', key);
        setTimeout(resolve, 180);                    // de explosie start vlak nadat het doek loskomt
        setTimeout(() => { over = true; cancelAnimationFrame(r2); curtain.classList.add('gone'); }, 1500);
      }
      const key = (ev) => { if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); lift(); } };
      curtain.addEventListener('pointerdown', lift);
      addEventListener('keydown', key);
      setTimeout(lift, 7000); // vangnet
      if (params.has('snel')) lift();
    });
  }

  // ---------- Bediening ----------
  function setShape(name) {
    if (!shapes[name] || name === cur) return;
    prev = cur; cur = name; switchT = performance.now();
  }
  // klik of tik op de hero wisselt tussen portret en figuur (niet op links, en niet zolang de leeuw in beeld is)
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button') || !started || prog > 0.1) return;
    setShape(cur === 'portret' ? 'figuur' : 'portret');
  });

  function onScroll() {
    const max = stage.offsetHeight - innerHeight;
    prog = max > 0 ? clamp(scrollY / max) : 0;
    hero.style.setProperty('--p', prog.toFixed(4));
    const e = smooth(0.72, 0.94, prog);
    endEl.style.setProperty('--end', e.toFixed(3));
    endEl.classList.toggle('on', e > 0.6);
  }
  addEventListener('scroll', onScroll, { passive: true });

  hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); tmx = e.clientX - r.left; tmy = e.clientY - r.top; if (!pointerOn) { mx = tmx; my = tmy; } pointerOn = true; });
  const leave = () => { pointerOn = false; tmx = tmy = -1e4; mx = my = -1e4; };
  hero.addEventListener('pointerleave', leave);
  hero.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); });
  hero.addEventListener('pointercancel', leave);

  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layout(); onScroll(); }, 120); });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // ---------- Start ----------
  Promise.all([load(window.IBE_LION_MASK), load(window.IBE_SHAPES.portret), load(window.IBE_SHAPES.figuur)]).then((imgs) => {
    init(imgs); onScroll();
    last = performance.now(); raf = requestAnimationFrame(frame);
    if (still) { document.body.classList.add('is-open'); curtain.classList.add('gone'); settle(performance.now()); return; }
    intro().then(() => explode(performance.now()));
  }).catch(() => { document.body.classList.add('is-open'); curtain.classList.add('gone'); root.classList.remove('intro-on'); });
})();
