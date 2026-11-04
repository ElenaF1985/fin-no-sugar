// Финансовый суд: шуточное заседание над желанием что-нибудь купить. Тексты — в data/court.js,
// data/court-live.js (живой суд), data/court-more.js (дополнительные варианты), data/court-kinds.js (виды покупок:
// одежда, расходники, еда, услуги, питомцы — свои надписи в заявлении и реплики), data/court-brands.js (бренды).
// Иск (что, сколько, 5 вопросов) → заседание (реплики прокурора и адвоката) → приговор с печатью.
// «Суд сберёг», условные сроки на 30 дней и архив дел за неделю хранятся только в браузере читателя.

(function () {
  const C = window.COURT;
  const form = document.getElementById('court-form');
  const session = document.getElementById('court-session');
  const itemInput = document.getElementById('court-item');
  const priceInput = document.getElementById('court-price');
  const curSelect = document.getElementById('court-cur');
  const savedBox = document.getElementById('court-saved');
  const appealsBox = document.getElementById('court-appeals');

  const sharedCounter = /^https?:$/.test(location.protocol);
  let globalCount = null;
  let numberRequest = null;
  const counterUrl = 'api/court-counter.php';

  async function counterRequest(options) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      const response = await fetch(counterUrl, Object.assign({ cache: 'no-store', signal: controller.signal }, options));
      if (!response.ok) throw new Error('counter');
      const data = await response.json();
      if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('counter');
      globalCount = Math.max(globalCount || 0, data.count);
      renderStats();
      return data;
    } finally { clearTimeout(timeout); }
  }

  const WAIT_DAYS = 30;
  const STEP_MS = 700; // пауза между репликами
  const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Мелочи ----------

  // Звук суда (js/court-sound.js): молчит, если звук выключен или файла нет
  function sound(name, face) { if (window.courtSound) window.courtSound.play(name, face); }

  const el = U.el, load = U.load, save = U.save, plural = U.plural, todayIso = U.todayIso, ruDate = U.ruDate;

  // Полный однократный сброс суда, согласованный 04.11.2026.
  // Холостой прогон возвращает ключи, ничего не изменяя.
  function resetCourtOnce(dryRun) {
    const marker = 'court-full-reset-20261104-v1';
    try {
      if (localStorage.getItem(marker) === 'done') return [];
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf('court-') === 0) keys.push(key);
      }
      if (dryRun) return keys;
      keys.forEach(function (key) { localStorage.removeItem(key); });
      localStorage.setItem(marker, 'done');
      return keys;
    } catch (error) { return []; /* Память браузера может быть недоступна. */ }
  }
  resetCourtOnce(false);

  function rub(n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; } // ₽ не отрывается от числа


  function daysLeft(iso) {
    const p = iso.split('-');
    const until = new Date(+p[0], +p[1] - 1, +p[2]);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((until - now) / 86400000);
  }

  // Курс ЦБ, действующий сегодня, из data/rates.js: { USD, EUR } или null
  function todayRates() {
    const days = (window.RATES && RATES.days) || [];
    const today = todayIso();
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i][0] <= today) return { USD: days[i][1], EUR: days[i][2] };
    }
    return null;
  }

  const rates = todayRates();
  if (!rates) { // без курсов — только рубли
    curSelect.querySelectorAll('option:not([value="RUB"])').forEach(function (o) { o.disabled = true; });
  }

  // ---------- Вопросы иска ----------

  // Пока покупка не названа, кнопки пустые; надписи появляются под вид покупки (renderAnswers)
  const qBox = document.getElementById('court-questions');
  const qLegends = [], qSpans = [];
  C.questions.forEach(function (q, qi) {
    const fs = el('fieldset', 'court-q');
    const legend = el('legend', '', (qi + 1) + '. ' + q.text);
    fs.append(legend);
    qLegends.push(legend);
    qSpans.push([]);
    const opts = el('div', 'court-q__opts');
    q.answers.forEach(function (a, ai) {
      const label = el('label', 'court-q__opt');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'q' + qi;
      input.value = ai;
      input.required = true;
      const span = el('span', '', '');
      qSpans[qi].push(span);
      label.append(input, span);
      opts.append(label);
    });
    fs.append(opts);
    qBox.append(fs);
  });

  // ---------- «Суд сберёг» и условные сроки ----------

  function addSaved(sum) {
    save('court-saved', load('court-saved', 0) + sum);
    renderSaved();
    sound('coins');
  }

  function renderSaved() {
    const sum = load('court-saved', 0);
    savedBox.hidden = !sum;
    document.getElementById('court-saved-text').textContent = 'Суд уже сберёг вам ' + rub(sum);
    renderStats();
  }

  // Число начатых заседаний общее; сбережения остаются личными.
  function renderStats() {
    const count = sharedCounter ? globalCount : load('court-count', 0);
    const sum = load('court-saved', 0);
    const stats = document.getElementById('court-stats');
    stats.hidden = count === null || (!sharedCounter && !count);
    stats.textContent = (sharedCounter ? 'Всего начато заседаний: ' + count : 'Заседаний в этом браузере: ' + count) +
      (sum ? ' · суд сберёг вам ' + rub(sum) : '');
  }

  // Картинка под названием раздела: pictures/court/Court.jpg (если её переименуют — подойдёт и banner.*);
  // нет файла — рамка скрыта
  (function () {
    const fig = document.getElementById('court-banner');
    const img = document.getElementById('court-banner-img');
    const files = ['Court.jpg', 'banner.jpg', 'banner.png', 'banner.webp', 'banner.jpeg'];
    let i = 0;
    img.onload = function () { fig.hidden = false; };
    img.onerror = function () { if (i < files.length) img.src = 'pictures/court/' + files[i++]; };
    img.addEventListener('click', function () { // увеличение в том же окошке, что у «Юмора» (js/humor.js)
      if (window.openLightbox) window.openLightbox(img);
    });
    img.onerror();
  })();

  // «Обнулить» — после подтверждения обнуляет только копилку; номера дел и условные сроки остаются
  document.getElementById('court-saved-clear').addEventListener('click', function () {
    if (!confirm('Обнулить копилку суда? Сбережения за всё время пропадут.')) return;
    save('court-saved', 0);
    renderSaved();
  });

  function setAppeals(list) {
    save('court-appeals', list);
    renderAppeals();
  }

  function renderAppeals() {
    const list = load('court-appeals', []);
    appealsBox.innerHTML = '';
    list.forEach(function (a) {
      const left = daysLeft(a.until);
      const card = el('div', 'court-appeal' + (left <= 0 ? ' is-due' : ''));
      const drop = el('button', 'court-btn', left <= 0 ? 'Нет, передумали' : 'Отказаться от покупки');
      drop.type = 'button';
      drop.addEventListener('click', function () {
        addSaved(a.price);
        setAppeals(load('court-appeals', []).filter(function (x) { return x.id !== a.id; }));
      });

      if (left <= 0) {
        card.append(el('p', 'court-appeal__text',
          'Условный срок по делу «' + a.item + '» (' + rub(a.price) + ') истёк. Всё ещё хотите купить?'));
        const buy = el('button', 'court-btn court-btn--main', 'Да, покупаю');
        buy.type = 'button';
        buy.addEventListener('click', function () {
          setAppeals(load('court-appeals', []).filter(function (x) { return x.id !== a.id; }));
        });
        card.append(buy, drop);
      } else {
        card.append(el('p', 'court-appeal__text',
          'Условный срок: «' + a.item + '» (' + rub(a.price) + ') — ещё ' + left + ' ' +
          plural(left, 'день', 'дня', 'дней') + ', до ' + ruDate(a.until) + '.'));
        card.append(drop);
      }
      appealsBox.append(card);
    });
  }

  // ---------- Архив дел за неделю ----------
  // Каждое заседание: номер, дата, покупка, приговор, мотивировка, ответы и что было дальше.
  // Хранится в браузере читателя 7 дней; дела старше недели удаляются сами

  const ARCHIVE_DAYS = 7;
  const archiveBox = document.getElementById('court-archive');
  const archiveList = document.getElementById('court-archive-list');
  // Приговор по его виду (free / wait / guilty) — печать и пороги берутся из data/court.js
  function verdictOf(kind) { return C.verdicts.find(function (v) { return v.kind === kind; }); }

  // Дела за последние 7 дней (старые заодно убираются из памяти)
  function archive() {
    const list = load('court-archive', []);
    const fresh = list.filter(function (c) { return -daysLeft(c.date) < ARCHIVE_DAYS; });
    if (fresh.length !== list.length) save('court-archive', fresh);
    return fresh;
  }

  function archiveAdd(d, verdict) {
    const list = archive();
    list.unshift({
      number: d.number,
      date: todayIso(),
      item: d.item,
      price: Math.round(d.price),
      kind: verdict.kind,
      motive: d.motive || '',
      answers: d.answers.map(function (a) { return a.q + ' — ' + a.text; }),
      outcome: ''
    });
    save('court-archive', list);
    renderArchive();
  }

  // Номер повторился (счётчик court-count сбросили вручную, через консоль браузера) —
  // старое дело с этим номером стирается из архива
  function archiveDrop(number) {
    const list = archive();
    const rest = list.filter(function (c) { return c.number !== number; });
    if (rest.length !== list.length) {
      save('court-archive', rest);
      renderArchive();
    }
  }

  // Что было после приговора: «отложено до …», «приговор исполнен», «обжаловано»
  function archiveMark(number, outcome) {
    const list = archive();
    const c = list.find(function (x) { return x.number === number; });
    if (c) c.outcome = outcome;
    save('court-archive', list);
    renderArchive();
  }

  function renderArchive() {
    const list = archive();
    archiveBox.hidden = !list.length;
    if (!list.length) return;

    const count = { free: 0, wait: 0, guilty: 0 };
    list.forEach(function (c) { count[c.kind]++; });
    document.getElementById('court-archive-stats').textContent =
      'За неделю: ' + list.length + ' ' + plural(list.length, 'дело', 'дела', 'дел') +
      ' · оправдано ' + count.free + ' · условно ' + count.wait + ' · виновно ' + count.guilty;

    archiveList.innerHTML = '';
    list.forEach(function (c) {
      const item = el('details', 'court-case');
      const head = el('summary', 'court-case__head');
      head.append(
        el('span', 'court-case__date', ruDate(c.date).slice(0, 5)),
        el('span', 'court-case__num', '№ ' + c.number),
        el('span', 'court-case__item', c.item + ' · ' + rub(c.price)),
        el('span', 'court-case__stamp is-' + c.kind, verdictOf(c.kind).stamp),
        el('span', 'court-case__outcome', c.outcome)
      );
      const body = el('div', 'court-case__body');
      if (c.motive) {
        const m = el('p', 'court-case__motive');
        m.append(el('strong', '', 'Мотивировка: '), document.createTextNode(c.motive));
        body.append(m);
      }
      const ul = el('ul', 'court-case__answers');
      c.answers.forEach(function (t) { ul.append(el('li', '', t)); });
      body.append(ul);
      item.append(head, body);
      archiveList.append(item);
    });
  }

  // «Очистить архив» — после подтверждения стирает только архив; копилка, условные сроки и номера дел остаются
  document.getElementById('court-archive-clear').addEventListener('click', function () {
    if (!confirm('Очистить архив дел? Дела за неделю пропадут.')) return;
    save('court-archive', []);
    renderArchive();
  });

  // ---------- Цена в повседневных мелочах ----------

  // Название покупки для поиска: строчные, ё → е, дефисы и знаки → пробелы
  function normalize(text) {
    return ' ' + text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9&']+/g, ' ').trim() + ' ';
  }

  // Длина совпадения слова для поиска с названием (0 — не подходит):
  // '=слово' — слово целиком, иначе — с начала слова (и для фраз из нескольких слов: «игрушка для кот…»)
  function matchLength(text, key) {
    key = key.replace(/ё/g, 'е');
    if (key.charAt(0) === '=') return text.indexOf(' ' + key.slice(1) + ' ') >= 0 ? key.length - 1 : 0;
    const k = key.replace(/-/g, ' ');
    return text.indexOf(' ' + k) >= 0 ? k.length : 0;
  }

  // Самое длинное совпадение из списка: { entry, len } или null
  function bestMatch(text, list) {
    let best = null;
    list.forEach(function (entry) {
      entry.words.forEach(function (w) {
        const len = matchLength(text, w);
        if (len && (!best || len > best.len)) best = { entry: entry, len: len };
      });
    });
    return best;
  }

  // Группа «цены в мелочах» для покупки. Бренд с одним типом товара тоже узнаётся: «эйрподс» → наушники
  function findGroup(item) {
    const text = normalize(item);
    const g = bestMatch(text, C.measures);
    if (g) return g.entry;
    const b = bestMatch(text, window.COURT_BRANDS || []);
    if (b && b.entry.types.length === 1) {
      const t = bestMatch(normalize(b.entry.types[0]), C.measures);
      return t ? t.entry : null;
    }
    return null;
  }

  // Бренд с несколькими типами товара, если сама покупка не узнана
  function findBrand(item) {
    const text = normalize(item);
    if (bestMatch(text, C.measures)) return null;
    const b = bestMatch(text, window.COURT_BRANDS || []);
    return b && b.entry.types.length > 1 ? b.entry : null;
  }

  // ---------- Вид покупки: вещь, одежда, расходники, еда, услуга, питомец (data/court-kinds.js) ----------

  function kindOf(group) {
    if (!group) return 'thing';
    if (group.pet) return 'pet';
    const K = C.kinds || {};
    for (const k in K) if (K[k].groups && K[k].groups.indexOf(group.name) >= 0) return k;
    return 'thing';
  }

  // Ответ ai на вопрос qi для вида покупки: вопрос, надпись, довод и реплики; сторона и баллы — как в data/court.js
  function answerFor(kind, qi, ai) {
    const base = C.questions[qi].answers[ai];
    const K = (C.kinds || {})[kind] || {};
    const o = (K.answers && K.answers[qi + '-' + ai]) || {};
    const pet = kind === 'pet';
    return {
      q: (K.questions && K.questions[qi]) || C.questions[qi].text,
      text: o.text || base.text,
      side: base.side,
      score: base.score,
      reason: (pet && base.petReason) || o.reason || base.reason,
      lines: (pet && base.petLines) || o.lines || base.lines
    };
  }

  // Надписи заявления под покупку; пока её не назвали — кнопки пустые и не нажимаются
  function renderAnswers() {
    const item = itemInput.value.trim();
    const kind = item.length >= 2 ? kindOf(findGroup(item)) : null;
    C.questions.forEach(function (q, qi) {
      qLegends[qi].textContent = (qi + 1) + '. ' + (kind ? answerFor(kind, qi, 0).q : q.text);
      q.answers.forEach(function (a, ai) {
        qSpans[qi][ai].textContent = kind ? answerFor(kind, qi, ai).text : '';
        qSpans[qi][ai].previousSibling.disabled = !kind;
      });
    });
    qBox.classList.toggle('is-blank', !kind);
  }

  // Срок окупаемости словами: «45 дней», «7 месяцев», «3 года», «11,7 года»
  function term(months) {
    if (months < 2) {
      const d = Math.max(1, Math.ceil(months * 30));
      return d + ' ' + plural(d, 'день', 'дня', 'дней');
    }
    if (months < 24) {
      const m = Math.round(months);
      return m + ' ' + plural(m, 'месяц', 'месяца', 'месяцев');
    }
    const y = Math.round(months / 12 * 10) / 10;
    return y % 1 ? y.toLocaleString('ru-RU') + ' года' : y + ' ' + plural(y, 'год', 'года', 'лет');
  }

  function measuresFor(item, price) {
    const found = findGroup(item);
    const list = found ? found.items.slice() : [];
    // Не хватает до трёх — добавляем случайные повседневные мелочи (не повторяя те, что уже есть)
    const pool = C.defaults.filter(function (d) {
      return !list.some(function (m) { return m.unit === d.unit; });
    });
    while (list.length < 3 && pool.length) list.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

    const lines = list.map(function (m) {
      const n = price / m.price;
      const count = n >= 10 ? Math.round(n).toLocaleString('ru-RU') :
        n < 0.05 ? 'меньше 0,1' : n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }); // не «0» у дешёвых покупок
      return m.unit + ' (по ' + rub(m.price) + '): ' + count;
    });

    let payback = '';
    if (found && found.payback) {
      payback = 'Окупится примерно за ' + term(price / found.payback.monthly) + ', ' + found.payback.how + '.';
    }
    return { lines: lines, payback: payback };
  }

  // ---------- Исковое заявление в окне ----------

  const modal = document.getElementById('court-modal');
  const start = document.getElementById('court-start');
  const submitBtn = document.getElementById('court-submit');
  const stamp = document.getElementById('court-doc-stamp');
  const sumBox = document.getElementById('court-doc-sum');
  const STAMP_MS = 1100; // штамп падает, окно ещё видно

  function wait(ms) { return new Promise(function (r) { setTimeout(r, quick ? 0 : ms); }); }

  // «Цена иска» в шапке заявления меняется вместе с ценой; доллары и евро — по курсу ЦБ
  function priceRub() {
    const amount = Number(String(priceInput.value).replace(',', '.'));
    if (!(amount > 0)) return 0;
    return curSelect.value === 'RUB' ? amount : amount * rates[curSelect.value];
  }
  function updateSum() {
    const p = priceRub();
    sumBox.textContent = p ? rub(p) : '________';
  }
  priceInput.addEventListener('input', updateSum);
  curSelect.addEventListener('change', updateSum);

  // ---------- Подсказка «укажите тип товара» ----------
  // Покупка узнана — подсказки нет. Только бренд с разными товарами («самсунг») — кнопки с типами.
  // Совсем не узнана — мягкая просьба уточнить; подать можно и так

  const hint = document.getElementById('court-hint');
  let hintTimer = null;

  function updateHint() {
    renderAnswers();
    const item = itemInput.value.trim();
    hint.innerHTML = '';
    if (item.length < 3 || findGroup(item)) { hint.hidden = true; return; }

    const brand = findBrand(item);
    if (brand) {
      hint.append(el('p', '', 'Суду нужен тип товара. «' + item + '» — это что?'));
      const opts = el('div', 'court-doc__hint-opts');
      brand.types.forEach(function (t) {
        const b = el('button', 'court-doc__hint-btn', t);
        b.type = 'button';
        b.addEventListener('click', function () {
          itemInput.value = t + ' ' + item;
          updateHint();
          itemInput.focus();
        });
        opts.append(b);
      });
      hint.append(opts);
    } else {
      hint.append(el('p', '', 'Суд не узнал покупку. Уточните тип товара — например, «наушники», «кофемашина», «кроссовки». ' +
        'Можно подать и так: цену суд посчитает в случайных мелочах.'));
    }
    hint.hidden = false;
  }

  itemInput.addEventListener('input', function () {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(updateHint, 400); // ждём, пока допишут слово
  });

  // ---------- Подпись своей рукой: мышкой или пальцем ----------

  const pad = document.getElementById('court-sign');
  const canvas = document.getElementById('court-sign-canvas');
  const ctx = canvas.getContext('2d');
  const signStatus = document.getElementById('court-sign-status');
  const MIN_SIGN = 120; // длина линии в px, с которой это подпись, а не случайная точка
  let drawing = false, last = null, inkLength = 0;

  // Холст по размеру поля с учётом плотности экрана — чтобы линия была чёткой. Подпись при этом стирается
  function clearSign() {
    const r = pad.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    canvas.width = r.width * k;
    canvas.height = r.height * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(pad).getPropertyValue('--ink-blue').trim() || '#2b3a67'; // «чернила» бланка
    inkLength = 0;
    pad.classList.remove('has-ink');
    submitBtn.disabled = true;
    signStatus.textContent = 'Без подписи заявление не принимается.';
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() };
  }

  pad.addEventListener('pointerdown', function (e) {
    if (form.classList.contains('is-signing')) return;
    drawing = true;
    last = point(e);
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже рисует */ }
  });
  pad.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    const p = point(e);
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    // Чем быстрее ведут, тем тоньше линия — как у настоящей ручки
    ctx.lineWidth = Math.max(1.2, 3.2 - d / Math.max(1, p.t - last.t) * 1.2);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inkLength += d;
    last = p;
    pad.classList.add('has-ink');
    if (inkLength > MIN_SIGN && submitBtn.disabled) {
      submitBtn.disabled = false;
      signStatus.textContent = 'Подпись есть — можно подавать.';
    }
  });
  function stopDrawing() { drawing = false; }
  pad.addEventListener('pointerup', stopDrawing);
  pad.addEventListener('pointercancel', stopDrawing);
  document.getElementById('court-sign-clear').addEventListener('click', function () {
    if (!form.classList.contains('is-signing')) clearSign();
  });

  function openModal() {
    form.classList.remove('is-signing');
    stamp.hidden = true;
    document.getElementById('court-doc-date').textContent = new Date().toLocaleDateString('ru-RU');
    updateSum();
    modal.hidden = false;
    document.body.classList.add('lightbox-open');
    form.scrollTop = 0;
    updateHint();
    clearSign(); // после показа окна — иначе размер поля ещё неизвестен
    itemInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('lightbox-open');
  }

  document.getElementById('court-open').addEventListener('click', openModal);
  // Пока падает штамп «Принято» (is-signing), окно не закрывается — заседание уже начинается
  document.getElementById('court-close').addEventListener('click', function () {
    if (!form.classList.contains('is-signing')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden && !form.classList.contains('is-signing')) closeModal();
  });

  // На сайте — единый номер; при открытии файла локально — прежняя нумерация браузера.
  async function nextNumber() {
    if (sharedCounter) {
      if (!numberRequest) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        numberRequest = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
      const data = await counterRequest({ method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Court-Request': '1'
      }, body: JSON.stringify({ requestId: numberRequest }) });
      if (!Number.isSafeInteger(data.number) || data.number < 1 || data.number > data.count) throw new Error('counter');
      return formatNumber(data.number);
    }
    const count = load('court-count', 0) + 1;
    save('court-count', count);
    return formatNumber(count);
  }

  function formatNumber(count) {
    const now = new Date();
    return String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' + String(count).padStart(3, '0');
  }

  // Подать: штамп «Принято» с номером дела → окно закрывается → заседание
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (form.classList.contains('is-signing') || inkLength <= MIN_SIGN) return;
    const item = itemInput.value.trim();
    const price = priceRub();
    if (!item || !price) return;

    const idx = C.questions.map(function (q, qi) { // номера выбранных ответов — для сочетаний
      return +form.querySelector('input[name="q' + qi + '"]:checked').value;
    });
    const kind = kindOf(findGroup(item));
    const answers = idx.map(function (ai, qi) { return answerFor(kind, qi, ai); });
    const amount = Number(String(priceInput.value).replace(',', '.'));
    const currency = curSelect.value;
    submitBtn.disabled = true;
    form.classList.add('is-signing');
    signStatus.textContent = 'Получаем номер дела…';
    let number;
    try { number = await nextNumber(); }
    catch (error) {
      form.classList.remove('is-signing');
      submitBtn.disabled = false;
      signStatus.textContent = 'Не удалось получить номер дела. Проверьте интернет и нажмите «Подать» ещё раз.';
      return;
    }
    numberRequest = null;
    const caseData = { item: item, price: price, amount: amount,
      cur: currency, answers: answers, idx: idx, kind: kind, number: number };
    archiveDrop(caseData.number); // до заседания — чтобы суд не «вспомнил» старое дело под тем же номером

    stamp.textContent = '';
    stamp.append(el('span', 'court-doc__stamp-big', 'Принято'),
      el('span', '', 'Вх. № ' + caseData.number), el('span', '', new Date().toLocaleDateString('ru-RU')));
    stamp.hidden = false;
    sound('stamp');
    signStatus.textContent = 'Заявление принято. Встать, суд идёт!';
    wait(STAMP_MS)
      .then(function () {
        form.classList.remove('is-signing');
        closeModal();
        hearing(caseData);
      });
  });

  // ---------- Заседание ----------

  // Случайный вариант реплики или текста из списка
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // Заключительные фразы сторон («Защита закончила: …», «У обвинения всё: …»): звучат только в конце —
  // hearing() дописывает такую фразу к последней реплике стороны.
  // CLOSING_TAIL — такая же фраза в конце обычной реплики («…прекрасна. У обвинения всё.»): её отрезаем и тоже переносим
  const CLOSING = /^(Защита закончила|Обвинение закончило|У защиты всё|У обвинения всё)/;
  const CLOSING_TAIL = /\s+(У защиты всё\.|У обвинения всё\.|Защите больше нечего добавить\.|Защите добавить нечего\.|Обвинению добавить нечего\.|Вопросов больше нет\.|У обвинения вопросов нет\.)$/;
  const WITNESS_DONE = /^Свидетель закончил/; // и «закончила»
  // Итог речи — вперёд, «закончила» — последним словом:
  // «Защита закончила: срок достаточный.» → { sum: 'Срок достаточный.', end: 'Защита закончила.' }
  function closingLast(t) {
    const m = t.match(/^(Защита закончила|Обвинение закончило|У защиты всё|У обвинения всё)[:.]\s*(.+)$/);
    if (!m) return { sum: '', end: t };
    return { sum: m[2].replace(/^([«"]?)(.)/, function (s, q, c) { return q + c.toUpperCase(); }), end: m[1] + '.' };
  }

  // Итог повторяет реплику, к которой его дописывают («Сумма ощутимая… Сумма серьёзная.»): есть общее слово
  // от 5 букв (сравниваем по первым четырём) — тогда итог не говорим, остаётся только «Обвинение закончило.»
  function stems(t) {
    return (t.toLowerCase().replace(/ё/g, 'е').match(/[а-я]{5,}/g) || []).map(function (w) { return w.slice(0, 4); });
  }
  function repeats(line, sum) {
    const own = stems(line);
    return stems(sum).some(function (s) { return own.indexOf(s) >= 0; });
  }

  // Фраза «без повторов»: суд помнит (в браузере), какие варианты из списка уже звучали,
  // и не повторяет их, пока не прозвучат все — как колода карт: перемешали, вытянули все, перемешали снова.
  // Новый круг начинается без последней трети прошлого — чтобы фраза из конца круга не вернулась сразу.
  // key — имя списка («ответ 1-3», «судья», «приговор: виновно»…)
  // В деле о питомце фразы о вещах пропускаются (и у других видов покупок — свои «чужие» слова, KIND_AVOID),
  // но «колода» у списка одна на все дела: пропущенные фразы просто не тянутся, и повторов между делами нет
  // «вещь», «пользоваться», поломка и ремонт, полки и антресоли, модели, возврат, гарантия,
  // «служит», «пылится», бирки, аналоги и дубли, «за полцены», «выбрасывать», хозяйство, инструмент.
  // Без «оглядки назад» в регулярных выражениях — её не понимают старые iPhone (iOS до 16.4),
  // поэтому исключения («посовещавшись», «заслужить») убираются из фразы перед проверкой (isThing)
  const THING_WORDS = /вещ|пользу|пользов|ломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|полк[еиу]|шкаф|антресол|коробк|кладовк|модел|возврат|детал|гарантию|служ|пыл[иья]|бирк|аналог|дубл|полцены|выбрас|хозяйств|инструмент/i;
  const NOT_THING = /совещ|заслуж/gi;
  function isThing(t) { return THING_WORDS.test(t.replace(NOT_THING, '')); }
  // Слова, по которым видно, о каком животном фраза: в деле о кошке не звучит «фото щенка», о собаке — «мурлычет».
  // (?:^|[^а-яё]) — начало слова: «кот», но не «молоток»
  const SPECIES_WORDS = {
    cat: /мяу|мурл|мурч|(?:^|[^а-яё])мур(?![а-яё])|котён|котен|котик|(?:^|[^а-яё])кот(а|ы|ов|ом)?(?![а-яё])|кошк|кис-кис|(?:^|[^а-яё])лоток|когтеточ|у батареи/i,
    dog: /(?:^|[^а-яё])гав|радостн[а-яё]* лай|щенк|щенок|щенят|(?:^|[^а-яё])п[её]с(?![а-яё])|(?:^|[^а-яё])пса(?![а-яё])|собак|прогулк|гулять|выгул|поводок|мячик/i
  };
  let petCase = false; // выставляет hearing(), действует до следующего заседания
  let petKind = '';    // 'cat', 'dog' или '' — другие питомцы (попугай, хомяк…)
  function wrongSpecies(t) {
    return Object.keys(SPECIES_WORDS).some(function (k) { return k !== petKind && SPECIES_WORDS[k].test(t); });
  }
  // Для других видов покупок (data/court-kinds.js) — свои «чужие» слова: про одежду не говорят «сломалась»
  // и «работает», про расходники — «модель» и «гарантия», про еду, услуги, подарки и деньги — всё «вещное», как у питомцев
  const CLOTHES_AVOID = /сломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|исправн|батаре|заряд|модел/i;
  const TEXTILE_AVOID = /(?:^|[^а-яё])нос(?:ить|ится|ят|или)|надеть|одежд|гардероб|наряд|свитер|локт|пятк/i;
  const CONSUMABLE_AVOID = /вещ|сломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|исправн|модел|гаранти|возврат|аналог|служ|пыл[иья]|полк[еиу]|антресол|бирк|полцены|выбрас|детал/i;
  const KIND_AVOID = {
    clothes: function (t) { return CLOTHES_AVOID.test(t); },
    textile: function (t) { return CLOTHES_AVOID.test(t) || TEXTILE_AVOID.test(t); },
    consumable: function (t) { return CONSUMABLE_AVOID.test(t.replace(NOT_THING, '')); },
    food: isThing,
    service: isThing,
    gift: isThing,
    money: isThing
  };
  let caseKind = 'thing'; // вид покупки — выставляет hearing(), как petCase
  function pickFresh(key, list) {
    let fits = null; // какие варианты подходят этому делу
    if (petCase) fits = function (t) { return !isThing(t) && !wrongSpecies(t); };
    else if (KIND_AVOID[caseKind]) fits = function (t) { return !KIND_AVOID[caseKind](t); };
    let allowed = [];
    for (let i = 0; i < list.length; i++) if (!fits || fits(list[i])) allowed.push(i);
    if (!allowed.length) allowed = list.map(function (t, i) { return i; }); // не подошло ничего — берём любые
    const used = load('court-used', {});
    let seen = (used[key] || []).filter(function (i) { return i < list.length; });
    function rest() { return allowed.filter(function (i) { return seen.indexOf(i) < 0; }); }
    let left = rest();
    if (!left.length) { // круг подходящих закончился: из них помним только последнюю треть
      const keep = Math.floor(allowed.length / 3); // slice(-0) вернул бы весь список — поэтому отдельно
      const mine = seen.filter(function (i) { return allowed.indexOf(i) >= 0; });
      const recent = keep ? mine.slice(-keep) : [];
      seen = seen.filter(function (i) { return allowed.indexOf(i) < 0 || recent.indexOf(i) >= 0; });
      left = rest();
    }
    const idx = left[Math.floor(Math.random() * left.length)];
    seen.push(idx);
    used[key] = seen;
    save('court-used', used);
    return list[idx];
  }

  const WHO = { clerk: 'Секретарь', pro: 'Прокурор', def: 'Адвокат', judge: 'Судья' };

  // Портреты участников: pictures/court/<имя>.jpg (или .png). Показываются фоном кружка с увеличением —
  // на картинках вокруг головы много места, а в кружке нужно лицо. Нет файла — кружок убирается, реплика остаётся
  // У свидетелей портреты свои (data/court-live.js → face), у Календаря и Желания — calendar и desire.
  // Щелчок по кружку — портрет крупно, в круглом окошке «Юмора» (js/humor.js)
  const FACES = { clerk: 'secretary', pro: 'prosecutor', def: 'lawyer', judge: 'judge' };
  function face(name, who) {
    const box = el('button', 'court-log__face');
    box.type = 'button';
    box.disabled = true; // пока портрет не загрузился, нажимать нечего
    box.setAttribute('aria-label', 'Портрет крупно: ' + who);
    box.title = who;
    const probe = new Image();
    probe.onload = function () {
      box.style.backgroundImage = 'url("' + probe.src + '")';
      box.disabled = false;
    };
    box.addEventListener('click', function () {
      if (window.openLightbox) window.openLightbox({ src: probe.src, alt: 'Портрет: ' + who }, { round: true });
    });
    probe.onerror = function () {
      if (probe.src.slice(-4) === '.jpg') probe.src = 'pictures/court/' + name + '.png';
      else box.remove();
    };
    probe.src = 'pictures/court/' + name + '.jpg';
    return box;
  }
  const OBJECTION_CHANCE = 0.35; // как часто сторона протестует после реплики
  const MAX_OBJECTIONS = 2;      // не больше двух протестов за заседание

  // Особое сочетание ответов (data/court.js → combos): первое подходящее или null
  function findCombo(d) {
    return C.combos.find(function (c) {
      if (c.when === 'best') return d.answers.every(function (a) { return a.score === 0; });
      if (c.when === 'worst') {
        return d.answers.every(function (a, qi) {
          return a.score === Math.max.apply(null, C.questions[qi].answers.map(function (x) { return x.score; }));
        });
      }
      return Object.keys(c.when).every(function (qi) { return c.when[qi].indexOf(d.idx[qi]) >= 0; });
    }) || null;
  }

  // Самый сильный довод стороны (среди равных — случайный)
  function strongest(list) {
    if (!list.length) return null;
    const top = Math.max.apply(null, list.map(function (r) { return r.weight; }));
    return pick(list.filter(function (r) { return r.weight === top; })).text;
  }

  // Мотивировка: оправдано — довод защиты, виновно — обвинения, условно — по доводу с каждой стороны
  function motive(kind, reasons) {
    const def = strongest(reasons.def);
    const pro = strongest(reasons.pro);
    if (kind === 'wait' && def && pro) {
      return pickFresh('мотивировка: условно', C.motives.wait).replace('{def}', def).replace('{pro}', pro);
    }
    const useDef = kind === 'free' ? !!def : !pro;
    const reason = useDef ? def : pro;
    if (!reason) return '';
    const mk = useDef ? 'free' : 'guilty';
    return pickFresh('мотивировка: ' + mk, C.motives[mk]).replace('{reason}', reason);
  }

  // ---------- Живой суд: память, календарь, свидетели, ремарки (тексты — data/court-live.js) ----------

  const WITNESS_CHANCE = 0.4;  // как часто вызывают свидетеля
  const HOLIDAY_CHANCE = 0.3;  // как часто Календарь вспоминает обычный праздник дня

  // Подстановка в шаблон фразы: {number}, {count}, {pay}, {left}, {holiday}, {name}
  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, function (m, k) { return values && k in values ? values[k] : m; });
  }

  // Что суд помнит о неделе (архив — ещё без текущего дела): не больше двух реплик
  function memoryLines(d) {
    const list = archive();
    const out = [];
    const me = normalize(d.item);
    const same = list.find(function (c) { return normalize(c.item) === me; });
    const broken = list.find(function (c) { return c.outcome === 'приговор нарушен'; });
    const good = list.find(function (c) { return c.outcome === 'приговор исполнен'; });
    if (broken) out.push({ side: 'pro', key: 'память: нарушен', list: C.memory.broken, values: { number: broken.number } });
    else if (same) out.push({ side: 'pro', key: 'память: повтор', list: C.memory.repeat, values: { number: same.number } });
    else if (good) out.push({ side: 'def', key: 'память: исполнен', list: C.memory.good, values: { number: good.number } });
    if (list.length >= 2) { // с текущим — три дела и больше
      const n = list.length + 1;
      out.push({ side: 'judge', key: 'память: много дел', list: C.memory.many,
        values: { count: n + ' ' + plural(n, 'дело', 'дела', 'дел') } });
    }
    return out;
  }

  // Ближайшая выплата: зарплата 10-го, аванс 25-го. { diff, word }: diff — дней до неё (−1 — была вчера)
  function payday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let best = null;
    C.paydays.forEach(function (p) {
      [-1, 0, 1].forEach(function (m) { // прошлый, этот и следующий месяц
        const diff = Math.round((new Date(today.getFullYear(), today.getMonth() + m, p.day) - today) / 86400000);
        if (diff >= -1 && diff <= 3 && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff: diff, word: p.word };
      });
    });
    return best;
  }

  // Реплика Календаря, если есть повод: денежный праздник → выплата → пятница вечером → выходные → праздник дня
  function calendarLine() {
    const K = C.calendar;
    const now = new Date();
    const key = String(now.getDate()).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0');
    const keyYear = key + '.' + now.getFullYear(); // праздники с плавающей датой: «13.09.2026»
    const events = (window.EVENTS || []).filter(function (e) { return e.date === key || e.date === keyYear; });
    const money = events.find(function (e) { return K.moneyHoliday.words.test(e.title); });
    if (money) return { set: 'moneyHoliday', values: { holiday: '«' + money.title + '»' } };
    const pay = payday();
    if (pay && pay.diff > 0) {
      return { set: 'beforePay', values: { pay: pay.word, left: pay.diff + ' ' + plural(pay.diff, 'день', 'дня', 'дней') } };
    }
    if (pay) return { set: 'afterPay', values: { pay: pay.word } };
    const wd = now.getDay();
    if (wd === 5 && now.getHours() >= 17) return { set: 'friday' };
    if (wd === 0 || wd === 6) return { set: 'weekend' };
    if (events.length && Math.random() < HOLIDAY_CHANCE) return { set: 'holiday', values: { holiday: '«' + events[0].title + '»' } };
    return null;
  }

  // Свидетель или никого. К кошке — чаще Кот, к собаке — Пёс, к еде — Холодильник и т. д.
  function witnessFor(group) {
    if (Math.random() >= WITNESS_CHANCE) return null;
    const special = C.witnesses.filter(function (w) {
      if (w.pet) return petCase && w.species === petKind;
      return !petCase && !!(group && w.groups && w.groups.indexOf(group.name) >= 0);
    });
    const general = C.witnesses.filter(function (w) { return !w.groups && !w.pet; });
    return pick(special.length && Math.random() < 0.7 ? special : general);
  }

  // Портрет свидетеля. Если вариантов несколько (cat1…cat3) — случайный при первой встрече,
  // дальше в этом браузере тот же: заявитель видит «своего» кота и «своего» пса
  function witnessFace(w) {
    if (!w.variants) return w.face;
    const chosen = load('court-pet-faces', {});
    if (!(chosen[w.face] >= 1 && chosen[w.face] <= w.variants)) {
      chosen[w.face] = 1 + Math.floor(Math.random() * w.variants);
      save('court-pet-faces', chosen);
    }
    return w.face + chosen[w.face];
  }

  // Пауза «…» перед репликой — по её длине
  function typingMs(text) { return Math.min(1100, Math.max(400, 200 + text.length * 7)); }

  function hearing(d) {
    const number = d.number;
    const group = findGroup(d.item);
    petCase = !!(group && group.pet);
    petKind = (petCase && group.species) || '';
    caseKind = d.kind || 'thing';

    let score = 0;
    const lines = [];
    const reasons = { def: [], pro: [] }; // доводы сторон для мотивировки: { text, weight }
    let objections = 0;
    // opt — для свидетелей, Календаря и Желания: { who, face, extra, sound } (extra — доп. класс строки,
    // sound — звук при появлении реплики: молоток у секретаря, голос кота или пса)
    // arg — довод стороны (к последнему доводу дописывается заключительная фраза),
    // objection — протест и ответ на него: сторона, которая протестует
    function say(side, text, opt) {
      opt = opt || {};
      lines.push({ who: opt.who || WHO[side], side: side, text: text, face: opt.face || FACES[side], extra: opt.extra || '',
        sound: opt.sound || '', arg: !!opt.arg, objection: opt.objection || '' });
    }

    // Довод адвоката или прокурора. Если выпала заключительная фраза — откладываем её до конца
    // и берём из того же списка другую. Другую берём и тогда, когда реплика начинается так же,
    // как прошлая реплика этой стороны («Обвинение напоминает: …» дважды подряд)
    const closing = {};
    function opener(t) { return t.split(' ').slice(0, 2).join(' '); }
    function argue(side, key, list, values) {
      const prev = lines.filter(function (l) { return l.side === side && l.arg; }).pop();
      let text = pickFresh(key, list);
      for (let i = 0; i < 3; i++) {
        if (CLOSING.test(text)) closing[side] = closingLast(fill(text, values));
        else if (!prev || opener(text) !== opener(prev.text)) break;
        text = pickFresh(key, list);
      }
      const tail = text.match(CLOSING_TAIL);
      if (tail) {
        closing[side] = { sum: '', end: tail[1] };
        text = text.slice(0, tail.index);
      }
      say(side, fill(text, values), { arg: true });
    }

    // Реплика свидетеля или Календаря — у них она одна. Если выпала концовка («Свидетель закончил и…»),
    // берём из списка обычную реплику, а концовку (tail) у свидетеля зал видит ремаркой после неё.
    // Календарь концовку не получает: его не вызывали, и праздник в ней повторил бы его же реплику
    function testify(key, list) {
      let text = pickFresh(key, list), tail = '';
      for (let i = 0; i < 3 && WITNESS_DONE.test(text); i++) {
        tail = text;
        text = pickFresh(key, list);
      }
      return { text: text, tail: tail };
    }

    // Иногда противоположная сторона протестует, судья отвечает. На приговор не влияет.
    // qi — вопрос заявления, на который был довод: протест чаще по его теме (C.topicObjections)
    function maybeObject(side, qi) {
      if (objections >= MAX_OBJECTIONS || Math.random() >= OBJECTION_CHANCE) return;
      objections++;
      const other = side === 'pro' ? 'def' : 'pro';
      const ruling = Math.random() < 0.5 ? 'rejected' : 'accepted';
      // протесты по теме написаны про вещи — для одежды подходят, для еды, услуг, расходников и питомцев — только общие
      const topic = (caseKind === 'thing' || caseKind === 'clothes') && C.topicObjections && C.topicObjections[other][qi];
      say(other, topic && Math.random() < 0.7
        ? pickFresh('протест по теме: ' + other + ' ' + (qi + 1), topic)
        : pickFresh('протест: ' + other, C.objections[other]), { objection: other });
      say('judge', pickFresh('ответ на протест: ' + ruling, C.rulings[ruling]), { objection: other });
    }

    const priceText = rub(d.price) + (d.cur === 'RUB' ? '' : ' (' + d.amount.toLocaleString('ru-RU') + ' ' +
      (d.cur === 'USD' ? '$' : '€') + ' по курсу ЦБ на сегодня)');
    say('clerk', 'Слушается дело № ' + number + ': желание купить «' + d.item + '» за ' + priceText + '. Встать, суд идёт!',
      { sound: 'gavel' });
    memoryLines(d).forEach(function (m) { argue(m.side, m.key, m.list, m.values); });
    const cal = calendarLine();
    if (cal) {
      const set = C.calendar[cal.set];
      say(set.side, fill(testify('календарь: ' + cal.set, set.lines).text, cal.values),
        { who: 'Календарь', face: 'calendar', extra: 'is-witness' });
    }
    d.answers.forEach(function (a, qi) {
      score += a.score;
      // Сила довода: для обвинения — чем больше баллов, тем сильнее; для защиты — чем меньше
      reasons[a.side].push({ text: a.reason, weight: a.side === 'pro' ? a.score : 2 - a.score });
      // Довод и реплики уже под вид покупки (answerFor): у питомца — petReason и petLines, у еды — свои и т. д.
      argue(a.side, 'ответ ' + (qi + 1) + '-' + (d.idx[qi] + 1), a.lines);
      maybeObject(a.side, qi);
    });
    // Сторона в трудном деле (из пяти ответов за неё не больше одного) не молчит, а говорит по существу (C.uphill)
    const count = { def: 0, pro: 0 };
    d.answers.forEach(function (a) { count[a.side]++; });
    if (C.uphill) ['def', 'pro'].forEach(function (side) {
      if (count[side] <= 1 && count[side === 'def' ? 'pro' : 'def'] >= 4) argue(side, 'трудное дело: ' + side, C.uphill[side]);
    });
    if (d.price >= C.expensive.from) {
      score += 1;
      reasons.pro.push({ text: C.expensive.reason, weight: 1 });
      argue('pro', 'дорогая покупка', C.expensive.lines);
    } else if (d.price >= C.notable.from) {
      argue('pro', 'ощутимая сумма', C.notable.lines);
    } else if (d.price < C.small.below) {
      say('judge', pickFresh('мелкая сумма', C.small.lines));
    }
    // Первая необходимость (C.essential): старого нет, сломалось или старое, а похожего рабочего нет — суд мягче
    const E = C.essential;
    const need = !!(group && E && E.groups.indexOf(group.name) >= 0) && d.idx[1] !== 2 && (d.idx[0] <= 1 || d.idx[1] <= 1);
    if (need) {
      score -= 2;
      reasons.def.push({ text: E.reason, weight: 3 });
      argue('def', 'первая необходимость', E.def);
      if (Math.random() < 0.5) argue('pro', 'первая необходимость: обвинение', E.pro);
    }
    // Промежуточный счёт судьи по ответам — иногда и только когда доводы есть у обеих сторон (5:0 — это сочетание)
    if (C.score && count.def && count.pro && Math.random() < 0.4) {
      const n = function (k) { return k + ' ' + plural(k, 'довод', 'довода', 'доводов'); };
      say('judge', fill(pickFresh('счёт', C.score), { pro: n(count.pro), def: n(count.def) }));
    }
    const witness = witnessFor(group);
    if (witness) {
      const call = pickFresh('вызов свидетеля', C.witnessCall);
      say('clerk', fill(call, { name: witness.name }));
      // «Входит…» — только после вызова в зал, а не после «говорите» / «суд вас слушает»: там свидетель уже у трибуны
      if (!/говорите|слуша/i.test(call) && Math.random() < 0.5) lines.push({ remark: true, text: fill(pickFresh('свидетель входит', C.witnessEnter), { name: witness.name }) });
      const said = testify('свидетель: ' + witness.face, witness.lines);
      say(witness.side, said.text,
        { who: witness.name, face: witnessFace(witness), extra: 'is-witness', sound: witness.pet ? 'animal' : '' });
      if (said.tail) lines.push({ remark: true, text: said.tail });
    }
    // Сочетания ответов написаны про вещи («одна сломалась, другая работает») — только у вещей, одежды и питомцев
    const combo = caseKind === 'thing' || caseKind === 'clothes' || caseKind === 'pet' ? findCombo(d) : null;
    if (combo) argue(combo.side, 'сочетание ' + (C.combos.indexOf(combo) + 1), combo.lines);

    // Заключительная фраза — в конец последнего довода стороны; протесты этой стороны после него
    // (вместе с ответом судьи) не звучат: сторона уже закончила
    Object.keys(closing).forEach(function (side) {
      let last = -1;
      lines.forEach(function (l, i) { if (l.arg && l.side === side) last = i; });
      if (last < 0) return;
      const c = closing[side];
      lines[last].text += ' ' + (c.sum && !repeats(lines[last].text, c.sum) ? c.sum + ' ' : '') + c.end;
      for (let i = lines.length - 1; i > last; i--) if (lines[i].objection === side) lines.splice(i, 1);
    });

    // Желание иногда не выдерживает и вмешивается после довода прокурора (после протеста на него, если был),
    // судья одёргивает (C.interject)
    if (C.interject && Math.random() < 0.35) {
      const pros = [];
      lines.forEach(function (l, i) { if (l.arg && l.side === 'pro') pros.push(i); });
      if (pros.length) {
        let at = pick(pros) + 1;
        while (lines[at] && lines[at].objection) at++;
        lines.splice(at, 0,
          { who: 'Желание', side: 'desire', text: pickFresh('желание вмешивается', C.interject.desire), face: 'desire',
            extra: 'is-witness', sound: '', pair: true },
          { who: WHO.judge, side: 'judge', text: pickFresh('судья одёргивает желание', C.interject.judge),
            face: FACES.judge, extra: '', sound: '', pair: true });
      }
    }

    // Ремарки зала: одна-две, между репликами (не перед секретарём, не между протестом и ответом судьи
    // и не между выкриком Желания и замечанием судьи)
    const remarkPool = petCase ? C.remarks.concat(C.petRemarks, C.petRemarks) : C.remarks; // о питомцах — чаще свои
    // и не рядом с другой ремаркой (и с концовкой свидетеля)
    function badSpot(i) {
      return (lines[i] && (lines[i].remark || lines[i].pair || (lines[i].objection && lines[i].side === 'judge'))) ||
        lines[i - 1].remark;
    }
    for (let r = Math.random() < 0.5 ? 2 : 1; r > 0; r--) {
      let at, tries = 0;
      do at = 1 + Math.floor(Math.random() * lines.length);
      while (badSpot(at) && ++tries < 30);
      if (!badSpot(at)) lines.splice(at, 0, { remark: true, text: pickFresh('ремарка', remarkPool) });
    }
    say('judge', pickFresh('последнее слово: вопрос', C.lastWordAsk));

    start.hidden = true;
    session.hidden = false;
    session.innerHTML = '';
    const head = el('div', 'panel__head');
    head.append(el('h3', 'panel__title', 'Заседание по делу № ' + number));
    const log = el('ol', 'court-log');
    log.id = 'court-log';

    // Крестик сворачивает диалог (приговор остаётся на виду), в свёрнутом виде становится плюсом
    const fold = el('button', 'court-fold');
    fold.type = 'button';
    fold.setAttribute('aria-controls', log.id);
    function setFolded(folded) {
      log.hidden = folded;
      fold.classList.toggle('is-folded', folded);
      fold.setAttribute('aria-expanded', String(!folded));
      fold.setAttribute('aria-label', folded ? 'Развернуть диалог' : 'Свернуть диалог');
      fold.title = folded ? 'Развернуть диалог' : 'Свернуть диалог';
    }
    fold.addEventListener('click', function () { setFolded(!log.hidden); });
    setFolded(false);
    head.append(fold);

    session.append(head, log);
    session.scrollIntoView({ behavior: quick ? 'auto' : 'smooth', block: 'start' });

    // Реплики появляются по одной: сначала «…» (говорящий набирается духу), потом текст; ремарки — сразу
    function play(list, then) {
      let i = 0;
      (function next() {
        if (i >= list.length) { then(); return; }
        const l = list[i++];
        if (l.remark) {
          log.append(el('li', 'court-log__line is-remark', l.text));
          if (quick) next(); else setTimeout(next, STEP_MS);
          return;
        }
        const li = el('li', ('court-log__line is-' + l.side + ' ' + l.extra).trim());
        const speech = el('div', 'court-log__speech');
        speech.append(el('span', 'court-log__who', l.who + ':'));
        li.append(face(l.face, l.who), speech);
        function show() { // «…» убираем, ставим текст реплики
          speech.querySelectorAll('.court-log__dots').forEach(function (n) { n.remove(); });
          speech.append(document.createTextNode(' ' + l.text));
          if (l.sound) sound(l.sound, l.face); // молоток у секретаря, голос кота или пса
        }
        if (quick) { show(); log.append(li); next(); return; }
        speech.append(el('span', 'court-log__dots', '…'));
        log.append(li);
        setTimeout(function () { show(); setTimeout(next, STEP_MS / 2); }, typingMs(l.text));
      })();
    }

    if (window.courtSound) window.courtSound.hall(true); // зал шепчется до приговора (sounds/court/hall.mp3)
    play(lines, function () { lastWord(); });

    // Последнее слово: три кнопки с фразами заявителя. Ответ сдвигает счёт, судья реагирует, затем приговор
    function lastWord() {
      const W = C.lastWord;
      const options = [
        { kind: 'honest', text: pickFresh('последнее слово: честно',
          petCase ? W.petHonest : caseKind === 'food' && W.foodHonest ? W.foodHonest : W.honest) },
        { kind: 'plead', text: pickFresh('последнее слово: мольба',
          petCase ? W.petPlead : caseKind === 'food' && W.foodPlead ? W.foodPlead : W.plead) },
        { kind: 'surrender', text: pickFresh('последнее слово: сдаюсь', W.surrender) }
      ];
      const box = el('li', 'court-log__choice');
      box.append(el('p', 'court-log__choice-title', 'Ваше последнее слово:'));
      const btns = el('div', 'court-log__choice-btns');
      options.forEach(function (o) {
        const b = el('button', 'court-btn', o.text);
        b.type = 'button';
        b.addEventListener('click', function () { box.remove(); answer(o); });
        btns.append(b);
      });
      box.append(btns);
      log.append(box);
      if (!quick) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function answer(o) {
      let reply = o.kind;
      if (o.kind === 'honest') score -= 1;
      else if (o.kind === 'plead') {
        if (Math.random() < 0.5) { score -= 1; reply = 'pleadYes'; } else { score += 1; reply = 'pleadNo'; }
      } else score = Math.min(score, verdictOf('wait').max); // «суду виднее»: «Виновно» смягчается до «Условно»
      if (need) score = Math.min(score, verdictOf('wait').max); // первая необходимость — не строже «Условно»

      const verdict = C.verdicts.find(function (v) { return score <= v.max; });
      // Ответ судьи не спорит с приговором: «суд растаял» — и «Виновно» не звучит
      if (verdict.kind === 'guilty' && (reply === 'honest' || reply === 'pleadYes')) reply += 'Short';
      else if (verdict.kind === 'free' && (reply === 'pleadNo' || reply === 'surrender')) reply += 'Free';

      const text = /[.…?!]$/.test(o.text) ? o.text : o.text + '.';
      const after = [];
      after.push({ who: 'Желание', side: 'desire', text: text, face: 'desire', extra: 'is-witness' });
      after.push({ who: WHO.judge, side: 'judge', text: pickFresh('последнее слово: ' + reply, C.lastWordReply[reply]),
        face: FACES.judge, extra: '' });
      after.push({ who: WHO.judge, side: 'judge', text: pickFresh('судья', C.judge), face: FACES.judge, extra: '' });

      d.motive = motive(verdict.kind, reasons);
      archiveAdd(d, verdict);
      play(after, function () {
        session.append(verdictCard(d, verdict));
        if (window.courtSound) window.courtSound.hall(false); // зал затихает
        sound(verdict.kind); // молоток и звук приговора: free, wait, guilty
      });
    }
  }

  function verdictCard(d, v) {
    const card = el('div', 'court-verdict is-' + v.kind);
    card.append(el('div', 'court-verdict__stamp', v.stamp));
    card.append(el('p', 'court-verdict__label', 'Приговор'));
    card.append(el('h4', 'court-verdict__title', v.title));
    card.append(el('p', 'court-verdict__text', pickFresh('приговор: ' + v.kind, v.texts)));
    if (d.motive) {
      const motiveBox = el('p', 'court-verdict__motive');
      motiveBox.append(el('strong', '', 'Мотивировка: '), document.createTextNode(d.motive));
      card.append(motiveBox);
    }

    const m = measuresFor(d.item, d.price);
    card.append(el('p', 'court-verdict__sub', 'Для протокола: ' + rub(d.price) + ' — это'));
    const ul = el('ul', 'court-verdict__measures');
    m.lines.forEach(function (t) { ul.append(el('li', '', t)); });
    card.append(ul);
    if (m.payback) card.append(el('p', 'court-verdict__payback', m.payback));

    const actions = el('div', 'court-verdict__actions');
    function button(text, main, onClick) {
      const b = el('button', 'court-btn' + (main ? ' court-btn--main' : ''), text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      actions.append(b);
      return b;
    }
    function done(text) {
      actions.innerHTML = '';
      actions.append(el('p', 'court-verdict__done', text));
      button('Новое дело', false, newCase);
    }
    // Нарушить приговор — покупка совершена: копилка не пополняется, в архиве — «приговор нарушен»
    function breakButton() {
      button('Нарушить приговор', false, function () {
        archiveMark(d.number, 'приговор нарушен');
        sound('broken');
        done('Приговор нарушен. Покупка совершена, копилка суда не пополнилась.');
      });
    }

    if (v.kind === 'free') {
      button('Новое дело', true, newCase);
    } else if (v.kind === 'wait') {
      button('Отложить на ' + WAIT_DAYS + ' ' + plural(WAIT_DAYS, 'день', 'дня', 'дней'), true, function () {
        const until = new Date();
        until.setDate(until.getDate() + WAIT_DAYS);
        const iso = U.isoOf(until);
        const list = load('court-appeals', []);
        list.push({ id: Date.now(), item: d.item, price: Math.round(d.price), until: iso });
        setAppeals(list);
        archiveMark(d.number, 'отложено до ' + ruDate(iso));
        done('Дело отложено до ' + ruDate(iso) + '. Суд напомнит о нём здесь же.');
      });
      button('Обжаловать', false, function () { archiveMark(d.number, 'обжаловано'); appeal(); });
      breakButton();
    } else {
      button('Подчиняюсь приговору', true, function () {
        addSaved(Math.round(d.price));
        archiveMark(d.number, 'приговор исполнен');
        done('Приговор исполнен. В копилку суда — ' + rub(d.price) + '.');
      });
      button('Обжаловать', false, function () { archiveMark(d.number, 'обжаловано'); appeal(); });
      breakButton();
    }
    card.append(actions);
    return card;
  }

  // Обжаловать — новое заявление с теми же ответами, что-то можно пересмотреть
  function appeal() {
    session.hidden = true;
    start.hidden = false;
    renderStats();
    openModal();
  }

  function newCase() {
    form.reset();
    appeal();
  }

  renderAnswers(); // кнопки заявления пустые, пока покупку не назвали
  renderSaved();
  if (sharedCounter) counterRequest().catch(function () { /* Не показываем личный счёт как общий. */ });
  renderAppeals();
  renderArchive();
})();
