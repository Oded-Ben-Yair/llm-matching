import express from 'express';
import nurses from '../sample_data/nurses.json' assert { type: 'json' };
import { llmMatch } from './lib/llm.js';

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

app.listen(PORT, () => console.log('LLM Matching listening on :' + PORT));
