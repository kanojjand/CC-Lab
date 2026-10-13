// Восстанавливает файлы сайта из pack/part-*.bin (см. scripts/pack-vercel.mjs).
// Нужен только для деплоя через API без подключённого Git; без архива ничего не делает.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'pack');
if (!fs.existsSync(path.join(dir, 'part-0.bin'))) process.exit(0);

const parts = fs.readdirSync(dir)
  .filter((f) => /^part-\d+\.bin$/.test(f))
  .sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10));
const raw = zlib.brotliDecompressSync(Buffer.concat(parts.map((f) => fs.readFileSync(path.join(dir, f)))));

let i = 0;
let count = 0;
while (i < raw.length) {
  const nl = raw.indexOf(10, i);
  const [file, size] = raw.subarray(i, nl).toString('utf8').split('\t');
  const start = nl + 1;
  const end = start + Number(size);
  const target = path.join(root, file);
  if (!target.startsWith(root + path.sep)) throw new Error(`bad path: ${file}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, raw.subarray(start, end));
  i = end;
  count += 1;
}
console.log(`[unpack] восстановлено файлов: ${count}`);
