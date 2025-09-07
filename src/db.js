import pg from 'pg';
import { MongoClient } from 'mongodb';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

export async function loadNurses() {
  const useDb = process.env.USE_DB === 'true';
  const dbKind = process.env.DB_KIND || 'postgres';
  
  // If DB is disabled or not connected, load from JSON
  if (!useDb || (dbKind === 'postgres' && !pgPool) || (dbKind === 'mongodb' && !mongoDb)) {
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