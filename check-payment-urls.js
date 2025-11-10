require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com') ? {
    rejectUnauthorized: false
  } : false
});

async function checkPaymentUrls() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        order_number,
        payment_proof_url,
        second_payment_proof_url,
        payment_method,
        created_at
      FROM orders
      WHERE payment_proof_url IS NOT NULL
         OR second_payment_proof_url IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('Recent orders with payment proofs:');
    console.log('=====================================');

    result.rows.forEach(order => {
      console.log(`\nOrder #${order.order_number} (ID: ${order.id}):`);
      console.log(`  Created: ${order.created_at}`);
      console.log(`  Payment Method: ${order.payment_method}`);
      console.log(`  First Payment Proof: ${order.payment_proof_url ? '✅ Present' : '❌ Missing'}`);
      if (order.payment_proof_url) {
        console.log(`    URL: ${order.payment_proof_url}`);
      }
      console.log(`  Second Payment Proof: ${order.second_payment_proof_url ? '✅ Present' : '❌ Missing'}`);
      if (order.second_payment_proof_url) {
        console.log(`    URL: ${order.second_payment_proof_url}`);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkPaymentUrls();