
const NOTION_API_KEY = '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';
const ADMIN_DB = '607c1233-5699-48e0-977e-7f1e670c5e38';

async function main() {
    const response = await fetch(`https://api.notion.com/v1/databases/${ADMIN_DB}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter: {
                and: [
                    { property: "Fecha", date: { on_or_after: "2026-02-01" } },
                    { property: "Fecha", date: { before: "2026-03-01" } }
                ]
            }
        })
    });
    const data = await response.json();
    console.log(JSON.stringify(data.results.map(r => ({
        desc: r.properties.Descripcion?.title?.[0]?.plain_text,
        fecha: r.properties.Fecha?.date?.start,
        tipo: r.properties.TIPO?.select?.name,
        arg: r.properties['ARG (Efectivo)']?.number,
        banco: r.properties['Banco Fullesthetic SA']?.number,
        giro: r.properties['Giroactivo']?.number,
        usd: r.properties['USD (efectivo)']?.number
    })), null, 2));
}

main().catch(console.error);
