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
      ORDER BY created_at DESC
      LIMIT 15
    `);

    console.log('Recent orders and their payment proof status:');
    console.log('==============================================');

    let firstProofCount = 0;
    let secondProofCount = 0;

    result.rows.forEach(order => {
      console.log(`\nOrder #${order.order_number} (ID: ${order.id}):`);
      console.log(`  Created: ${order.created_at}`);
      console.log(`  Payment Method: ${order.payment_method}`);

      if (order.payment_proof_url) {
        firstProofCount++;
        console.log(`  First Payment Proof: ✅ Present`);
        console.log(`    URL: ${order.payment_proof_url.substring(0, 50)}...`);
      } else {
        console.log(`  First Payment Proof: ❌ Missing`);
      }

      if (order.second_payment_proof_url) {
        secondProofCount++;
        console.log(`  Second Payment Proof: ✅ Present`);
        console.log(`    URL: ${order.second_payment_proof_url.substring(0, 50)}...`);
      } else {
        console.log(`  Second Payment Proof: ⚪ Not uploaded yet`);
      }
    });

    console.log('\n==============================================');
    console.log(`Summary: ${firstProofCount}/${result.rows.length} orders have first payment proof`);
    console.log(`         ${secondProofCount}/${result.rows.length} orders have second payment proof`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkPaymentUrls();