import crypto from 'node:crypto';
import multer from 'multer';

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export const MAX_GALLERY = 12;
// Бессерверные хостинги (Vercel) принимают запросы до ~4,5 МБ.
// Админка сама сжимает фото перед отправкой, так что обычно это 200–800 КБ на картинку.
export const MAX_FILE_MB = 4;

export function createUploader() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_GALLERY + 1, fields: 60 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
      const err = new Error('Можно загружать только изображения: JPG, PNG, WebP, GIF или AVIF.');
      err.code = 'BAD_FILE_TYPE';
      return cb(err);
    },
  });
}

/** Сохраняет загруженные multer-файлы в базу и возвращает их имена */
export async function storeUploads(store, files = []) {
  const names = [];
  for (const file of files) {
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[file.mimetype]}`;
    await store.saveFile({ name, mime: file.mimetype, data: file.buffer });
    names.push(name);
  }
  return names;
}

export function uploadErrorMessage(err) {
  if (!err) return '';
  if (err.code === 'LIMIT_FILE_SIZE') return `Файл слишком большой — максимум ${MAX_FILE_MB} МБ на картинку.`;
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return `Слишком много файлов — до ${MAX_GALLERY} картинок в галерее.`;
  }
  if (err.code === 'BAD_FILE_TYPE') return err.message;
  return 'Не удалось загрузить файл.';
}
