# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM-based healthcare staffing matching service that uses Azure OpenAI to intelligently rank nurse candidates for patient requests.

## Architecture

- **Express API Server**: Runs on port 5003 (configurable via `PORT`)
- **LLM Integration**: Azure OpenAI Responses API with structured JSON output
- **Data Model**: Nurses with services, expertise tags, availability, location, and ratings
- **Matching Logic**: `src/lib/llm.js` handles prompt building and Azure OpenAI communication

## Key Components

- `src/index.js`: Express server with `/health` and `/match` endpoints
- `src/lib/llm.js`: Core LLM matching logic using Azure OpenAI Responses API
- `sample_data/nurses.json`: Sample nurse data for testing

## Development Commands

```bash
# Install dependencies
npm install

# Run the server
npm start

# The service expects these environment variables:
# AZURE_OPENAI_URI - Full Azure OpenAI endpoint URL
# AZURE_OPENAI_KEY - API key for Azure OpenAI
# AZURE_OPENAI_DEPLOYMENT - Model deployment name
# PORT - Server port (default 5003)
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /match` - Match nurses to patient request
  - Request body includes: city, servicesQuery, expertiseQuery, timeWindow, location, urgent
  - Returns ranked candidates with scores and reasons

## Azure OpenAI Integration

The service uses Azure OpenAI's Responses API with:
- Structured JSON output via `response_format.json_schema`
- Input format using role-based messages with `input_text` type
- Returns top candidates with scores (0-1) and reasoning