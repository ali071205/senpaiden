import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(__dirname, 'full_catalog_audit_results.json'), 'utf8');
const data = JSON.parse(raw);

const zeroEpisodes = data.mangas.filter((m: any) => m.totalChapters === 0);
const partiallyReady = data.mangas.filter((m: any) => m.readinessGrade.includes('PARTIALLY_READY'));
const fullyReady = data.mangas.filter((m: any) => m.readinessGrade.includes('100% READY'));
const failed = data.mangas.filter((m: any) => m.failedCount > 0);

console.log('=== ZERO EPISODES MANGAS ===');
console.table(zeroEpisodes.map((m: any) => ({ title: m.title, provider: m.source_provider, source_id: m.source_id })));

console.log('\n=== TOP 20 PARTIALLY READY MANGAS ===');
console.table(partiallyReady.slice(0, 20).map((m: any) => ({
  title: m.title.slice(0, 35),
  total: m.totalChapters,
  ready: m.readyCount,
  failed: m.failedCount,
  storage: m.storageEngine
})));

console.log('\n=== TOP 20 FULLY READY MANGAS ===');
console.table(fullyReady.slice(0, 20).map((m: any) => ({
  title: m.title.slice(0, 35),
  chapters: m.totalChapters,
  range: m.chapterRange,
  storage: m.storageEngine
})));

const storageCounts: Record<string, number> = {};
for (const m of data.mangas) {
  storageCounts[m.storageEngine] = (storageCounts[m.storageEngine] || 0) + 1;
}
console.log('\n=== STORAGE ENGINE DISTRIBUTION ===');
console.log(storageCounts);
