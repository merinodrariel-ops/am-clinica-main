
const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';

async function main() {
    const response = await fetch(`https://api.notion.com/v1/databases/${RECEPTION_DB}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter: {
                and: [
                    { property: "FECHA", date: { on_or_after: "2026-01-01" } },
                    { property: "FECHA", date: { before: "2026-02-01" } },
                    { property: "Categoria", select: { equals: "Ingreso" } }
                ]
            },
            sorts: [{ property: "ARG", direction: "descending" }]
        })
    });
    const data = await response.json();
    console.log(data.results.slice(0, 10).map(r => ({
        desc: r.properties.Descripcion?.title?.[0]?.plain_text,
        ars: (r.properties.ARG?.number || 0) + (r.properties.MP?.number || 0) + (r.properties['Banco Pesos']?.number || 0)
    })));
}

main().catch(console.error);
