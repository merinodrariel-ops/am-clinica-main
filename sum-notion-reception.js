
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
    const cats = {};
    data.results.forEach(r => {
        const cat = r.properties.Categoria?.select?.name || 'None';
        if (!cats[cat]) cats[cat] = 0;
        cats[cat] += (r.properties.ARG?.number || 0) + (r.properties.MP?.number || 0) + (r.properties['Banco Pesos']?.number || 0);
    });
    return cats;
}

async function main() {
    console.log('Jan:', await queryNotion(1));
    console.log('Feb:', await queryNotion(2));
}

main().catch(console.error);
