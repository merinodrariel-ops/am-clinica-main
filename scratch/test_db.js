const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");

    // Check if column exists in pacientes
    const resPacientes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pacientes' AND column_name = 'saldo_a_favor_usd'
    `);

    if (resPacientes.rows.length === 0) {
      console.log("Column 'saldo_a_favor_usd' does not exist in 'pacientes' table. Executing migration...");
      
      const fs = require('fs');
      const path = require('path');
      const migrationSql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260602_add_saldo_a_favor.sql'), 'utf8');
      
      await client.query(migrationSql);
      console.log("Migration executed successfully!");
    } else {
      console.log("Column 'saldo_a_favor_usd' already exists in 'pacientes' table.");
    }

  } catch (err) {
    console.error("Database error:", err);
  } finally {
    await client.end();
  }
}

run();
