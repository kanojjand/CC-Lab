// CC Lab — мелочи для удобства в админке
(function () {
  // подтверждение опасных действий
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // подтверждение для кнопок с formaction (удаление внутри формы редактирования)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-confirm-click]');
    if (btn && !window.confirm(btn.getAttribute('data-confirm-click'))) e.preventDefault();
  });

  // автосохранение статуса заявки / фильтров при выборе
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); });
  });

  // предупреждение о несохранённых изменениях в форме разработки
  var form = document.querySelector('form[data-dirty-check]');
  if (form) {
    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('change', function () { dirty = true; });
    form.addEventListener('submit', function (e) { if (!e.defaultPrevented) dirty = false; });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // Перед отправкой уменьшаем фото до 1920 px и пережимаем в JPEG/WebP:
  // страницы грузятся быстрее, а хостинг принимает запросы только до ~4,5 МБ.
  var MAX_SIDE = 1920;
  var MAX_TOTAL = 4 * 1024 * 1024;

  function shrink(file) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 900 * 1024) return file;
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      var type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          var name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
          resolve(new File([blob], name, { type: type }));
        }, type, 0.85);
      });
    }).catch(function () { return file; });
  }

  var pending = 0;
  function totalUploadSize(form) {
    var total = 0;
    form.querySelectorAll('input[type="file"]').forEach(function (inp) {
      Array.prototype.forEach.call(inp.files || [], function (f) { total += f.size; });
    });
    return total;
  }

  document.querySelectorAll('input[type="file"]').forEach(function (input) {
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length || typeof DataTransfer === 'undefined') return;
      pending++;
      Promise.all(files.map(shrink)).then(function (out) {
        var dt = new DataTransfer();
        out.forEach(function (f) { dt.items.add(f); });
        input.files = dt.files;
      }).finally(function () { pending--; });
    });
  });

  document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (pending > 0) {
        e.preventDefault();
        window.alert('Картинки ещё сжимаются — подождите секунду и сохраните снова.');
        return;
      }
      if (totalUploadSize(form) > MAX_TOTAL) {
        e.preventDefault();
        window.alert('Слишком много картинок за один раз (больше 4 МБ). Загрузите часть, сохраните, затем добавьте остальные.');
      }
    }, true);
  });

  // превью обложки до сохранения
  document.querySelectorAll('input[type="file"][data-preview]').forEach(function (input) {
    input.addEventListener('change', function () {
      var target = document.querySelector(input.getAttribute('data-preview'));
      var file = input.files && input.files[0];
      if (!target || !file) return;
      var img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(file);
      target.innerHTML = '';
      target.appendChild(img);
    });
  });

  // счётчик символов
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var out = document.getElementById(el.getAttribute('data-count'));
    if (!out) return;
    var max = el.getAttribute('maxlength');
    var update = function () { out.textContent = el.value.length + (max ? ' / ' + max : ''); };
    el.addEventListener('input', update);
    update();
  });
})();
