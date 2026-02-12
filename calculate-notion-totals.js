
const { Client } = require('@notionhq/client');

const NOTION_API_KEY = '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';
const RECEPTION_DB = '891fda42-c4f2-401b-ba7d-ffe2af271939';
const ADMIN_DB = '607c1233-5699-48e0-977e-7f1e670c5e38';

const notion = new Client({ auth: NOTION_API_KEY });

async function getTotals(dbId, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

    let results = [];
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const response = await notion.databases.query({
            database_id: dbId,
            filter: {
                and: [
                    {
                        property: "FECHA",
                        date: {
                            on_or_after: startDate
                        }
                    },
                    {
                        property: "FECHA",
                        date: {
                            before: endDate
                        }
                    }
                ]
            },
            start_cursor: cursor
        });
        results = results.concat(response.results);
        hasMore = response.has_more;
        cursor = response.next_cursor;
    }

    return results;
}

async function getAdminTotals(dbId, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

    let results = [];
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const response = await notion.databases.query({
            database_id: dbId,
            filter: {
                and: [
                    {
                        property: "Fecha",
                        date: {
                            on_or_after: startDate
                        }
                    },
                    {
                        property: "Fecha",
                        date: {
                            before: endDate
                        }
                    }
                ]
            },
            start_cursor: cursor
        });
        results = results.concat(response.results);
        hasMore = response.has_more;
        cursor = response.next_cursor;
    }

    return results;
}

async function main() {
    console.log('--- RECEPTION FEBRUARY ---');
    const receptionFeb = await getTotals(RECEPTION_DB, 2, 2026);
    let recArs = 0;
    let recUsd = 0;
    receptionFeb.forEach(page => {
        const type = page.properties.Categoria?.select?.name;
        if (type === 'Ingreso' || type === 'Consulta') {
            recArs += page.properties.ARG?.number || 0;
            recArs += page.properties.MP?.number || 0;
            recArs += page.properties['Banco Pesos']?.number || 0;
            recUsd += page.properties['USD Billete']?.number || 0;
            recUsd += page.properties['Tether USDT']?.number || 0;
            recUsd += page.properties['Banco USD']?.number || 0;
        }
    });
    console.log(`Reception Feb: ARS ${recArs.toLocaleString()}, USD ${recUsd.toLocaleString()}`);

    console.log('\n--- ADMIN FEBRUARY ---');
    const adminFeb = await getAdminTotals(ADMIN_DB, 2, 2026);
    let admArs = 0;
    let admUsd = 0;
    adminFeb.forEach(page => {
        const type = page.properties.TIPO?.select?.name;
        if (type === 'Ingreso') {
            admArs += page.properties['ARG (Efectivo)']?.number || 0;
            admArs += page.properties['Banco Fullesthetic SA']?.number || 0;
            admArs += page.properties['Giroactivo']?.number || 0;
            admUsd += page.properties['USD (efectivo)']?.number || 0;
            admUsd += page.properties['Banco USD']?.number || 0;
            admUsd += page.properties['Amex']?.number || 0;
        }
    });
    console.log(`Admin Feb: ARS ${admArs.toLocaleString()}, USD ${admUsd.toLocaleString()}`);

    console.log('\n--- TOTAL FEBRUARY ---');
    console.log(`Total ARS: ${(recArs + admArs).toLocaleString()}`);
    console.log(`Total USD: ${(recUsd + admUsd).toLocaleString()}`);

    console.log('\n--- RECEPTION JANUARY ---');
    const receptionJan = await getTotals(RECEPTION_DB, 1, 2026);
    let recArsJan = 0;
    receptionJan.forEach(page => {
        const type = page.properties.Categoria?.select?.name;
        if (type === 'Ingreso' || type === 'Consulta') {
            recArsJan += page.properties.ARG?.number || 0;
            recArsJan += page.properties.MP?.number || 0;
            recArsJan += page.properties['Banco Pesos']?.number || 0;
        }
    });
    console.log(`Reception Jan ARS: ${recArsJan.toLocaleString()}`);
}

main().catch(console.error);
