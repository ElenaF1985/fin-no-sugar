// Калькулятор: открывается из меню в окошке, которое можно перетаскивать за верхнюю полосу.
// Считает как обычный настольный калькулятор (каждое действие — сразу), плюс кнопки НДС и «Копировать».
// История последних 5 вычислений, ставка НДС и место окошка запоминаются в браузере читателя.

(function () {
  const win = document.getElementById('calc');
  const bar = document.getElementById('calc-bar');
  const exprBox = document.getElementById('calc-expr');
  const valueBox = document.getElementById('calc-value');
  const infoBox = document.getElementById('calc-info');
  const historyBox = document.getElementById('calc-history');
  const rateBtn = win.querySelector('[data-key="rate"]');

  const VAT_RATES = [22, 10];       // основная ставка НДС с 2026 года и льготная
  const HISTORY_SIZE = 5;
  const MAX_DIGITS = 15;
  const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const load = U.load;
  const save = U.save;

  // ---------- Числа ----------

  // Результат в строку для ввода: без ошибок двоичной дроби (0,1 + 0,2 = 0,3), не больше 10 знаков после запятой
  function toEntry(n) {
    if (!isFinite(n) || Math.abs(n) >= 1e15) return null;
    const clean = Number(n.toPrecision(15));
    if (Math.abs(clean) < 1e-10) return '0';
    return clean.toFixed(10).replace(/\.?0+$/, '');
  }

  // «1234567.5» → «1 234 567,5» (неразрывные пробелы между разрядами)
  function format(entry) {
    const neg = entry.charAt(0) === '-';
    const parts = (neg ? entry.slice(1) : entry).split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + int + (parts.length > 1 ? ',' + parts[1] : '');
  }

  function fmt(n) { return format(toEntry(n) || '0'); }

  function money(n) { return format(n.toFixed(2)); } // суммы в пояснении НДС — всегда с копейками

  function round2(n) { return Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100; }

  // ---------- Состояние ----------

  let entry = '0';        // число на табло, как его вводят: «1234.5»
  let acc = null;         // первое число действия
  let op = null;          // ожидающее действие: + - * /
  let fresh = true;       // следующая цифра начинает новое число
  let hasEntry = false;   // число на табло — второе число действия
  let rate = load('calc-rate', VAT_RATES[0]);
  if (VAT_RATES.indexOf(rate) < 0) rate = VAT_RATES[0]; // запомнена ставка, которой больше нет (например, 20%)
  let history = load('calc-history', []);
  let infoTimer = null;
  let error = false;      // на табло «Ошибка» — до следующей кнопки

  function render() {
    const shown = error ? 'Ошибка' : format(entry);
    valueBox.textContent = shown;
    valueBox.classList.toggle('is-long', shown.length > 14);
    rateBtn.textContent = 'НДС ' + rate + '%';
  }

  function setInfo(text, temporary) {
    clearTimeout(infoTimer);
    infoBox.textContent = text;
    if (temporary) infoTimer = setTimeout(function () { infoBox.textContent = ''; }, 1500);
  }

  function reset() {
    entry = '0'; acc = null; op = null; fresh = true; hasEntry = false;
    exprBox.textContent = '';
    setInfo('');
  }

  function fail(message) {
    reset();
    setInfo(message);
    error = true;
  }

  function compute(a, o, b) {
    if (o === '+') return a + b;
    if (o === '-') return a - b;
    if (o === '*') return a * b;
    return a / b;
  }

  // Записывает результат на табло; false — если число не помещается
  function show(n) {
    const e = toEntry(n);
    if (e === null) { fail(isFinite(n) ? 'Слишком большое число' : 'Деление на ноль'); return false; }
    entry = e;
    fresh = true;
    return true;
  }

  function addHistory(text, n) {
    history.unshift({ text: text, value: toEntry(n) });
    history = history.slice(0, HISTORY_SIZE);
    save('calc-history', history);
    renderHistory();
  }

  function renderHistory() {
    historyBox.innerHTML = '';
    history.forEach(function (h) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = 'Подставить результат';
      btn.textContent = h.text + ' ' + format(h.value);
      btn.addEventListener('click', function () {
        entry = h.value; fresh = true; hasEntry = true;
        render();
      });
      li.append(btn);
      historyBox.append(li);
    });
    document.getElementById('calc-past').hidden = !history.length;
  }

  // «Очистить» — стирает только историю, число на табло остаётся
  document.getElementById('calc-clear').addEventListener('click', function () {
    history = [];
    save('calc-history', history);
    renderHistory();
  });

  // ---------- Действия ----------

  function digit(d) {
    if (fresh) { entry = '0'; fresh = false; setInfo(''); }
    if (entry.replace(/[-.]/g, '').length >= MAX_DIGITS) return;
    entry = entry === '0' ? d : entry === '-0' ? '-' + d : entry + d;
    hasEntry = true;
  }

  function dot() {
    if (fresh) { entry = '0'; fresh = false; setInfo(''); }
    if (entry.indexOf('.') < 0) entry += '.';
    hasEntry = true;
  }

  function backspace() {
    if (fresh) return;
    entry = entry.slice(0, -1);
    if (entry === '' || entry === '-') entry = '0';
  }

  function negate() {
    if (entry === '0') return;
    entry = entry.charAt(0) === '-' ? entry.slice(1) : '-' + entry;
  }

  function operator(o) {
    const v = Number(entry);
    if (op !== null && hasEntry) {
      if (op === '/' && v === 0) { fail('Деление на ноль'); return; }
      if (!show(compute(acc, op, v))) return;
    } else if (op === null) {
      fresh = true;
    }
    acc = Number(entry);
    op = o;
    hasEntry = false;
    exprBox.textContent = fmt(acc) + ' ' + SYMBOLS[o];
  }

  function equals() {
    if (op === null) return;
    const v = Number(entry);
    if (op === '/' && v === 0) { fail('Деление на ноль'); return; }
    const text = fmt(acc) + ' ' + SYMBOLS[op] + ' ' + fmt(v) + ' =';
    const r = compute(acc, op, v);
    if (!show(r)) return;
    exprBox.textContent = text;
    addHistory(text, r);
    acc = null; op = null; hasEntry = false;
  }

  // Процент: при + и − — процент от первого числа (1 000 + 5% = 1 050), при × и ÷ — просто сотая доля
  function percent() {
    const v = Number(entry);
    const p = (op === '+' || op === '-') ? acc * v / 100 : v / 100;
    if (show(p)) hasEntry = true;
  }

  // НДС: «+НДС» — начислить на сумму, «−НДС» — выделить из суммы с НДС. Суммы — до копеек
  function vat(add) {
    if (op !== null && hasEntry) equals();
    if (error) return;
    if (op !== null) { op = null; acc = null; }
    const v = Number(entry);
    const tax = round2(add ? v * rate / 100 : v * rate / (100 + rate));
    const r = round2(add ? v + tax : v - tax);
    const text = fmt(v) + (add ? ' + НДС ' : ' − НДС ') + rate + '% =';
    if (!show(r)) return;
    exprBox.textContent = text;
    setInfo('НДС ' + rate + '%: ' + money(tax) + ' · ' + (add ? 'без НДС: ' : 'с НДС: ') + money(v));
    addHistory(text, r);
    hasEntry = true;
  }

  function toggleRate() {
    rate = VAT_RATES[(VAT_RATES.indexOf(rate) + 1) % VAT_RATES.length];
    save('calc-rate', rate);
  }

  // Копирование — с запятой и без пробелов, чтобы Excel понял число
  function copy() {
    const text = entry.replace('.', ',');
    function done() { setInfo('Скопировано: ' + text, true); }
    function fallback() {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (e) { setInfo('Не удалось скопировать', true); }
      area.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  // ---------- Курс $ и € из плитки «Курс на дату» (js/rates.js) ----------

  const CURRENCY = { USD: '$', EUR: '€' };
  const rateKeys = win.querySelectorAll('.calc__rate');

  function updateRateKeys() {
    const r = window.DAY_RATE;
    rateKeys.forEach(function (btn) {
      const code = btn.dataset.key;
      btn.disabled = !r;
      btn.querySelector('span').textContent = CURRENCY[code] + (r ? ' на ' + r.date : ' на дату');
      btn.querySelector('small').textContent = !r ? 'курс загружается' : r.today ? 'курс на сегодня' : 'дата из «Курса на дату»';
      btn.title = r ? 'Подставить курс ' + code + ' ЦБ на ' + r.date : 'Курс ещё не загрузился';
    });
  }

  // Курс встаёт на табло как набранное число — с ним можно дальше считать: 1 000 × курс =
  function insertRate(code) {
    const r = window.DAY_RATE;
    if (!r) return;
    entry = toEntry(r[code]);
    fresh = true;
    hasEntry = true;
    setInfo('Курс ' + code + ' на ' + r.date + ': ' + format(r[code].toFixed(4)));
  }

  document.addEventListener('dayrate', updateRateKeys);

  function press(key) {
    if (error && key !== 'rate') error = false; // после ошибки считаем заново с нуля
    if (/^\d$/.test(key)) digit(key);
    else if (key === '.') dot();
    else if (SYMBOLS[key]) operator(key);
    else if (key === '=') equals();
    else if (key === 'C') reset();
    else if (key === 'back') backspace();
    else if (key === 'neg') negate();
    else if (key === '%') percent();
    else if (key === 'vat+') vat(true);
    else if (key === 'vat-') vat(false);
    else if (key === 'rate') toggleRate();
    else if (key === 'copy') copy();
    else if (CURRENCY[key]) insertRate(key);
    render();
  }

  win.querySelectorAll('[data-key]').forEach(function (btn) {
    btn.addEventListener('click', function () { press(btn.dataset.key); });
  });

  // Клавиатура — только пока окошко открыто и курсор не в поле ввода (например, в дате курса)
  const KEYS = { ',': '.', '.': '.', 'Enter': '=', '=': '=', 'Backspace': 'back', 'Delete': 'C', '%': '%',
    '+': '+', '-': '-', '*': '*', '/': '/' };
  document.addEventListener('keydown', function (e) {
    if (win.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    // Esc сначала закрывает увеличенную картинку или график: тот Esc уже обработан (preventDefault),
    // а пока окошко открыто, калькулятор клавиатуру не слушает
    if (e.defaultPrevented || document.querySelector('.lightbox:not([hidden])')) return;
    if (e.key === 'Escape') { close(); return; }
    const key = /^\d$/.test(e.key) ? e.key : KEYS[e.key];
    if (!key) return;
    e.preventDefault(); // иначе Enter ещё раз нажмёт кнопку, на которой стоит фокус
    press(key);
  });

  // ---------- Окошко: открыть, закрыть, перетащить ----------

  // Окошко целиком на экране, и крестик на углу (выступает на 16 px) тоже; если экран сузили — подвигаем
  const EDGE = 16;
  function place(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - win.offsetWidth - EDGE);
    const maxTop = Math.max(EDGE, window.innerHeight - win.offsetHeight);
    win.style.left = Math.min(Math.max(0, left), maxLeft) + 'px';
    win.style.top = Math.min(Math.max(EDGE, top), maxTop) + 'px';
  }

  const navBtn = document.getElementById('nav-calc');

  function open() {
    win.hidden = false;
    navBtn.setAttribute('aria-expanded', 'true');
    const pos = load('calc-pos', null);
    if (pos) place(pos.left, pos.top);
    else place(window.innerWidth - win.offsetWidth - 24, 80); // в первый раз — справа сверху
    document.getElementById('calc-close').focus();
  }

  function close() {
    win.hidden = true;
    navBtn.setAttribute('aria-expanded', 'false');
    navBtn.focus();
  }

  navBtn.addEventListener('click', function () {
    if (win.hidden) open(); else close();
  });
  document.getElementById('calc-close').addEventListener('click', close);

  let drag = null;
  bar.addEventListener('pointerdown', function (e) {
    drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже тащится */ }
    win.classList.add('is-dragging');
  });
  bar.addEventListener('pointermove', function (e) {
    if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  function drop() {
    if (!drag) return;
    drag = null;
    win.classList.remove('is-dragging');
    save('calc-pos', { left: win.offsetLeft, top: win.offsetTop });
  }
  bar.addEventListener('pointerup', drop);
  bar.addEventListener('pointercancel', drop);
  window.addEventListener('resize', function () {
    if (!win.hidden) place(win.offsetLeft, win.offsetTop);
  });

  render();
  renderHistory();
  updateRateKeys();
})();
