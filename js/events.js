// Раздел «День в истории»: праздники из data/events.js и data/events-daily.js.
// Праздник: «31 декабря — Новый год!» и интересные факты о нём. Картинка — pictures/events/ДД.ММ.png
// (или .jpg, .jpeg, .webp), вторая — «ДД.ММ 1.png»; оформление и увеличение по щелчку — как в «Юморе».
// Нет картинки — места под неё нет. Нет праздника — раздел и пункт меню скрыты.

(function () {
  const section = document.getElementById('events');
  const navLink = document.getElementById('nav-events');
  const textBox = document.getElementById('events-text'); // праздники с фактами
  const pics = document.getElementById('events-pics');

  const EXTS = ['png', 'jpg', 'jpeg', 'webp'];
  const el = U.el;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const today = dd + '.' + mm;                          // "31.12"
  const todayFull = today + '.' + now.getFullYear();    // "31.12.2026"

  // Все государственные праздники дня и один негосударственный: профессиональный важнее остальных,
  // при равенстве — тот, что раньше в списке (главные праздники из data/events.js идут первыми)
  function rank(e) { return e.kind === 'pro' ? 0 : 1; }
  const all = (window.EVENTS || []).filter(function (e) {
    return e.date === today || e.date === todayFull;
  });
  const extra = all
    .filter(function (e) { return e.kind !== 'state'; })
    .sort(function (a, b) { return rank(a) - rank(b); }) // при равенстве порядок списка сохраняется
    .slice(0, 1);
  const holidays = all.filter(function (e) { return e.kind === 'state'; }).concat(extra);

  if (!holidays.length) return; // раздел остаётся скрытым

  section.hidden = false;
  navLink.hidden = false;

  // ---------- Праздники ----------

  holidays.forEach(function (h) {
    const item = el('article', 'event');
    item.append(el('h3', 'event__title', now.getDate() + ' ' + U.MONTHS[now.getMonth()] + ' — ' + h.title + '!'));
    const list = el('ul', 'event__facts');
    h.facts.forEach(function (fact) {
      list.append(el('li', '', fact));
    });
    item.append(list);
    textBox.append(item);
  });

  // Картинки — только в день праздника. Пробуем форматы по очереди; не нашлось — рамка остаётся скрытой.
  function loadPicture(name, alt) {
    const figure = el('figure', 'humor-pic');
    const img = el('img', 'humor-pic__img');
    img.alt = alt;
    figure.hidden = true;
    figure.append(img);
    pics.append(figure);

    let next = 0;
    function tryNext() {
      if (next >= EXTS.length) {
        img.onerror = null;
        return;
      }
      img.src = 'pictures/events/' + encodeURIComponent(name + '.' + EXTS[next++]);
    }
    img.onload = function () {
      figure.hidden = false;
      pics.hidden = false;
      pics.classList.toggle('is-two', pics.querySelectorAll('figure:not([hidden])').length > 1);
    };
    img.onerror = tryNext;
    img.addEventListener('click', function () {
      if (window.openLightbox) window.openLightbox(img);
    });
    tryNext();
  }

  loadPicture(today, 'Картинка к празднику');
  loadPicture(today + ' 1', 'Вторая картинка к празднику');
})();
