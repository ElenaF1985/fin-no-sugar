// Проверка сайта и «Финансового суда». Запускает tests/run-tests.ps1: он открывает копию index.html
// в невидимом окне Edge, подключает этот файл последним и читает отчёт из <pre id="REPORT">.
// Сайт не меняется: у проверки своя временная папка браузера, память браузера (localStorage) — своя.
//
// Что проверяется: разделы страницы, все тексты суда, узнавание покупок, заявление (пустые кнопки, надписи
// по виду покупки, подсказки), обжалование и архив, затем пробные заседания (TEST_CASES, по умолчанию 100)
// и правила живого суда — см. checkHearing(). FAIL — ошибка, WARN — стоит посмотреть, но не страшно.
//
// Слова-фильтры ниже (THING_WORDS и др.) повторяют js/court.js — если меняете их там, поменяйте и здесь.

(function () {
  const C = window.COURT;
  const FAIL = [], WARN = [], INFO = [];
  const fail = function (m) { if (FAIL.length < 60) FAIL.push(m); };
  const warn = function (m) { if (WARN.length < 30) WARN.push(m); };
  const info = function (m) { INFO.push(m); };
  const $ = function (id) { return document.getElementById(id); };
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function until(f, what, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 60000)) { const v = f(); if (v) return v; await sleep(100); }
    throw new Error('не дождались: ' + what);
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ---------- Узнавание покупки и вид — как в js/court.js ----------
  function normalize(t) { return ' ' + t.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9&']+/g, ' ').trim() + ' '; }
  function matchLength(text, key) {
    key = key.replace(/ё/g, 'е');
    if (key.charAt(0) === '=') return text.indexOf(' ' + key.slice(1) + ' ') >= 0 ? key.length - 1 : 0;
    const k = key.replace(/-/g, ' ');
    return text.indexOf(' ' + k) >= 0 ? k.length : 0;
  }
  function bestMatch(text, list) {
    let best = null;
    list.forEach(function (e) { e.words.forEach(function (w) { const l = matchLength(text, w); if (l && (!best || l > best.len)) best = { entry: e, len: l }; }); });
    return best;
  }
  function findGroup(item) {
    const t = normalize(item), g = bestMatch(t, C.measures);
    if (g) return g.entry;
    const b = bestMatch(t, window.COURT_BRANDS || []);
    if (b && b.entry.types.length === 1) { const x = bestMatch(normalize(b.entry.types[0]), C.measures); return x ? x.entry : null; }
    return null;
  }
  function isBrand(item) { const t = normalize(item); return !bestMatch(t, C.measures) && !!bestMatch(t, window.COURT_BRANDS || []); }
  function kindOf(g) {
    if (!g) return 'thing';
    if (g.pet) return 'pet';
    for (const k in C.kinds) if (C.kinds[k].groups && C.kinds[k].groups.indexOf(g.name) >= 0) return k;
    return 'thing';
  }
  function label(kind, qi, ai) {
    const o = C.kinds[kind] && C.kinds[kind].answers && C.kinds[kind].answers[qi + '-' + ai];
    return (o && o.text) || C.questions[qi].answers[ai].text;
  }

  const THING_WORDS = /вещ|пользу|пользов|ломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|полк[еиу]|шкаф|антресол|коробк|кладовк|модел|возврат|детал|гарантию|служ|пыл[иья]|бирк|аналог|дубл|полцены|выбрас|хозяйств|инструмент/i;
  const NOT_THING = /совещ|заслуж/gi;
  const CLOTHES_AVOID = /сломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|исправн|батаре|заряд|модел/i;
  const TEXTILE_AVOID = /(?:^|[^а-яё])нос(?:ить|ится|ят|или)|надеть|одежд|гардероб|наряд|свитер|локт|пятк/i;
  const CONSUMABLE_AVOID = /вещ|сломал|сломан|поломк|ремонт|мастер|чинить|рабоч|работа[ею]т|работающ|исправн|модел|гаранти|возврат|аналог|служ|пыл[иья]|полк[еиу]|антресол|бирк|полцены|выбрас|детал/i;
  function avoidOf(kind) {
    if (kind === 'textile') return function (t) { return CLOTHES_AVOID.test(t) || TEXTILE_AVOID.test(t); };
    if (kind === 'clothes') return function (t) { return CLOTHES_AVOID.test(t); };
    if (kind === 'consumable') return function (t) { return CONSUMABLE_AVOID.test(t.replace(NOT_THING, '')); };
    if (kind === 'food' || kind === 'service' || kind === 'gift' || kind === 'money' || kind === 'pet') {
      return function (t) { return THING_WORDS.test(t.replace(NOT_THING, '')); };
    }
    return null;
  }

  // ---------- 1. Страница ----------
  function pageChecks() {
    if (!$('today').textContent.trim()) fail('Шапка: нет сегодняшней даты');
    const tiles = [].map.call(document.querySelectorAll('.tile__value'), function (x) { return x.textContent.trim(); });
    if (!tiles.length || tiles.some(function (t) { return !t || t === '—'; })) fail('Курсы: плитки пустые (' + tiles.join(' / ') + ')');
    if (!document.querySelectorAll('#rate-table-body tr').length) fail('Курсы: таблица пустая');
    const news = document.querySelectorAll('.news__item');
    if (!news.length) fail('Новости: нет ни одной новости');
    if (![].every.call(document.querySelectorAll('.news__source'), function (a) { return /^https?:/.test(a.getAttribute('href')); })) fail('Новости: ссылка не на http(s)');
    const humor = !$('humor').hidden;
    if (humor && !$('humor-img').naturalWidth) fail('Юмор: картинка не загрузилась (' + $('humor-img').src.split('/').pop() + ')');
    $('nav-calc').click();
    if ($('calc').hidden) fail('Калькулятор не открылся');
    if (document.querySelector('[data-key="rate"]').textContent.indexOf('22') < 0) fail('Калькулятор: ставка 20% из памяти не сменилась на 22%');
    const key = function (k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
    if (humor) {
      $('humor-img').click(); key('Escape');
      if (!$('lightbox').hidden || $('calc').hidden) fail('Esc: должен закрыть только картинку, калькулятор остаётся');
    }
    key('Escape');
    if (!$('calc').hidden) fail('Esc: калькулятор не закрылся');
    const s = $('court-sound'), before = s.textContent.trim();
    s.click(); const after = s.textContent.trim(); s.click();
    if (before === after) fail('Звук суда: кнопка не переключается');
    info('Страница: дата, курсы (' + tiles.join(' / ') + '), ' + news.length + ' новости, калькулятор, Esc, звук — проверены');
  }

  // ---------- 2. Тексты суда ----------
  function staticChecks() {
    const PH = ['{number}', '{count}', '{pay}', '{left}', '{holiday}', '{name}', '{def}', '{pro}', '{reason}'];
    let n = 0;
    (function walk(o, path) {
      if (typeof o === 'string') {
        n++;
        if (/\s\s|\s[,.!?:]|,,|\.\.(?!\.)|undefined|null/.test(o)) fail('Текст: опечатка в ' + path + ': «' + o + '»');
        (o.match(/\{\w+\}/g) || []).forEach(function (x) { if (PH.indexOf(x) < 0) fail('Текст: неизвестная подстановка ' + x + ' в ' + path); });
        return;
      }
      if (Array.isArray(o)) o.forEach(function (x, i) { walk(x, path + '[' + i + ']'); });
      else if (o && typeof o === 'object') for (const k in o) walk(o[k], path + '.' + k);
    })(C, 'COURT');
    // реплики вида — на стороне своего ответа; ответы и группы существуют
    const names = C.measures.map(function (g) { return g.name; });
    for (const kn in C.kinds) {
      (C.kinds[kn].groups || []).forEach(function (g) { if (names.indexOf(g) < 0) fail('Виды: в ' + kn + ' нет группы «' + g + '»'); });
      const A = C.kinds[kn].answers || {};
      for (const key in A) {
        const qa = key.split('-'), q = C.questions[+qa[0]], a = q && q.answers[+qa[1]];
        if (!a) { fail('Виды: в ' + kn + ' нет ответа ' + key); continue; }
        (A[key].lines || []).forEach(function (t) {
          if (a.side === 'def' && /^(Обвинение|Прокурор)/.test(t)) fail('Виды: реплика прокурора у защиты ' + kn + ' ' + key + ': ' + t);
          if (a.side === 'pro' && /^(Защита|Адвокат)/.test(t)) fail('Виды: реплика адвоката у обвинения ' + kn + ' ' + key + ': ' + t);
          const av = avoidOf(kn);
          if (av && av(t)) fail('Виды: в ' + kn + ' ' + key + ' «чужое» слово — реплика никогда не прозвучит: ' + t);
        });
      }
    }
    (C.essential.groups || []).forEach(function (g) { if (names.indexOf(g) < 0) fail('Первая необходимость: нет группы «' + g + '»'); });
    C.witnesses.forEach(function (w) { (w.groups || []).forEach(function (g) { if (names.indexOf(g) < 0) fail('Свидетель ' + w.name + ': нет группы «' + g + '»'); }); });
    (window.COURT_BRANDS || []).forEach(function (b) { b.types.forEach(function (t) { if (!bestMatch(normalize(t), C.measures)) fail('Бренды: тип «' + t + '» не узнаётся'); }); });
    info('Тексты суда: ' + n + ' фраз, группы, виды, свидетели и бренды — проверены');
  }

  // ---------- 3. Узнавание покупок ----------
  const RECOGNIZE = [
    ["шторы","Шторы, занавески, тюль","textile"],
    ["занавеска","Шторы, занавески, тюль","textile"],
    ["тюль","Шторы, занавески, тюль","textile"],
    ["жалюзи","Шторы, жалюзи","thing"],
    ["ковёр","Ковёр","textile"],
    ["палас","Ковёр","textile"],
    ["полотенце","Полотенца, текстиль","textile"],
    ["скатерть","Полотенца, текстиль","textile"],
    ["тканевые салфетки","Полотенца, текстиль","textile"],
    ["бумажные салфетки","Бумажные салфетки","consumable"],
    ["палатка","Палатка, спальный мешок","textile"],
    ["спальный мешок","Палатка, спальный мешок","textile"],
    ["гамак","Гамак","textile"],
    ["шезлонг","Гамак, шезлонг","thing"],
    ["рюкзак","Рюкзак","textile"],
    ["чемодан","Чемодан, рюкзак","thing"],
    ["тканевая сумка","Тканевая сумка","textile"],
    ["лежанка для кота","Лежанка для питомца","textile"],
    ["переноска","Лежанка, переноска","thing"],
    ["тряпка","Тряпки, коврики для ванной","textile"],
    ["коврик для ванной","Тряпки, коврики для ванной","textile"],
    ['трусы', 'Бельё, носки', 'clothes'], ['ботинки', 'Обувь', 'clothes'], ['купальник', 'Спортивная одежда', 'clothes'],
    ['Levis', 'Джинсы, брюки', 'clothes'], ['кружевное платье', 'Платье, костюм', 'clothes'],
    ['одеяло', 'Подушка, одеяло, плед', 'textile'],
    ['подушка', 'Подушка, одеяло, плед', 'textile'],
    ['наволочка', 'Подушка, одеяло, плед', 'textile'],
    ['простыня', 'Подушка, одеяло, плед', 'textile'],
    ['пододеяльник', 'Подушка, одеяло, плед', 'textile'],
    ['покрывало', 'Подушка, одеяло, плед', 'textile'],
    ['плед', 'Подушка, одеяло, плед', 'textile'],
    ['постельное бельё', 'Подушка, одеяло, плед', 'textile'],
    ['блокнот', 'Канцелярия', 'consumable'], ['шампунь', 'Уход и гигиена', 'consumable'], ['кофе', 'Кофе', 'consumable'],
    ['корм для кота', 'Корм для питомца', 'consumable'], ['краска для волос', 'Краска для волос', 'consumable'],
    ['резинки для волос', 'Уход и гигиена', 'consumable'], ['стиральный порошок', 'Бытовая химия', 'consumable'],
    ['пицца', 'Еда в кафе и доставка', 'food'], ['шоколадка', 'Сладости и перекусы', 'food'],
    ['стрижка', 'Салон красоты', 'service'], ['окрашивание', 'Салон красоты', 'service'], ['такси', 'Такси и транспорт', 'service'],
    ['букет', 'Цветы', 'gift'], ['доставка цветов', 'Цветы', 'gift'], ['лотерея', 'Лотерея', 'money'],
    ['котёнок', 'Кошка', 'pet'], ['щенок корги', 'Собака', 'pet'],
    ['кофемашина', 'Кофемашина', 'thing'], ['кофемолка', 'Кофемолка', 'thing'], ['машинка', 'Игрушки', 'thing'],
    ['швейная машинка', 'Швейная машина', 'thing'], ['iphone 16', 'Смартфон', 'thing'], ['зеркалка', 'Фотоаппарат', 'thing'],
    ['samsung', 'бренд', ''], ['самсунг', 'бренд', ''], ['zara', 'бренд', '']
  ];
  function recognitionChecks() {
    RECOGNIZE.forEach(function (r) {
      if (r[1] === 'бренд') { if (!isBrand(r[0])) fail('Узнавание: «' + r[0] + '» — должен быть вопрос о типе товара'); return; }
      const g = findGroup(r[0]);
      if (!g || g.name !== r[1]) fail('Узнавание: «' + r[0] + '» → «' + (g ? g.name : 'не узнано') + '», а должно «' + r[1] + '»');
      else if (kindOf(g) !== r[2]) fail('Узнавание: «' + r[0] + '» — вид ' + kindOf(g) + ', а должен ' + r[2]);
    });
    info('Узнавание: ' + RECOGNIZE.length + ' контрольных покупок');
  }

  // ---------- 4. Заявление ----------
  const spans = function () { return [].map.call(document.querySelectorAll('#court-questions .court-q__opt span'), function (s) { return s.textContent; }); };
  async function typeItem(v) { $('court-item').value = v; $('court-item').dispatchEvent(new Event('input')); await sleep(600); }
  function sign() {
    const pad = $('court-sign'), b = pad.getBoundingClientRect();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: b.left + 5, clientY: b.top + 5, bubbles: true, pointerId: 1 }));
    for (let k = 1; k < 40; k++) pad.dispatchEvent(new PointerEvent('pointermove', { clientX: b.left + 5 + k * 6, clientY: b.top + 5 + (k % 2) * 10, bubbles: true, pointerId: 1 }));
    pad.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
  }
  async function formChecks() {
    $('court-open').click();
    const qb = $('court-questions');
    if (!qb.classList.contains('is-blank') || !qb.querySelector('input').disabled || spans().join('')) fail('Заявление: при открытии кнопки должны быть пустыми и не нажиматься');
    await typeItem('пицца');
    if (spans()[0] !== label('food', 0, 0)) fail('Заявление: для пиццы первая кнопка «' + spans()[0] + '», а должна «' + label('food', 0, 0) + '»');
    if (qb.classList.contains('is-blank')) fail('Заявление: после названия покупки кнопки остались пустыми');
    await typeItem('шторы');
    if (spans()[0] !== 'Старое износилось') fail('Текстиль: неверная первая кнопка');
    if (!$('court-questions').textContent.includes('Будете ли пользоваться этим через полгода?')) fail('Текстиль: неверный вопрос о полугоде');
    if (/сломал|носить|носится|поношенное/.test($('court-questions').textContent)) fail('Текстиль: неподходящие подписи');
    await typeItem('котёнок');
    if (spans()[0] !== label('pet', 0, 0)) fail('Заявление: для котёнка первая кнопка «' + spans()[0] + '»');
    await typeItem('');
    if (!qb.classList.contains('is-blank')) fail('Заявление: после стирания названия кнопки не опустели');
    await typeItem('самсунг');
    const hb = document.querySelectorAll('.court-doc__hint-btn');
    if ($('court-hint').hidden || !hb.length) fail('Заявление: для «самсунг» нет вопроса о типе товара');
    else { hb[0].click(); await sleep(100); if (!$('court-hint').hidden) fail('Заявление: после выбора типа подсказка не исчезла'); }
    await typeItem('абвгдейка');
    if ($('court-hint').hidden) fail('Заявление: для неизвестной покупки нет просьбы уточнить');
    if (spans()[0] !== label('thing', 0, 0)) fail('Заявление: у неизвестной покупки не обычные надписи');
    $('court-close').click();
    info('Заявление: пустые кнопки, надписи по виду покупки, подсказки — проверены');
  }

  // ---------- 5. Заседание целиком ----------
  // Подать заявление и дождаться приговора. idx — номера ответов (null — оставить как есть, для обжалования)
  async function runCase(item, price, cur, idx, choice) {
    if (item !== null) {
      await typeItem(item);
      $('court-price').value = price; $('court-cur').value = cur || 'RUB';
      $('court-price').dispatchEvent(new Event('input'));
      document.querySelectorAll('.court-q').forEach(function (fs, qi) { const r = fs.querySelectorAll('input'); r[Math.min(idx[qi], r.length - 1)].checked = true; });
    }
    sign();
    $('court-form').requestSubmit();
    const btns = await until(function () { const b = document.querySelectorAll('.court-log__choice button'); return b.length && b; }, 'последнее слово');
    const texts = [].map.call(btns, function (b) { return b.textContent; });
    btns[choice].click();
    const v = await until(function () { return document.querySelector('.court-verdict'); }, 'приговор');
    return { verdict: v, choice: ['honest', 'plead', 'surrender'][choice], options: texts };
  }
  const kindOfVerdict = function (v) { return /is-free/.test(v.className) ? 'free' : /is-guilty/.test(v.className) ? 'guilty' : 'wait'; };
  const button = function (v, name) { return [].find.call(v.querySelectorAll('.court-btn'), function (x) { return x.textContent === name; }); };
  async function newCase(v) { const b = button(v, 'Новое дело'); (b || $('court-open')).click(); await sleep(300); }

  async function flowChecks() {
    $('court-open').click();
    let r = await runCase('пицца', 900, 'RUB', [0, 0, 0, 0, 0], 0);
    if (kindOfVerdict(r.verdict) !== 'free') fail('Ход дела: пицца с лучшими ответами — не «Оправдано»');
    if ($('court-archive-list').textContent.indexOf(C.kinds.food.questions[4]) < 0) fail('Архив: ответы записаны не надписями вида покупки');
    await newCase(r.verdict);
    r = await runCase('кофемашина', 90000, 'RUB', [2, 2, 2, 2, 2], 2);
    if (kindOfVerdict(r.verdict) === 'guilty') fail('Ход дела: «суду виднее» не смягчило «Виновно» до «Условно»');
    const br = button(r.verdict, 'Нарушить приговор');
    if (!br) fail('Ход дела: нет кнопки «Нарушить приговор»');
    else { br.click(); await sleep(200); if ($('court-archive-list').textContent.indexOf('нарушен') < 0) fail('Архив: нет отметки о нарушенном приговоре'); }
    await newCase(document.querySelector('.court-verdict'));
    r = await runCase('кофемашина', 90000, 'RUB', [2, 2, 2, 2, 2], 0);
    const ap = button(r.verdict, 'Обжаловать');
    if (!ap) fail('Ход дела: нет кнопки «Обжаловать»');
    else {
      ap.click(); await sleep(600);
      if ($('court-modal').hidden || $('court-item').value !== 'кофемашина' || document.querySelectorAll('#court-questions input:checked').length !== 5) fail('Обжалование: заявление открылось не с теми же данными');
      r = await runCase(null, 0, '', null, 2);
      const w = button(r.verdict, 'Отложить на 30 дней');
      if (w) { w.click(); await sleep(200); if ($('court-appeals').textContent.indexOf('кофемашина') < 0) fail('Условный срок: не появился'); }
    }
    $('court-archive-clear').click(); await sleep(100);
    if (!$('court-archive').hidden) fail('Архив: не очистился');
    await newCase(document.querySelector('.court-verdict'));
    info('Ход дела: оправдание, смягчение, нарушение приговора, обжалование, условный срок, архив — проверены');
  }

  // ---------- 6. Пробные заседания ----------
  const ITEMS = [['трусы', 1500], ['пицца', 900], ['шампунь', 700], ['стрижка', 2500], ['котёнок', 10000], ['щенок корги', 60000],
    ['попугай', 3000], ['такси', 800], ['торт', 1800], ['ботинки', 9000], ['блокнот', 500], ['музей', 700], ['лекарства', 1500],
    ['кофе', 800], ['букет', 3500], ['лотерея', 300], ['акции', 20000], ['кофемашина', 45000], ['айфон', 1200, 'USD'],
    ['квартира', 10000000], ['абвгдейка', 5000], ['самсунг', 900, 'EUR'], ['шоколадка', 90], ['пальто', 25000],
    ['наушники', 150, 'USD'], ['корм для кота', 900], ['телевизор 4K', 80000], ['продукты', 5000], ['машина', 3500000], ['игрушка для кота', 500]];
  const PROFILES = [[0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [3, 1, 1, 1, 1], [1, 0, 1, 0, 0], [3, 2, 2, 2, 2], [0, 1, 0, 1, 0], [2, 1, 0, 0, 1]];
  const CLOSING_ANY = /(Защита закончила|Обвинение закончило|У защиты всё|У обвинения всё|добавить нечего|нечего добавить|вопросов нет|Вопросов больше нет)/;
  const CLOSING_END = /(Защита закончила\.|Обвинение закончило\.|У защиты всё\.|У обвинения всё\.|нечего добавить\.|добавить нечего\.|вопросов нет\.|Вопросов больше нет\.)$/;
  const isProtest = function (s) { return /^(Ваша честь, )?(Возражаю|Протест|Протестую)/i.test(s); };
  // «Протест принят/отклонён» у судьи — решение, а не новый протест стороны.
  function remarkSplitsObjection(prev, next) {
    return !!(prev && (prev.who === 'Адвокат' || prev.who === 'Прокурор') &&
      isProtest(prev.text) && next && next.who === 'Судья');
  }
  function objectionChecks() {
    const judge = { who: 'Судья', text: 'Продолжаем.' };
    const cases = [
      ['Адвокат', 'Протестую! Это домыслы.', true],
      ['Прокурор', 'Ваша честь, возражаю! Это реклама.', true],
      ['Судья', 'Протест принят. Суд просит не увлекаться.', false],
      ['Судья', 'Протест отклонён. Продолжаем.', false],
      ['Адвокат', 'Покупку обдумывали давно.', false]
    ];
    cases.forEach(function (c) {
      if (remarkSplitsObjection({ who: c[0], text: c[1] }, judge) !== c[2]) fail('Проверка протестов: ' + c[0] + ': ' + c[1]);
    });
    info('Протесты: протесты сторон и решения судьи различаются — проверено');
  }

  const stems = function (t) { return (t.toLowerCase().replace(/ё/g, 'е').match(/[а-я]{5,}/g) || []).map(function (w) { return w.slice(0, 4); }); };
  const S = { cases: 0, free: 0, wait: 0, guilty: 0, interject: 0, closings: 0, essential: 0, prev: [] };

  function readLog() {
    return [].map.call(document.querySelectorAll('#court-log .court-log__line'), function (li) {
      const w = li.querySelector('.court-log__who');
      const who = w ? w.textContent.replace(/:$/, '') : '';
      const t = li.textContent;
      return { who: who, text: w ? t.slice(w.textContent.length).trim() : t.trim(), full: t, remark: li.classList.contains('is-remark'),
        witness: li.classList.contains('is-witness') };
    });
  }

  function checkHearing(no, item, idx, res) {
    const L = readLog(), v = res.verdict, vk = kindOfVerdict(v), g = findGroup(item), kind = kindOf(g);
    const tag = '#' + no + ' «' + item + '»: ';
    S.cases++; S[vk]++;
    const BAD = /\{\w+\}|undefined|NaN|\bnull\b|\s\s|\.\.(?!\.)|\s[,.!?]|,,/;
    L.concat([{ full: v.textContent }]).forEach(function (l) { if (BAD.test(l.full)) fail('Текст ' + tag + l.full.slice(0, 120)); });
    const av = avoidOf(kind);
    L.forEach(function (l, i) {
      const next = L[i + 1], prev = L[i - 1];
      // концовки — только в конце речи, после них сторона молчит, итог не повторяет реплику
      if ((l.who === 'Адвокат' || l.who === 'Прокурор') && CLOSING_ANY.test(l.text)) {
        S.closings++;
        if (!CLOSING_END.test(l.text)) fail('Концовка не в конце ' + tag + l.full);
        if (L.slice(i + 1).some(function (x) { return x.who === l.who; })) fail('После концовки сторона говорит ещё ' + tag + l.full);
        // Итог бывает из нескольких предложений («С питомцем лучше. Просто лучше.»): ошибка — только если
        // при любом разделении «реплика | итог» у них есть общее слово
        const body = l.text.match(/^(.*) (Защита закончила|Обвинение закончило)\.$/);
        if (body) {
          const parts = body[1].split(/(?<=[.!?…»]) /);
          let clean = parts.length < 2;
          for (let k = 1; k < parts.length && !clean; k++) {
            const own = stems(parts.slice(0, k).join(' '));
            clean = !stems(parts.slice(k).join(' ')).some(function (s) { return own.indexOf(s) >= 0; });
          }
          if (!clean) fail('Итог речи повторяет реплику ' + tag + l.full);
        }
      }
      // ремарки: не подряд, не между протестом и ответом судьи, не между выкриком Желания и судьёй
      if (l.remark) {
        if (prev && prev.remark) fail('Две ремарки подряд ' + tag + prev.text + ' | ' + l.text);
        if (remarkSplitsObjection(prev, next)) fail('Ремарка между протестом и ответом судьи ' + tag + prev.full + ' | ' + l.text + ' | ' + next.full);
        if (next && next.who === 'Желание' && /^\(/.test(next.text)) fail('Ремарка перед выкриком Желания ' + tag + l.text);
        if (/^(Входит|В зал входит|Дверь открывается)/.test(l.text) && prev && /говорите|слуша/i.test(prev.text)) fail('Свидетель входит после «говорите» ' + tag + prev.full);
      }
      // Желание вмешивается после прокурора (или после ответа судьи на протест), судья одёргивает
      if (l.who === 'Желание' && /^\(/.test(l.text)) {
        S.interject++;
        if (!prev || !/^(Прокурор|Судья)$/.test(prev.who)) fail('Желание вмешалось не после прокурора ' + tag + (prev ? prev.full : '—'));
        if (!next || next.who !== 'Судья') fail('Судья не одёрнул Желание ' + tag + l.text);
      }
      // свидетели говорят от первого лица, секретарь — не о себе
      if (l.witness && l.who !== 'Желание' && (/Свидетел[ья] (?!закончил)/.test(l.text) || /^Свидетель закончил/.test(l.text))) fail('Свидетель о себе в третьем лице ' + tag + l.full);
      if (l.who === 'Секретарь' && /^Секретарь /.test(l.text)) fail('Секретарь о себе в третьем лице ' + tag + l.full);
      // «чужие» слова для вида покупки (одежда — без «сломалась», еда — без «вещи» и т. п.)
      if (av && (l.who === 'Адвокат' || l.who === 'Прокурор') && av(l.text)) warn('Слово не для вида «' + kind + '» ' + tag + l.full);
    });
    // ответ судьи на последнее слово не спорит с приговором
    const R = C.lastWordReply;
    const lastWordAt = (function () { for (let i = L.length - 1; i >= 0; i--) if (L[i].who === 'Желание' && !/^\(/.test(L[i].text)) return i; return -1; })();
    const reply = lastWordAt >= 0 && L[lastWordAt + 1] ? L[lastWordAt + 1].text : '';
    const inList = function (k) { return R[k] && R[k].indexOf(reply) >= 0; };
    if (vk === 'guilty' && (inList('honest') || inList('pleadYes'))) fail('Судья смягчился, а приговор «Виновно» ' + tag + reply);
    if (vk === 'free' && (inList('pleadNo') || inList('surrender'))) fail('Ответ судьи не к «Оправдано» ' + tag + reply);
    // первая необходимость — не строже «Условно»
    const need = !!(g && C.essential.groups.indexOf(g.name) >= 0) && idx[1] !== 2 && (idx[0] <= 1 || idx[1] <= 1);
    if (need) { S.essential++; if (vk === 'guilty') fail('Первая необходимость получила «Виновно» ' + tag + idx.join('')); }
    // фразы не повторяются в соседних делах
    const cur = L.map(function (l) { return l.full; }).filter(function (t) { return t.length > 25 && !/Слушается дело/.test(t) && !/^Желание: [^(]/.test(t); });
    cur.forEach(function (t) { if (S.prev.indexOf(t) >= 0) fail('Фраза повторилась в соседних делах ' + tag + t.slice(0, 100)); });
    S.prev = cur;
  }

  async function hearings(n) {
    $('court-open').click();
    let appeal = false, last = null;
    for (let no = 1; no <= n; no++) {
      let res, item, idx;
      if (appeal) { item = last.item; idx = last.idx; res = await runCase(null, 0, '', null, Math.floor(Math.random() * 3)); }
      else {
        const it = ITEMS[(no - 1) % ITEMS.length];
        item = it[0];
        idx = Math.random() < 0.5 ? pick(PROFILES).slice() : [0, 1, 2, 3, 4].map(function (qi) { return Math.floor(Math.random() * C.questions[qi].answers.length); });
        res = await runCase(item, it[1], it[2], idx, Math.floor(Math.random() * 3));
      }
      checkHearing(no, item, idx, res);
      last = { item: item, idx: idx };
      const acts = [].slice.call(res.verdict.querySelectorAll('.court-verdict__actions .court-btn'));
      const ap = acts.find(function (b) { return b.textContent === 'Обжаловать'; });
      appeal = !!ap && Math.random() < 0.2;
      if (appeal) { ap.click(); await sleep(600); continue; }
      const other = acts.filter(function (b) { return b.textContent !== 'Обжаловать' && b.textContent !== 'Новое дело'; });
      if (other.length) { pick(other).click(); await sleep(150); }
      await newCase(document.querySelector('.court-verdict'));
    }
    info('Заседания: ' + S.cases + ' (оправдано ' + S.free + ', условно ' + S.wait + ', виновно ' + S.guilty + '); ' +
      'концовок ' + S.closings + ', выкриков Желания ' + S.interject + ', дел о первой необходимости ' + S.essential);
  }

  // ---------- Отчёт ----------
  function report() {
    (window.TEST_ERR || []).forEach(function (e) { fail('Ошибка на странице: ' + e); });
    const out = [];
    out.push(FAIL.length ? 'ЕСТЬ ОШИБКИ: ' + FAIL.length : 'Всё в порядке');
    INFO.forEach(function (m) { out.push('  ' + m); });
    if (FAIL.length) { out.push(''); out.push('Ошибки:'); FAIL.forEach(function (m) { out.push('  FAIL ' + m); }); }
    if (WARN.length) { out.push(''); out.push('Стоит посмотреть:'); WARN.forEach(function (m) { out.push('  WARN ' + m); }); }
    const pre = document.createElement('pre');
    pre.id = 'REPORT';
    pre.textContent = out.join('\n');
    document.body.append(pre);
  }

  async function main() {
    try {
      objectionChecks();
      staticChecks();
      recognitionChecks();
      pageChecks();
      await formChecks();
      await flowChecks();
      await hearings(window.TEST_CASES || 100);
    } catch (e) {
      fail('Проверка прервалась: ' + e.message);
    }
    report();
  }

  window.addEventListener('load', function () { setTimeout(main, 1500); });
})();
