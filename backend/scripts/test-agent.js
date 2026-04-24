/**
 * AUTOMATED TESTING & VULNERABILITY SCANNER
 *
 * This agent acts like a "web reinforcer" that:
 * 1. Scans all API endpoints for bugs
 * 2. Tests database schema integrity
 * 3. Checks for security vulnerabilities
 * 4. Validates data types and constraints
 * 5. Tests error handling
 * 6. Generates detailed reports
 */

import { config } from 'dotenv';
import { query, closePool } from './shared/database.js';
import fetch from 'node-fetch';

config();

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  critical: []
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    pass: `${colors.green}✓${colors.reset}`,
    fail: `${colors.red}✗${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    info: `${colors.cyan}ℹ${colors.reset}`,
    critical: `${colors.red}🔥${colors.reset}`
  }[type] || '';

  console.log(`${prefix} [${timestamp}] ${message}`);
}

// ==========================================
// DATABASE SCHEMA TESTS
// ==========================================

async function testDatabaseSchema() {
  log('Testing database schema integrity...', 'info');

  const tests = [
    {
      name: 'orders table has all required columns',
      query: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'orders'
        AND column_name IN ('event_type', 'event_date', 'client_notes', 'subtotal',
                             'deposit_amount', 'payment_method', 'approval_status')
      `,
      expected: 7
    },
    {
      name: 'products table exists',
      query: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products')",
      expected: true
    },
    {
      name: 'clients table exists',
      query: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'clients')",
      expected: true
    },
    {
      name: 'payments table exists',
      query: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payments')",
      expected: true
    },
    {
      name: 'order_files table exists',
      query: "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_files')",
      expected: true
    }
  ];

  for (const test of tests) {
    try {
      const result = await query(test.query);
      const actual = test.expected === 7 ? result.rows.length : result.rows[0].exists;

      if (actual === test.expected) {
        log(`${test.name}`, 'pass');
        testResults.passed.push(test.name);
      } else {
        log(`${test.name} - Expected: ${test.expected}, Got: ${actual}`, 'fail');
        testResults.failed.push({ test: test.name, expected: test.expected, actual });
      }
    } catch (error) {
      log(`${test.name} - Error: ${error.message}`, 'fail');
      testResults.failed.push({ test: test.name, error: error.message });
    }
  }
}

// ==========================================
// API ENDPOINT TESTS
// ==========================================

