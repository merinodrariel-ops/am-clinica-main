
const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';

async function queryNotion(dbId, filter) {
    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filter })
    });
    const data = await response.json();
    return data.results;
}

async function main() {
    const results = await queryNotion(RECEPTION_DB, {
        and: [
            { property: "FECHA", date: { equals: "2026-02-04" } },
            { property: "Descripcion", title: { contains: "Leandro Miguel" } }
        ]
    });
    console.log(JSON.stringify(results, null, 2));
}
main().catch(console.error);
