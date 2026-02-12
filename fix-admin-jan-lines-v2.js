
const NOTION_API_KEY = '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';

const movements = [
    { id: '82ac7a5c-e0a4-45fe-abe8-aa86255f897d', url: 'https://www.notion.so/Nicolas-Maximiliano-Leon-2f029b892a93804db8b4e8f7d9ef8385' },
    { id: '02f08ff6-1a00-443c-9a59-2aae25f0417c', url: 'https://www.notion.so/Inicio-caja-4-000-000ars-1100usd-2f029b892a93806cbb2ff5f9f4347398' },
    { id: '08450b80-e578-42e6-baab-c89ca1156ceb', url: 'https://www.notion.so/Ingreso-Ariel-2ed29b892a9380198613cf7d3d8cf9e6' },
    { id: '85dd81a3-858a-4444-9961-e09c0413f697', url: 'https://www.notion.so/Pase-Caja-de-Pacientes-2e229b892a93808d9a5bd09f6a81710f' },
    { id: '0f27b4cb-82ef-4f2a-9dc0-15ff8be06a52', url: 'https://www.notion.so/Liliana-Ester Suarez-2ef29b892a93809ea3d8cc22900a203f' },
    { id: '7e3d10a2-240d-4d54-98ea-1bb68a363ae1', url: 'https://www.notion.so/Magali-mazzuca-2ef29b892a938022878dceb0bfdbc8aa' },
    { id: 'edc16921-dad0-4123-a3dc-d9598e190a49', url: 'https://www.notion.so/Silvio-Pomar-2ef29b892a9380b98d12e9aa07bc2951' },
    { id: '5cc0ecae-81e0-47f2-9338-4fb6ef610439', url: 'https://www.notion.so/Inicio-caja-4-000-000ars-1100usd-2f129b892a93803cbc93fbe88b4ccad1' },
    { id: 'c3ed4ec1-56fd-4444-ba84-ede0b9985214', url: 'https://www.notion.so/Pase-Caja-de-Pacientes-2ea29b892a9380609066ee963795d489' },
    { id: '4006720e-354b-4346-ae23-93fa5a208ffb', url: 'https://www.notion.so/Devoluci-n-dep-sito-piso-17-Unidad-1701-2ea29b892a9380a38a7ed6c47912d743' },
    { id: '119fd893-5495-4fe9-bfa8-d6c6e6710e5b', url: 'https://www.notion.so/Ingreso-caja-de-pacientes-2e029b892a938038b66ef818af384ec6' },
    { id: '1140e8bd-0e95-4d23-8f0c-7e67ad131c30', url: 'https://www.notion.so/Cierre-caja-4-000-000ars-1100usd-2f129b892a93806ab58ed9fbf71cf3ff' },
    { id: 'f63dbb2d-c0aa-4c3f-90e0-98290a0e97e1', url: 'https://www.notion.so/Cierre-caja-4-000-000ars-1100usd-2f029b892a9380d9af50cced9749d433' },
    { id: 'cbe84ce1-04e5-40c8-8fc6-6dd30db2d070', url: 'https://www.notion.so/Pase-Caja-de-Pacientes-2e129b892a9380759766da54f995704e' },
    { id: '9d63fc1b-f1e3-46ec-ac3e-8f7cc53c5a88', url: 'https://www.notion.so/Antonella-Mascioli-2f029b892a938022836ce19e50df0214' },
    { id: 'e5bc254d-a8e2-4c3c-92e9-6dd83d7e162d', url: 'https://www.notion.so/Cierre-caja-4-000-000ars-1100usd-2ef29b892a938056b5ffe5ff7b12809b' }
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
    for (const mov of movements) {
        if (!mov.url) continue;
        const notionId = mov.url.split('-').pop();
        const page = await getPage(notionId);
        if (page.object === 'error') continue;
        const props = page.properties;

        let found = false;
        // Admin Style
        const adminAmounts = [
            { name: 'ARG (Efectivo)', val: props['ARG (Efectivo)']?.number, currency: 'ARS' },
            { name: 'Banco Fullesthetic SA', val: props['Banco Fullesthetic SA']?.number, currency: 'ARS' },
            { name: 'Giroactivo', val: props['Giroactivo']?.number, currency: 'ARS' },
            { name: 'USD (efectivo)', val: props['USD (efectivo)']?.number, currency: 'USD' },
            { name: 'Banco USD', val: props['Banco USD']?.number, currency: 'USD' },
            { name: 'Amex', val: props['Amex']?.number, currency: 'USD' }
        ];

        for (const amt of adminAmounts) {
            if (amt.val && amt.val !== 0) {
                console.log(`INSERT INTO caja_admin_movimiento_lineas (admin_movimiento_id, importe, moneda, created_at) VALUES ('${mov.id}', ${amt.val}, '${amt.currency}', NOW());`);
                found = true;
            }
        }

        if (!found) {
            // Reception Style
            const receptionAmounts = [
                { name: 'ARG', val: props['ARG']?.number, currency: 'ARS' },
                { name: 'MP', val: props['MP']?.number, currency: 'ARS' },
                { name: 'Banco Pesos', val: props['Banco Pesos']?.number, currency: 'ARS' },
                { name: 'USD Billete', val: props['USD Billete']?.number, currency: 'USD' },
                { name: 'Tether USDT', val: props['Tether USDT']?.number, currency: 'USD' },
                { name: 'Banco USD', val: props['Banco USD']?.number, currency: 'USD' }
            ];
            for (const amt of receptionAmounts) {
                if (amt.val && amt.val !== 0) {
                    console.log(`INSERT INTO caja_admin_movimiento_lineas (admin_movimiento_id, importe, moneda, created_at) VALUES ('${mov.id}', ${amt.val}, '${amt.currency}', NOW());`);
                    found = true;
                }
            }
        }
    }
}

main().catch(console.error);
