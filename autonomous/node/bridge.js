#!/usr/bin/env node
// ============================================================
// bridge.js — Node.js Adapter Bridge for Python Orchestrator
// Reuses existing MangaPill and MangaDex TypeScript/JavaScript adapters.
// Outputs clean JSON to stdout for consumption by the Python brain.
// ============================================================

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic import of existing TypeScript/JavaScript adapters
async function loadOrchestrator() {
  const orchestratorPath = path.resolve(__dirname, '../../github-action/src/providers/ProviderOrchestrator.ts');
  try {
    const mod = await import(pathToFileURL(orchestratorPath).href);
    return new mod.ProviderOrchestrator();
  } catch (err) {
    process.stderr.write(`[Bridge] Error importing ProviderOrchestrator: ${err.message}\n`);
    throw err;
  }
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log(JSON.stringify({ success: false, error: 'No command specified' }));
    process.exit(1);
  }

  try {
    const orchestrator = await loadOrchestrator();

    switch (command) {
      case 'fetch-latest': {
        const page = parseInt(args[0] || '1', 10);
        const result = await orchestrator.fetchLatestManga(page);
        console.log(JSON.stringify(result));
        break;
      }

      case 'fetch-chapters': {
        const mangaSourceId = args[0];
        if (!mangaSourceId) {
          console.log(JSON.stringify({ success: false, error: 'mangaSourceId required' }));
          process.exit(1);
        }
        const result = await orchestrator.fetchChapterList(mangaSourceId);
        console.log(JSON.stringify(result));
        break;
      }

      case 'fetch-pages': {
        const chapterId = args[0];
        if (!chapterId) {
          console.log(JSON.stringify({ success: false, error: 'chapterId required' }));
          process.exit(1);
        }
        const result = await orchestrator.fetchChapterPages(chapterId);
        console.log(JSON.stringify(result));
        break;
      }

      case 'health-check': {
        // Quick 1-item test of adapters
        const result = await orchestrator.fetchLatestManga(1);
        console.log(JSON.stringify({
          success: result.success,
          provider: result.provider,
          sample_count: result.data ? result.data.length : 0,
          error: result.error || null,
          timestamp: new Date().toISOString()
        }));
        break;
      }

      default:
        console.log(JSON.stringify({ success: false, error: `Unknown command: ${command}` }));
        process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({
      success: false,
      error: err.message || String(err),
      stack: err.stack
    }));
    process.exit(1);
  }
}

main();
