import fs from 'node:fs';
import path from 'node:path';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const root = process.argv[2] ?? 'prisma/migrations';
let stripped = 0;
let scanned = 0;
for (const file of walk(root)) {
  if (!file.endsWith('.sql')) continue;
  scanned++;
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fs.writeFileSync(file, buf.subarray(3));
    console.log(`Stripped BOM: ${file}`);
    stripped++;
  }
}
console.log(`\nScanned ${scanned} .sql files, stripped BOM from ${stripped}.`);
