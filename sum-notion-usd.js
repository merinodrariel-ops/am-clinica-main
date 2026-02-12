
const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';

async function queryNotion(month) {
    const startDate = `2026-${month.toString().padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? 2027 : 2026;
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

    const response = await fetch(`https://api.notion.com/v1/databases/${RECEPTION_DB}/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter: {
                and: [
                    { property: "FECHA", date: { on_or_after: startDate } },
                    { property: "FECHA", date: { before: endDate } }
                ]
            }
        })
    });
    const data = await response.json();
    let usd = 0;
    data.results.forEach(r => {
        const cat = r.properties.Categoria?.select?.name || 'None';
        if (cat === 'Ingreso' || cat === 'Consulta') {
            usd += (r.properties['USD Billete']?.number || 0) + (r.properties['Tether USDT']?.number || 0) + (r.properties['Banco USD']?.number || 0);
        }
    });
    return usd;
}

async function main() {
    console.log('Jan Reception USD:', await queryNotion(1));
    console.log('Feb Reception USD:', await queryNotion(2));
}

main().catch(console.error);
