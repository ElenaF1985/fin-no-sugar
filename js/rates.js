// Курсы валют ЦБ РФ: плитки (текущий курс и курс на выбранную дату), график и таблица за 7 или 14 последних курсов
// или за выбранный период, выгрузка таблицы в CSV.
// Данные — файл data/rates.js (курсы ЦБ с 1 января 2023, его пополняет update-rates.ps1),
// а всё, чего в файле нет, — зеркало официальных курсов ЦБ cbr-xml-daily.ru
// (сайт ЦБ не отдаёт данные браузеру напрямую). Зеркало не любит частых запросов,
// поэтому из сети догружаются только дни новее файла — обычно один-два.

(function () {
  const BASE = 'https://www.cbr-xml-daily.ru';
  const CODES = ['USD', 'EUR'];
  const DAYS = 14; // сколько курсов загружаем — по максимуму переключателя 7 / 14
  const FIRST_DAY = '2023-01-01'; // начало data/rates.js — раньше этой даты выбрать нельзя
  const ruDate = U.ruDate;
  const todayIso = U.todayIso;

  // ---------- Вспомогательные функции ----------

  // "2026-10-15T11:30:00+03:00" → "2026-10-15" (без перевода часовых поясов)
  function isoDay(cbrDate) {
    return cbrDate.slice(0, 10);
  }

  // "2026-10-15", -1 → "2026-10-14"; переход через месяц и год считается сам
  function addDays(day, n) {
    const p = day.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }

  function rate(data, code) {
    const v = data.Valute[code];
    return v.Value / v.Nominal;
  }

  function money(n) {
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  function loadJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- Курсы из файла data/rates.js ----------

  // День → курс в том же виде, в каком его отдаёт зеркало ЦБ
  const fileDays = {};
  let fileFirst = '';
  let fileLast = '';

  if (window.RATES && RATES.days.length) {
    RATES.days.forEach(function (r, i) {
      const prev = RATES.days[i - 1] || r; // Previous — для плиток, если сайт работает без связи
      fileDays[r[0]] = {
        Date: r[0],
        PreviousDate: RATES.days[i - 1] ? prev[0] : null,
        Valute: {
          USD: { Value: r[1], Nominal: 1, Previous: prev[1] },
          EUR: { Value: r[2], Nominal: 1, Previous: prev[2] }
        }
      };
    });
    fileFirst = RATES.days[0][0];
    fileLast = RATES.days[RATES.days.length - 1][0];
  }

  // Последний день из файла раньше заданного: "2026-10-16" → "2026-10-15"
  function fileDayBefore(day) {
    if (!fileLast) return null;
    for (let i = RATES.days.length - 1; i >= 0; i--) {
      if (RATES.days[i][0] < day) return fileDays[RATES.days[i][0]];
    }
    return null;
  }

  // ---------- Свежий курс: кэш на 1 час и резерв, если источник недоступен ----------
  // Последний ответ источника хранится в браузере. Если ему меньше часа — источник не спрашиваем.
  // Если источник недоступен — берём самое свежее из сохранённого ответа и файла data/rates.js.

  const LATEST_KEY = 'fin-no-sugar:cbr-latest';
  const LATEST_TTL = 60 * 60 * 1000; // 1 час

  // Хранилище браузера может быть недоступно (приватный режим, запрет сайтам) — тогда работаем без кэша
  function readLatest() {
    try {
      const saved = JSON.parse(localStorage.getItem(LATEST_KEY));
      return saved && saved.data && saved.data.Valute ? saved : null;
    } catch (e) {
      return null;
    }
  }

  function saveLatest(data) {
    try {
      localStorage.setItem(LATEST_KEY, JSON.stringify({ savedAt: Date.now(), data: data }));
    } catch (e) { /* не сохранилось — не страшно */ }
  }

  // Источник или сеть по пути могут отдать устаревший курс — тогда берём более свежий из файла
  function newest(data) {
    return fileLast && fileLast > isoDay(data.Date) ? fileDays[fileLast] : data;
  }

  // → { data: курс ЦБ, offline: true, если источник недоступен и курс из сохранённых данных }
  function loadLatest() {
    const saved = readLatest();
    if (saved && Date.now() - saved.savedAt < LATEST_TTL) {
      return Promise.resolve({ data: newest(saved.data), offline: false });
    }

    return loadJson(BASE + '/daily_json.js').then(function (data) {
      saveLatest(data);
      return { data: newest(data), offline: false };
    }, function (err) {
      let best = saved ? saved.data : null;
      if (fileLast && (!best || fileLast > isoDay(best.Date))) best = fileDays[fileLast];
      if (!best) throw err;
      return { data: best, offline: true };
    });
  }

  // ---------- Последние 14 курсов ----------

  // От свежего курса идём назад по ссылке PreviousURL — так пропускаются выходные.
  // Предыдущие дни, которые есть в файле, берём из файла — без ожидания.
  // Источник недоступен — переходим к ближайшему более раннему дню из файла.
  function loadLastDays(latest) {
    const result = [];

    function add(data) {
      result.push(data);
      if (result.length >= DAYS) return result;
      const prev = data.PreviousDate && fileDays[isoDay(data.PreviousDate)];
      if (prev) return add(prev);
      if (!data.PreviousURL) return result;
      return loadJson('https:' + data.PreviousURL).then(add, function () {
        const before = fileDayBefore(isoDay(data.Date));
        return before ? add(before) : result;
      });
    }

    return Promise.resolve(add(latest));
  }

  function renderTiles(latest) {
    CODES.forEach(function (code) {
      const tile = document.querySelector('.tile[data-code="' + code + '"]');
      const v = latest.Valute[code];
      const now = rate(latest, code);
      const diff = now - v.Previous / v.Nominal;

      tile.querySelector('.tile__day').textContent = ruDate(isoDay(latest.Date));
      tile.querySelector('.tile__value').textContent = money(now) + '\u00A0₽';

      const delta = tile.querySelector('.tile__delta');
      const arrow = diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : '';
      delta.textContent = arrow + money(diff) + ' к ' + ruDate(isoDay(latest.PreviousDate));
      delta.classList.toggle('is-up', diff > 0);
      delta.classList.toggle('is-down', diff < 0);
    });
  }

  // ---------- Курсы за период ----------

  // Архив ЦБ за день. Если в этот день курс не устанавливался (выходной, праздник), архива нет.
  function archiveUrl(day) {
    const p = day.split('-');
    return BASE + '/archive/' + p[0] + '/' + p[1] + '/' + p[2] + '/daily_json.js';
  }

  // Уже известные дни: день → курс ЦБ или null, если в этот день ЦБ курс не устанавливал
  const cache = {};

  // Архив отвечает на выходной так же, как при обрыве связи, поэтому любая ошибка = «курса нет».
  // Такие дни не запоминаем: при следующем запросе проверим ещё раз.
  function loadDay(day) {
    if (day in cache) return Promise.resolve(cache[day]);
    if (day >= fileFirst && day <= fileLast) return Promise.resolve(fileDays[day] || null);
    return loadJson(archiveUrl(day)).then(function (data) {
      cache[day] = data;
      return data;
    }, function () {
      return null;
    });
  }

  // Загружаем дни не все сразу, а по несколько штук — чтобы не перегружать источник
  function loadEach(list, worker, limit) {
    const results = new Array(list.length);
    let next = 0;

    function run() {
      if (next >= list.length) return Promise.resolve();
      const i = next++;
      return worker(list[i]).then(function (r) {
        results[i] = r;
        return run();
      });
    }

    const runners = [];
    for (let k = 0; k < Math.min(limit, list.length); k++) runners.push(run());
    return Promise.all(runners).then(function () { return results; });
  }

  // Если на день курс не устанавливался — ищем ближайший предыдущий: он и действовал в этот день
  function findRateOn(day, triesLeft) {
    return loadDay(day).then(function (data) {
      if (data) return data;
      if (triesLeft <= 0) throw new Error('not found');
      return findRateOn(addDays(day, -1), triesLeft - 1);
    });
  }

  // Строки таблицы на каждый календарный день периода, новые сверху.
  // Строка: { day: "2026-10-11", data: курс ЦБ, from: "2026-10-10" — дата, от которой этот курс }
  function loadPeriod(from, to) {
    const list = [];
    for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);

    return loadEach(list, loadDay, 12).then(function (found) {
      // Первый день периода выпал на выходной — берём курс, действовавший до него
      const first = found[0] ? Promise.resolve(found[0]) : findRateOn(addDays(from, -1), 10);

      return first.then(function (current) {
        return list.map(function (day, i) {
          if (found[i]) current = found[i];
          return { day: day, data: current, from: isoDay(current.Date) };
        }).reverse();
      });
    });
  }

  // ---------- Таблица и график ----------

  function renderTable(rows) {
    const body = document.getElementById('rate-table-body');
    body.innerHTML = '';
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      if (row.from !== row.day) {
        tr.className = 'is-carried';
        tr.title = 'ЦБ курс не устанавливал — действует курс от ' + ruDate(row.from);
      }
      [ruDate(row.day), money(rate(row.data, 'USD')), money(rate(row.data, 'EUR'))]
        .forEach(function (text) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        });
      body.append(tr);
    });
  }

  let chart = null;

  // Подписи дат, курсы и размер точек для графика по строкам таблицы
  function chartData(rows) {
    const ordered = rows.slice().reverse(); // на графике — от старых к новым
    return {
      // Период длиннее двух месяцев может захватить разные годы — тогда в подписях и год: "15.10.26"
      labels: ordered.map(function (r) {
        const d = ruDate(r.day);
        return rows.length > 62 ? d.slice(0, 6) + d.slice(8) : d.slice(0, 5);
      }),
      values: function (code) {
        return ordered.map(function (r) { return rate(r.data, code); });
      },
      // Чем длиннее период, тем мельче точки — иначе график превращается в кашу
      pointRadius: rows.length > 31 ? 0 : rows.length > 14 ? 2 : 4
    };
  }

  // Щелчок внутри области с линиями, а не по подписям USD / EUR над ней
  function inPlotArea(e, c) {
    const a = c.chartArea;
    return e.x >= a.left && e.x <= a.right && e.y >= a.top && e.y <= a.bottom;
  }

  // Один и тот же график для страницы и для окошка; extra — дополнительные настройки
  function makeChart(canvas, rows, extra) {
    const d = chartData(rows);
    const styles = getComputedStyle(document.documentElement);
    const colors = { USD: styles.getPropertyValue('--tea').trim(), EUR: styles.getPropertyValue('--eur').trim() };

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: CODES.map(function (code) {
          return {
            label: code,
            data: d.values(code),
            borderColor: colors[code],
            backgroundColor: colors[code],
            borderWidth: 2,
            pointRadius: d.pointRadius,
            tension: 0.25
          };
        })
      },
      options: Object.assign({
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.dataset.label + ': ' + money(ctx.parsed.y) + '\u00A0₽'; }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: function (v) { return v.toLocaleString('ru-RU') + ' ₽'; } } }
        }
      }, extra)
    });
  }

  function renderChart(rows) {
    if (!window.Chart) return; // библиотека графиков не загрузилась — таблица всё равно есть

    // График уже нарисован — при переключении периода только меняем данные
    if (chart) {
      const d = chartData(rows);
      chart.data.labels = d.labels;
      chart.data.datasets.forEach(function (ds) {
        ds.data = d.values(ds.label);
        ds.pointRadius = d.pointRadius;
      });
      chart.update();
      return;
    }

    chart = makeChart(document.getElementById('rate-chart'), rows, {
      // Над линиями — курсор-«лупа», щелчок открывает увеличенный график
      onHover: function (e, items, c) {
        c.canvas.style.cursor = inPlotArea(e, c) ? 'zoom-in' : '';
      },
      onClick: function (e, items, c) {
        if (inPlotArea(e, c)) openBigChart();
      }
    });
  }

  // ---------- Увеличенный график в окошке ----------
  // Те же данные и подсказки, что на странице; скрытая на странице линия скрыта и здесь.
  // Закрыть — крестик, щелчок по фону вокруг окошка или Esc. При закрытии крупный график убирается.

  const chartBox = document.getElementById('chart-lightbox');
  const chartBoxClose = document.getElementById('chart-lightbox-close');
  let bigChart = null;

  function openBigChart() {
    if (!shownRows.length) return;
    chartBox.hidden = false; // сначала показываем окошко — иначе графику не от чего взять размер
    document.body.classList.add('lightbox-open');
    bigChart = makeChart(document.getElementById('rate-chart-big'), shownRows);
    bigChart.data.datasets.forEach(function (ds, i) {
      ds.hidden = !chart.isDatasetVisible(i);
    });
    bigChart.update();
    chartBoxClose.focus();
  }

  function closeBigChart() {
    chartBox.hidden = true;
    document.body.classList.remove('lightbox-open');
    if (bigChart) bigChart.destroy();
    bigChart = null;
  }

  chartBoxClose.addEventListener('click', closeBigChart);
  chartBox.addEventListener('click', function (e) {
    if (e.target === chartBox) closeBigChart();
  });
  // preventDefault — знак калькулятору (js/calc.js), что этот Esc уже закрыл окошко
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !chartBox.hidden) { closeBigChart(); e.preventDefault(); }
  });

  // ---------- Переключатель 7 / 14 / Период ----------

  const periodButtons = document.querySelectorAll('.period button');
  const periodToggle = document.getElementById('period-toggle');
  const periodForm = document.getElementById('period-form');
  const fromInput = document.getElementById('period-from');
  const toInput = document.getElementById('period-to');
  const periodSubmit = document.getElementById('period-submit');
  const periodNote = document.getElementById('period-note');
  const exportBtn = document.getElementById('export-btn');

  let allDays = [];
  let shownRows = []; // что сейчас в таблице — это и выгружается в CSV
  let request = 0; // номер последнего запроса: ответ на устаревший запрос не показываем

  function showRows(rows) {
    shownRows = rows;
    renderTable(rows);
    renderChart(rows);
  }

  function press(button) {
    periodButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === button));
    });
  }

  const periodHint = periodNote.textContent; // «Любой период с 01.01.2023.»

  function showLast(count) {
    request++; // если в это время грузился период — он больше не нужен
    periodNote.textContent = periodHint; // и надпись «Загрузка…» не должна остаться
    periodSubmit.disabled = false;
    showRows(allDays.slice(0, count).map(function (d) {
      return { day: isoDay(d.Date), data: d, from: isoDay(d.Date) };
    }));
  }

  periodButtons.forEach(function (b) {
    if (b === periodToggle) return;
    b.addEventListener('click', function () {
      if (!allDays.length) return;
      press(b);
      periodForm.hidden = true;
      showLast(+b.dataset.days);
    });
  });

  // «Период» только открывает свои поля — график меняется после «Показать»
  periodToggle.addEventListener('click', function () {
    if (!allDays.length) return;
    press(periodToggle);
    periodForm.hidden = false;
  });

  // ---------- Плитка «Курс на дату» ----------
  // Только курс USD и EUR на выбранную дату — без изменений к предыдущему дню.
  // Если на дату курс не устанавливался (выходной, праздник), показываем тот, что действовал.

  const dayInput = document.getElementById('day-input');
  const dayResult = document.getElementById('day-result');
  let dayRequest = 0;

  function dayNote(text) {
    dayResult.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'tile__wait';
    p.textContent = text;
    dayResult.append(p);
  }

  // Курс для кнопок калькулятора (js/calc.js): на дату из плитки, а если она не выбрана — на сегодня.
  // window.DAY_RATE = { date: '12.10.2026', today: false, USD: 80.53, EUR: 90.1 } или null; событие 'dayrate'
  let todayRate = null;

  function publishRate(day, data, isToday) {
    window.DAY_RATE = data ? { date: ruDate(day), today: isToday, USD: rate(data, 'USD'), EUR: rate(data, 'EUR') } : null;
    document.dispatchEvent(new CustomEvent('dayrate'));
  }

  function publishToday() {
    publishRate(todayIso(), todayRate, true);
  }

  function showDay() {
    const asked = dayInput.value; // "2026-10-12"
    if (!asked) { // дату стёрли — плитка снова пустая
      dayRequest++;
      dayResult.innerHTML = '';
      publishToday();
      return;
    }

    if (asked > dayInput.max) {
      dayNote('Курс на эту дату ЦБ ещё не установил.');
      publishToday();
      return;
    }
    if (asked < dayInput.min) {
      dayNote('Курсы на сайте есть с ' + ruDate(dayInput.min) + '.');
      publishToday();
      return;
    }

    const id = ++dayRequest;
    dayNote('Загрузка…');

    findRateOn(asked, 10)
      .then(function (data) {
        if (id !== dayRequest) return;
        publishRate(asked, data, false);
        dayResult.innerHTML = '';
        CODES.forEach(function (code) {
          const p = document.createElement('p');
          const label = document.createElement('span');
          label.textContent = code;
          p.append(label, money(rate(data, code)) + '\u00A0₽');
          dayResult.append(p);
        });
        // Выходной или праздник — подсказываем, от какой даты курс
        if (isoDay(data.Date) !== asked) {
          const note = document.createElement('p');
          note.className = 'tile__wait';
          note.textContent = 'ЦБ курс не устанавливал — действует курс от ' + ruDate(isoDay(data.Date)) + '.';
          dayResult.append(note);
        }
      })
      .catch(function () {
        if (id !== dayRequest) return;
        dayNote('Не удалось найти курс. Проверьте подключение к интернету.');
        publishToday();
      });
  }

  dayInput.addEventListener('change', showDay);

  // Курс, действующий сегодня (не завтрашний, который ЦБ уже установил), — для калькулятора
  findRateOn(todayIso(), 10)
    .then(function (data) {
      todayRate = data;
      if (!window.DAY_RATE) publishToday(); // дату в плитке за это время могли уже выбрать
    })
    .catch(function () { /* без курса кнопки калькулятора останутся неактивными */ });

  // ---------- Выбор периода ----------

  periodForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const from = fromInput.value; // "2026-10-01"
    const to = toInput.value;
    if (!from || !to) return;

    if (from > to) {
      periodNote.textContent = 'Дата «с» должна быть не позже даты «по».';
      return;
    }
    if (to > toInput.max) {
      periodNote.textContent = 'Курс на ' + ruDate(to) + ' ЦБ ещё не установил. Выберите дату «по» не позже ' + ruDate(toInput.max) + '.';
      return;
    }
    if (from < FIRST_DAY) {
      periodNote.textContent = 'Курсы на сайте есть с ' + ruDate(FIRST_DAY) + '. Выберите дату «с» не раньше.';
      return;
    }

    const id = ++request;
    periodNote.textContent = 'Загрузка…';
    periodSubmit.disabled = true;

    loadPeriod(from, to)
      .then(function (rows) {
        if (id !== request) return;
        periodNote.textContent = 'Курсы ЦБ ' + periodText(from, to) + ' — ' + rows.length + ' ' +
          U.plural(rows.length, 'день', 'дня', 'дней') + '.';
        showRows(rows);
      })
      .catch(function () {
        if (id !== request) return;
        periodNote.textContent = 'Не удалось загрузить курсы за период. Проверьте подключение к интернету.';
      })
      .then(function () {
        if (id === request) periodSubmit.disabled = false;
      });
  });

  // "2026-10-07", "2026-10-15" → "с 7 по 15 октября 2026"
  // месяц и год пишутся у первой даты, только если отличаются от второй
  function periodText(from, to) {
    const a = from.split('-');
    const b = to.split('-');
    let start = String(+a[2]);
    if (a[1] !== b[1] || a[0] !== b[0]) start += ' ' + U.MONTHS[+a[1] - 1];
    if (a[0] !== b[0]) start += ' ' + a[0];
    return 'с ' + start + ' по ' + (+b[2]) + ' ' + U.MONTHS[+b[1] - 1] + ' ' + b[0];
  }

  // ---------- Выгрузка таблицы в CSV ----------

  // 98.7654 → "98,7654" — с запятой, как привык русский Excel
  function csvNumber(n) {
    return n.toFixed(4).replace('.', ',');
  }

  exportBtn.addEventListener('click', function (e) {
    e.preventDefault(); // кнопка стоит в заголовке раздела — без этого клик ещё и сворачивал бы таблицу
    if (!shownRows.length) return;

    // Разделитель «;» и метка кодировки в начале — чтобы русский Excel сразу разложил по столбцам
    const lines = ['Дата;USD, ₽;EUR, ₽'];
    shownRows.forEach(function (row) {
      lines.push([ruDate(row.day), csvNumber(rate(row.data, 'USD')), csvNumber(rate(row.data, 'EUR'))].join(';'));
    });
    const file = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });

    // Имя файла: "CBR rates 08.10.2026-16.10.2026.csv" — первая и последняя дата файла (в таблице новые сверху)
    const from = shownRows[shownRows.length - 1].day;
    const to = shownRows[0].day;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'CBR rates ' + ruDate(from) + '-' + ruDate(to) + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  });

  // ---------- Запуск ----------

  const ratesError = document.getElementById('rates-error');
  let offline = false;

  loadLatest()
    .then(function (got) {
      offline = got.offline;
      return loadLastDays(got.data);
    })
    .then(function (days) {
      renderTiles(days[0]);
      allDays = days;

      const latest = isoDay(days[0].Date);
      // Выбрать можно и выходные после последнего курса до сегодня — на них действует последний курс.
      // В пятницу днём ЦБ уже установил курс на субботу, тогда граница — он.
      const lastChoice = latest > todayIso() ? latest : todayIso();
      if (offline) {
        ratesError.textContent = 'Нет связи с источником курсов — показан курс на ' + ruDate(latest) +
          ' из сохранённых данных. Обновите страницу позже.';
        ratesError.hidden = false;
      } else {
        // Дни между загруженными курсами — выходные: запоминаем, чтобы не спрашивать архив ещё раз.
        // Без связи в списке могут быть пропуски, поэтому тогда не запоминаем.
        for (let d = isoDay(days[days.length - 1].Date); d <= latest; d = addDays(d, 1)) cache[d] = null;
      }
      days.forEach(function (data) { cache[isoDay(data.Date)] = data; });

      showLast(7);
      exportBtn.disabled = false;

      // В календаре можно выбрать даты от начала data/rates.js до сегодня (или до последнего курса, если он позже).
      // По умолчанию период — с начала месяца по эту дату.
      dayInput.min = fromInput.min = toInput.min = FIRST_DAY;
      dayInput.max = fromInput.max = toInput.max = lastChoice;
      dayInput.disabled = false;
      toInput.value = lastChoice;
      fromInput.value = lastChoice.slice(0, 8) + '01';
    })
    .catch(function () {
      ratesError.hidden = false;
      document.getElementById('rate-table-body').innerHTML =
        '<tr><td colspan="3" class="rate-table__wait">Нет данных</td></tr>';
    });
})();
