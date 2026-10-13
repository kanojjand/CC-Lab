// Упаковывает исходники сайта в сжатый архив из нескольких частей (.vercel-pack/),
// которые можно загрузить в Vercel через API без подключённого Git.
// При сборке Vercel запускает unpack.cjs (installCommand) и восстанавливает файлы.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, '.vercel-pack');
const partSize = Number(process.argv[2] || 16000);
const skip = /^(test\/|README\.md$|Dockerfile$|docker-compose\.yml$|\.env\.example$|\.dockerignore$|\.gitignore$|\.vercelignore$|scripts\/|server\.js$|package-lock\.json$|public\/brand\/logo-source\.jpg$)/;

const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !skip.test(f));
// формат: для каждого файла строка "путь\tразмер\n", затем сами байты
const chunks = [];
for (const f of files) {
  const data = fs.readFileSync(path.join(root, f));
  chunks.push(Buffer.from(`${f}\t${data.length}\n`), data);
}
const raw = Buffer.concat(chunks);
const packed = zlib.brotliCompressSync(raw, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
});

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const parts = [];
for (let i = 0; i * partSize < packed.length; i++) {
  const chunk = packed.subarray(i * partSize, (i + 1) * partSize);
  const name = `pack/part-${i}.bin`;
  fs.mkdirSync(path.join(out, 'pack'), { recursive: true });
  fs.writeFileSync(path.join(out, name), chunk);
  parts.push({ file: name, size: chunk.length, sha: crypto.createHash('sha1').update(chunk).digest('hex') });
}
fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(parts, null, 2));
console.log(`files: ${files.length}, raw: ${raw.length} B, packed: ${packed.length} B, parts: ${parts.length}`);
for (const p of parts) console.log(p.file, p.size, p.sha);