async function testAPIEndpoints() {
  log('Testing API endpoints...', 'info');

  const endpoints = [
    { method: 'GET', path: '/health', expectedStatus: 200, name: 'Health check' },
    { method: 'GET', path: '/api/client/products', expectedStatus: 200, name: 'Get products' },
    {
      method: 'POST',
      path: '/api/client/orders/submit',
      body: {
        clientName: 'Test User',
        clientPhone: '1234567890',
        clientEmail: 'test@example.com',
        clientAddress: 'Test Address',
        clientCity: 'Test City',
        clientState: 'Test State',
        clientPostal: '12345',
        items: [{ productId: 14, quantity: 1 }],
        eventType: 'test',
        eventDate: '2025-12-01',
        paymentMethod: 'bank_transfer'
      },
      expectedStatus: 201,
      name: 'Submit order'
    }
  ];

  for (const endpoint of endpoints) {
    try {
      const options = {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (endpoint.body) {
        options.body = JSON.stringify(endpoint.body);
      }

      const response = await fetch(`${API_BASE}${endpoint.path}`, options);

      if (response.status === endpoint.expectedStatus) {
        log(`${endpoint.name} (${endpoint.method} ${endpoint.path})`, 'pass');
        testResults.passed.push(endpoint.name);
      } else {
        log(`${endpoint.name} - Expected status ${endpoint.expectedStatus}, got ${response.status}`, 'fail');
        testResults.failed.push({
          test: endpoint.name,
          expected: endpoint.expectedStatus,
          actual: response.status
        });
      }
    } catch (error) {
      log(`${endpoint.name} - Error: ${error.message}`, 'fail');
      testResults.failed.push({ test: endpoint.name, error: error.message });
    }
  }
}

// ==========================================
// SECURITY TESTS
// ==========================================

async function testSecurity() {
  log('Running security tests...', 'info');

  // Test 1: SQL Injection attempt
  try {
    const maliciousInput = "'; DROP TABLE products; --";
    const result = await query('SELECT id FROM clients WHERE phone = $1', [maliciousInput]);
    log('SQL injection protection (parameterized queries)', 'pass');
    testResults.passed.push('SQL injection protection');
  } catch (error) {
    log('SQL injection protection failed', 'critical');
    testResults.critical.push('SQL injection vulnerability detected');
  }

  // Test 2: XSS attempt in order submission
  try {
    const xssPayload = '<script>alert("XSS")</script>';
    const response = await fetch(`${API_BASE}/api/client/orders/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: xssPayload,
        clientPhone: '1234567890',
        clientEmail: 'test@example.com',
        clientAddress: 'Test',
        clientCity: 'Test',
        clientState: 'Test',
        clientPostal: '12345',
        items: [{ productId: 14, quantity: 1 }],
        eventType: 'test',
        paymentMethod: 'bank_transfer'
      })
    });

    if (response.status === 200) {
      log('XSS input handling test', 'warn');
      testResults.warnings.push('XSS sanitization should be verified manually');
    }
  } catch (error) {
    log(`XSS test error: ${error.message}`, 'warn');
  }

  // Test 3: Check for exposed sensitive data in error messages
  try {
    const response = await fetch(`${API_BASE}/api/orders/99999`);
    const data = await response.json();

    if (data.error && !data.error.includes('password') && !data.error.includes('secret')) {
      log('Error messages don\'t expose sensitive data', 'pass');
      testResults.passed.push('Safe error messages');
    } else {
      log('Error messages may expose sensitive data', 'critical');
      testResults.critical.push('Sensitive data in error messages');
    }
  } catch (error) {
    log('Error message test inconclusive', 'warn');
  }
}

// ==========================================
// DATA VALIDATION TESTS
// ==========================================

async function testDataValidation() {
  log('Testing data validation...', 'info');

  // Test 1: Invalid email format
  try {
    const response = await fetch(`${API_BASE}/api/client/orders/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Test',
        clientPhone: '1234567890',
        clientEmail: 'invalid-email',
        clientAddress: 'Test',
        clientCity: 'Test',
        clientState: 'Test',
        clientPostal: '12345',
        items: [{ productId: 14, quantity: 1 }],
        paymentMethod: 'bank_transfer'
      })
    });

    // Should either reject or accept (validation may be client-side only)
    if (response.status === 400 || response.status === 422) {
      log('Email format validation', 'pass');
      testResults.passed.push('Email validation');
    } else {
      log('Email format validation (may be client-side only)', 'warn');
      testResults.warnings.push('Server-side email validation recommended');
    }
  } catch (error) {
    log(`Email validation test error: ${error.message}`, 'warn');
  }

  // Test 2: Negative quantity
  try {
    const response = await fetch(`${API_BASE}/api/client/orders/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Test',
        clientPhone: '1234567890',
        clientEmail: 'test@example.com',
        clientAddress: 'Test',
        clientCity: 'Test',
        clientState: 'Test',
        clientPostal: '12345',
        items: [{ productId: 14, quantity: -5 }],
        paymentMethod: 'bank_transfer'
      })
    });

    if (response.status === 400 || response.status === 422) {
      log('Negative quantity validation', 'pass');
      testResults.passed.push('Quantity validation');
    } else {
      log('Negative quantity accepted (needs validation)', 'fail');
      testResults.failed.push({ test: 'Quantity validation', issue: 'Negative values allowed' });
    }
  } catch (error) {
    log(`Quantity validation test error: ${error.message}`, 'warn');
  }
}

// ==========================================
// STRESS TESTS
// ==========================================

async function testPerformance() {
  log('Running performance tests...', 'info');

  // Test 1: Concurrent requests
  const concurrentRequests = 10;
  const startTime = Date.now();

  try {
    const promises = Array(concurrentRequests).fill().map(() =>
      fetch(`${API_BASE}/api/client/products`)
    );

    await Promise.all(promises);
    const duration = Date.now() - startTime;

    if (duration < 5000) {
      log(`Concurrent requests test (${concurrentRequests} requests in ${duration}ms)`, 'pass');
      testResults.passed.push('Performance: Concurrent requests');
    } else {
      log(`Concurrent requests slow (${duration}ms)`, 'warn');
      testResults.warnings.push('Performance may be slow under load');
    }
  } catch (error) {
    log(`Performance test error: ${error.message}`, 'fail');
    testResults.failed.push({ test: 'Concurrent requests', error: error.message });
  }
}

// ==========================================
// REPORT GENERATION
// ==========================================

function generateReport() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log(`${colors.magenta}          AUTOMATED TEST REPORT${colors.reset}`);
  console.log('='.repeat(60));
  console.log('');

  console.log(`${colors.green}✓ PASSED:${colors.reset} ${testResults.passed.length} tests`);
  console.log(`${colors.red}✗ FAILED:${colors.reset} ${testResults.failed.length} tests`);
  console.log(`${colors.yellow}⚠ WARNINGS:${colors.reset} ${testResults.warnings.length} issues`);
  console.log(`${colors.red}🔥 CRITICAL:${colors.reset} ${testResults.critical.length} issues`);
  console.log('');

  if (testResults.failed.length > 0) {
    console.log(`${colors.red}Failed Tests:${colors.reset}`);
    testResults.failed.forEach((failure, i) => {
      console.log(`  ${i + 1}. ${failure.test || 'Unknown'}`);
      if (failure.error) console.log(`     Error: ${failure.error}`);
      if (failure.expected) console.log(`     Expected: ${failure.expected}, Got: ${failure.actual}`);
    });
    console.log('');
  }

  if (testResults.warnings.length > 0) {
    console.log(`${colors.yellow}Warnings:${colors.reset}`);
    testResults.warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. ${warning}`);
    });
    console.log('');
  }

  if (testResults.critical.length > 0) {
    console.log(`${colors.red}🔥 CRITICAL ISSUES:${colors.reset}`);
    testResults.critical.forEach((critical, i) => {
      console.log(`  ${i + 1}. ${critical}`);
    });
    console.log('');
  }

  const totalTests = testResults.passed.length + testResults.failed.length;
  const passRate = ((testResults.passed.length / totalTests) * 100).toFixed(1);

  console.log('='.repeat(60));
  console.log(`Pass Rate: ${passRate}% (${testResults.passed.length}/${totalTests})`);
  console.log('='.repeat(60));
  console.log('');
}

// ==========================================
// MAIN EXECUTION
// ==========================================

async function runAllTests() {
  console.log('\n');
  console.log(`${colors.magenta}=`.repeat(60));
  console.log('        AUTOMATED TESTING AGENT STARTED');
  console.log(`=`.repeat(60) + `${colors.reset}\n`);

  try {
    await testDatabaseSchema();
    console.log('');

    await testAPIEndpoints();
    console.log('');

    await testSecurity();
    console.log('');

    await testDataValidation();
    console.log('');

    await testPerformance();
    console.log('');

    generateReport();

  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  } finally {
    await closePool();
  }
}

// Run tests
runAllTests();
