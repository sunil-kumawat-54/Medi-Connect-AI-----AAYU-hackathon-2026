import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync } from 'fs';

// 1. Generate new cryptographically secure random password
const randomPart = randomBytes(24).toString('base64');
const newSecret = `${randomPart}!Aa9#`;

// 2. Write exclusively to gitignored files
writeFileSync('u:/aayu/.demo_secret.txt', newSecret + '\n', 'utf8');
writeFileSync('u:/aayu/apps/mobile/dev_secret.json', JSON.stringify({ demoPassword: newSecret }, null, 2), 'utf8');

console.log('Rotated secret written to .demo_secret.txt and apps/mobile/dev_secret.json (Password masked).');
