import fs from 'fs';

const demoConfig = JSON.parse(fs.readFileSync('u:/aayu/apps/mobile/dev_secret.json', 'utf8'));
const password = demoConfig.demoPassword;

const supabaseUrl = 'https://nbwggyzxivengzfnarin.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY';

const users = [
  'patient.aarav@mediconnect.demo',
  'patient.sunita@mediconnect.demo',
  'doctor.alex@mediconnect.demo',
  'staff.priya@mediconnect.demo',
  'admin.officer@mediconnect.demo'
];

console.log('--- VERIFYING ALL 5 DEMO USER AUTHENTICATIONS ---');

for (const email of users) {
  const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.log(`[FAIL] ${email}: status=${resp.status} error=${data.error_description || data.message || JSON.stringify(data)}`);
  } else {
    // Query profile with bearer token
    const profResp = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${data.user.id}&select=id,full_name,role`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${data.access_token}`
      }
    });
    const profiles = await profResp.json();
    const prof = profiles[0];

    console.log(`[PASS] ${email}: UID=${data.user.id} Role=${prof?.role} Name=${prof?.full_name}`);
  }
}
console.log('--- ALL 5 LOGINS VERIFICATION COMPLETE ---');
