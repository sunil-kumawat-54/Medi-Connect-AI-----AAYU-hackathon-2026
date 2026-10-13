import fs from 'fs';
import path from 'path';

const demoPassword = fs.readFileSync('u:/aayu/.demo_secret.txt', 'utf8').trim();

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      getFiles(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const targetDirs = [
  'u:/aayu/apps/web/dist',
  'u:/aayu/apps/mobile/dist'
];

console.log('================ BUNDLE SECURITY SCAN ================');

let totalFilesScanned = 0;
let pwMatches = 0;
let serviceRoleMatches = 0;
let sbSecretMatches = 0;
const jwtsFound = [];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} does not exist yet.`);
    continue;
  }
  const files = getFiles(dir);
  totalFilesScanned += files.length;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // 1. Check for demo password
    if (content.includes(demoPassword)) {
      pwMatches++;
      console.log(`[ALERT] Demo password found in: ${file}`);
    }

    // 2. Check for service_role or actual sb_secret_ tokens
    if (content.includes('service_role')) {
      serviceRoleMatches++;
      console.log(`[ALERT] 'service_role' literal found in: ${file}`);
    }
    const rawSbSecretMatches = content.match(/sb_secret_[a-zA-Z0-9_-]{10,}/g) || [];
    // Hermes bytecode table concatenates SDK prefix 'sb_secret_' with adjacent symbol 'frontimeoutTimer_getOrReturnCtx'
    const sbSecretMatchesFound = rawSbSecretMatches.filter(m => !m.includes('frontimeoutTimer_getOrReturnCtx'));
    if (sbSecretMatchesFound.length > 0) {
      sbSecretMatches += sbSecretMatchesFound.length;
      console.log(`[ALERT] Actual 'sb_secret_' key token found in: ${file} ->`, sbSecretMatchesFound);
    }

    // 3. Find and decode JWT tokens
    const jwtRegex = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
    let match;
    while ((match = jwtRegex.exec(content)) !== null) {
      const token = match[0];
      try {
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        jwtsFound.push({ file, role: payload.role, iss: payload.iss, exp: payload.exp });
      } catch (e) {
        // Not a standard JWT payload
      }
    }
  }
}

console.log(`Total files scanned: ${totalFilesScanned}`);
console.log(`Demo password leaks detected: ${pwMatches} (Target: 0)`);
console.log(`'service_role' literals detected: ${serviceRoleMatches} (Target: 0)`);
console.log(`'sb_secret_' patterns detected: ${sbSecretMatches} (Target: 0)`);
console.log('\nDecoded JWT Findings:');
if (jwtsFound.length === 0) {
  console.log('No JWT strings found in bundle.');
} else {
  jwtsFound.forEach((j, idx) => {
    console.log(`  [JWT #${idx + 1}] Role: "${j.role}" | Issuer: "${j.iss}" | File: ${j.file}`);
  });
}

const allAnon = jwtsFound.every(j => j.role === 'anon');
console.log('\n--- SCAN VERIFICATION CONCLUSION ---');
if (pwMatches === 0 && serviceRoleMatches === 0 && sbSecretMatches === 0 && allAnon) {
  console.log('STATUS: VERIFIED SECURE (Zero secret leaks, all JWTs strictly role=anon)');
} else {
  console.log('STATUS: FAILED SECURITY CHECK');
}
console.log('======================================================');
