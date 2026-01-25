
/* eslint-disable @typescript-eslint/no-require-imports */
const fetch = global.fetch || require('node-fetch');

const API_URL = 'http://localhost:3000/api/import-notion';
const LIMIT = 50; // Use a reasonable batch size

async function runImport() {
    let cursor = null;
    let totalImported = 0;
    let pageCount = 0;
    let hasMore = true;

    console.log('Starting Full Import...');
    console.log(`Target URL: ${API_URL}`);

    while (hasMore) {
        pageCount++;
        const url = `${API_URL}?limit=${LIMIT}${cursor ? `&cursor=${cursor}` : ''}`;
        console.log(`\n--- Fetching Page ${pageCount} ---`);
        console.log(`URL: ${url}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`HTTP Error: ${response.status} ${response.statusText}`);
                const text = await response.text();
                console.error('Response:', text);
                break;
            }

            const data = await response.json();

            if (data.errors && data.errors.length > 0) {
                console.warn(`Warnings/Errors in this batch: ${data.errors.length}`);
                data.errors.forEach(e => console.log(`  - ID: ${e.id}, Msg: ${JSON.stringify(e.error)}`));
            }

            const count = data.count || 0;
            totalImported += count;
            console.log(`Imported ${count} records in this batch.`);

            hasMore = data.has_more;
            cursor = data.next_cursor;

            if (hasMore) {
                console.log(`More data available. Next cursor: ${cursor}`);
            } else {
                console.log('No more data.');
            }

        } catch (e) {
            console.error('Exception during import:', e.message);
            break;
        }
    }

    console.log(`\nImport Process Finished.`);
    console.log(`Total Records Processed: ${totalImported}`);
}

runImport();
