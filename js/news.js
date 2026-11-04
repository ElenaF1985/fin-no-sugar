// Новости дня: берёт данные из data/news.js и выводит список.
// Ссылки на источники — только обычные веб-ссылки (U.safeUrl), иначе без перехода.

(function () {
  const data = window.NEWS_OF_THE_DAY;
  const list = document.getElementById('news-list');

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    list.innerHTML = '<li class="news__empty">Новости ещё не загружены.</li>';
    return;
  }

  document.getElementById('news-date').textContent = 'Выпуск от ' + data.date;

  // Выпуск старше предыдущего рабочего дня — /news давно не запускали: предупреждаем,
  // чтобы старые новости не приняли за сегодняшние. Праздники не учитываются — только выходные.
  const issued = U.parseRu(data.date); // "15.10.2026"
  const lastWorkday = new Date();
  lastWorkday.setHours(0, 0, 0, 0);
  do {
    lastWorkday.setDate(lastWorkday.getDate() - 1);
  } while (lastWorkday.getDay() === 0 || lastWorkday.getDay() === 6);

  if (issued < lastWorkday) {
    const stale = document.getElementById('news-stale');
    stale.textContent = 'Новости от ' + data.date + ' — свежий выпуск ещё не вышел.';
    stale.hidden = false;
  }

  // Текст вставляется через textContent, чтобы чужая разметка из новостей не попала на страницу
  data.items.forEach(function (item) {
    const li = document.createElement('li');
    li.className = 'news__item';

    const body = document.createElement('div');

    const tag = document.createElement('p');
    tag.className = 'news__tag';
    tag.textContent = item.topic;

    const title = document.createElement('h3');
    title.className = 'news__title';
    title.textContent = item.title;

    const text = document.createElement('p');
    text.className = 'news__text';
    text.textContent = item.summary;

    const link = document.createElement('a');
    link.className = 'news__source';
    link.href = U.safeUrl(item.url);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Источник: ' + item.source + (item.published ? ', ' + item.published : '') + ' →';

    body.append(tag, title, text, link);
    li.append(body);
    list.append(li);
  });
})();

// Архив новостей за неделю: из data/archive.js, каждый день — свёрнутый блок с датой
(function () {
  const box = document.getElementById('news-archive');

  // Показываем только выпуски не старше 7 дней — даже если /news давно не запускали
  const weekAgo = new Date();
  weekAgo.setHours(0, 0, 0, 0);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const days = (window.NEWS_ARCHIVE || []).filter(function (day) {
    return U.parseRu(day.date) >= weekAgo; // "15.10.2026"
  });

  if (days.length === 0) {
    box.innerHTML = '<p class="archive__empty">Архив пока пуст — он пополнится со следующего выпуска.</p>';
    return;
  }

  days.forEach(function (day) {
    const details = document.createElement('details');
    details.className = 'archive__day';

    const summary = document.createElement('summary');
    summary.textContent = day.date;

    const ul = document.createElement('ul');
    day.items.forEach(function (item) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = U.safeUrl(item.url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = item.title;
      const source = document.createElement('span');
      source.textContent = ' · ' + item.source + (item.published ? ', ' + item.published : '');
      li.append(a, source);
      ul.append(li);
    });

    details.append(summary, ul);
    box.append(details);
  });
})();
