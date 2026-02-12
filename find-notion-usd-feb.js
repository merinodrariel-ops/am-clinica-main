
const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';

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
    const rec = await queryNotion(RECEPTION_DB, {
        and: [
            { property: "FECHA", date: { on_or_after: "2026-02-01" } },
            { property: "FECHA", date: { before: "2026-03-01" } }
        ]
    });
    const interesting = rec.filter(p => {
        const usd = (p.properties['USD Billete']?.number || 0) + (p.properties['Tether USDT']?.number || 0) + (p.properties['Banco USD']?.number || 0);
        return usd > 0;
    }).map(p => ({
        desc: p.properties['Descripcion']?.title?.[0]?.plain_text || 'No Name',
        fecha: p.properties['FECHA']?.date?.start,
        cat: p.properties['Categoria']?.select?.name,
        usd: (p.properties['USD Billete']?.number || 0) + (p.properties['Tether USDT']?.number || 0) + (p.properties['Banco USD']?.number || 0)
    }));
    console.table(interesting);
}
main().catch(console.error);
