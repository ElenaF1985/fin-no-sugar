// Раздел «Юмор»: две картинки дня из папки pictures/humor/ с любыми названиями.
// Список картинок — data/humor.js (его составляет update-humor.ps1: браузер не может сам заглянуть в папку).
// Выбор зависит только от даты, как «Горящие сроки» и «День в истории»: в полночь — две новые, весь день
// у всех одни и те же; /news их не меняет. Картинки не повторяются, пока не покажутся все; затем новый круг.
// Две картинки в один день разные; если в списке одна — показывается одна. Нет ни одной — раздел и пункт меню скрыты.

(function () {
  const section = document.getElementById('humor');
  const navLink = document.getElementById('nav-humor');
  const img = document.getElementById('humor-img');
  const figure2 = document.getElementById('humor-pic-2');
  const img2 = document.getElementById('humor-img-2');

  const list = window.HUMOR_PICTURES || [];

  // Номер дня по местной дате, считая от 01.01.1970: каждый день на единицу больше
  function dayNumber() {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  // Случайные числа, одинаковые для одного начального числа: простой генератор (mulberry32)
  function random(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Один перемешанный порядок для всех кругов: любая картинка повторяется
  // только после всех остальных. Одинаковый список даёт одинаковый порядок у всех.
  const order = list.map(function (_, i) { return i; });
  const rnd = random(20261015);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }

  function at(pos) {
    return order[((pos % order.length) + order.length) % order.length];
  }

  // Новые списки вступают в силу со следующего дня: сегодняшняя пара сохраняется.
  // Этапы хранятся в файле данных, поэтому выбор одинаков у всех читателей.
  function pickToday() {
    const day = dayNumber();
    const stages = window.HUMOR_ROTATIONS || [];
    let stage = null;
    stages.forEach(function (candidate) {
      if (candidate.startDay <= day && (!stage || candidate.startDay >= stage.startDay)) stage = candidate;
    });
    if (stage) {
      const names = stage.order.filter(function (name) { return list.indexOf(name) >= 0; });
      if (!names.length) return [];
      const offset = ((day - stage.startDay) * 2) % names.length;
      return [names[offset]].concat(names.length > 1 ? [names[(offset + 1) % names.length]] : [])
        .map(function (name) { return list.indexOf(name); });
    }
    // Совместимость со списками, созданными до сохранения этапов цикла.
    if (list.length < 2) return list.length ? [0] : [];
    return [at(day * 2), at(day * 2 + 1)];
  }

  function src(name) { return 'pictures/humor/' + encodeURIComponent(name); }

  const picked = pickToday();
  if (picked.length) {
    img.onload = function () {
      section.hidden = false;
      navLink.hidden = false;
    };
    img.src = src(list[picked[0]]);
    if (picked.length > 1) {
      img2.onload = function () { figure2.hidden = false; };
      img2.src = src(list[picked[1]]);
    }
  }

  // Увеличение по щелчку: картинка открывается в окошке поверх страницы.
  // Закрыть — крестик, щелчок по фону вокруг окошка или Esc. Щелчок по самой картинке окошко не закрывает.
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  // opt.round — показать в круглом окошке (портреты участников «Финансового суда»)
  function openLightbox(image, opt) {
    lightbox.classList.toggle('is-round', !!(opt && opt.round));
    lightboxImg.src = image.src;
    lightboxImg.alt = image.alt;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
  }

  // Этим же окошком увеличиваются картинки «Дня в истории» (js/events.js), зарисовка и портреты суда (js/court.js)
  window.openLightbox = openLightbox;

  [img, img2].forEach(function (image) {
    image.addEventListener('click', function () { openLightbox(image); });
  });
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  // preventDefault — знак калькулятору (js/calc.js), что этот Esc уже закрыл окошко
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lightbox.hidden) { closeLightbox(); e.preventDefault(); }
  });
})();
