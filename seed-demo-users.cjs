/**
 * seed-demo-users.js
 * Creates three demo accounts with @prorxpharma.com emails.
 * Run once: node seed-demo-users.js
 * Safe to run again — skips existing accounts (409 = already registered).
 */

const http = require('http');

const BASE = 'localhost';
const PORT = 3001;

const DEMO_USERS = [
  { name: 'Admin Demo',   email: 'admin@prorxpharma.com',   password: 'Admin@ProRx2026!',   role: 'admin'   },
  { name: 'Manager Demo', email: 'manager@prorxpharma.com', password: 'Manager@ProRx2026!', role: 'manager' },
  { name: 'User Demo',    email: 'user@prorxpharma.com',    password: 'User@ProRx2026!',    role: 'user'    },
];

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: BASE, port: PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = '';
        res.on('data', d => (data += d));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n🔑  Seeding demo accounts…\n');
  for (const u of DEMO_USERS) {
    try {
      const { status, body } = await post('/api/auth/register', u);
      if (status === 201) {
        console.log(`  ✅  Created  [${u.role.padEnd(7)}]  ${u.email}`);
      } else if (status === 409) {
        console.log(`  ⏭   Exists   [${u.role.padEnd(7)}]  ${u.email}  (skipped)`);
      } else {
        console.log(`  ❌  Failed   [${u.role.padEnd(7)}]  ${u.email}  →  ${body.message}`);
      }
    } catch (err) {
      console.error(`  💥  Error for ${u.email}: ${err.message}`);
    }
  }

  console.log('\n📋  Demo credentials:\n');
  console.log('  Role     Email                        Password');
  console.log('  ─────────────────────────────────────────────────────');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(32)} ${u.password}`);
  }
  console.log('\n  ⚠  Remove these accounts before going to production.\n');
}

main();
