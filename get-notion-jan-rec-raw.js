
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
            { property: "FECHA", date: { on_or_after: "2026-01-01" } },
            { property: "FECHA", date: { before: "2026-02-01" } }
        ]
    });

    const notionData = rec.map(p => {
        const props = p.properties;
        const usd = (props['USD Billete']?.number || 0) + (props['Tether USDT']?.number || 0) + (props['Banco USD']?.number || 0);
        const ars = (props.ARG?.number || 0) + (props.MP?.number || 0) + (props['Banco Pesos']?.number || 0);
        return {
            fecha: props.FECHA?.date?.start,
            desc: props.Descripcion?.title?.[0]?.plain_text || 'No Name',
            cat: props.Categoria?.select?.name,
            ars,
            usd,
            id: p.id
        };
    });

    console.log(JSON.stringify(notionData, null, 2));
}

main().catch(console.error);
