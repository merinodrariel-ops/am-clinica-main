
import fs from 'fs';

const content = fs.readFileSync('/Users/am/Downloads/antigravity apps/am-clinica-main/app/caja-recepcion/CajaRecepcionClient.tsx', 'utf8');
const lines = content.split('\n');

function count(text) {
  const o = (text.match(/<div/g) || []).length;
  const c = (text.match(/<\/div>/g) || []).length;
  const fo = (text.match(/<>/g) || []).length;
  const fc = (text.match(/<\/>/g) || []).length;
  const po = (text.match(/{/g) || []).length;
  const pc = (text.match(/}/g) || []).length;
  return {div: o-c, fragment: fo-fc, brace: po-pc};
}

console.log('Range 0-1212:', count(lines.slice(0, 1213).join('\n')));
console.log('Range 1213-2063:', count(lines.slice(1213, 2064).join('\n')));
console.log('Range 2064-end:', count(lines.slice(2064).join('\n')));
