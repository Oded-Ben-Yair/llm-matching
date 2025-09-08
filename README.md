# llm-matching

LLM-based healthcare staffing matching service that uses Azure OpenAI to intelligently rank nurse candidates for patient requests.

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Open the demo interface
open http://localhost:5003/docs/demo.html
```

The service runs in **mock mode** by default when Azure credentials are not configured, allowing local development and testing without Azure OpenAI.

## Features

- **Intelligent Matching**: Uses Azure OpenAI to analyze and rank candidates based on multiple factors
- **Mock Mode**: Runs locally without Azure credentials for development
- **Resilient API Calls**: Automatic retries with exponential backoff for transient errors
- **Database Support**: Postgres primary, MongoDB optional, with JSON fallback
- **RESTful API**: Simple HTTP endpoints for health checks and matching requests
- **Flexible Scoring**: Considers skills, expertise, location, availability, ratings, and urgency

## Testing

```bash
# Run smoke tests (works without Azure)
npm run test:smoke

# Run live tests (requires Azure credentials)
npm run test:live
```

Test artifacts are saved in the `docs/` directory for review.

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /db/health` - Database health check with connection status and record count
- `POST /match` - Match nurses to patient request
  ```json
  {
    "city": "New York",
    "servicesQuery": ["Wound Care"],
    "expertiseQuery": ["Pediatrics"],
    "timeWindow": { "start": "2024-01-15", "end": "2024-01-20" },
    "location": { "lat": 40.7128, "lng": -74.0060 },
    "urgent": true
  }
  ```

## Database Integration

The service supports multiple database backends with automatic fallback to JSON data.

### Environment Configuration

```bash
# Enable/disable database
USE_DB=true

# Choose database type
DB_KIND=postgres  # or mongodb

# PostgreSQL configuration
DATABASE_URL=postgres://user:pass@localhost:5432/wondercare

# MongoDB configuration
MONGODB_URI=mongodb://user:pass@localhost:27017
MONGODB_DB=wondercare
MONGODB_COLLECTION=nurses
```

### Database Health Check

Monitor database connectivity and record count:

```bash
curl http://localhost:5003/db/health
```

Response when connected:
```json
{
  "database": {
    "enabled": true,
    "kind": "postgres",
    "connected": true,
    "message": "PostgreSQL connected",
    "count": 42
  }
}
```

### Running with Production Database

```bash
# PostgreSQL
USE_DB=true DB_KIND=postgres DATABASE_URL=postgres://prod_user:prod_pass@prod_host:5432/wondercare npm start

# MongoDB
USE_DB=true DB_KIND=mongodb MONGODB_URI=mongodb://prod_user:prod_pass@prod_host:27017 npm start

# JSON fallback (no database)
USE_DB=false npm start
```

### Database Setup

See [docs/DB_SETUP.md](docs/DB_SETUP.md) for:
- PostgreSQL schema and indexes
- MongoDB collection structure
- Sample seed data
- Security considerations for LLM integration
- Data privacy and redaction guidelines

## Azure OpenAI Configuration

The service supports both mock mode (for local development) and live Azure OpenAI integration:

### Mock Mode (Default)
When Azure credentials are not configured, the service automatically uses mock responses for development and testing.

### Live Mode
Configure these environment variables for Azure OpenAI Responses API:

```bash
AZURE_OPENAI_URI=https://your-instance.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=gpt-5
```

**Security Notes**: 
- API keys are masked in logs (only hostname shown)
- Request/response bodies are truncated to 500 chars in logs
- The LLM receives candidate data for ranking - ensure no sensitive PII or secrets are included

## Architecture

- **Express Server** (`src/index.js`): HTTP API with health and match endpoints
- **LLM Integration** (`src/lib/llm.js`): Azure OpenAI communication with structured JSON output
- **Database Adapter** (`src/db.js`): Multi-database support with automatic fallback
- **Sample Data** (`sample_data/nurses.json`): Fallback data when database is unavailable

## Performance Considerations

- Database queries add latency to LLM matching operations
- The LLM processes the entire candidate list, so limit dataset size for optimal performance
- Consider implementing caching for frequently requested matches
- Database connection pooling is implemented for production use

## Development

```bash
# Install dependencies
npm install

# Run with environment variables
USE_DB=true DB_KIND=postgres npm start

# Test endpoints
curl http://localhost:5003/health
curl http://localhost:5003/db/health
curl -X POST http://localhost:5003/match \
  -H "Content-Type: application/json" \
  -d '{"city": "New York", "servicesQuery": ["Wound Care"]}'
```

## Documentation

- [Database Setup Guide](docs/DB_SETUP.md) - Complete database configuration and security
- [Demo Interface](docs/demo.html) - Interactive web interface for testing

## License

MIT