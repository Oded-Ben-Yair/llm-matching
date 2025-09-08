#!/bin/bash

echo "=== LLM CSV Deep Smoke Tests ==="
echo ""

# Detect mode
if [ -n "$AZURE_OPENAI_URI" ] && [ -n "$AZURE_OPENAI_KEY" ] && [ -n "$AZURE_OPENAI_DEPLOYMENT" ]; then
    MODE="LIVE"
    echo "MODE: LIVE (Azure OpenAI)"
else
    MODE="MOCK"
    echo "MODE: MOCK (Fallback)"
fi
echo ""

# Create docs directory
mkdir -p docs

# Save mode to metadata
echo "{\"mode\": \"$MODE\", \"timestamp\": \"$(date -Iseconds)\", \"scenarios\": []}" > docs/csv_results_meta.json

# Function to run test scenario
run_scenario() {
    local CASE_ID=$1
    local CITY=$2
    local SERVICES=$3
    local EXPERTISE=$4
    local START=$5
    local END=$6
    local URGENT=$7
    local TOP_K=$8
    local DESC=$9
    
    echo "Scenario $CASE_ID: $DESC"
    echo "  City: $CITY"
    echo "  Services: $SERVICES"
    echo "  Expertise: $EXPERTISE"
    
    # Build payload
    PAYLOAD="{\"city\":\"$CITY\",\"servicesQuery\":$SERVICES,\"expertiseQuery\":$EXPERTISE"
    if [ "$START" != "null" ]; then
        PAYLOAD="$PAYLOAD,\"start\":\"$START\""
    fi
    if [ "$END" != "null" ]; then
        PAYLOAD="$PAYLOAD,\"end\":\"$END\""
    fi
    PAYLOAD="$PAYLOAD,\"urgent\":$URGENT,\"topK\":$TOP_K}"
    
    # Time the request
    START_TIME=$(date +%s%3N)
    RESPONSE=$(curl -s -X POST http://localhost:5003/match \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null)
    END_TIME=$(date +%s%3N)
    LATENCY=$((END_TIME - START_TIME))
    
    # Save response
    echo "$RESPONSE" > "docs/csv_case_${CASE_ID}.json"
    
    # Validate schema
    if echo "$RESPONSE" | jq -e '.count' > /dev/null 2>&1 && \
       echo "$RESPONSE" | jq -e '.results | type == "array"' > /dev/null 2>&1; then
        echo "  ✓ Schema valid (latency: ${LATENCY}ms)"
        
        # Extract top result
        TOP_ID=$(echo "$RESPONSE" | jq -r '.results[0].id // "none"')
        TOP_SCORE=$(echo "$RESPONSE" | jq -r '.results[0].score // 0')
        COUNT=$(echo "$RESPONSE" | jq -r '.count // 0')
        echo "  Results: $COUNT matches, top: $TOP_ID (score: $TOP_SCORE)"
    else
        echo "  ✗ Schema invalid or error"
    fi
    
    # Update metadata
    jq --arg case "$CASE_ID" \
       --arg city "$CITY" \
       --arg desc "$DESC" \
       --arg latency "$LATENCY" \
       --arg count "$(echo "$RESPONSE" | jq -r '.count // 0')" \
       '.scenarios += [{
           "case": $case,
           "city": $city,
           "description": $desc,
           "latency_ms": ($latency | tonumber),
           "count": ($count | tonumber)
       }]' docs/csv_results_meta.json > docs/csv_results_meta.tmp && \
    mv docs/csv_results_meta.tmp docs/csv_results_meta.json
    
    echo ""
}

# Run 10 deep scenarios (A through J)
echo "Running 10 deep scenarios..."
echo "----------------------------"

# A: Tel Aviv, Wound Care, Urgent
run_scenario "A" "Tel Aviv" '["Wound Care"]' '["Geriatrics"]' \
    "2024-01-15T08:00:00Z" "2024-01-15T20:00:00Z" true 5 \
    "Tel Aviv urgent wound care"

# B: Jerusalem, Post-Surgery, Time window
run_scenario "B" "Jerusalem" '["Post-Surgery Care"]' '["Rehabilitation"]' \
    "2024-02-01T09:00:00Z" "2024-02-01T17:00:00Z" false 5 \
    "Jerusalem post-surgery with time window"

# C: Haifa, Geriatric Care
run_scenario "C" "Haifa" '["Geriatric Care"]' '["Elder Care","Bedridden Patient Care"]' \
    "null" "null" false 10 \
    "Haifa geriatric care, top 10"

# D: Beer Sheva, Pediatric, Urgent
run_scenario "D" "Beer Sheva" '["Pediatric Care"]' '["Child Care"]' \
    "2024-03-10T06:00:00Z" "2024-03-10T22:00:00Z" true 5 \
    "Beer Sheva urgent pediatric"

# E: Rishon LeTsiyon, Emergency
run_scenario "E" "Rishon LeTsiyon" '["Emergency Care","Critical Care"]' '[]' \
    "null" "null" true 3 \
    "Rishon emergency care, top 3"

# F: Netanya, Home Care
run_scenario "F" "Netanya" '["Home Care"]' '["Mobile Patient Care"]' \
    "2024-04-01T08:00:00Z" "2024-04-30T18:00:00Z" false 7 \
    "Netanya home care, month window"

# G: Ashdod, IV Therapy
run_scenario "G" "Ashdod" '["IV Therapy","Catheter Care"]' '[]' \
    "null" "null" false 5 \
    "Ashdod IV therapy"

# H: Herzliya, Private Nursing
run_scenario "H" "Herzliya" '["Private Nursing"]' '["Wheelchair Patient Care"]' \
    "2024-05-15T10:00:00Z" "2024-05-15T14:00:00Z" false 5 \
    "Herzliya private nursing, short window"

# I: Ramat Gan, General Care
run_scenario "I" "Ramat Gan" '["General Care"]' '["Assisted Mobility Care"]' \
    "null" "null" false 10 \
    "Ramat Gan general care"

# J: Bat Yam, Specialized Procedures
run_scenario "J" "Bat Yam" '["Specialized Procedures","Clinical Care"]' '[]' \
    "2024-06-01T07:00:00Z" "2024-06-01T19:00:00Z" true 5 \
    "Bat Yam specialized procedures, urgent"

echo "=== CSV Smoke Tests Complete ==="
echo ""
echo "Results saved to docs/csv_case_*.json"
echo "Metadata saved to docs/csv_results_meta.json"
echo "Mode: $MODE"