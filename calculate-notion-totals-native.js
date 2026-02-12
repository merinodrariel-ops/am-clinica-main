
const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';
const ADMIN_DB = '607c1233-5699-48e0-977e-7f1e670c5e38';

async function queryNotion(dbId, filter) {
    let results = [];
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter: filter,
                start_cursor: cursor
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Notion Error: ${JSON.stringify(data)}`);
        }
        results = results.concat(data.results);
        hasMore = data.has_more;
        cursor = data.next_cursor;
    }

    return results;
}

async function main() {
    console.log('--- RECEPTION FEBRUARY ---');
    const receptionFeb = await queryNotion(RECEPTION_DB, {
        and: [
            { property: "FECHA", date: { on_or_after: "2026-02-01" } },
            { property: "FECHA", date: { before: "2026-03-01" } }
        ]
    });

    let recArs = 0;
    let recUsd = 0;
    receptionFeb.forEach(page => {
        const type = page.properties.Categoria?.select?.name;
        if (type === 'Ingreso' || type === 'Consulta') {
            recArs += page.properties.ARG?.number || 0;
            recArs += page.properties.MP?.number || 0;
            recArs += page.properties['Banco Pesos']?.number || 0;
            recUsd += page.properties['USD Billete']?.number || 0;
            recUsd += page.properties['Tether USDT']?.number || 0;
            recUsd += page.properties['Banco USD']?.number || 0;
        }
    });
    console.log(`Reception Feb: ARS ${recArs.toLocaleString()}, USD ${recUsd.toLocaleString()}`);

    console.log('\n--- ADMIN FEBRUARY ---');
    const adminFeb = await queryNotion(ADMIN_DB, {
        and: [
            { property: "Fecha", date: { on_or_after: "2026-02-01" } },
            { property: "Fecha", date: { before: "2026-03-01" } }
        ]
    });

    let admArs = 0;
    let admUsd = 0;
    adminFeb.forEach(page => {
        const type = page.properties.TIPO?.select?.name;
        if (type === 'Ingreso') {
            admArs += page.properties['ARG (Efectivo)']?.number || 0;
            admArs += page.properties['Banco Fullesthetic SA']?.number || 0;
            admArs += page.properties['Giroactivo']?.number || 0;
            admUsd += page.properties['USD (efectivo)']?.number || 0;
            admUsd += page.properties['Banco USD']?.number || 0;
            admUsd += page.properties['Amex']?.number || 0;
        }
    });
    console.log(`Admin Feb: ARS ${admArs.toLocaleString()}, USD ${admUsd.toLocaleString()}`);

    console.log('\n--- TOTAL FEBRUARY ---');
    console.log(`Total ARS: ${(recArs + admArs).toLocaleString()}`);
    console.log(`Total USD: ${(recUsd + admUsd).toLocaleString()}`);

    console.log('\n--- RECEPTION JANUARY ---');
    const receptionJan = await queryNotion(RECEPTION_DB, {
        and: [
            { property: "FECHA", date: { on_or_after: "2026-01-01" } },
            { property: "FECHA", date: { before: "2026-02-01" } }
        ]
    });
    let recArsJan = 0;
    receptionJan.forEach(page => {
        const type = page.properties.Categoria?.select?.name;
        if (type === 'Ingreso' || type === 'Consulta') {
            recArsJan += page.properties.ARG?.number || 0;
            recArsJan += page.properties.MP?.number || 0;
            recArsJan += page.properties['Banco Pesos']?.number || 0;
        }
    });
    console.log(`Reception Jan ARS: ${recArsJan.toLocaleString()}`);
}

main().catch(console.error);
