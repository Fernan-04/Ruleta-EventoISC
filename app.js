/* Ruleta de Becas ISC UTP — JS puro, sin módulos (funciona con file://). */
(function () {
  'use strict';

  const PRIZES = window.PRIZES;
  const SAMPLE = window.SAMPLE_NAMES.join('\n');
  const TAU = 2 * Math.PI;
  // Paleta alegre dentro de la identidad: morados vivos alternados con dorados/crema.
  const SEG = ['#5a1ae2', '#f3bd62', '#8b5cff', '#f6d9a8', '#6c2bf0', '#ffcf7a'];
  const LIGHT = ['#f3bd62', '#f6d9a8', '#ffcf7a'];
  const $ = id => document.getElementById(id);
  const mod = (x, m) => ((x % m) + m) % m;
  const key = s => s.toLocaleLowerCase('es');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Línea de tiempo del giro (ms). Total: 450 + 5900 + 850 = 7,2 s.
  const T_BACK = 450;     // tirón hacia atrás
  const T_MAIN = 5900;    // aceleración y frenado
  const T_SETTLE = 850;   // rebote de vuelta al segmento ganador
  const T_REDUCED = 300;  // prefers-reduced-motion

  /* ---------- Persistencia ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('iscSorteo_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('iscSorteo_' + k, JSON.stringify(v)); } catch (e) { /* sin storage: seguimos en memoria */ } }
  };

  /* ---------- Estado ---------- */
  const ta = $('names');
  const state = {
    namesRaw: store.get('names', SAMPLE),
    winners: store.get('winners', []),   // índice = n° de beca (0..24)
    absent: store.get('absent', []),
    rotation: Number(store.get('rotation', 0)) || 0,
    // true = el último ganador aún no fue confirmado ("Siguiente beca" no se ha pulsado):
    // la pantalla sigue mostrándolo con sus botones, incluso tras recargar. Aplica también a la beca 25.
    pending: store.get('pending', false) === true,
    muted: store.get('muted', false) === true,
    spinning: false,
    interlude: false,
    lastSpin: null                       // datos del último giro (para verificación)
  };
  if (!Array.isArray(state.winners)) state.winners = [];
  if (!Array.isArray(state.absent)) state.absent = [];
  state.winners = state.winners.filter(w => w && typeof w.name === 'string').slice(0, PRIZES.length);
  if (!state.winners.length) state.pending = false;
  ta.value = state.namesRaw;

  function save() {
    store.set('names', state.namesRaw);
    store.set('winners', state.winners);
    store.set('absent', state.absent);
    store.set('pending', state.pending);
    store.set('rotation', mod(state.rotation, TAU));
  }

  /* ---------- Participantes ---------- */
  function names() {
    const seen = new Set(), out = [];
    for (const line of state.namesRaw.split(/\r?\n/)) {
      const n = line.replace(/\s+/g, ' ').trim();
      if (!n || seen.has(key(n))) continue;
      seen.add(key(n));
      out.push(n);
    }
    return out;
  }
  function poolWithout(winners) {
    const taken = new Set(winners.map(w => key(w.name)).concat(state.absent.map(key)));
    return names().filter(n => !taken.has(key(n)));
  }
  const pool = () => poolWithout(state.winners);
  // ¿Hay un ganador en pantalla sin confirmar?
  const showingWinner = () => state.pending && state.winners.length > 0;
  const isDone = () => state.winners.length >= PRIZES.length && !state.pending;
  const canSpin = () => !state.spinning && !state.interlude && !showingWinner() &&
    state.winners.length < PRIZES.length && pool().length > 0;

  /* ---------- Sonido (Web Audio, sin archivos) ---------- */
  let actx = null, master = null;
  function audio() {
    if (state.muted) return null;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = 0.6;
        master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function note(freq, at, dur, type, vol) {
    const c = actx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + dur + 0.05);
  }
  function tickSound() {
    const c = audio(); if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1500 + Math.random() * 200, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.035);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.07);
  }
  function winSound() {
    const c = audio(); if (!c) return;
    const t = c.currentTime + 0.02;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.1, 0.24, 'triangle', 0.22));
    [523.25, 659.25, 783.99, 1046.5].forEach(f => note(f, t + 0.45, 1.3, 'sine', 0.09));
    note(2093, t + 0.45, 0.5, 'triangle', 0.05);
  }

  /* ---------- Ruleta ---------- */
  const wheel = $('wheel'), wx = wheel.getContext('2d');
  const C = 500;          // centro del canvas 1000×1000
  const R_OUT = 498;      // borde exterior del aro
  const RIM = 44;         // grosor del marco (con foquitos)
  const RS = R_OUT - RIM; // radio de los segmentos (454)
  const TEXT_OUT = RS - 20;       // el texto termina aquí (deja sitio a la punta de la flecha)
  const TEXT_IN = 140;            // ...y no entra más allá del centro (logo)
  const TEXT_MAX = TEXT_OUT - TEXT_IN;
  const FS_MIN = 16, FS_MAX = 34;
  const FONT = fs => `700 ${fs}px Poppins, system-ui, sans-serif`;

  function segColor(i, n) {
    // Si n % 6 === 1, el último segmento tendría el mismo color que el primero: lo cambiamos.
    return (n % SEG.length === 1 && i === n - 1 && n > 1) ? '#c4387a' : SEG[i % SEG.length];
  }

  function segPath(s0, a) { wx.beginPath(); wx.moveTo(C, C); wx.arc(C, C, RS, s0, s0 + a); wx.closePath(); }

  function offscreen(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

  // Marco dorado suave, estilo "ruleta de feria" (estático: no gira). Se dibuja una sola vez.
  const rimLayer = (() => {
    const c = offscreen(1000), x = c.getContext('2d');
    x.beginPath(); x.arc(C, C, R_OUT, 0, TAU); x.arc(C, C, RS, 0, TAU, true);
    const g = x.createLinearGradient(0, C - R_OUT, 0, C + R_OUT);   // dorado cálido, sin brillos "de metal"
    g.addColorStop(0, '#ffe3a8'); g.addColorStop(.45, '#f3bd62'); g.addColorStop(1, '#d9953b');
    x.fillStyle = g; x.fill('evenodd');
    // bordes redondeados y amables: blanco cremoso por dentro y por fuera
    x.lineWidth = 6; x.strokeStyle = '#fff3d9';
    x.beginPath(); x.arc(C, C, RS + 3, 0, TAU); x.stroke();
    x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,.55)';
    x.beginPath(); x.arc(C, C, R_OUT - 3, 0, TAU); x.stroke();
    // sombra muy suave hacia los segmentos
    const s = x.createRadialGradient(C, C, RS - 22, C, C, RS);
    s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(30,10,80,.22)');
    x.beginPath(); x.arc(C, C, RS, 0, TAU); x.fillStyle = s; x.fill();
    return c;
  })();

  // Foquitos del marco (encendido / apagado), como en una ruleta de feria.
  function bulb(on) {
    const c = offscreen(64), x = c.getContext('2d');
    if (on) { x.shadowColor = 'rgba(255,236,170,.95)'; x.shadowBlur = 16; }
    const g = x.createRadialGradient(28, 27, 2, 32, 32, 13);
    if (on) { g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#fff6cf'); g.addColorStop(1, '#ffd36b'); }
    else { g.addColorStop(0, '#fff3d9'); g.addColorStop(1, '#e3a64f'); }
    x.beginPath(); x.arc(32, 32, 12, 0, TAU); x.fillStyle = g; x.fill();
    x.shadowBlur = 0; x.lineWidth = 2; x.strokeStyle = on ? 'rgba(255,255,255,.9)' : 'rgba(180,110,30,.6)'; x.stroke();
    return c;
  }
  const BULB_ON = bulb(true), BULB_OFF = bulb(false);
  const BULBS = 24;              // fijos en el marco
  const BULB_R = RS + RIM / 2;
  // modo de los foquitos: 'idle' (titilan suave), 'chase' (corren mientras gira), 'blink' (parpadean al ganar)
  const lights = { mode: 'idle', phase: 0 };
  function bulbOn(i) {
    if (reducedMotion()) return true;
    if (lights.mode === 'chase') return (i + lights.phase) % 3 === 0;
    if (lights.mode === 'blink') return lights.phase % 2 === 0;
    return (i + lights.phase) % 2 === 0;
  }

  // Puntito blanco tipo caramelo en cada división (gira con la ruleta; la flecha "choca" con ellos).
  const pegSprite = (() => {
    const c = offscreen(48), x = c.getContext('2d');
    x.shadowColor = 'rgba(40,10,90,.45)'; x.shadowBlur = 4; x.shadowOffsetY = 2;
    const g = x.createRadialGradient(20, 19, 1, 24, 24, 11);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#efe6ff');
    x.beginPath(); x.arc(24, 24, 10, 0, TAU); x.fillStyle = g; x.fill();
    return c;
  })();
  const PEG_IN = RS - 14;        // radio de los puntitos (borde de los segmentos)

  // Relieve suave de los segmentos: luz hacia el centro.
  const depth = wx.createRadialGradient(C, C, 60, C, C, RS);
  depth.addColorStop(0, 'rgba(255,255,255,.22)');
  depth.addColorStop(.6, 'rgba(255,255,255,0)');
  depth.addColorStop(1, 'rgba(30,10,80,.12)');

  /* --- Etiquetas: nombre + primer apellido, se achica, 2 líneas y recién entonces "…" --- */
  const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'das', 'do', 'dos', 'van', 'von', 'san', 'mc']);
  function shortName(full) {
    const w = full.split(' ');
    let take = w.length >= 4 ? w.length - 1 : w.length === 3 ? 2 : w.length;   // quita el 2.º apellido
    while (take > 1 && PARTICLES.has(key(w[take - 1]))) take--;                  // no terminar en "de", "la", "y"…
    return w.slice(0, take).join(' ');
  }
  function ellipsize(t, max) {
    if (wx.measureText(t).width <= max) return t;
    while (t.length > 1 && wx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  // Alto disponible en el extremo interior del texto (el segmento es más angosto hacia el centro).
  function roomAt(width, a) {
    if (a >= Math.PI) return Infinity;
    return 2 * (TEXT_OUT - width) * Math.tan(a / 2);
  }
  function splitTwo(t) {
    const w = t.split(' ');
    if (w.length < 2) return null;
    let best = null;
    for (let i = 1; i < w.length; i++) {
      const l1 = w.slice(0, i).join(' '), l2 = w.slice(i).join(' ');
      const m = Math.max(wx.measureText(l1).width, wx.measureText(l2).width);
      if (!best || m < best.m) best = { lines: [l1, l2], m };
    }
    return best;
  }
  const labelCache = new Map();
  function wheelLabel(full, n) {
    const ck = n + '|' + full;
    if (labelCache.has(ck)) return labelCache.get(ck);
    const a = TAU / n, t = shortName(full);
    const fs0 = Math.round(Math.max(FS_MIN, Math.min(FS_MAX, a * RS * 0.55)));
    const fsLow = Math.max(FS_MIN, Math.round(fs0 * 0.72));
    let out = null;
    // 1) una línea, achicando hasta un tope
    for (let fs = fs0; fs >= fsLow && !out; fs--) {
      wx.font = FONT(fs);
      const w = wx.measureText(t).width;
      if (w <= TEXT_MAX && fs * 0.95 <= roomAt(w, a)) out = { fs, lines: [t] };
    }
    // 2) dos líneas
    for (let fs = fs0; fs >= FS_MIN && !out; fs--) {
      wx.font = FONT(fs);
      const sp = splitTwo(t);
      if (!sp) break;
      if (sp.m <= TEXT_MAX && fs * 2.1 <= roomAt(sp.m, a)) out = { fs, lines: sp.lines };
    }
    // 3) recién ahora "…": 2 líneas recortadas al ancho que permite el alto del segmento; si no hay alto, 1 línea
    if (!out) {
      for (let fs = Math.min(fs0, 20); fs >= FS_MIN && !out; fs--) {
        wx.font = FONT(fs);
        const w = t.split(' ');
        if (w.length < 2) break;
        // ancho máximo tal que en su extremo interior aún quepan 2 líneas
        const maxW = Math.min(TEXT_MAX, a >= Math.PI ? TEXT_MAX : TEXT_OUT - (fs * 2.1) / (2 * Math.tan(a / 2)));
        if (maxW < 120) continue;
        // 1.ª línea completa con todas las palabras que quepan; solo la 2.ª lleva "…"
        let i = 1;
        while (i < w.length - 1 && wx.measureText(w.slice(0, i + 1).join(' ')).width <= maxW) i++;
        out = { fs, lines: [ellipsize(w.slice(0, i).join(' '), maxW), ellipsize(w.slice(i).join(' '), maxW)] };
      }
      if (!out) { wx.font = FONT(fsLow); out = { fs: fsLow, lines: [ellipsize(t, TEXT_MAX)] }; }
    }
    if (labelCache.size > 3000) labelCache.clear();
    labelCache.set(ck, out);
    return out;
  }

  // hi = índice del segmento ganador a iluminar (-1 = ninguno); glow 0..1 = intensidad.
  function drawWheel(list, hi = -1, glow = 1) {
    const n = list.length;
    wx.clearRect(0, 0, 1000, 1000);
    if (!n) {
      wx.fillStyle = '#7c4dff';
      wx.beginPath(); wx.arc(C, C, RS, 0, TAU); wx.fill();
      drawFrame();
      return;
    }
    const a = TAU / n, rot = state.rotation;

    // segmentos
    for (let i = 0; i < n; i++) {
      segPath(rot + i * a, a);
      wx.fillStyle = segColor(i, n); wx.fill();
      if (hi >= 0 && i !== hi) { wx.fillStyle = 'rgba(40,15,110,.28)'; wx.fill(); }   // atenuar suave al resto
    }
    wx.beginPath(); wx.arc(C, C, RS, 0, TAU); wx.fillStyle = depth; wx.fill();   // relieve
    if (hi >= 0) {
      segPath(rot + hi * a, a);
      wx.fillStyle = `rgba(255,255,255,${0.12 + 0.22 * glow})`; wx.fill();
    }
    // divisiones blancas, redondeadas
    if (n > 1) {
      wx.beginPath();
      for (let i = 0; i < n; i++) {
        const ang = rot + i * a;
        wx.moveTo(C, C); wx.lineTo(C + Math.cos(ang) * RS, C + Math.sin(ang) * RS);
      }
      wx.lineCap = 'round'; wx.lineWidth = n > 60 ? 1.5 : 3; wx.strokeStyle = 'rgba(255,255,255,.7)'; wx.stroke();
    }
    // nombres
    wx.textAlign = 'right'; wx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const col = segColor(i, n), lab = wheelLabel(list[i], n), light = LIGHT.includes(col);
      wx.save();
      wx.translate(C, C); wx.rotate(rot + i * a + a / 2);
      wx.fillStyle = light ? '#2a0f7a' : '#ffffff';
      if (!light) { wx.shadowColor = 'rgba(30,10,80,.35)'; wx.shadowBlur = 4; wx.shadowOffsetY = 1; }
      if (hi >= 0 && i !== hi) wx.globalAlpha = 0.7;
      wx.font = FONT(lab.fs);
      if (lab.lines.length === 1) wx.fillText(lab.lines[0], TEXT_OUT, 0);
      else { wx.fillText(lab.lines[0], TEXT_OUT, -lab.fs * 0.56); wx.fillText(lab.lines[1], TEXT_OUT, lab.fs * 0.56); }
      wx.restore();
    }
    // segmento ganador: borde blanco cálido que brilla
    if (hi >= 0) {
      wx.save();
      wx.beginPath(); wx.arc(C, C, RS, 0, TAU); wx.clip();
      segPath(rot + hi * a, a);
      wx.shadowColor = 'rgba(255,214,120,.95)';
      wx.shadowBlur = 20 + 40 * glow;
      wx.strokeStyle = '#fff3d9'; wx.lineWidth = 9; wx.lineJoin = 'round';
      wx.stroke();
      wx.restore();
    }
    // puntitos en cada división (se achican si hay muchos participantes)
    if (n > 1) {
      const size = Math.max(8, Math.min(22, a * PEG_IN * 0.45));
      for (let i = 0; i < n; i++) {
        const ang = rot + i * a;
        wx.drawImage(pegSprite, C + Math.cos(ang) * PEG_IN - size, C + Math.sin(ang) * PEG_IN - size, size * 2, size * 2);
      }
    }
    drawFrame();
  }

  // Marco fijo + foquitos.
  function drawFrame() {
    wx.drawImage(rimLayer, 0, 0);
    for (let i = 0; i < BULBS; i++) {
      const ang = -Math.PI / 2 + (i + 0.5) * TAU / BULBS;
      wx.drawImage(bulbOn(i) ? BULB_ON : BULB_OFF, C + Math.cos(ang) * BULB_R - 32, C + Math.sin(ang) * BULB_R - 32);
    }
  }

  // Índice del segmento que está bajo la flecha (0 rad) para la rotación actual.
  function indexAtPointer(n) {
    const a = TAU / n;
    return Math.floor(mod(-state.rotation, TAU) / a) % n;
  }

  // Ruleta y segmento ganador que corresponden a la pantalla actual.
  function winnerWheel() {
    const winner = state.winners[state.winners.length - 1].name;
    const list = poolWithout(state.winners.slice(0, -1));
    const k = list.findIndex(n => key(n) === key(winner));
    return { list, k };
  }

  let glowRaf = 0, glowRunning = false;
  function drawCurrentWheel() {
    cancelAnimationFrame(glowRaf); glowRunning = false; lights.mode = 'idle';
    if (!showingWinner()) { drawWheel(pool()); return; }
    const { list, k } = winnerWheel();
    if (k < 0) { drawWheel(pool()); return; }   // el ganador ya no está en la lista pegada
    if (indexAtPointer(list.length) !== k) {
      // La lista cambió desde el giro: centramos el segmento del ganador bajo la flecha.
      const a = TAU / list.length;
      state.rotation = mod(-(k * a + a / 2), TAU);
    }
    drawWheel(list, k, 1);
  }

  // Segmento ganador pulsando ~2 s y luego fijo.
  function winnerGlow(list, k) {
    cancelAnimationFrame(glowRaf);
    if (reducedMotion()) { lights.mode = 'idle'; drawWheel(list, k, 1); return; }
    const t0 = performance.now();
    glowRunning = true; lights.mode = 'blink';
    (function f(now) {
      const t = (now - t0) / 1000;
      if (t >= 2.2) { glowRunning = false; lights.mode = 'idle'; drawWheel(list, k, 1); return; }
      lights.phase = Math.floor(t / 0.22);                     // todos los foquitos parpadean
      drawWheel(list, k, 0.35 + 0.65 * Math.abs(Math.sin(t * 4.3)));
      glowRaf = requestAnimationFrame(f);
    })(t0);
  }

  function flickPin() {
    const pin = $('pin');
    if (!pin.animate || reducedMotion()) return;
    pin.animate([
      { transform: 'translateY(-50%) rotate(0deg)' },
      { transform: 'translateY(-50%) rotate(-18deg)', offset: 0.35 },
      { transform: 'translateY(-50%) rotate(0deg)' }
    ], { duration: 130, easing: 'ease-out' });
  }

  /* ---------- Render ---------- */
  function prizePosition(i) {
    let tot = 0, pos = 0;
    PRIZES.forEach((q, j) => { if (q.b === PRIZES[i].b) { tot++; if (j <= i) pos = tot; } });
    return [pos, tot];
  }

  function renderCounters() {
    $('pc').textContent = pool().length + ' en juego · ' + names().length + ' registrados';
    $('wc').textContent = state.winners.length + ' / ' + PRIZES.length;
  }

  function renderTable(curIndex) {
    $('tb').innerHTML = PRIZES.map((p, j) => {
      const w = state.winners[j];
      return `<tr class="${j === curIndex ? 'cur' : ''}"><td class="n">${j + 1}</td>` +
        `<td><span class="tag ${p.k}">${p.k === 'full' ? 'COMPLETA' : 'MEDIA'}</span> ${esc(p.b)}<div class="ally">${esc(p.a)}</div></td>` +
        `<td class="w ${w ? '' : 'pend'}">${w ? esc(w.name) : '—'}</td></tr>`;
    }).join('');
    // Desplaza solo la caja de la tabla (scrollIntoView movería toda la página).
    const cur = $('tb').querySelector('tr.cur'), box = $('tb').closest('.tbl');
    if (cur && box) {
      const b = box.getBoundingClientRect(), r = cur.getBoundingClientRect();
      const top = b.top + box.querySelector('thead').offsetHeight;
      if (r.top < top) box.scrollTop -= top - r.top;
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
    }
  }

  function renderPrize(i) {
    const p = PRIZES[i], [pos, tot] = prizePosition(i);
    $('prize').innerHTML =
      `<span class="kind ${p.k === 'half' ? 'half' : ''}">${p.k === 'full' ? 'BECA COMPLETA 100%' : 'MEDIA BECA'}</span>` +
      `<h2>${esc(p.b)}</h2>` +
      `<div class="by">${esc(p.a)}${p.k === 'half' ? ' · válida por máximo 1 mes' : ''}</div>` +
      `<div class="count">Beca ${pos} de ${tot} · Sorteo ${i + 1} de ${PRIZES.length}</div>`;
  }

  /* ---------- Caja del ganador: alto fijo, el texto se ajusta ANTES de mostrarse ---------- */
  // La caja tiene alto fijo por CSS (2 líneas del tamaño máximo). Aquí se calcula, con un canvas
  // (sin tocar el layout), el mayor tamaño de letra con el que el nombre entra en ≤ 2 líneas.
  const measureCtx = document.createElement('canvas').getContext('2d');
  const LINE_H = 1.08;                 // = line-height de .reel .name
  const fitCache = new Map();
  let liveFs = 0;                      // tamaño fijo mientras gira

  function boxInner() {
    const r = $('reel'), cs = getComputedStyle(r);
    const w = r.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = r.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return { w: Math.floor(w * 0.96), h: Math.floor(h) };   // 4 % de margen por diferencias de render
  }
  function linesNeeded(words, maxW, fs) {
    measureCtx.font = `800 ${fs}px Poppins, system-ui, sans-serif`;
    const sp = -0.01 * fs;                                   // letter-spacing: -.01em
    const width = s => measureCtx.measureText(s).width + sp * s.length;
    let lines = 1, cur = '';
    for (const w of words) {
      if (width(w) > maxW) return Infinity;                  // una palabra sola no entra
      const next = cur ? cur + ' ' + w : w;
      if (width(next) <= maxW) cur = next; else { lines++; cur = w; }
    }
    return lines;
  }
  function fitSize(text) {
    const { w, h } = boxInner();
    const ck = w + 'x' + h + '|' + text;
    if (fitCache.has(ck)) return fitCache.get(ck);
    const words = text.split(' ');
    const max = Math.floor(h / (2 * LINE_H));                // 2 líneas del tamaño máximo llenan la caja
    let fs = max;
    for (; fs > 12; fs--) if (linesNeeded(words, w, fs) <= 2) break;
    if (fitCache.size > 4000) fitCache.clear();
    fitCache.set(ck, fs);
    return fs;
  }

  // mode: 'live' (tamaño fijo del giro, sin transición) | 'final' (su tamaño, con transición) | 'static'
  function showName(text, mode = 'static') {
    const el = $('name');
    el.textContent = text;
    el.className = 'name';
    if (mode === 'live') { el.style.fontSize = liveFs + 'px'; return; }
    if (mode === 'final') {
      el.classList.add('sizing');                            // font-size con transición suave
      el.style.fontSize = fitSize(text) + 'px';
      void el.offsetWidth; el.classList.add('pop');
      return;
    }
    el.style.fontSize = fitSize(text) + 'px';
  }
  function showHint(text) {
    const el = $('name');
    el.className = 'name';
    el.style.fontSize = '';
    el.innerHTML = `<span class="hint">${esc(text)}</span>`;
  }
  // Si cambia el tamaño de la caja (pantalla completa, rotar el celular), reajustar el texto.
  if (window.ResizeObserver) {
    let lastW = 0, lastH = 0;
    new ResizeObserver(() => {
      const r = $('reel');
      if (r.clientWidth === lastW && r.clientHeight === lastH) return;
      lastW = r.clientWidth; lastH = r.clientHeight;
      const el = $('name');
      if (el.querySelector('.hint')) return;
      if (state.spinning) { liveFs = Math.min(...currentSpinList.map(fitSize)); el.style.fontSize = liveFs + 'px'; }
      else el.style.fontSize = fitSize(el.textContent) + 'px';
    }).observe($('reel'));
  }
  let currentSpinList = [];

  function render() {
    const i = state.winners.length;
    if (!state.spinning) drawCurrentWheel();
    renderCounters();
    $('exnote').hidden = state.namesRaw.trim() !== SAMPLE;
    const reel = $('reel');

    if (isDone()) {
      $('prize').innerHTML = '<span class="kind">SORTEO COMPLETO</span><h2>¡Felicitaciones a los 25 ganadores!</h2><div class="by">Los aliados se comunicarán con cada ganador</div>';
      reel.className = 'reel win done';
      showName('🎉');
      $('actions').innerHTML = '';
      renderTable(-1);
    } else if (showingWinner()) {
      // Ganador aún sin confirmar (p. ej. tras recargar): misma pantalla que al terminar el giro.
      renderPrize(i - 1);
      reel.className = 'reel win';
      showName(state.winners[i - 1].name);
      showAfterWin();
      renderTable(i - 1);
    } else {
      renderPrize(i);
      reel.className = 'reel';
      const empty = pool().length === 0;
      showHint(empty ? 'No quedan participantes en la ruleta 🙈' : 'Presiona “Girar” y que gane la suerte 🍀');
      $('actions').innerHTML = '<button class="go" id="go">🎡 ¡Girar la ruleta!</button>';
      $('go').onclick = spin;
      $('go').disabled = !canSpin();
      renderTable(i);
    }
  }

  function showAfterWin() {
    const last = state.winners.length >= PRIZES.length;
    $('actions').innerHTML =
      `<button class="go" id="next">${last ? 'Finalizar sorteo' : 'Siguiente beca'} →</button>` +
      '<button class="ghost" id="abs">No está presente · volver a sortear</button>';
    $('next').onclick = nextPrize;
    $('abs').onclick = notPresent;
  }

  // Transición suave del panel de info al cambiar de beca.
  function swapIn() {
    const side = $('side');
    if (reducedMotion() || !side.animate) return;
    side.animate([
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  /* ---------- Pantalla de transición a medias becas ---------- */
  let interludeTimer;
  function showInterlude() {
    const total = PRIZES.filter(p => p.k === 'half').length;
    $('interludeSub').textContent = `${total} medias becas · válidas por máximo 1 mes`;
    state.interlude = true;
    $('interlude').hidden = false;
    const go = $('go'); if (go) go.disabled = true;
    clearTimeout(interludeTimer);
    interludeTimer = setTimeout(hideInterlude, 3500);
  }
  function hideInterlude() {
    if (!state.interlude) return;
    clearTimeout(interludeTimer);
    state.interlude = false;
    $('interlude').hidden = true;
    const go = $('go'); if (go) go.disabled = !canSpin();
  }

  /* ---------- Acciones ---------- */
  function nextPrize() {
    if (state.spinning || !showingWinner()) return;
    const i = state.winners.length;   // índice de la próxima beca
    state.pending = false;            // ganador confirmado
    save();
    render();
    swapIn();
    if (i >= PRIZES.length) { confetti(true); return; }
    if (PRIZES[i].k === 'half' && PRIZES[i - 1].k === 'full') showInterlude();
  }

  function notPresent() {
    if (state.spinning || !showingWinner()) return;
    const w = state.winners.pop();
    state.absent.push(w.name);
    state.pending = false;
    save();
    render();   // misma beca, ruleta sin la persona ausente
    spin();
  }

  /* ---------- Girar (sin sesgo) ---------- */
  function spin() {
    if (!canSpin()) return;
    const list = pool();
    audio();   // crear/activar el audio dentro del gesto del usuario
    state.spinning = true;
    ta.readOnly = true;
    $('wheelbox').classList.add('spinning');
    $('reel').className = 'reel spin';
    // los botones no desaparecen (la columna no cambia de alto): el principal queda deshabilitado
    $('actions').innerHTML = '<button class="go" id="go" disabled>🎡 Girando…</button>';
    $('reel').setAttribute('aria-busy', 'true');   // que el lector de pantalla no lea cada nombre al pasar

    const n = list.length, a = TAU / n;
    const k = crypto.getRandomValues(new Uint32Array(1))[0] % n;
    const pick = list[k];
    // Punto de parada cerca del centro del segmento (40–60 %), lejos de los bordes.
    const jitter = (Math.random() * 0.2 + 0.4) * a;
    const target = mod(-(k * a + jitter), TAU);                 // segmento k bajo la flecha
    const start = state.rotation;
    const base = start - mod(start, TAU);
    const reduce = reducedMotion();
    const end = base + (reduce ? 1 : 7) * TAU + target;
    const back = reduce ? 0 : 0.18;                             // tirón hacia atrás (rad)
    // Rebote: se pasa un poco y vuelve, pero SIN salir del segmento ganador
    // (deja al menos un 30 % del segmento de margen antes del borde).
    const over = reduce ? 0 : Math.max(0, Math.min(0.14, jitter - 0.3 * a));
    const tA = reduce ? 0 : T_BACK, tB = reduce ? T_REDUCED : T_MAIN, tC = reduce ? 0 : T_SETTLE;
    const t0 = performance.now();
    let lastIdx = indexAtPointer(n), lastTick = 0, lastFlick = 0;
    // tamaño FIJO para todo el giro: el que hace entrar al nombre más largo de la ruleta
    currentSpinList = list;
    liveFs = Math.min(...list.map(fitSize));
    showName(list[lastIdx], 'live');   // nombre en vivo: el que está bajo la flecha

    function angleAt(t) {
      if (t < tA) {                                             // 1) tirón atrás (ease in-out)
        const p = t / tA;
        return start - back * (0.5 - 0.5 * Math.cos(Math.PI * p));
      }
      t -= tA;
      if (t < tB) {                                             // 2) giro principal (easeOutQuart)
        const p = t / tB, e = 1 - Math.pow(1 - p, 4);
        const from = start - back;
        return from + (end + over - from) * e;
      }
      t -= tB;
      if (t < tC) {                                             // 3) rebote de vuelta (ease in-out)
        const p = t / tC, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        return end + over - over * e;
      }
      return end;
    }

    function frame(now) {
      const t = now - t0;
      state.rotation = angleAt(t);
      lights.mode = 'chase'; lights.phase = Math.floor(t / 90);   // foquitos corriendo
      drawWheel(list);
      const idx = indexAtPointer(n);
      if (idx !== lastIdx) {                                    // un clavo pasó por la flecha
        lastIdx = idx;
        showName(list[idx], 'live');                            // nombre en vivo (mismo tamaño)
        if (now - lastTick > 30) { tickSound(); lastTick = now; }
        if (now - lastFlick > 60) { flickPin(); lastFlick = now; }
      }
      if (t < tA + tB + tC) { requestAnimationFrame(frame); return; }
      finish();
    }

    function finish() {
      state.rotation = end;
      const under = indexAtPointer(n);
      state.lastSpin = { k, pick, n, underPointer: list[under], ok: under === k, rotation: end,
        liveName: $('name').textContent };   // lo que mostraba la caja justo al detenerse
      if (under !== k) console.error('[ruleta] La flecha no coincide con el ganador', state.lastSpin);

      state.winners.push({ name: pick });
      state.pending = true;   // hasta que se pulse "Siguiente beca" / "Finalizar sorteo"
      state.spinning = false;
      ta.readOnly = false;
      save();
      $('wheelbox').classList.remove('spinning');
      $('reel').className = 'reel win';
      $('reel').removeAttribute('aria-busy');
      showName(pick, 'final');   // su tamaño final, con transición
      winnerGlow(list, k);
      winSound();
      confetti(false);
      renderCounters();
      renderTable(state.winners.length - 1);
      showAfterWin();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Confeti ---------- */
  let confettiRun = 0;
  function confetti(big) {
    if (reducedMotion()) return;
    const c = $('confetti'), s = $('stage'), x = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = s.clientWidth, H = s.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ['#e8ac54', '#f6d9a8', '#ffffff', '#7c4dff', '#ff2d78'];
    const run = ++confettiRun;
    const P = [];
    const sp = Math.sqrt(0.64 * H) * 1.2;
    function emit(count, ox, oy, ang, spread, speed) {
      for (let i = 0; i < count; i++) {
        const dir = ang + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.6);
        const r = Math.random();
        P.push({
          x: ox, y: oy, vx: Math.cos(dir) * v, vy: Math.sin(dir) * v,
          s: Math.random() * 6 + 5, c: cols[Math.random() * cols.length | 0],
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3,
          tilt: Math.random() * TAU, vt: Math.random() * 0.15 + 0.05,
          shape: r < 0.2 ? 'circle' : r < 0.55 ? 'ribbon' : 'rect',
          drag: 0.982 + Math.random() * 0.012
        });
      }
    }
    const N = big ? 340 : 240;
    emit(N * 0.35, 0, H, -Math.PI / 3, 0.7, sp);               // cañón izquierdo
    emit(N * 0.35, W, H, -2 * Math.PI / 3, 0.7, sp);           // cañón derecho
    emit(N * 0.3, W * 0.5, H * 0.45, -Math.PI / 2, TAU, sp * 0.55); // explosión central
    const FRAMES = 210;
    let f = 0;
    (function anim() {
      if (run !== confettiRun) return;
      x.clearRect(0, 0, W, H);
      const alpha = f > FRAMES - 45 ? (FRAMES - f) / 45 : 1;
      for (const p of P) {
        p.vx *= p.drag; p.vy = p.vy * p.drag + 0.32;
        p.tilt += p.vt; p.rot += p.vr;
        p.x += p.vx + Math.sin(p.tilt) * 0.8; p.y += p.vy;
        if (p.y > H + 30) continue;
        x.save();
        x.globalAlpha = alpha;
        x.translate(p.x, p.y); x.rotate(p.rot);
        x.scale(1, Math.cos(p.tilt));                           // efecto de giro 3D
        x.fillStyle = p.c;
        if (p.shape === 'circle') { x.beginPath(); x.arc(0, 0, p.s * 0.45, 0, TAU); x.fill(); }
        else if (p.shape === 'ribbon') x.fillRect(-p.s * 0.2, -p.s * 1.1, p.s * 0.4, p.s * 2.2);
        else x.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6);
        x.restore();
      }
      if (++f < FRAMES) requestAnimationFrame(anim); else x.clearRect(0, 0, W, H);
    })();
  }

  /* ---------- Utilidades UI ---------- */
  let toastTimer;
  function toast(m) {
    const t = $('toast');
    t.textContent = m; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function winnersTSV() {
    return ['N°\tBeca\tAliado\tTipo\tGanador'].concat(PRIZES.map((p, j) =>
      `${j + 1}\t${p.b}\t${p.a}\t${p.k === 'full' ? 'Beca completa' : 'Media beca'}\t${state.winners[j] ? state.winners[j].name : ''}`
    )).join('\n');
  }

  function copyFallback(txt) {
    const t = document.createElement('textarea');
    t.value = txt;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed'; t.style.top = '-1000px';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    return ok;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const s = $('stage');
    const req = s.requestFullscreen ? s.requestFullscreen() : Promise.reject();
    req.catch(() => toast('Tu navegador no permite pantalla completa aquí'));
  }

  function renderMute() {
    const b = $('mute');
    b.setAttribute('aria-pressed', String(state.muted));
    b.querySelector('span').textContent = state.muted ? 'Silenciado' : 'Sonido';
    b.title = (state.muted ? 'Activar sonido' : 'Silenciar') + ' (M)';
  }
  function toggleMute() {
    state.muted = !state.muted;
    store.set('muted', state.muted);
    renderMute();
    toast(state.muted ? 'Sonido desactivado' : 'Sonido activado');
  }

  /* ---------- Eventos ---------- */
  ta.addEventListener('input', () => {
    if (state.spinning) return;
    state.namesRaw = ta.value;
    save();
    render();
  });

  $('fs').onclick = toggleFullscreen;
  $('mute').onclick = toggleMute;
  $('help').onclick = () => {
    const k = $('keys'), open = k.hidden;
    k.hidden = !open;
    $('help').setAttribute('aria-expanded', String(open));
  };
  $('interlude').onclick = hideInterlude;

  $('reset').onclick = () => {
    $('confirmBox').innerHTML = '<div class="confirm">¿Borrar todos los ganadores y empezar de nuevo? <button id="yes">Sí, reiniciar</button><button id="no">Cancelar</button></div>';
    $('yes').onclick = () => {
      if (state.spinning) return;
      state.winners = []; state.absent = []; state.pending = false;
      hideInterlude();
      save();
      $('confirmBox').innerHTML = '';
      render();
      toast('Sorteo reiniciado');
    };
    $('no').onclick = () => { $('confirmBox').innerHTML = ''; };
  };

  $('copy').onclick = () => {
    const txt = winnersTSV();
    const done = () => toast('Copiado. Pégalo en la hoja “Ganadores becas”');
    const fail = () => { if (copyFallback(txt)) done(); else toast('No se pudo copiar automáticamente'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fail);
    else fail();
  };

  // Atajos de teclado. No actúan mientras se escribe en la lista; si un botón tiene foco
  // de teclado (Tab), Espacio/Enter lo activan como siempre.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tgt = e.target, tag = tgt && tgt.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if ((k === 'space' || k === 'enter') && tag === 'BUTTON' && tgt.matches(':focus-visible')) return;

    if (state.interlude) {
      if (k === 'space' || k === 'enter' || k === 'escape') { e.preventDefault(); hideInterlude(); }
      return;
    }
    switch (k) {
      case 'space': spin(); break;
      case 'enter': nextPrize(); break;
      case 'a': notPresent(); break;
      case 'f': toggleFullscreen(); break;
      case 'm': toggleMute(); break;
      default: return;
    }
    e.preventDefault();
  });
  // Evita que Espacio "clickee" además el botón enfocado con el mouse.
  document.addEventListener('keyup', e => {
    if (e.key === ' ' && e.target && e.target.tagName === 'BUTTON' && !e.target.matches(':focus-visible')) e.preventDefault();
  });

  setInterval(() => {
    if (state.spinning || glowRunning || document.hidden || reducedMotion()) return;
    lights.mode = 'idle'; lights.phase++;
    drawCurrentWheel();
  }, 700);

  // Redibujar cuando cargue Poppins (el canvas no se actualiza solo).
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    labelCache.clear(); fitCache.clear();
    if (state.spinning) return;
    drawCurrentWheel();
    const el = $('name'); if (!el.querySelector('.hint')) el.style.fontSize = fitSize(el.textContent) + 'px';
  });

  // Acceso para pruebas desde la consola.
  window.ruleta = { state, pool, names, winnersTSV, indexAtPointer, winnerWheel, wheelLabel, shortName, drawWheel };

  renderMute();
  render();
})();
