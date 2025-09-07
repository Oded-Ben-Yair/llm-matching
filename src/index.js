import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llmMatch } from './lib/llm.js';
import { initDb, dbHealth, loadNurses } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5003;

// Serve static docs
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/db/health', async (_req, res) => {
  try {
    const health = await dbHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: 'Database health check failed', detail: error.message });
  }
});

// Query shape is shared with other services; the LLM sees full candidate list + query
app.post('/match', async (req, res) => {
  try {
    const q = req.body || {};
    const allNurses = await loadNurses();
    const results = await llmMatch(q, allNurses);
    res.json({ count: results.length, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'LLM error', detail: e?.message || String(e) });
  }
});

// Initialize database on startup
await initDb().catch(e => console.warn('DB init error:', e.message));

app.listen(PORT, () => {
  console.log('LLM Matching listening on :' + PORT);
  console.log(`Docs at http://localhost:${PORT}/docs/demo.html`);
  if (process.env.AZURE_OPENAI_URI) {
    const url = new URL(process.env.AZURE_OPENAI_URI);
    console.log(`Azure OpenAI configured: ${url.protocol}//${url.hostname}/...`);
  } else {
    console.log('Warning: AZURE_OPENAI_URI not configured');
  }
});
