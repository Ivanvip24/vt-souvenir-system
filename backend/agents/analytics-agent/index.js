// Analytics Agent - Main Entry Point
// This agent handles all analytics, reporting, and automated email delivery

import * as revenueCalculator from './revenue-calculator.js';
import * as reportGenerator from './report-generator.js';
import * as emailSender from './email-sender.js';
import * as scheduler from './scheduler.js';

/**
 * Initialize the Analytics Agent
 */
export async function initialize() {
  console.log('🚀 Initializing Analytics Agent...\n');

  // Initialize email sender
  emailSender.initializeEmailSender();

  // Initialize scheduler for automated reports
  scheduler.initializeScheduler();

  console.log('✅ Analytics Agent initialized successfully\n');
}

/**
 * Get analytics summary for a period
 */
export async function getAnalytics(periodType = 'this_month') {
  return await revenueCalculator.getAnalyticsSummary(periodType);
}

/**
 * Generate and send daily report
 */
export async function sendDailyReport(date = new Date()) {
  const report = await reportGenerator.generateDailyReport(date);
  return await emailSender.sendDailyReport(report.html, date);
}

/**
 * Generate and send monthly report
 */
export async function sendMonthlyReport(year, month) {
  const report = await reportGenerator.generateMonthlyReport(year, month);
  return await emailSender.sendMonthlyReport(report.html, year, month);
}

/**
 * Get revenue data
 */
export async function getRevenue(startDate, endDate) {
  return await revenueCalculator.calculateRevenue(startDate, endDate);
}

/**
 * Get top products
 */
export async function getTopProducts(startDate, endDate, limit = 10) {
  return await revenueCalculator.getTopProducts(startDate, endDate, limit);
}

/**
 * Get top clients
 */
export async function getTopClients(startDate, endDate, limit = 10) {
  return await revenueCalculator.getTopClients(startDate, endDate, limit);
}

// Export all modules
export {
  revenueCalculator,
  reportGenerator,
  emailSender,
  scheduler
};

export default {
  initialize,
  getAnalytics,
  sendDailyReport,
  sendMonthlyReport,
  getRevenue,
  getTopProducts,
  getTopClients,
  revenueCalculator,
  reportGenerator,
  emailSender,
  scheduler
};
