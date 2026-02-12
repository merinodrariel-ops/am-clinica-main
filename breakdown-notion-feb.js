
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
    console.log('--- RECEPTION FEBRUARY ALL CATEGORIES ---');
    const rec = await queryNotion(RECEPTION_DB, {
        and: [
            { property: "FECHA", date: { on_or_after: "2026-02-01" } },
            { property: "FECHA", date: { before: "2026-03-01" } }
        ]
    });
    const recCats = {};
    rec.forEach(p => {
        const cat = p.properties.Categoria?.select?.name || 'None';
        if (!recCats[cat]) recCats[cat] = { ars: 0, usd: 0 };
        recCats[cat].ars += (p.properties.ARG?.number || 0) + (p.properties.MP?.number || 0) + (p.properties['Banco Pesos']?.number || 0);
        recCats[cat].usd += (p.properties['USD Billete']?.number || 0) + (p.properties['Tether USDT']?.number || 0) + (p.properties['Banco USD']?.number || 0);
    });
    console.table(recCats);

    console.log('\n--- ADMIN FEBRUARY ALL TYPES ---');
    const adm = await queryNotion(ADMIN_DB, {
        and: [
            { property: "Fecha", date: { on_or_after: "2026-02-01" } },
            { property: "Fecha", date: { before: "2026-03-01" } }
        ]
    });
    const admTypes = {};
    adm.forEach(p => {
        const type = p.properties.TIPO?.select?.name || 'None';
        if (!admTypes[type]) admTypes[type] = { ars: 0, usd: 0 };
        admTypes[type].ars += (p.properties['ARG (Efectivo)']?.number || 0) + (p.properties['Banco Fullesthetic SA']?.number || 0) + (p.properties['Giroactivo']?.number || 0);
        admTypes[type].usd += (p.properties['USD (efectivo)']?.number || 0) + (p.properties['Banco USD']?.number || 0) + (p.properties['Amex']?.number || 0);
    });
    console.table(admTypes);
}

main().catch(console.error);
