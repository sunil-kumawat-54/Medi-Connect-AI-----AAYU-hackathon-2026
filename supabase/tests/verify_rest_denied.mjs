import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://nbwggyzxivengzfnarin.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY';
const DEMO_PW = readFileSync('u:/aayu/.demo_secret.txt', 'utf8').trim();

async function testEndpoint(name, url, token) {
  const headers = {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  const text = await res.text();
  console.log(`[${name}] Status: ${res.status} | Body: ${text.trim()}`);
  return { status: res.status, body: text };
}

async function run() {
  console.log('--- 1. Testing REST RPC with ANON key ---');
  await testEndpoint('ANON -> run_rls_test_suite', `${SUPABASE_URL}/rest/v1/rpc/run_rls_test_suite`, null);
  await testEndpoint('ANON -> test_audit_security', `${SUPABASE_URL}/rest/v1/rpc/test_audit_security`, null);

  console.log('\n--- 2. Obtaining Authenticated JWT for Patient A ---');
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'patient.a@demo.mediconnect.local',
      password: DEMO_PW
    })
  });

  const authData = await authRes.json();
  if (!authData.access_token) {
    console.error('Failed to log in as Patient A:', authData);
    process.exit(1);
  }
  const token = authData.access_token;
  console.log('Successfully acquired authenticated JWT for Patient A.');

  console.log('\n--- 3. Testing REST RPC with AUTHENTICATED JWT ---');
  await testEndpoint('AUTH -> run_rls_test_suite', `${SUPABASE_URL}/rest/v1/rpc/run_rls_test_suite`, token);
  await testEndpoint('AUTH -> test_audit_security', `${SUPABASE_URL}/rest/v1/rpc/test_audit_security`, token);
}

run().catch(console.error);
