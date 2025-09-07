# Database Setup

This service supports both PostgreSQL and MongoDB as database backends, with JSON file fallback when no database is configured.

## PostgreSQL Setup

### Schema

Create the following table in your PostgreSQL database:

```sql
CREATE TABLE nurses (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  services TEXT[],
  expertise_tags TEXT[],
  availability TEXT[],
  city VARCHAR(100),
  state VARCHAR(50),
  rating NUMERIC(3,2),
  reviews INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_nurses_city ON nurses(city);
CREATE INDEX idx_nurses_state ON nurses(state);
CREATE INDEX idx_nurses_rating ON nurses(rating DESC);
```

### Sample Seed Data

```sql
-- Insert sample nurses
INSERT INTO nurses (id, name, services, expertise_tags, availability, city, state, rating, reviews) VALUES
('nurse_001', 'Sarah Johnson', ARRAY['Wound Care', 'Medication'], ARRAY['Pediatrics', 'Emergency'], ARRAY['Mon-Fri 9-5'], 'New York', 'NY', 4.8, 127),
('nurse_002', 'Michael Chen', ARRAY['IV Therapy', 'Pain Management'], ARRAY['Geriatrics', 'ICU'], ARRAY['24/7 On-Call'], 'Los Angeles', 'CA', 4.9, 95),
('nurse_003', 'Emily Davis', ARRAY['Physical Therapy', 'Wound Care'], ARRAY['Orthopedics', 'Sports Medicine'], ARRAY['Weekends'], 'Chicago', 'IL', 4.7, 82),
('nurse_004', 'James Wilson', ARRAY['Medication', 'Monitoring'], ARRAY['Cardiology', 'Critical Care'], ARRAY['Night Shift'], 'Houston', 'TX', 4.6, 103),
('nurse_005', 'Maria Garcia', ARRAY['Home Health', 'Medication'], ARRAY['Diabetes Care', 'Nutrition'], ARRAY['Flexible'], 'Phoenix', 'AZ', 4.9, 156);
```

## MongoDB Setup

### Collection Structure

Create a `nurses` collection with documents following this structure:

```javascript
{
  "id": "nurse_001",
  "name": "Sarah Johnson",
  "services": ["Wound Care", "Medication"],
  "expertiseTags": ["Pediatrics", "Emergency"],
  "availability": ["Mon-Fri 9-5"],
  "city": "New York",
  "state": "NY",
  "rating": 4.8,
  "reviews": 127
}
```

### Sample Seed Data

```javascript
db.nurses.insertMany([
  {
    "id": "nurse_001",
    "name": "Sarah Johnson",
    "services": ["Wound Care", "Medication"],
    "expertiseTags": ["Pediatrics", "Emergency"],
    "availability": ["Mon-Fri 9-5"],
    "city": "New York",
    "state": "NY",
    "rating": 4.8,
    "reviews": 127
  },
  {
    "id": "nurse_002",
    "name": "Michael Chen",
    "services": ["IV Therapy", "Pain Management"],
    "expertiseTags": ["Geriatrics", "ICU"],
    "availability": ["24/7 On-Call"],
    "city": "Los Angeles",
    "state": "CA",
    "rating": 4.9,
    "reviews": 95
  },
  {
    "id": "nurse_003",
    "name": "Emily Davis",
    "services": ["Physical Therapy", "Wound Care"],
    "expertiseTags": ["Orthopedics", "Sports Medicine"],
    "availability": ["Weekends"],
    "city": "Chicago",
    "state": "IL",
    "rating": 4.7,
    "reviews": 82
  }
]);

// Create indexes
db.nurses.createIndex({ "city": 1 });
db.nurses.createIndex({ "state": 1 });
db.nurses.createIndex({ "rating": -1 });
```

## Environment Configuration

Configure your `.env` file with the appropriate database settings:

### PostgreSQL Configuration
```env
USE_DB=true
DB_KIND=postgres
DATABASE_URL=postgres://username:password@localhost:5432/wondercare
```

### MongoDB Configuration
```env
USE_DB=true
DB_KIND=mongodb
MONGODB_URI=mongodb://username:password@localhost:27017
MONGODB_DB=wondercare
MONGODB_COLLECTION=nurses
```

### Disable Database (Use JSON Fallback)
```env
USE_DB=false
```

## Data Privacy & Security

### Important Notes on LLM Integration

The LLM prompt receives a compacted version of the request and candidate list. When using database-backed data:

1. **No PII/Secrets in Prompts**: The system sends nurse data to the Azure OpenAI API. Ensure no sensitive personal information or secrets are stored in the database fields that are sent to the LLM.

2. **Data Redaction**: If your database contains sensitive fields, consider implementing redaction before sending to the LLM:
   - Remove or mask SSNs, personal phone numbers, addresses
   - Exclude internal employee IDs or system credentials
   - Use only professional/public information in LLM prompts

3. **Fields Sent to LLM**: The following fields are included in LLM prompts:
   - id, name, city, state
   - services, expertiseTags
   - availability
   - rating, reviews
   - location coordinates (if available)

### Example Redaction Implementation

If needed, you can modify `src/lib/llm.js` to redact sensitive data:

```javascript
function redactSensitiveData(nurse) {
  return {
    id: nurse.id,
    name: nurse.name, // Consider using first name + last initial
    city: nurse.city,
    state: nurse.state,
    services: nurse.services,
    expertiseTags: nurse.expertiseTags,
    availability: nurse.availability,
    rating: nurse.rating,
    reviews: nurse.reviews
    // Exclude: phone, email, address, ssn, etc.
  };
}
```

## Testing Database Connection

Use the `/db/health` endpoint to verify your database connection:

```bash
curl http://localhost:5003/db/health
```

Expected response when connected:
```json
{
  "database": {
    "enabled": true,
    "kind": "postgres",
    "connected": true,
    "message": "PostgreSQL connected",
    "count": 5
  }
}
```

Expected response when using JSON fallback:
```json
{
  "database": {
    "enabled": false,
    "kind": "postgres",
    "connected": false,
    "message": "Database disabled (JSON fallback)",
    "count": 0
  }
}
```

## Clear Operations

To clear all nurses from the database:

### PostgreSQL
```sql
TRUNCATE TABLE nurses;
-- or
DELETE FROM nurses;
```

### MongoDB
```javascript
db.nurses.deleteMany({});
```

## Performance Considerations

- Database queries add latency to the LLM matching process
- Consider implementing connection pooling for production use
- Index frequently queried fields (city, state, rating)
- The LLM processes the entire candidate list, so limit the total number of nurses for optimal performance
- Consider implementing pagination or filtering if dealing with large datasets