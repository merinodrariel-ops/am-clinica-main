
const NOTION_API_KEY = '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';

const missingRecords = [
    { id: '2f429b892a938094863b-d755898afb21', desc: 'Diego Ortiz' },
    { id: '2fb29b892a93806d8cc9-f674bcc8baa5', desc: 'Patricio Sanchez' }
];

async function getPage(id) {
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28'
        }
    });
    return response.json();
}

async function main() {
    for (const rec of missingRecords) {
        // Notion IDs in the JSON were abbreviated or changed format, let's use the actual part after the last hyphen if it's there, or the whole thing
        const cleanId = rec.id.includes('-') ? rec.id.split('-').join('') : rec.id;
        console.log(`Processing ${rec.desc} (${cleanId})...`);
        const page = await getPage(cleanId);

        if (page.object === 'error') {
            console.error(`Error fetching ${rec.desc}: ${page.message}`);
            continue;
        }

        const props = page.properties;
        const fecha = props.FECHA?.date?.start;
        const usd = props["USD Billete"]?.number || props["USD total"]?.formula?.number || 0;
        const ars = props.ARG?.number || 0;
        const cat = props.Categoria?.select?.name || "Ingreso";
        const url = page.url;

        console.log(`-- SQL for ${rec.desc}`);
        console.log(`INSERT INTO caja_recepcion_movimientos (
    fecha_hora, paciente_id, concepto_nombre, categoria, monto, moneda, metodo_pago, estado, usd_equivalente, observaciones, usuario, fecha_movimiento, origen
) VALUES (
    '${fecha}T12:00:00Z', 'e5193b04-5e9d-43c2-a35b-8abc5a4a0f59', '${rec.desc}', '${cat}', ${usd > 0 ? usd : ars}, '${usd > 0 ? 'USD' : 'ARS'}', 'Efectivo', 'pagado', ${usd > 0 ? usd : 'NULL'}, 'Importado de Notion. URL: ${url}', 'Sistema', '${fecha}', 'manual'
);`);
    }
}

main().catch(console.error);
