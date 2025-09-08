#!/bin/bash

echo "=== LLM CSV Deep Smoke Tests ==="
echo ""

# Detect mode by sourcing .env if exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs) 2>/dev/null
fi

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

# Run 10 deep scenarios (A through J) aligned with other engines
echo "Running 10 deep scenarios..."
echo "----------------------------"

# A: Tel Aviv, Wound Care, 30km radius
run_scenario "A" "Tel Aviv" '["Wound Care"]' '["Post-Surgery Care"]' \
    "2024-01-15T08:00:00Z" "2024-01-15T20:00:00Z" true 5 \
    "Tel Aviv wound care 30km"

# B: Jerusalem, Medication Administration, 40km
run_scenario "B" "Jerusalem" '["Medication Administration"]' '["Pharmacy Services"]' \
    "2024-02-01T09:00:00Z" "2024-02-01T17:00:00Z" false 5 \
    "Jerusalem medication 40km"

# C: Haifa, Pediatrics, 50km
run_scenario "C" "Haifa" '["Pediatric Care"]' '["Child Care"]' \
    "null" "null" false 10 \
    "Haifa pediatrics 50km"

# D: Beer Sheva, Hospital Care, 60km
run_scenario "D" "Beer Sheva" '["Hospital Care"]' '["Inpatient Services"]' \
    "2024-03-10T06:00:00Z" "2024-03-10T22:00:00Z" false 5 \
    "Beer Sheva hospital 60km"

# E: Rishon LeTsiyon, Home Care, 35km
run_scenario "E" "Rishon LeTsiyon" '["Home Care"]' '["Mobile Patient Care"]' \
    "null" "null" false 3 \
    "Rishon home care 35km"

# F: Netanya, Day Night nursing, 45km
run_scenario "F" "Netanya" '["Day Night","Post-Surgery Care"]' '[]' \
    "2024-04-01T08:00:00Z" "2024-04-30T18:00:00Z" false 7 \
    "Netanya day-night 45km"

# G: Ashdod, Geriatric Care, 55km
run_scenario "G" "Ashdod" '["Geriatric Care"]' '["Elder Care"]' \
    "null" "null" false 5 \
    "Ashdod geriatric 55km"

# H: Herzliya, Emergency Care, 30km, urgent
run_scenario "H" "Herzliya" '["Emergency Care"]' '["Critical Care"]' \
    "2024-05-15T10:00:00Z" "2024-05-15T14:00:00Z" true 5 \
    "Herzliya emergency 30km urgent"

# I: Ramat Gan, IV Therapy, 40km
run_scenario "I" "Ramat Gan" '["IV Therapy","Catheter Care"]' '[]' \
    "null" "null" false 10 \
    "Ramat Gan IV therapy 40km"

# J: Bat Yam, General Care, 50km
run_scenario "J" "Bat Yam" '["General Care"]' '["Home Care"]' \
    "2024-06-01T07:00:00Z" "2024-06-01T19:00:00Z" false 5 \
    "Bat Yam general care 50km"

echo "=== CSV Smoke Tests Complete ==="
echo ""
echo "Results saved to docs/csv_case_*.json"
echo "Metadata saved to docs/csv_results_meta.json"
echo "Mode: $MODE"