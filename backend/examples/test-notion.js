import * as notionAgent from '../agents/notion-agent/index.js';
import * as notionSync from '../agents/notion-agent/sync.js';

async function testNotionIntegration() {
  console.log('🧪 Testing Notion Integration Agent...\n');

  try {
    // Test 1: Create a test order
    console.log('Test 1: Creating test order in both systems...');
    const testOrder = {
      clientName: "Test Client",
      clientPhone: "5512345678",
      clientAddress: "Test Address 123",
      clientCity: "Ciudad de México",
      clientState: "CDMX",
      totalPrice: 500,
      productionCost: 100,
      notes: "This is a test order",
      items: [
        {
          productName: "Test Product",
          quantity: 10,
          unitPrice: 50,
          unitCost: 10
        }
      ]
    };

    const createResult = await notionSync.createOrderBothSystems(testOrder);
    console.log('✅ Test order created:');
    console.log('   Order ID:', createResult.orderId);
    console.log('   Order Number:', createResult.orderNumber);
    console.log('   Notion Page URL:', createResult.notionPageUrl);

    const notionPageId = createResult.notionPageId;

    // Test 2: Retrieve order from Notion
    console.log('\nTest 2: Retrieving order from Notion...');
    const getResult = await notionAgent.getOrder(notionPageId);
    console.log('✅ Order retrieved:');
    console.log('   Client:', getResult.data.clientName);
    console.log('   Total:', getResult.data.totalPrice);
    console.log('   Status:', getResult.data.status);

    // Test 3: Update order status
    console.log('\nTest 3: Updating order status...');
    await notionSync.syncStatusToNotion(createResult.orderId, 'printing');
    console.log('✅ Status updated to "printing"');

    // Test 4: Query orders
    console.log('\nTest 4: Querying orders...');
    const queryResult = await notionAgent.queryOrders({
      status: 'printing'
    });
    console.log(`✅ Found ${queryResult.count} orders with status "printing"`);

    // Test 5: Update order details
    console.log('\nTest 5: Updating order details in Notion...');
    await notionAgent.updateOrder(notionPageId, {
      notes: 'Updated test note',
      priority: 'high'
    });
    console.log('✅ Order details updated');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));
    console.log('\n📌 Test order created in Notion:');
    console.log(`   ${createResult.notionPageUrl}`);
    console.log('\n💡 You can now check your Notion database to see the test order.');
    console.log('   Feel free to delete it or use it for further testing.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check that NOTION_API_TOKEN is set in .env');
    console.error('2. Verify NOTION_ORDERS_DATABASE_ID is correct');
    console.error('3. Ensure the integration is added to your Notion database');
    console.error('4. Check that database properties match the configuration\n');
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
testNotionIntegration();
