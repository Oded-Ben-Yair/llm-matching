const { AZURE_OPENAI_URI, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT } = process.env;

// Helper: Sleep for exponential backoff
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Mask sensitive data for logging
function maskSensitive(str) {
  if (!str) return '';
  if (str.length > 500) return str.substring(0, 500) + '...[truncated]';
  return str;
}

// Helper: Retry wrapper for Azure API calls
async function retryFetch(url, options, maxRetries = 2) {
  let lastError;
  const delays = [250, 500]; // Exponential backoff in ms
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      
      // If it's a transient error (429, 5xx), retry
      if (!resp.ok && attempt < maxRetries) {
        const status = resp.status;
        if (status === 429 || (status >= 500 && status < 600)) {
          console.log(`Transient error ${status}, retrying in ${delays[attempt]}ms...`);
          await sleep(delays[attempt]);
          continue;
        }
      }
      
      return resp;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`Network error, retrying in ${delays[attempt]}ms...`);
        await sleep(delays[attempt]);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

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

// Mock response for when Azure credentials are not configured
function getMockResponse(allNurses, topK = 5) {
  const mockResults = allNurses.slice(0, topK).map((nurse, idx) => ({
    id: nurse.id,
    name: nurse.name,
    score: (1.0 - idx * 0.15), // Decreasing scores
    reason: `Mock match: ${nurse.services[0] || 'General care'} expertise, ${nurse.city} location`
  }));
  
  return mockResults;
}

export async function llmMatch(query, allNurses){
  // Check for Azure credentials
  if(!AZURE_OPENAI_URI || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT){
    console.log('Azure credentials not configured. Using mock mode for local development.');
    console.log('Set AZURE_OPENAI_URI, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT for live matching.');
    return getMockResponse(allNurses, query.topK || 5);
  }
  
  // Log masked URI for debugging
  const uriHost = new URL(AZURE_OPENAI_URI).hostname;
  console.log(`Calling Azure OpenAI at ${uriHost} (deployment: ${AZURE_OPENAI_DEPLOYMENT})`);
  
  const payload = buildPrompt(query, allNurses);

  // Ask the model to rank and explain. Use JSON schema to force a strict shape.
  const body = {
    model: AZURE_OPENAI_DEPLOYMENT,
    input: [
      { role: 'system', content: [
        { type: 'input_text', text: 'You are a healthcare staffing matching engine for WonderCare. Rank candidates for a patient request using ALL provided data: skills, expertise tags, location proximity, availability overlap, rating, reviews, and urgency. Be decisive and avoid ties unless justified.' }
      ]},
      { role: 'user', content: [
        { type: 'input_text', text: `Request + Candidates (JSON):\n${JSON.stringify(payload)}\n\nReturn topK (default 5) as JSON only. Include a compact rationale per candidate.` }
      ]}
    ],
    text: {
      format: {
        name: 'MatchResult',
        type: 'json_schema',
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
                },
                additionalProperties: false
              }
            }
          },
          required: ['results'],
          additionalProperties: false
        }
      }
    }
  };

  // Log truncated request for debugging
  console.log('Request payload:', maskSensitive(JSON.stringify(body)));
  
  // Make API call with retry logic
  const resp = await retryFetch(AZURE_OPENAI_URI, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': AZURE_OPENAI_KEY
    },
    body: JSON.stringify(body)
  });
  
  if(!resp.ok){
    const txt = await resp.text();
    console.error(`Azure OpenAI error ${resp.status}:`, maskSensitive(txt));
    throw new Error(`Azure OpenAI HTTP ${resp.status}: ${maskSensitive(txt)}`);
  }
  
  const data = await resp.json();
  console.log('Response received:', maskSensitive(JSON.stringify(data)));
  
  // Find the message output with the text content
  let text = null;
  if (data?.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content?.[0]) {
        const content = item.content[0];
        if (content.type === 'output_text' && content.text) {
          text = content.text;
          break;
        } else if (content.text) {
          text = content.text;
          break;
        }
      }
    }
  }
  
  // Fallback to other possible locations
  if (!text) {
    text = data?.output_text || data?.text || JSON.stringify(data);
  }
  
  let parsed;
  try { 
    parsed = typeof text === 'string' ? JSON.parse(text) : text;
  } catch(e) { 
    console.error('Failed to parse JSON:', maskSensitive(text));
    throw new Error('LLM did not return valid JSON: ' + maskSensitive(text)); 
  }
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