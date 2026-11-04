// Общие мелочи для всех разделов: элемент страницы, память браузера, даты, склонение слов.
// Подключается первым, остальные файлы берут функции из window.U.

(function () {
  // Элемент с классом и текстом: el('p', 'news__text', 'Текст')
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Память браузера (localStorage). Может быть недоступна (закрытое окно, запрет сайтам) —
  // тогда читаем значение по умолчанию и просто не запоминаем
  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* не запоминаем */ }
  }

  // 1 день, 2 дня, 5 дней, 21 день: plural(n, 'день', 'дня', 'дней')
  function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  // Дата → "2026-10-25" по часам компьютера (без перевода часовых поясов)
  function isoOf(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }
  function todayIso() { return isoOf(new Date()); }

  // "2026-10-15" → "15.10.2026"
  function ruDate(iso) {
    const p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  // "28.10.2026" → дата (полночь)
  function parseRu(s) {
    const p = s.split('.');
    return new Date(+p[2], +p[1] - 1, +p[0]);
  }

  // Ссылка из данных — только обычная веб-ссылка (http/https), иначе «#»
  function safeUrl(url) { return /^https?:\/\//i.test(url || '') ? url : '#'; }

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  window.U = {
    el: el, load: load, save: save, plural: plural,
    isoOf: isoOf, todayIso: todayIso, ruDate: ruDate, parseRu: parseRu, safeUrl: safeUrl, MONTHS: MONTHS
  };
})();
