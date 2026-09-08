import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(__dirname, 'full_catalog_audit_results.json'), 'utf8');
const data = JSON.parse(raw);

const famous = ['One Piece', 'Naruto', 'Jujutsu Kaisen', 'Solo Leveling', 'Chainsaw Man', 'Bleach', 'Attack on Titan', 'Demon Slayer', 'Dragon Ball', 'Hunter x Hunter', 'Berserk', 'Tokyo Ghoul', 'Kingdom', 'Vinland Saga', 'Black Clover', 'Vagabond', 'Monster', 'Oshi no Ko', 'Blue Lock', 'Dandadan'];

const famousResults = data.mangas.filter((m: any) => famous.some(f => m.title.toLowerCase().includes(f.toLowerCase())));

console.log('=== POPULAR TITLES STATUS ===');
console.table(famousResults.map((m: any) => ({
  title: m.title.slice(0, 30),
  totalCh: m.totalChapters,
  readyCh: m.readyCount,
  failedCh: m.failedCount,
  readiness: m.readinessGrade,
  storage: m.storageEngine
})));

const partiallyReadyAll = data.mangas.filter((m: any) => m.readinessGrade.includes('PARTIALLY_READY'));
console.log('\n=== ALL 44 PARTIALLY READY MANGAS ===');
console.table(partiallyReadyAll.map((m: any) => ({
  title: m.title.slice(0, 30),
  total: m.totalChapters,
  ready: m.readyCount,
  failed: m.failedCount,
  storage: m.storageEngine
})));
