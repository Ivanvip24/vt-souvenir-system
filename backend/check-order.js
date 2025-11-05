import { query } from './shared/database.js';

async function checkOrder() {
  try {
    const result = await query(`
      SELECT
        o.id, o.order_number, o.total_price, o.total_production_cost,
        o.event_date, o.event_type, o.client_notes,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.address, c.city, c.state,
        json_agg(
          json_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'unit_cost', oi.unit_cost
          )
        ) as items
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_number = 'ORD-20251104-5859'
      GROUP BY o.id, c.name, c.phone, c.email, c.address, c.city, c.state
    `);

    if (result.rows.length === 0) {
      console.log('Order not found');
      return;
    }

    const order = result.rows[0];
    console.log('\n=== PostgreSQL Order Data ===\n');
    console.log('Order Number:', order.order_number);
    console.log('Client Name:', order.client_name);
    console.log('Client Phone:', order.client_phone);
    console.log('Client Email:', order.client_email);
    console.log('Client Address:', order.address);
    console.log('Client City:', order.city);
    console.log('Client State:', order.state);
    console.log('Event Type:', order.event_type);
    console.log('Event Date:', order.event_date);
    console.log('Total Price:', order.total_price);
    console.log('Production Cost:', order.total_production_cost);
    console.log('Client Notes:', order.client_notes);
    console.log('\nOrder Items:');
    console.log(JSON.stringify(order.items, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkOrder();
