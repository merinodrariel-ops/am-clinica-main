const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('SQL applied:', process.argv[2]);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
