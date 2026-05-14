import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node strip-bom.mjs <file>');
  process.exit(1);
}
const buf = fs.readFileSync(file);
if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  fs.writeFileSync(file, buf.subarray(3));
  console.log(`Stripped BOM from ${file}`);
} else {
  console.log(`No BOM in ${file}`);
}
