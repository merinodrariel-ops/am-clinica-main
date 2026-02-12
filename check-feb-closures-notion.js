
const NOTION_API_KEY = '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';
const ADMIN_DB = '607c1233-5699-48e0-977e-7f1e670c5e38';

async function check() {
    const response = await fetch(`https://api.notion.com/v1/databases/${ADMIN_DB}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter: {
                and: [
                    { property: 'Fecha', date: { on_or_after: '2026-02-01' } },
                    { property: 'Fecha', date: { on_or_before: '2026-02-28' } }
                ]
            }
        })
    });
    const data = await response.json();
    const results = data.results.map(p => ({
        desc: p.properties.Descripción?.title[0]?.plain_text,
        date: p.properties.Fecha?.date?.start
    }));
    console.log(JSON.stringify(results.filter(r => r.desc && (r.desc.toLowerCase().includes('cierre') || r.desc.toLowerCase().includes('inicio'))), null, 2));
}
check();
