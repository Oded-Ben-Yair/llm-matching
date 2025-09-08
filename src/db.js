import pg from 'pg';
import { MongoClient } from 'mongodb';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pgPool = null;
let mongoDb = null;
let mongoClient = null;

export async function initDb() {
  const useDb = process.env.USE_DB === 'true';
  const dbKind = process.env.DB_KIND || 'postgres';

  if (!useDb) {
    console.log('Database disabled (USE_DB=false), using JSON fallback');
    return;
  }

  try {
    if (dbKind === 'postgres') {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL not configured');
      }
      
      pgPool = new pg.Pool({ connectionString });
      
      // Test connection
      const client = await pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      
      console.log('✓ Connected to PostgreSQL database');
    } else if (dbKind === 'mongodb') {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI not configured');
      }
      
      mongoClient = new MongoClient(uri);
      await mongoClient.connect();
      
      const dbName = process.env.MONGODB_DB || 'wondercare';
      mongoDb = mongoClient.db(dbName);
      
      // Test connection
      await mongoDb.command({ ping: 1 });
      
      console.log('✓ Connected to MongoDB database');
    } else {
      throw new Error(`Unknown DB_KIND: ${dbKind}`);
    }
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    console.log('Falling back to JSON data');
    
    // Clean up on failure
    if (pgPool) {
      await pgPool.end().catch(() => {});
      pgPool = null;
    }
    if (mongoClient) {
      await mongoClient.close().catch(() => {});
      mongoClient = null;
      mongoDb = null;
    }
    
    throw error;
  }
}

export async function dbHealth() {
  const useDb = process.env.USE_DB === 'true';
  const dbKind = process.env.DB_KIND || 'postgres';
  
  const health = {
    database: {
      enabled: useDb,
      kind: dbKind,
      connected: false,
      message: '',
      count: 0
    }
  };
  
  if (!useDb) {
    health.database.message = 'Database disabled (JSON fallback)';
    return health;
  }
  
  try {
    if (dbKind === 'postgres' && pgPool) {
      const client = await pgPool.connect();
      try {
        const result = await client.query('SELECT COUNT(*) FROM nurses');
        health.database.connected = true;
        health.database.count = parseInt(result.rows[0].count);
        health.database.message = 'PostgreSQL connected';
      } finally {
        client.release();
      }
    } else if (dbKind === 'mongodb' && mongoDb) {
      const collection = process.env.MONGODB_COLLECTION || 'nurses';
      const count = await mongoDb.collection(collection).countDocuments();
      health.database.connected = true;
      health.database.count = count;
      health.database.message = 'MongoDB connected';
    } else {
      health.database.message = 'Database not initialized';
    }
  } catch (error) {
    health.database.message = `Database error: ${error.message}`;
  }
  
  return health;
}

// Helper to create deterministic hash-based value 0-1 from string
function hashToUnit(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 1000) / 1000; // Return value 0-1
}

// Helper to normalize services/expertise from CSV treatment types
function normalizeServices(treatmentType) {
  const serviceMap = {
    'CENTRAL_CATHETER_TREATMENT': ['Catheter Care', 'IV Therapy'],
    'DAY_NIGHT_CIRCUMCISION_NURSE': ['Post-Surgery Care', 'Pediatric Care', 'Day Night'],
    'DEFAULT': ['General Care', 'Home Care'],
    'ENEMA_UNDER_INSTRUCTION': ['Specialized Procedures', 'Clinical Care'],
    'PRIVATE_SECURITY_HOME': ['Home Care', 'Private Nursing'],
    'WOUND_CARE': ['Wound Care', 'Post-Surgery Care'],
    'GERIATRIC': ['Geriatric Care', 'Elder Care'],
    'PEDIATRIC': ['Pediatric Care', 'Child Care'],
    'EMERGENCY': ['Emergency Care', 'Critical Care'],
    'MEDICATION': ['Medication Administration', 'Pharmacy Services'],
    'HOSPITAL': ['Hospital Care', 'Inpatient Services']
  };
  return serviceMap[treatmentType] || ['General Care'];
}

function normalizeMobility(mobility) {
  const mobilityMap = {
    'INDEPENDENT': ['Mobile Patient Care'],
    'WALKER': ['Assisted Mobility Care'],
    'WHEELCHAIR': ['Wheelchair Patient Care'],
    'BEDRIDDEN': ['Bedridden Patient Care']
  };
  return mobilityMap[mobility] || [];
}

