
const NOTION_API_KEY = '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';
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
                'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filter, start_cursor: cursor })
        });
        const data = await response.json();
        results = results.concat(data.results);
        hasMore = data.has_more;
        cursor = data.next_cursor;
    }
    return results;
}

async function main() {
    console.log('--- ADMIN JANUARY EGRESO ---');
    const jan = await queryNotion(ADMIN_DB, {
        and: [
            { property: "Fecha", date: { on_or_after: "2026-01-01" } },
            { property: "Fecha", date: { before: "2026-02-01" } }
        ]
    });
    let ars = 0;
    let usd = 0;
    jan.forEach(p => {
        const type = p.properties.TIPO?.select?.name;
        if (type === 'Egreso' || type === 'Gasto') {
            ars += (p.properties['ARG (Efectivo)']?.number || 0) + (p.properties['Banco Fullesthetic SA']?.number || 0) + (p.properties['Giroactivo']?.number || 0);
            usd += (p.properties['USD (efectivo)']?.number || 0) + (p.properties['Banco USD']?.number || 0) + (p.properties['Amex']?.number || 0);
        }
    });
    console.log(`Jan Egreso: ARS ${ars.toLocaleString()}, USD ${usd.toLocaleString()}`);
}
main().catch(console.error);
