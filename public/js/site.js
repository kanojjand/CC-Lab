// CC Lab — интерактив и анимации. Сайт полностью работает и без JavaScript.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // мобильное меню
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = root.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        root.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('nav-open')) {
        root.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // сортировка в каталоге применяется сразу
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // защита от двойной отправки формы заявки
  document.querySelectorAll('form[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = form.getAttribute('data-sending') || '…';
      }
    });
  });

  // ---------- тема: выбор хранится в cookie, чтобы сервер сразу отдавал нужную ----------
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(next) {
    root.setAttribute('data-theme', next);
    document.cookie = 'cclab_theme=' + next + '; path=/; max-age=31536000; samesite=lax';
    if (themeMeta) themeMeta.setAttribute('content', next === 'light' ? '#f6f6f3' : '#050505');
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      if (reduceMotion) return applyTheme(next);
      if (!document.startViewTransition) {
        // плавная смена цветов
        root.classList.add('theme-fade');
        applyTheme(next);
        setTimeout(function () { root.classList.remove('theme-fade'); }, 400);
        return;
      }
      // новая тема «расходится» кругом от кнопки
      var r = btn.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.classList.add('theme-switching');
      var vt = document.startViewTransition(function () { applyTheme(next); });
      vt.ready.then(function () {
        root.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 650, easing: 'cubic-bezier(.2, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      vt.finished.finally(function () { root.classList.remove('theme-switching'); });
    });
  });

  // ---------- шапка плотнее после прокрутки; полоска прогресса чтения ----------
  var header = document.querySelector('.site-header');
  var progress = document.querySelector('.read-progress');
  var cssProgress = window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
      if (progress && !cssProgress) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.setProperty('--progress', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- появление блоков при прокрутке ----------
  var reveals = document.querySelectorAll('.reveal');
  if (!reduceMotion && 'IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('is-pending');
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    var fold = window.innerHeight * 0.92;
    reveals.forEach(function (el) {
      // то, что видно сразу при загрузке, не прячем — иначе оно мигнёт
      if (el.getBoundingClientRect().top < fold) return;
      el.classList.add('is-pending');
      io.observe(el);
    });
  }

  // ---------- счётчики на первом экране ----------
  if (!reduceMotion) {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (!(target > 0)) return;
      var duration = 1100 + Math.min(target, 60) * 12;
      var start = null;
      el.textContent = '0';
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      }
      setTimeout(function () { requestAnimationFrame(step); }, 450);
    });
  }

  if (!finePointer || reduceMotion) return;

  // ---------- кольца вокруг логотипа следуют за курсором ----------
  var hero = document.querySelector('[data-hero]');
  var visual = hero && hero.querySelector('.hero-visual');
  if (visual) {
    var heroFrame = 0;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var my = ((e.clientY - r.top) / r.height) * 2 - 1;
      cancelAnimationFrame(heroFrame);
      heroFrame = requestAnimationFrame(function () {
        visual.style.setProperty('--mx', mx.toFixed(3));
        visual.style.setProperty('--my', my.toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', function () {
      cancelAnimationFrame(heroFrame);
      visual.style.setProperty('--mx', '0');
      visual.style.setProperty('--my', '0');
    });
  }

  // ---------- карточки: лёгкий 3D-наклон и подсветка под курсором ----------
  document.querySelectorAll('.card').forEach(function (card) {
    var frame = 0;
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        card.style.setProperty('--px', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--py', (py * 100).toFixed(1) + '%');
        card.style.setProperty('--rx', ((0.5 - py) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((px - 0.5) * 6).toFixed(2) + 'deg');
      });
    });
    card.addEventListener('pointerleave', function () {
      cancelAnimationFrame(frame);
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    });
  });
})();
