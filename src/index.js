import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llmMatch } from './lib/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nurses = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sample_data', 'nurses.json'), 'utf-8'));

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5003;

app.get('/health', (_req, res) => res.json({ ok: true }));

// Query shape is shared with other services; the LLM sees full candidate list + query
app.post('/match', async (req, res) => {
  try {
    const q = req.body || {};
    const results = await llmMatch(q, nurses);
    res.json({ count: results.length, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'LLM error', detail: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log('LLM Matching listening on :' + PORT);
  if (process.env.AZURE_OPENAI_URI) {
    const url = new URL(process.env.AZURE_OPENAI_URI);
    console.log(`Azure OpenAI configured: ${url.protocol}//${url.hostname}/...`);
  } else {
    console.log('Warning: AZURE_OPENAI_URI not configured');
  }
});
