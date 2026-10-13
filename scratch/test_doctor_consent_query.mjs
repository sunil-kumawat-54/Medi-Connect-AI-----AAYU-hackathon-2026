import fs from 'fs';

const demoConfig = JSON.parse(fs.readFileSync('u:/aayu/apps/mobile/dev_secret.json', 'utf8'));
const password = demoConfig.demoPassword;

const supabaseUrl = 'https://nbwggyzxivengzfnarin.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY';

const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ email: 'doctor.alex@mediconnect.demo', password })
});

const authData = await resp.json();
console.log('Doctor signed in, UID:', authData.user.id);

const conResp = await fetch(`${supabaseUrl}/rest/v1/patient_consents?patient_id=eq.a0000000-0000-0000-0000-000000000001&status=eq.ACTIVE&select=*`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${authData.access_token}`
  }
});

const conData = await conResp.json();
console.log('Consent query result:', conData);
