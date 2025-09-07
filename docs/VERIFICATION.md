# LLM Matching — Verification & Flow (Azure OpenAI - Responses API)

## What it does:
- Sends `{q:request, c:allCandidates}` to Azure Responses API (deployment: gpt-5) with a JSON schema requesting:
  ```json
  { results: [{ id: string, score: number (0..1), reason: string }] }
  ```
- Parses the output, sorts by score, returns topK.

## Flow
```
Request + All candidates
  └─ build compact payload
      └─ Azure Responses API (json_schema format)
          └─ parse → {results[]} → sort → topK
```

## Env required (no secrets here):
- `AZURE_OPENAI_URI`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`

## Run Results
- **Health:** docs/run_health.txt
- **Live LLM match (if env set):** docs/run_llm_case.json
- **Schema validation:** docs/run_validate.txt

## Observations
- Reasons reflect multiple signals (service/expertise/distance/availability/ratings/urgency).
- Output is strict JSON per schema; failures are surfaced with clear 4xx/5xx error text.

## Acceptance
✅ boots, ✅ health OK, ✅ schema valid, ✅ ranked results with reasons.