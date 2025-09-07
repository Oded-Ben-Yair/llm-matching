#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:5003}
mkdir -p docs

if [[ -z "${AZURE_OPENAI_URI:-}" || -z "${AZURE_OPENAI_KEY:-}" || -z "${AZURE_OPENAI_DEPLOYMENT:-}" ]]; then
  echo "Azure env not set. Skipping live test." | tee docs/run_llm_skipped.txt
  exit 0
fi

echo "Health:" | tee docs/run_health.txt
curl -s $BASE/health | tee -a docs/run_health.txt
echo

cat > req.json <<'JSON'
{
  "city":"Tel Aviv",
  "servicesQuery":["Wound Care"],
  "expertiseQuery":["Geriatrics","Pediatrics"],
  "start":"2025-07-28T09:00:00Z","end":"2025-07-28T12:00:00Z",
  "lat":32.0853,"lng":34.7818,"urgent":true,"topK":5
}
JSON

echo "LLM Match:" | tee docs/run_llm_case.txt
curl -s -X POST $BASE/match -H "content-type: application/json" -d @req.json | tee docs/run_llm_case.json | tee -a docs/run_llm_case.txt
echo

echo "Validate:" | tee docs/run_validate.txt
jq -e '.results and (.results|type=="array") and (.results[0].id and .results[0].score and .results[0].reason)' docs/run_llm_case.json >/dev/null \
  && echo "Schema OK" | tee -a docs/run_validate.txt \
  || (echo "Schema FAIL" | tee -a docs/run_validate.txt; exit 1)

rm -f req.json
echo "DONE"