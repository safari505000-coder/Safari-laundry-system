import fs from 'node:fs';
const lines = fs.readFileSync('src/pages/pos-page.tsx', 'utf8').split(/\r?\n/);
const types = lines.slice(59, 193).join('\n');
const inner = lines.slice(195, 911).join('\n');
fs.writeFileSync('src/modules/shared/hooks/_pos-inner.txt', inner);
fs.writeFileSync('src/modules/shared/hooks/_pos-types.txt', types);
console.log('inner lines', inner.split('\n').length);
