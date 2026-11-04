// Шапка: сегодняшняя дата и анимация заголовка — «Финансы» появляется по центру, уезжает влево,
// затем «без сахара» печатается по буквам, как на пишущей машинке.

(function () {
  document.getElementById('today').textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const title = document.querySelector('.masthead__title');
  const word = title.querySelector('.title-word');
  const typed = title.querySelector('.title-typed');
  const caret = title.querySelector('.title-caret');
  const text = typed.textContent;

  // Если в системе отключены анимации — сразу показываем готовый заголовок
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    word.classList.add('is-ready');
    return;
  }

  typed.textContent = '';

  // Ждём загрузки шрифтов, иначе ширина слова посчитается неверно
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }

  function start() {
    // Ставим «Финансы» в центр строки
    const offset = (title.clientWidth - word.offsetWidth) / 2;
    word.style.transform = 'translateX(' + offset + 'px)';
    word.classList.add('is-ready');

    // Пауза → плавный сдвиг влево
    setTimeout(function () {
      word.style.transition = 'transform .9s cubic-bezier(.6, 0, .2, 1)';
      word.style.transform = 'translateX(0)';
    }, 1500);

    // После сдвига — печать по буквам с неровным, «машинописным» ритмом
    setTimeout(function () {
      caret.classList.add('is-on', 'is-typing');
      let i = 0;

      (function typeNext() {
        if (i < text.length) {
          typed.textContent += text[i];
          i += 1;
          setTimeout(typeNext, 90 + Math.random() * 90);
          return;
        }
        // Напечатано: курсор мигает пару секунд и гаснет
        caret.classList.remove('is-typing');
        setTimeout(function () {
          caret.classList.remove('is-on');
          caret.classList.add('is-off');
        }, 2200);
      })();
    }, 2600);
  }
})();
