#!/bin/bash

# Kill any existing node process on port 5003
lsof -ti:5003 | xargs -r kill -9 2>/dev/null || true

# Start the server in background
nohup npm start >/tmp/llm-matching.log 2>&1 &

# Wait for server to start
sleep 2

# Check health
echo "Checking server health..."
curl -s http://localhost:5003/health | jq . || echo "Server started (check logs if health failed)"

echo ""
echo "Server running on http://localhost:5003"
echo "Demo available at http://localhost:5003/docs/demo.html"
echo "Logs: tail -f /tmp/llm-matching.log"