// Звуки «Финансового суда». По умолчанию выключены; кнопка «Звук» у названия раздела включает их,
// выбор запоминается в этом браузере (localStorage: court-sound).
// Молоток, штамп, приговор, монетки и «провал» создаются прямо здесь (Web Audio) — файлы не нужны.
// Голоса свидетелей — файлы sounds/court/: сначала ищется файл по портрету (cat2.mp3),
// потом общий (cat.mp3, dog.mp3). Нет файла — свидетель просто молчит (браузер один раз
// напрасно спросит cat2.mp3 и запомнит, что его нет).
// Фон зала — от «Встать, суд идёт!» до приговора: созданный здесь (шёпот, шорох, гул) или запись
// sounds/court/hall.mp3 по кругу — выбирается в HALL_FROM_FILE.

(function () {
  const KEY = 'court-sound';
  const VOLUME = 1; // общая громкость синтезированных звуков
  let ctx = null;
  let out = null;

  function isOn() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function audio() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
      out = ctx.createGain();
      out.gain.value = VOLUME;
      // Ограничитель: на полной громкости удары не хрипят
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -6;
      limit.ratio.value = 12;
      out.connect(limit);
      limit.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Тон: частота (можно со съездом к toFreq), начало и длительность в секундах, громкость, форма волны
  function tone(c, freq, at, dur, vol, type, toFreq) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + at;
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Короткий шум — «деревянная» часть удара
  function noise(c, at, dur, vol, freq) {
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.5;
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(c.currentTime + at);
  }

  function knock(c, at) { // удар молотка
    tone(c, 190, at, 0.14, 0.6, 'sine', 60);
    noise(c, at, 0.05, 0.7, 1300);
  }

  const SOUNDS = {
    gavel: function (c) { knock(c, 0); knock(c, 0.22); },                            // «Встать, суд идёт!»
    stamp: function (c) { tone(c, 130, 0, 0.2, 0.6, 'sine', 50); noise(c, 0, 0.09, 0.5, 600); }, // штамп «Принято»
    free: function (c) {                                                             // оправдан — светлый звон
      knock(c, 0); knock(c, 0.22); knock(c, 0.44);
      [784, 988, 1175, 1568].forEach(function (f, i) { tone(c, f, 0.7 + i * 0.09, 0.7, 0.16); });
    },
    wait: function (c) {                                                             // условно — нейтральный сигнал
      knock(c, 0); knock(c, 0.22); knock(c, 0.44);
      tone(c, 523, 0.7, 0.3, 0.15, 'triangle');
      tone(c, 523, 1.0, 0.4, 0.15, 'triangle');
    },
    guilty: function (c) {                                                           // виновно — низкий удар
      knock(c, 0); knock(c, 0.22); knock(c, 0.44);
      tone(c, 110, 0.7, 0.8, 0.6, 'sine', 50);
      tone(c, 220, 0.7, 0.6, 0.12, 'triangle', 110);
    },
    coins: function (c) {                                                            // в копилку
      for (let i = 0; i < 6; i++) {
        const at = i * 0.07 + Math.random() * 0.03;
        const f = 2600 + Math.random() * 1400;
        tone(c, f, at, 0.14, 0.08);
        tone(c, f * 1.5, at, 0.08, 0.04);
      }
    },
    broken: function (c) {                                                           // приговор нарушен — «провал»
      [392, 370, 349].forEach(function (f, i) { tone(c, f, i * 0.28, 0.26, 0.16, 'triangle'); });
      tone(c, 330, 0.84, 0.8, 0.16, 'triangle', 280);
    }
  };

  // Голос свидетеля-зверя из файла: cat2 → cat2.mp3, затем cat.mp3
  const missing = {};
  function voice(face) {
    const names = [face, face.replace(/\d+$/, '')].filter(function (n, i, a) { return a.indexOf(n) === i; });
    (function tryNext() {
      const name = names.shift();
      if (!name) return;
      if (missing[name]) { tryNext(); return; }
      const a = new Audio('sounds/court/' + name + '.mp3');
      a.volume = 1; // громче браузер не умеет
      a.onerror = function () { missing[name] = true; tryNext(); };
      const p = a.play();
      if (p && p.catch) p.catch(function () {});
    })();
  }

  // name — звук из SOUNDS или 'animal' (тогда face — портрет свидетеля)
  function play(name, face) {
    if (!isOn()) return;
    if (name === 'animal') { if (face) voice(face); return; }
    const c = audio();
    if (c && SOUNDS[name]) SOUNDS[name](c);
  }

  // Фон зала: hall(true) — тихо по кругу, hall(false) — плавно затихает. Выключили звук — смолкает сразу
  const HALL_FROM_FILE = true;  // true — запись sounds/court/hall.mp3, false — фон, созданный здесь (шёпот, шорох, гул)
  const HALL_VOLUME = 0.5;     // громкость записи
  const SYNTH_VOLUME = 0.5;     // громкость созданного фона
  const FADE_MS = 1500;
  let hallAudio = null;
  let hallWanted = false; // идёт заседание — фон должен звучать, если звук включён
  let fadeTimer = null;
  let synth = null;       // созданный фон, пока звучит: { bus, sources, timer }

  // Созданный фон: тихий гул зала, два шепчущихся соседа (слева и справа) и изредка шорох бумаги.
  // Всё — из одного шума через разные фильтры; слоги шёпота расставляются случайно на секунду вперёд
  function synthStart() {
    const c = audio();
    if (!c) return;
    if (synth) synthStop(true);
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const bus = c.createGain();
    bus.gain.value = 0;
    bus.connect(out);
    const sources = [];
    function chain(type, freq, q, vol, pan) {
      const src = c.createBufferSource();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.random(); // у каждого слоя свой кусок шума
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      if (pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(bus);
      } else g.connect(bus);
      src.start(0, src.loopStart);
      sources.push(src);
      return { f: f, g: g, until: c.currentTime + Math.random() };
    }
    chain('lowpass', 300, 0.7, 0.35);                                    // гул зала
    const voices = [chain('bandpass', 1800, 3, 0, -0.5), chain('bandpass', 2300, 3, 0, 0.6)]; // шёпот
    const paper = chain('highpass', 3500, 0.7, 0, 0.2);                  // шорох бумаги

    function schedule() {
      const horizon = c.currentTime + 1.2;
      voices.forEach(function (v) {
        while (v.until < horizon) {
          if (Math.random() < 0.55) { // фраза из нескольких слогов
            for (let n = 3 + Math.floor(Math.random() * 6); n > 0; n--) {
              const t = v.until;
              const dur = 0.08 + Math.random() * 0.15;
              v.g.gain.setTargetAtTime(0.3 + Math.random() * 0.4, t, 0.02);
              v.g.gain.setTargetAtTime(0, t + dur, 0.04);
              v.f.frequency.setTargetAtTime(1300 + Math.random() * 1900, t, 0.03);
              v.until += dur + 0.04 + Math.random() * 0.1;
            }
            v.until += 0.5 + Math.random() * 1.5; // пауза между фразами
          } else v.until += 0.6 + Math.random() * 1.2; // помолчал
        }
      });
      if (Math.random() < 0.12) { // кто-то перелистнул бумаги
        const t0 = c.currentTime + Math.random();
        for (let k = 0; k < 6 + Math.floor(Math.random() * 8); k++) {
          const t = t0 + k * 0.03 + Math.random() * 0.03;
          paper.g.gain.setValueAtTime(0.15 + Math.random() * 0.25, t);
          paper.g.gain.setTargetAtTime(0, t + 0.008, 0.015);
        }
      }
    }
    schedule();
    synth = { bus: bus, sources: sources, timer: setInterval(schedule, 1000) };
    bus.gain.setValueAtTime(0, c.currentTime);
    bus.gain.linearRampToValueAtTime(SYNTH_VOLUME, c.currentTime + FADE_MS / 1000);
  }

  function synthStop(now) {
    if (!synth) return;
    const s = synth;
    synth = null;
    clearInterval(s.timer);
    const t = ctx.currentTime;
    const end = now ? 0.05 : FADE_MS / 1000;
    s.bus.gain.cancelScheduledValues(t);
    s.bus.gain.setValueAtTime(s.bus.gain.value, t);
    s.bus.gain.linearRampToValueAtTime(0, t + end);
    s.sources.forEach(function (src) { src.stop(t + end + 0.05); });
    setTimeout(function () { s.bus.disconnect(); }, (end + 0.2) * 1000);
  }

  function fadeTo(target, then) {
    clearInterval(fadeTimer);
    const step = HALL_VOLUME / (FADE_MS / 50);
    fadeTimer = setInterval(function () {
      if (!hallAudio) { clearInterval(fadeTimer); return; } // файла не оказалось
      const v = hallAudio.volume;
      if (Math.abs(v - target) <= step) {
        hallAudio.volume = target;
        clearInterval(fadeTimer);
        if (then) then();
      } else hallAudio.volume = v + (target > v ? step : -step);
    }, 50);
  }

  function hallStart() {
    if (!HALL_FROM_FILE) { synthStart(); return; }
    if (!hallAudio) {
      hallAudio = new Audio('sounds/court/hall.mp3');
      hallAudio.loop = true;
      hallAudio.onerror = function () { hallAudio = null; }; // нет файла — без фона
    }
    hallAudio.volume = 0;
    const p = hallAudio.play();
    if (p && p.catch) p.catch(function () {});
    fadeTo(HALL_VOLUME);
  }

  function hallStop(now) {
    if (!HALL_FROM_FILE) { synthStop(now); return; }
    if (!hallAudio) return;
    if (now) { clearInterval(fadeTimer); hallAudio.pause(); return; }
    fadeTo(0, function () { hallAudio.pause(); });
  }

  function hall(on) {
    hallWanted = on;
    if (!isOn()) return;
    if (on) hallStart(); else hallStop();
  }

  window.courtSound = { play: play, hall: hall };

  // Кнопка «Звук» у названия раздела
  const btn = document.getElementById('court-sound');
  if (!btn) return;
  function render() {
    const on = isOn();
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Выключить звуки суда' : 'Включить звуки суда';
    btn.querySelector('.court-sound__text').textContent = on ? 'Звук включён' : 'Звук выключен';
  }
  btn.addEventListener('click', function () {
    try { localStorage.setItem(KEY, isOn() ? '0' : '1'); } catch (e) {}
    render();
    if (!isOn()) { hallStop(true); return; }
    play('gavel'); // включили — суд стучит молотком
    if (hallWanted) hallStart(); // посреди заседания — и зал снова шепчется
  });
  render();
})();
