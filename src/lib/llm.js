import { azureRespond } from "../clients/azure.js";

const {
  AZURE_OPENAI_URI,
  AZURE_OPENAI_KEY,
  AZURE_OPENAI_RESOURCE_HOST,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION
} = process.env;

function isLiveAzureEnabled() {
  // Live if we have either a full URI+KEY, or host+deployment+version+key
  const hasFull = AZURE_OPENAI_URI && AZURE_OPENAI_KEY;
  const hasParts = AZURE_OPENAI_RESOURCE_HOST && AZURE_OPENAI_DEPLOYMENT && AZURE_OPENAI_API_VERSION && AZURE_OPENAI_KEY;
  return Boolean(hasFull || hasParts);
}

function resolvedAzureUri() {
  if (AZURE_OPENAI_URI) return AZURE_OPENAI_URI;
  if (AZURE_OPENAI_RESOURCE_HOST && AZURE_OPENAI_DEPLOYMENT && AZURE_OPENAI_API_VERSION) {
    return `${AZURE_OPENAI_RESOURCE_HOST}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
  }
  return null;
}

// Helper: Mask sensitive data for logging
function maskSensitive(str) {
  if (!str) return '';
  if (str.length > 500) return str.substring(0, 500) + '...[truncated]';
  return str;
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
  if (!isLiveAzureEnabled()) {
    console.log('Azure credentials not configured. Using mock mode for local development.');
    console.log('Set AZURE_OPENAI_URI, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT for live matching.');
    return getMockResponse(allNurses, query.topK || 5);
  }
  
  // Limit candidates to reduce token usage for Azure API
  const maxCandidates = Math.min(50, allNurses.length);
  const limitedNurses = allNurses.slice(0, maxCandidates);
  
  const uri = resolvedAzureUri();
  const uriHost = new URL(uri).hostname;
  console.log(`Calling Azure OpenAI at ${uriHost} (deployment: ${AZURE_OPENAI_DEPLOYMENT || 'auto'})`);
  
  const payload = buildPrompt(query, limitedNurses);
  console.log(`Processing ${limitedNurses.length} candidates (limited from ${allNurses.length})`);

  // Build messages for Azure Chat Completions API
  const messages = [
    { 
      role: 'system', 
      content: 'You are a healthcare staffing matching engine for WonderCare. Rank candidates for a patient request using ALL provided data: skills, expertise tags, location proximity, availability overlap, rating, reviews, and urgency. Be decisive and avoid ties unless justified. Always respond with valid JSON in this format: {"results": [{"id": "string", "score": 0.95, "reason": "explanation"}]}' 
    },
    { 
      role: 'user', 
      content: `Request + Candidates (JSON):\n${JSON.stringify(payload)}\n\nReturn topK (default 5) as JSON only. Include a compact rationale per candidate.` 
    }
  ];

  // Log truncated request for debugging
  console.log('Request payload:', maskSensitive(JSON.stringify(messages)));
  
  // Make API call with new robust client
  const result = await azureRespond({
    uri,
    apiKey: AZURE_OPENAI_KEY,
    messages,
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 192
  });
  
  if (!result.ok) {
    console.error(`Azure OpenAI error:`, result.error);
    throw new Error(`Azure OpenAI error: ${result.error}`);
  }
  
  console.log('Response received:', maskSensitive(result.text));
  
  let parsed;
  try { 
    parsed = typeof result.text === 'string' ? JSON.parse(result.text) : result.text;
  } catch(e) { 
    console.error('Failed to parse JSON:', maskSensitive(result.text));
    throw new Error('LLM did not return valid JSON: ' + maskSensitive(result.text)); 
  }
  
  const results = (parsed.results || []).sort((a,b)=> (b.score??0)-(a.score??0));
  // Attach names for convenience (use full list for name lookup)
  const byId = Object.fromEntries(allNurses.map(n=>[n.id,n]));
  return results.map(r => ({
    id: r.id,
    name: byId[r.id]?.name || r.id,
    score: r.score,
    reason: r.reason
  }));
}