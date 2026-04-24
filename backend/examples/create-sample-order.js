import * as notionSync from '../agents/notion-agent/sync.js';

/**
 * Example: Creating a complete order from WhatsApp message
 *
 * This demonstrates how to create an order when a client
 * messages you with their requirements
 */

async function createSampleOrder() {
  console.log('📦 Creating sample order...\n');

  // Simulate order data received from client via WhatsApp
  const orderData = {
    // Client information
    clientName: "María González",
    clientPhone: "5512345678",
    clientAddress: "Avenida Juárez 123, Col. Centro",
    clientCity: "Guadalajara",
    clientState: "Jalisco",

    // Order items
    items: [
      {
        productName: "Quinceañera Souvenir - Hearts Design",
        quantity: 50,
        unitPrice: 10.00,    // Price per unit
        unitCost: 2.00       // Cost per unit (materials + labor)
      },
      {
        productName: "Custom Name Plate",
        quantity: 50,
        unitPrice: 5.00,
        unitCost: 1.00
      }
    ],

    // Calculate totals
    totalPrice: (50 * 10.00) + (50 * 5.00),  // 750
    productionCost: (50 * 2.00) + (50 * 1.00), // 150

    // Additional details
    notes: "Client needs by next week. Rush order. She will pick up in person.",
    priority: "high",
    deliveryDate: "2024-02-15"
  };

  try {
    console.log('Client: ' + orderData.clientName);
    console.log('Phone: ' + orderData.clientPhone);
    console.log('Total: $' + orderData.totalPrice.toFixed(2) + ' MXN');
    console.log('Production Cost: $' + orderData.productionCost.toFixed(2) + ' MXN');
    console.log('Profit: $' + (orderData.totalPrice - orderData.productionCost).toFixed(2) + ' MXN');
    console.log('Margin: ' + (((orderData.totalPrice - orderData.productionCost) / orderData.totalPrice) * 100).toFixed(1) + '%');
    console.log('\nItems:');
    orderData.items.forEach(item => {
      console.log(`  - ${item.productName} x ${item.quantity} @ $${item.unitPrice}`);
    });
    console.log('\nCreating order in system...');

    // Create order in both local database and Notion
    const result = await notionSync.createOrderBothSystems(orderData);

    console.log('\n✅ Order created successfully!');
    console.log('\n📋 Order Details:');
    console.log('   Order Number:', result.orderNumber);
    console.log('   Order ID (Local DB):', result.orderId);
    console.log('   Notion Page ID:', result.notionPageId);
    console.log('\n🔗 View in Notion:');
    console.log('   ' + result.notionPageUrl);

    console.log('\n💡 What happens next:');
    console.log('   1. ✅ Order page created in Notion');
    console.log('   2. ✅ Order saved in local database');
    console.log('   3. 📊 Order will appear in analytics');
    console.log('   4. 📧 Client confirmation email can be sent');
    console.log('   5. 📈 Included in next scheduled report');
    console.log('   6. 🔄 Status can be updated as order progresses');

    console.log('\n📱 Simulated WhatsApp Workflow:');
    console.log('   [Client WhatsApp] → [You receive order details]');
    console.log('   [You run this script] → [Order created automatically]');
    console.log('   [Notion updated] → [Team sees order]');
    console.log('   [Analytics tracked] → [Reports include this order]');

  } catch (error) {
    console.error('\n❌ Error creating order:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure database is initialized: npm run init-db');
    console.error('2. Check Notion integration is set up correctly');
    console.error('3. Verify all environment variables in .env');
    process.exit(1);
  }

  process.exit(0);
}

// Run the example
createSampleOrder();
