const { AZURE_OPENAI_URI, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT } = process.env;

function buildPrompt(query, candidates){
  // Keep message compact; send only essential fields
  const q = {
    city: query.city ?? null,
    servicesQuery: query.servicesQuery ?? (query.service ? [query.service] : []),
    expertiseQuery: query.expertiseQuery ?? [],
    timeWindow: query.start && query.end ? { start: query.start, end: query.end } : null,
    location: (query.lat!=null && query.lng!=null) ? { lat: query.lat, lng: query.lng } : null,
    urgent: !!query.urgent
  };
  const c = candidates.map(n => ({
    id: n.id, name: n.name, city: n.city,
    rating: n.rating, reviewsCount: n.reviewsCount,
    services: n.services, expertiseTags: n.expertiseTags,
    lat: n.lat, lng: n.lng, availability: n.availability
  }));
  return { q, c };
}

export async function llmMatch(query, allNurses){
  if(!AZURE_OPENAI_URI || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT){
    throw new Error('Missing AZURE_OPENAI_* env vars');
  }
  const payload = buildPrompt(query, allNurses);

  // Ask the model to rank and explain. Use JSON schema to force a strict shape.
  const body = {
    model: AZURE_OPENAI_DEPLOYMENT,
    input: [
      { role: 'system', content: [
        { type: 'text', text: 'You are a healthcare staffing matching engine for WonderCare. Rank candidates for a patient request using ALL provided data: skills, expertise tags, location proximity, availability overlap, rating, reviews, and urgency. Be decisive and avoid ties unless justified.' }
      ]},
      { role: 'user', content: [
        { type: 'text', text: 'Request + Candidates (JSON):' },
        { type: 'input_text', text: JSON.stringify(payload) },
        { type: 'text', text: 'Return topK (default 5) as JSON only. Include a compact rationale per candidate.' }
      ]}
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'MatchResult',
        schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id','score','reason'],
                properties: {
                  id: { type: 'string' },
                  score: { type: 'number', minimum: 0, maximum: 1 },
                  reason: { type: 'string' }
                }
              }
            }
          },
          required: ['results'],
          additionalProperties: false
        }
      }
    }
  };

  const resp = await fetch(AZURE_OPENAI_URI, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': AZURE_OPENAI_KEY
    },
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const txt = await resp.text();
    throw new Error('Azure OpenAI HTTP '+resp.status+': '+txt);
  }
  const data = await resp.json();
  // Responses API returns content in output[0].content[0].text or similar (stable JSON per spec).
  const text = data?.output_text || data?.output?.[0]?.content?.[0]?.text || data?.content?.[0]?.text || JSON.stringify(data);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('LLM did not return valid JSON: '+text); }
  const results = (parsed.results || []).sort((a,b)=> (b.score??0)-(a.score??0));
  // Attach names for convenience
  const byId = Object.fromEntries(allNurses.map(n=>[n.id,n]));
  return results.map(r => ({
    id: r.id,
    name: byId[r.id]?.name || r.id,
    score: r.score,
    reason: r.reason
  }));
}
