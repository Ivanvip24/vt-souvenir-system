import dotenv from 'dotenv';import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkOrder() {
  try {
    // Check the most recent order
    const result = await pool.query(`
      SELECT
        o.id,
        o.order_number,
        o.payment_method,
        o.payment_proof_url,
        o.second_payment_proof_url,
        o.created_at,
        c.name as client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.order_number = 'ORD-20251110-7905'
         OR o.created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    console.log('\n🔍 Recent Orders Check:');
    console.log('=' .repeat(80));

    if (result.rows.length === 0) {
      console.log('No recent orders found');
    } else {
      result.rows.forEach(order => {
        console.log(`\nOrder: ${order.order_number}`);
        console.log(`  Client: ${order.client_name}`);
        console.log(`  Created: ${order.created_at}`);
        console.log(`  Payment Method: ${order.payment_method}`);
        console.log(`  First Payment Proof URL: ${order.payment_proof_url ? '✅ ' + order.payment_proof_url : '❌ NULL'}`);
        console.log(`  Second Payment Proof URL: ${order.second_payment_proof_url ? '✅ Present' : '⚪ Not yet'}`);
      });
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkOrder();