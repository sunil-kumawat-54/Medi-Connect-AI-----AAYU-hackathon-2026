import { createClient } from '../apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import * as fs from 'fs';

const SUPABASE_URL = 'https://nbwggyzxivengzfnarin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY';

const password = fs.readFileSync('u:/aayu/.demo_secret.txt', 'utf8').trim();

const usersToTest = [
  { email: 'patient.aarav@mediconnect.demo', expectedRole: 'patient' },
  { email: 'patient.sunita@mediconnect.demo', expectedRole: 'patient' },
  { email: 'doctor.alex@mediconnect.demo', expectedRole: 'doctor' },
  { email: 'staff.priya@mediconnect.demo', expectedRole: 'hospital_staff' },
  { email: 'admin.officer@mediconnect.demo', expectedRole: 'super_admin' },
];

async function runAuthTests() {
  console.log('--- STARTING SUPABASE AUTH SIGN-IN VERIFICATION ---');
  let allPassed = true;

  for (const u of usersToTest) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: u.email,
      password: password
    });

    if (error) {
      console.error(`FAILED: ${u.email} sign-in failed:`, error.message);
      allPassed = false;
      continue;
    }

    const session = data.session;
    const user = data.user;
    const jwtRole = session ? 'authenticated' : 'none';

    // Query profile with the authenticated client
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error(`FAILED: Could not fetch profile for ${u.email}:`, profileError.message);
      allPassed = false;
      continue;
    }

    const roleMatches = profile.role === u.expectedRole;
    console.log(`SUCCESS: ${u.email} authenticated! User ID: ${user.id}, JWT Role: ${jwtRole}, Profile Role: ${profile.role} (matches expected: ${roleMatches})`);
    if (!roleMatches) allPassed = false;
  }

  if (allPassed) {
    console.log('--- ALL 5 DEMO USERS AUTHENTICATED SUCCESSFULLY ---');
  } else {
    console.error('--- SOME AUTH TESTS FAILED ---');
    process.exit(1);
  }
}

runAuthTests().catch(err => {
  console.error('Fatal error during auth test:', err);
  process.exit(1);
});
