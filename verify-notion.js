
/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('@notionhq/client');

// Mock Env for testing or use real key
const NOTION_API_KEY = process.env.NOTION_API_KEY || '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';
const DATABASE_ID = '607c1233-5699-48e0-977e-7f1e670c5e38';

async function test() {
    console.log('Testing with Key:', NOTION_API_KEY.substring(0, 10) + '...');
    const notion = new Client({ auth: NOTION_API_KEY });

    // Test 0: Auth Check
    try {
        console.log('Checking Auth (users/me)...');
        const user = await notion.users.me({});
        console.log('Auth Success:', user.name || user.id);
    } catch (e) {
        console.error('Auth Failed:', e.code || e.message);
    }

    // Test 1: Retrieve Database
    try {
        console.log('Attempting databases.retrieve...');
        const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
        console.log('Database Found:', db.title?.[0]?.plain_text || db.id);
    } catch (e) {
        console.error('Retrieve DB Failed:', e.code || e.message);
    }

    // Test 5: Native Fetch
    try {
        console.log('Attempting native fetch (POST v1/databases/.../query)...');
        const fetch = global.fetch || require('node_fetch'); // Ensure fetch exists
        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ page_size: 1 })
        });

        console.log('Fetch Status:', response.status, response.statusText);
        const data = await response.json();

        if (response.ok) {
            console.log('Fetch Success:', data.results?.length, 'records');
            if (data.results?.length > 0) {
                console.log('First Record Prop Keys:', Object.keys(data.results[0].properties));
            }
        } else {
            console.error('Fetch Error:', JSON.stringify(data));
        }
    } catch (e) {
        console.error('Fetch Exception:', e.message);
    }
}

test();
