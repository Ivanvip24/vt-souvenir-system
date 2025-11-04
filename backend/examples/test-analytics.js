import * as analyticsAgent from '../agents/analytics-agent/index.js';
import { getDateRange } from '../shared/utils.js';

async function testAnalyticsAgent() {
  console.log('🧪 Testing Analytics Agent...\n');

  try {
    // Test 1: Get analytics summary for this month
    console.log('Test 1: Getting analytics summary for this month...');
    const summary = await analyticsAgent.getAnalytics('this_month');

    console.log('✅ Analytics summary:');
    console.log('   Period:', summary.dateRange.start, 'to', summary.dateRange.end);
    console.log('   Orders:', summary.revenue.orderCount);
    console.log('   Revenue:', summary.revenue.revenue.toFixed(2), process.env.CURRENCY || 'MXN');
    console.log('   Profit:', summary.revenue.profit.toFixed(2), process.env.CURRENCY || 'MXN');
    console.log('   Avg Margin:', summary.revenue.profitMargin.toFixed(1), '%');

    // Test 2: Get revenue comparison
    console.log('\nTest 2: Revenue comparison (current vs previous month)...');
    if (summary.comparison) {
      console.log('✅ Comparison:');
      console.log('   Revenue change:', summary.comparison.comparison.revenueChangePercent.toFixed(1), '%');
      console.log('   Profit change:', summary.comparison.comparison.profitChangePercent.toFixed(1), '%');
      console.log('   Order count change:', summary.comparison.comparison.orderCountChange);
    }

    // Test 3: Get top products
    console.log('\nTest 3: Getting top products...');
    if (summary.topProducts && summary.topProducts.length > 0) {
      console.log('✅ Top Products:');
      summary.topProducts.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.productName}`);
        console.log(`      Quantity: ${product.totalQuantity}`);
        console.log(`      Revenue: ${product.revenue.toFixed(2)}`);
        console.log(`      Profit: ${product.profit.toFixed(2)}`);
      });
    } else {
      console.log('⚠️  No products found for this period');
    }

    // Test 4: Get top clients
    console.log('\nTest 4: Getting top clients...');
    if (summary.topClients && summary.topClients.length > 0) {
      console.log('✅ Top Clients:');
      summary.topClients.forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.clientName}`);
        console.log(`      Orders: ${client.orderCount}`);
        console.log(`      Total Spent: ${client.totalSpent.toFixed(2)}`);
      });
    } else {
      console.log('⚠️  No clients found for this period');
    }

    // Test 5: Get low margin orders
    console.log('\nTest 5: Checking for low margin orders...');
    if (summary.lowMarginOrders && summary.lowMarginOrders.length > 0) {
      console.log(`⚠️  Found ${summary.lowMarginOrders.length} low margin orders:`);
      summary.lowMarginOrders.forEach((order) => {
        console.log(`   ${order.orderNumber}: ${order.profitMargin.toFixed(1)}% margin`);
      });
    } else {
      console.log('✅ No low margin orders found');
    }

    // Test 6: Production metrics
    console.log('\nTest 6: Production efficiency metrics...');
    if (summary.productionMetrics) {
      console.log('✅ Production Metrics:');
      console.log('   Completed orders:', summary.productionMetrics.completedOrders);
      console.log('   Completion rate:', summary.productionMetrics.completionRate.toFixed(1), '%');
      console.log('   On-time delivery rate:', summary.productionMetrics.onTimeRate.toFixed(1), '%');
      console.log('   Avg completion days:', summary.productionMetrics.avgCompletionDays);
    }

    // Test 7: Generate daily report (HTML only, don't send)
    console.log('\nTest 7: Generating daily report (HTML)...');
    const dailyReport = await analyticsAgent.reportGenerator.generateDailyReport(new Date());
    console.log('✅ Daily report generated successfully');
    console.log('   Report length:', dailyReport.html.length, 'characters');

    // Test 8: Generate monthly report (HTML only, don't send)
    console.log('\nTest 8: Generating monthly report (HTML)...');
    const now = new Date();
    const monthlyReport = await analyticsAgent.reportGenerator.generateMonthlyReport(
      now.getFullYear(),
      now.getMonth() + 1
    );
    console.log('✅ Monthly report generated successfully');
    console.log('   Report length:', monthlyReport.html.length, 'characters');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All analytics tests passed!');
    console.log('='.repeat(60));

    console.log('\n💡 Tips:');
    console.log('   - To send reports via email, use the API endpoints');
    console.log('   - To test email: curl -X POST http://localhost:3000/api/test/email');
    console.log('   - To send daily report: curl -X POST http://localhost:3000/api/reports/daily/send');
    console.log('   - Check scheduled jobs: curl http://localhost:3000/api/reports/schedule\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure database is initialized: npm run init-db');
    console.error('2. Check database connection settings in .env');
    console.error('3. Verify you have some orders in the database');
    console.error('4. Run the Notion test first to create sample data\n');
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
testAnalyticsAgent();
