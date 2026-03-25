
import fs from 'fs';

const content = fs.readFileSync('/Users/ariel/Downloads/antigravity apps/am-clinica-main/app/caja-recepcion/CajaRecepcionClient.tsx', 'utf8');

let divOpen = 0;
let divClose = 0;

const openMatches = content.match(/<div/g) || [];
const closeMatches = content.match(/<\/div>/g) || [];

console.log('Open <div>:', openMatches.length);
console.log('Close </div>:', closeMatches.length);

const fragmentOpen = content.match(/<>/g) || [];
const fragmentClose = content.match(/<\/>/g) || [];

console.log('Open <>:', fragmentOpen.length);
console.log('Close </>:', fragmentClose.length);

const animateOpen = content.match(/<AnimatePresence/g) || [];
const animateClose = content.match(/<\/AnimatePresence>/g) || [];

console.log('Open <AnimatePresence>:', animateOpen.length);
console.log('Close </AnimatePresence>:', animateClose.length);
