// Горящие сроки: берёт сроки из data/deadlines.js. Сверху — сроки на сегодня,
// в свёрнутом блоке — на неделю вперёд. Нет сроков сегодня и в ближайшие 7 дней — раздел и пункт меню скрыты.
// День считается по дате на компьютере читателя.

(function () {
  const section = document.getElementById('deadlines');
  const navLink = document.getElementById('nav-deadlines');
  const list = document.getElementById('deadlines-list');
  const table = document.getElementById('deadlines-table-body');

  const WEEK_DAYS = 7;      // «Сроки на неделю» — с завтрашнего дня на 7 дней вперёд
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parse = U.parseRu; // "28.10.2026" → дата
  const el = U.el;

  const all = window.DEADLINES || [];
  const todays = all.filter(function (d) { return parse(d.date).getTime() === today.getTime(); });

  const until = new Date(today);
  until.setDate(until.getDate() + WEEK_DAYS);
  const week = all
    .map(function (d) { return { d: d, day: parse(d.date) }; })
    .filter(function (x) { return x.day > today && x.day <= until; })
    .sort(function (a, b) { return a.day - b.day; }); // в один день — в порядке файла (сортировка устойчивая)

  if (!todays.length && !week.length) return; // раздел остаётся скрытым

  list.hidden = !todays.length;

  section.hidden = false;
  navLink.hidden = false;

  // ---------- Сроки на сегодня ----------

  if (todays.length) {
    const li = el('li', 'deadline is-hot');
    const when = el('div', 'deadline__when');
    when.append(
      el('span', 'deadline__day', String(today.getDate())),
      el('span', 'deadline__month', MONTHS[today.getMonth()] + ', ' + WEEKDAYS[today.getDay()])
    );
    const body = el('div');
    body.append(el('p', 'deadline__left', 'сегодня'));
    const ul = el('ul', 'deadline__items');
    todays.forEach(function (item) {
      const row = el('li');
      row.append(el('span', 'deadline__tag', item.tax), document.createTextNode(item.title));
      if (item.note) row.append(el('span', 'deadline__note', item.note));
      ul.append(row);
    });
    body.append(ul);
    li.append(when, body);
    list.append(li);
  }

  // ---------- Сроки на неделю: с завтрашнего дня ----------

  table.innerHTML = '';
  if (!week.length) {
    table.innerHTML = '<tr><td colspan="4" class="rate-table__wait">На ближайшую неделю сроков нет.</td></tr>';
  }
  week.forEach(function (x, n) {
    const first = n === 0 || week[n - 1].d.date !== x.d.date; // дату пишем только у первой строки дня
    const tr = el('tr', first ? 'is-first' : '');
    tr.append(
      el('td', 'deadlines-table__date', first ? x.d.date : ''),
      el('td', 'deadlines-table__tax', x.d.tax),
      el('td', '', x.d.title + (x.d.note ? ' (' + x.d.note + ')' : '')),
      el('td', 'deadlines-table__law', x.d.law || '')
    );
    table.append(tr);
  });

  const last = all.reduce(function (max, d) {
    const day = parse(d.date);
    return day > max ? day : max;
  }, today);
  document.getElementById('deadlines-until').textContent =
    'Календарь заполнен по ' + U.ruDate(U.isoOf(last)) + '.';
})();
