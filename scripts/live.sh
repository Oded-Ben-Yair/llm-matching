#!/bin/bash

echo "=== LLM Matching Live Tests (Azure) ==="
echo ""

# Check if Azure credentials are set
if [[ -z "${AZURE_OPENAI_URI:-}" || -z "${AZURE_OPENAI_KEY:-}" || -z "${AZURE_OPENAI_DEPLOYMENT:-}" ]]; then
    echo "Azure credentials not set. Skipping live tests."
    echo "Set AZURE_OPENAI_URI, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT to run live tests."
    exit 0
fi

echo "Azure credentials detected. Running live test..."
echo ""

# Create realistic payload
PAYLOAD=$(cat <<'JSON'
{
  "city": "Tel Aviv",
  "servicesQuery": ["Wound Care", "Medication Administration"],
  "expertiseQuery": ["Geriatrics", "Diabetes Management"],
  "start": "2025-07-28T09:00:00Z",
  "end": "2025-07-28T17:00:00Z",
  "lat": 32.0853,
  "lng": 34.7818,
  "urgent": false,
  "topK": 5
}
JSON
)

# Call match endpoint with live Azure
echo "Calling /match with live Azure LLM..."
RESPONSE=$(curl -s -X POST http://localhost:5003/match \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Save response
mkdir -p docs
echo "$RESPONSE" > docs/run_llm_live.json

# Display truncated response
echo "Response (truncated):"
echo "$RESPONSE" | jq . 2>/dev/null | head -20 || echo "$RESPONSE" | head -c 500

echo ""
echo "✓ Full response saved to docs/run_llm_live.json"

# Validate response structure
if echo "$RESPONSE" | jq -e '.results and (.results|type=="array")' >/dev/null 2>&1; then
    echo "✓ Response structure validated"
else
    echo "✗ Response structure validation failed"
    exit 1
fi

echo ""
echo "=== Live tests completed successfully ==="