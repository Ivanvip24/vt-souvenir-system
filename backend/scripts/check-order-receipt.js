import dotenv from 'dotenv';
import pg from 'pg';

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
    const result = await pool.query(`
      SELECT
        order_number,
        payment_method,
        payment_proof_url,
        second_payment_proof_url,
        created_at
      FROM orders
      WHERE order_number = 'ORD-20251110-5390'
    `);

    console.log('\n🔍 Order Receipt Check:');
    console.log('='.repeat(80));

    if (result.rows.length === 0) {
      console.log('Order not found');
    } else {
      const order = result.rows[0];
      console.log(`\nOrder: ${order.order_number}`);
      console.log(`Payment Method: ${order.payment_method}`);
      console.log(`Created: ${order.created_at}`);
      console.log(`\nFirst Payment Proof URL:`);
      console.log(order.payment_proof_url || '❌ NULL (NOT STORED)');
      console.log(`\nSecond Payment Proof URL:`);
      console.log(order.second_payment_proof_url || '⚪ Not yet');
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