// Try to load from CSV first, then fallback to JSON
async function loadFromCSV() {
  const csvPath = join(__dirname, '..', 'sample_data', 'nurses.csv');
  
  try {
    await fs.access(csvPath);
    console.log('Loading nurses from CSV file');
    
    const csvContent = await fs.readFile(csvPath, 'utf8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });
    
    // Load city centroids
    const centroidsPath = join(__dirname, '..', 'sample_data', 'city_centroids_il.json');
    const centroidsData = await fs.readFile(centroidsPath, 'utf8');
    const centroids = JSON.parse(centroidsData);
    
    // Group by nurse_id and aggregate data
    const nursesMap = new Map();
    let counter = 1;
    
    for (const record of records) {
      const nurseId = record.nurse_id;
      const city = record.municipality || 'Unknown';
      
      if (!nursesMap.has(nurseId)) {
        const coords = centroids[city] || { lat: 32.0853, lng: 34.7818 }; // Default to Tel Aviv
        
        nursesMap.set(nurseId, {
          id: nurseId, // Use actual nurse_id
          name: `Nurse ${counter}`, // Anonymous name
          city: city,
          lat: coords.lat,
          lng: coords.lng,
          gender: record.gender,
          mobility: record.mobility,
          services: new Set(),
          expertiseTags: new Set(),
          rating: 4.2 + hashToUnit(nurseId) * 0.7, // Deterministic 4.2-4.9
          reviewsCount: Math.floor(50 + hashToUnit(nurseId + 'reviews') * 150), // Deterministic 50-200
          availability: {
            from: record.from_datetime_utc || '2024-01-01T08:00:00Z',
            to: record.to_datetime_utc || '2024-12-31T18:00:00Z'
          },
          status: record.status
        });
        counter++;
      }
      
      const nurse = nursesMap.get(nurseId);
      
      // Add services from treatment type
      const services = normalizeServices(record.treatment_type || record.name);
      services.forEach(s => nurse.services.add(s));
      
      // Add expertise from mobility
      const expertise = normalizeMobility(record.mobility);
      expertise.forEach(e => nurse.expertiseTags.add(e));
    }
    
    // Convert to array and clean up Sets
    const nurses = Array.from(nursesMap.values()).map(n => ({
      ...n,
      services: Array.from(n.services),
      expertiseTags: Array.from(n.expertiseTags)
    }));
    
    console.log(`Loaded ${nurses.length} nurses from CSV`);
    return nurses;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('CSV file not found, falling back to JSON');
    } else {
      console.error('Error loading CSV:', error.message);
    }
    return null;
  }
}

export async function loadNurses() {
  const useDb = process.env.USE_DB === 'true';
  const dbKind = process.env.DB_KIND || 'postgres';
  
  // If DB is disabled or not connected, try CSV first then JSON
  if (!useDb || (dbKind === 'postgres' && !pgPool) || (dbKind === 'mongodb' && !mongoDb)) {
    // Try CSV first
    const csvNurses = await loadFromCSV();
    if (csvNurses) {
      return csvNurses;
    }
    
    // Fallback to JSON
    console.log('Loading nurses from JSON file');
    const jsonPath = join(__dirname, '..', 'sample_data', 'nurses.json');
    const data = await fs.readFile(jsonPath, 'utf8');
    const nurses = JSON.parse(data);
    return nurses;
  }
  
  try {
    if (dbKind === 'postgres') {
      const client = await pgPool.connect();
      try {
        const result = await client.query(`
          SELECT 
            id,
            name,
            services,
            expertise_tags as "expertiseTags",
            availability,
            city,
            state,
            rating,
            reviews
          FROM nurses
          ORDER BY id
        `);
        
        return result.rows.map(row => ({
          id: row.id,
          name: row.name,
          services: row.services || [],
          expertiseTags: row.expertiseTags || [],
          availability: row.availability || [],
          city: row.city,
          state: row.state,
          rating: parseFloat(row.rating) || 0,
          reviews: parseInt(row.reviews) || 0
        }));
      } finally {
        client.release();
      }
    } else if (dbKind === 'mongodb') {
      const collection = process.env.MONGODB_COLLECTION || 'nurses';
      const nurses = await mongoDb.collection(collection)
        .find({})
        .project({
          _id: 0,
          id: 1,
          name: 1,
          services: 1,
          expertiseTags: 1,
          availability: 1,
          city: 1,
          state: 1,
          rating: 1,
          reviews: 1
        })
        .toArray();
      
      return nurses.map(nurse => ({
        id: nurse.id,
        name: nurse.name,
        services: nurse.services || [],
        expertiseTags: nurse.expertiseTags || [],
        availability: nurse.availability || [],
        city: nurse.city,
        state: nurse.state,
        rating: parseFloat(nurse.rating) || 0,
        reviews: parseInt(nurse.reviews) || 0
      }));
    }
  } catch (error) {
    console.error('Error loading nurses from database:', error);
    console.log('Falling back to JSON data');
    
    // Fallback to JSON on error
    const jsonPath = join(__dirname, '..', 'sample_data', 'nurses.json');
    const data = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(data);
  }
}

// Cleanup function
export async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    mongoDb = null;
  }
}