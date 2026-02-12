
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
                    { property: "FECHA", date: { on_or_after: "2026-02-01" } },
                    { property: "FECHA", date: { before: "2026-03-01" } }
                ]
            }
        })
    });
    const data = await response.json();
    data.results.forEach(r => {
        const desc = r.properties.Descripcion?.title?.[0]?.plain_text;
        const cat = r.properties.Categoria?.select?.name;
        const ars = (r.properties.ARG?.number || 0) + (r.properties.MP?.number || 0) + (r.properties['Banco Pesos']?.number || 0);
        const usd = (r.properties['USD Billete']?.number || 0) + (r.properties['Tether USDT']?.number || 0) + (r.properties['Banco USD']?.number || 0);
        console.log(`${r.properties.FECHA?.date?.start} | ${desc} | ${cat} | ARS ${ars} | USD ${usd}`);
    });
}

main().catch(console.error);
