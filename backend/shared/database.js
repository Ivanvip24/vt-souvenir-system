import pg from 'pg';
import { config } from 'dotenv';

const { Pool } = pg;

config();

// Database connection pool
let pool;

if (process.env.DB_TYPE === 'postgres') {
  // Use DATABASE_URL if available (Render.com, Heroku, etc.)
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  } else {
    // Fallback to individual environment variables (local development)
    pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }
} else {
  // SQLite support can be added here if needed
  console.warn('Only PostgreSQL is currently supported');
}

// Test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✓ Database connected successfully');
    client.release();
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
}

// Execute query
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

// Get a client from the pool
export async function getClient() {
  return await pool.connect();
}

// Close pool
export async function closePool() {
  await pool.end();
}

export default {
  query,
  getClient,
  testConnection,
  closePool,
};
