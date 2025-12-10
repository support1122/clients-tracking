// Test script for Operations API endpoints
const API_BASE = 'http://localhost:8086';

async function testOperationsAPI() {
  console.log('🧪 Testing Operations API endpoints...\n');

  try {
    // Test 1: Get all operations
    console.log('1. Testing GET /api/operations');
    const response1 = await fetch(`${API_BASE}/api/operations`);
    if (response1.ok) {
      const data = await response1.json();
      console.log('✅ Success:', data);
    } else {
      console.log('❌ Failed:', response1.status, await response1.text());
    }

    // Test 2: Create a test operation
    console.log('\n2. Testing POST /api/operations (create)');
    const testOperation = {
      email: 'test.operator@flashfirehq',
      name: 'Test Operator',
      role: 'operations'
    };
    
    const response2 = await fetch(`${API_BASE}/api/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testOperation)
    });
    
    if (response2.ok) {
      const data = await response2.json();
      console.log('✅ Success:', data);
    } else {
      console.log('❌ Failed:', response2.status, await response2.text());
    }

    // Test 3: Get operation by email
    console.log('\n3. Testing GET /api/operations/:email');
    const response3 = await fetch(`${API_BASE}/api/operations/test.operator@flashfirehq`);
    if (response3.ok) {
      const data = await response3.json();
      console.log('✅ Success:', data);
    } else {
      console.log('❌ Failed:', response3.status, await response3.text());
    }

    // Test 4: Get jobs by operator email
    console.log('\n4. Testing GET /api/operations/:email/jobs');
    const response4 = await fetch(`${API_BASE}/api/operations/test.operator@flashfirehq/jobs`);
    if (response4.ok) {
      const data = await response4.json();
      console.log('✅ Success:', data);
    } else {
      console.log('❌ Failed:', response4.status, await response4.text());
    }

    // Test 5: Get available clients
    console.log('\n5. Testing GET /api/operations/clients');
    const response5 = await fetch(`${API_BASE}/api/operations/clients`);
    if (response5.ok) {
      const data = await response5.json();
      console.log('✅ Success:', data);
    } else {
      console.log('❌ Failed:', response5.status, await response5.text());
    }

  } catch (error) {
    console.error('❌ Network Error:', error.message);
  }
}

// Run the test
testOperationsAPI();
