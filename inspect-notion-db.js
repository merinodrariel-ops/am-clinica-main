const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

try {
    const envConfig = fs.readFileSync(path.resolve('.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        if (!line || line.startsWith('#')) return;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            const key = line.substring(0, eqIdx).trim();
            let value = line.substring(eqIdx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
} catch (e) {
    console.error('Could not read .env.local', e);
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DBS = {
    ADMIN: process.env.NOTION_DB_ADMIN_ID,
    RECEPCION: process.env.NOTION_DB_RECEPCION_ID,
    PACIENTES: process.env.NOTION_DB_PACIENTES_ID
};

async function inspect(name, id) {
    if (!id) {
        console.log(`Skipping ${name}: No ID`);
        return;
    }
    console.log(`\n--- Inspecting ${name} (${id}) ---`);
    try {
        console.log(`Resolving Data Source ID for ${id}...`);
        const dbInfo = await notion.databases.retrieve({ database_id: id });

        let dataSourceId = id;
        if (dbInfo.data_sources && dbInfo.data_sources.length > 0) {
            dataSourceId = dbInfo.data_sources[0].id;
            console.log(`Found Data Source ID: ${dataSourceId} (Original: ${id})`);
        } else {
            console.log('No data_sources field found, using original ID.');
        }

        const response = await notion.dataSources.query({
            data_source_id: dataSourceId,
            page_size: 1
        });

        if (response.results.length === 0) {
            console.log('No results found.');
            return;
        }

        const page = response.results[0];
        const props = page.properties;
        const keys = Object.keys(props);
        console.log('Properties:', keys);

        // Print detailed type info
        keys.forEach(k => {
            console.log(`  "${k}": ${props[k].type}`);
        });

    } catch (e) {
        console.error(`Error inspecting ${name}:`, e.message);
    }
}

async function main() {
    await inspect('ADMIN', DBS.ADMIN);
    await inspect('RECEPCION', DBS.RECEPCION);
    await inspect('PACIENTES', DBS.PACIENTES);
}

main();
