import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';

// Initialize Supabase Client lazily
const getSupabase = () => createAdminClient();

const NOTION_DATABASE_ID_ADMIN = process.env.NOTION_DB_ADMIN_ID;
const NOTION_DB_RECEPCION_ID = process.env.NOTION_DB_RECEPCION_ID;
const NOTION_DB_INVENTARIO_ID = process.env.NOTION_DB_INVENTARIO_ID;
const NOTION_DB_LABORATORIO_ID = process.env.NOTION_DB_LABORATORIO_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

const IMPORTACION_PACIENTE_ID = 'e5193b04-5e9d-43c2-a35b-8abc5a4a0f59'; // Placeholder ID for Recepcion imports

export const dynamic = 'force-dynamic';

type NotionDatabaseInfo = {
    data_sources?: Array<{ id: string }>;
};

type NotionQueryRequestBody = {
    page_size: number;
    sorts: Array<{
        timestamp: 'created_time';
        direction: 'descending';
    }>;
    start_cursor?: string;
};

type NotionProperty = {
    date?: { start?: string };
    title?: Array<{ plain_text?: string }>;
    select?: { name?: string };
    multi_select?: Array<{ name?: string }>;
    number?: number;
    type?: string;
    files?: unknown[];
};

type NotionProperties = Record<string, NotionProperty | undefined>;

type NotionPage = {
    id: string;
    url?: string;
    properties?: NotionProperties;
};

type NotionQueryResponse = {
    results?: NotionPage[];
    has_more?: boolean;
    next_cursor?: string | null;
};

export async function GET(request: Request) {
    const supabase = getSupabase();
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    try {
        if (!NOTION_API_KEY) {
            console.error('Missing NOTION_API_KEY');
            return NextResponse.json({ error: 'Missing NOTION_API_KEY' }, { status: 500 });
        }


        const { searchParams } = new URL(request.url);
        // If limit is not provided, fetch ALL (handled via loop)
        const limitParam = searchParams.get('limit');
        const explicitLimit = limitParam ? parseInt(limitParam) : null;

        let cursor = searchParams.get('cursor') || undefined;
        const source = searchParams.get('source') || 'admin';
        const debug = searchParams.get('debug') === 'true';

        if (debug) console.log('DEBUG: API Key loaded:', NOTION_API_KEY.substring(0, 5) + '...');

        const area = (searchParams.get('area') as 'CLINICA' | 'LABORATORIO') || 'CLINICA';

        let targetDbId = NOTION_DATABASE_ID_ADMIN;
        if (source === 'recepcion') targetDbId = NOTION_DB_RECEPCION_ID;
        if (source === 'inventario') {
            if (area === 'LABORATORIO') {
                targetDbId = NOTION_DB_LABORATORIO_ID;
            } else {
                targetDbId = NOTION_DB_INVENTARIO_ID;
            }
        }

        if (!targetDbId) {
            return NextResponse.json({ error: `Missing Database ID for source: ${source}` }, { status: 500 });
        }

        // Resolve Data Source ID
        try {
            const dbInfo = await fetch(`https://api.notion.com/v1/databases/${targetDbId}`, {
                headers: {
                    'Authorization': `Bearer ${NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28',
                }
            }).then(r => r.json() as Promise<NotionDatabaseInfo>);

            if (dbInfo.data_sources && dbInfo.data_sources.length > 0) {
                targetDbId = dbInfo.data_sources[0].id;
                if (debug) console.log(`Resolved Data Source ID: ${targetDbId}`);
            }
        } catch (e: unknown) {
            console.error('Error resolving data source ID, trying original...', e);
        }

        if (debug) console.log(`DEBUG: Starting Import... Source: ${source}, Limit: ${explicitLimit || 'ALL'}`);

        const processed = [];
        const errors = [];
        let hasMore = true;
        let fetchedCount = 0;

        // Pagination Loop
        while (hasMore) {

            // Stop if we reached explicit limit
            if (explicitLimit && fetchedCount >= explicitLimit) {
                break;
            }

            const body: NotionQueryRequestBody = {
                page_size: explicitLimit ? Math.min(explicitLimit - fetchedCount, 100) : 100,
                sorts: [
                    {
                        timestamp: 'created_time',
                        direction: 'descending',
                    }
                ]
            };

            if (cursor) {
                body.start_cursor = cursor;
            }

            const response = await fetch(`https://api.notion.com/v1/databases/${targetDbId}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                // If cursor is invalid (expired), we might want to restart? But for now just error.
                throw new Error(`Notion API Error: ${response.status} ${errorText}`);
            }

            const data = (await response.json()) as NotionQueryResponse;
            const results = data.results || [];
            hasMore = Boolean(data.has_more);
            cursor = data.next_cursor || undefined; // Update cursor for next loop

            fetchedCount += results.length;

            for (const page of results) {
                if (!page.properties) continue;

                if (debug && processed.length === 0) {
                    console.log('DEBUG: First Page Properties:', JSON.stringify(page.properties, null, 2));
                }

                try {
                    const props = page.properties as NotionProperties;

                    // Common Fields
                    let fecha = new Date().toISOString();
                    let descripcion = 'Sin descripción';
                    const externalUrl = page.url;

                    if (source === 'recepcion') {
                        // === RECEPCION MAPPING ===
                        fecha = props['FECHA']?.date?.start || new Date().toISOString();
                        descripcion = props['Descripcion']?.title?.[0]?.plain_text || 'Sin descripción - Importado';
                        const categoria = props['Categoria']?.select?.name || null;

                        // Amounts
                        const usdBillete = props['USD Billete']?.number || 0;
                        const usdt = props['Tether USDT']?.number || 0;
                        const bancoUsd = props['Banco USD']?.number || 0;
                        const totalUsd = usdBillete + usdt + bancoUsd;

                        const bancoPesos = props['Banco Pesos']?.number || 0;
                        const mp = props['MP']?.number || 0;
                        const arg = props['ARG']?.number || 0;
                        const totalArs = bancoPesos + mp + arg;

                        const tc = props['Dolar Infobae']?.number || 1;

                        let monto = 0;
                        let usdEquivalente = 0;
                        let moneda = 'ARS';

                        if (totalUsd !== 0) {
                            monto = totalUsd; // Monto in original currency (USD)
                            moneda = 'USD';
                            usdEquivalente = totalUsd;
                        } else {
                            monto = totalArs; // Monto in original currency (ARS)
                            moneda = 'ARS';
                            usdEquivalente = totalArs / (tc || 1);
                        }

                        // Determine method of payment (simplified logic)
                        let metodo = 'Efectivo';
                        if (usdt > 0) metodo = 'USDT';
                        if (bancoUsd > 0 || bancoPesos > 0) metodo = 'Transferencia';
                        if (mp > 0) metodo = 'Mercado Pago';

                        // Insert into caja_recepcion_movimientos
                        const { error: insertError } = await supabase.from('caja_recepcion_movimientos').upsert({
                            // Mapping to schema columns
                            fecha_hora: fecha,
                            paciente_id: IMPORTACION_PACIENTE_ID, // Required foreign key
                            concepto_nombre: descripcion, // Use description as concept
                            categoria: categoria,
                            monto: monto,
                            moneda: moneda,
                            metodo_pago: metodo,
                            estado: 'pagado', // Assume imported are paid
                            usd_equivalente: usdEquivalente,
                            tc_bna_venta: tc,
                            observaciones: `Importado de Notion. URL: ${externalUrl}`,
                            usuario: 'Sistema', // Default user
                            fecha_movimiento: (fecha || new Date().toISOString()).split('T')[0],
                            origen: 'importacion'
                        }, { onConflict: undefined }); // No unique constraint easily mapped for recepcion yet, usually just insert. 
                        // Note: upsert without ON CONFLICT works as INSERT if no PK match (UUID generated).
                        // To prevent duplicates, we'd need a unique field. Recepcion table might not have one for external_url.
                        // For now we INSERT. 

                        if (insertError) {
                            errors.push({ id: page.id, error: insertError });
                        } else {
                            processed.push({ id: page.id, status: 'imported_recepcion' });
                        }

                    } else if (source === 'admin' || !source) {
                        // === ADMIN MAPPING ===
                        fecha = props['Fecha']?.date?.start || new Date().toISOString();
                        descripcion = props['Descripcion']?.title?.[0]?.plain_text || 'Sin descripción - Importado';
                        const subTipo = props['Sub TIPO']?.select?.name || null;
                        const tipoRaw = props['TIPO']?.select?.name?.toUpperCase();
                        const tc = props['Valor dolar']?.number || 1;

                        const usdEfectivo = props['USD (efectivo)']?.number || 0;
                        const bancoUsd = props['Banco USD']?.number || 0;
                        const amex = props['Amex']?.number || 0;
                        const montoUsd = usdEfectivo + bancoUsd + amex;
                        const montoArs = props['Giroactivo']?.number || props['ARG (Efectivo)']?.number || 0;

                        let monto = 0;
                        let p_moneda = 'ARS';

                        if (montoUsd !== 0) {
                            monto = montoUsd;
                            p_moneda = 'USD';
                        } else {
                            monto = montoArs;
                            p_moneda = 'ARS';
                        }

                        let tipoMovimiento = 'EGRESO';
                        if (tipoRaw === 'INGRESO') {
                            tipoMovimiento = 'INGRESO_ADMIN';
                        } else if (tipoRaw === 'EGRESO' || tipoRaw === 'GASTO') {
                            tipoMovimiento = 'EGRESO';
                        } else {
                            const subTipoUpper = (subTipo || '').toUpperCase();
                            if (['INGRESO', 'APORTE', 'COBRO'].some(s => subTipoUpper.includes(s))) {
                                tipoMovimiento = 'INGRESO_ADMIN';
                            } else {
                                tipoMovimiento = 'EGRESO';
                            }
                        }

                        // Link Only Strategy
                        const fileProp = props['Comprobante & Tickets'] || props['Adjuntos'] || props['Files'];
                        const attachmentsCount =
                            fileProp?.type === 'files' && Array.isArray(fileProp.files)
                                ? fileProp.files.length
                                : 0;
                        const hasAttachments = attachmentsCount > 0;
                        let nota = `Imported from Notion. Original ID: ${page.id}.`;
                        if (hasAttachments) nota += ` Has ${attachmentsCount} attachment(s).`;

                        const { error: insertError } = await supabase.from('caja_admin_movimientos').upsert({
                            fecha_hora: fecha,
                            descripcion: descripcion,
                            subtipo: subTipo,
                            tipo_movimiento: tipoMovimiento,
                            usd_equivalente_total: p_moneda === 'USD' ? monto : (monto / (tc || 1)),
                            tc_bna_venta: tc || null,
                            external_url: page.url,
                            adjuntos: null,
                            nota: nota,
                            fecha_movimiento: (fecha || new Date().toISOString()).split('T')[0],
                            origen: 'importacion'
                        }, { onConflict: 'external_url' });

                        if (insertError) {
                            errors.push({ id: page.id, error: insertError });
                        } else {
                            processed.push({ id: page.id, status: 'imported_admin' });
                        }
                    } else if (source === 'inventario') {
                        // === INVENTARIO MAPPING ===
                        let nombre = 'Item Sin Nombre';
                        let categoria = 'General';
                        let stockActual = 0;
                        let stockMinimo = 0;
                        let unidad = 'unidades';

                        if (area === 'LABORATORIO') {
                            nombre = props['Nombre ']?.title?.[0]?.plain_text || props['Nombre']?.title?.[0]?.plain_text || 'Item Sin Nombre';
                            categoria = props['Área']?.multi_select?.[0]?.name || props['Categoria']?.select?.name || 'General';
                            stockActual = props['Stock']?.number || 0;
                            stockMinimo = props['Fijar alerta']?.number || 0;
                        } else {
                            // CLINICA Defaults (Updated based on "Elementos" DB Schema)
                            nombre = props['Nombre ']?.title?.[0]?.plain_text || props['Nombre']?.title?.[0]?.plain_text || props['Name']?.title?.[0]?.plain_text || 'Item Sin Nombre';

                            // "Área" is a multi_select in the Elements DB, serve as Category
                            const areaProp = props['Área']?.multi_select;
                            if (areaProp && areaProp.length > 0) {
                                categoria = areaProp
                                    .map((option: { name?: string }) => option.name || '')
                                    .filter(Boolean)
                                    .join(', ');
                            } else {
                                categoria = props['Categoria']?.select?.name || props['Category']?.select?.name || 'General';
                            }

                            stockActual = props['Stock']?.number || props['Stock Actual']?.number || 0;
                            stockMinimo = props['Fijar alerta']?.number || props['Stock Minimo']?.number || props['Min Stock']?.number || 0;
                            unidad = props['Unidad']?.select?.name || props['Unit']?.select?.name || 'unidades';
                        }


                        const { error: insertError } = await supabase.from('inventario_items').upsert({
                            nombre,
                            categoria,
                            stock_actual: stockActual,
                            stock_minimo: stockMinimo,
                            unidad_medida: unidad,
                            area: area, // Use the area from query param
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'nombre, area' });

                        if (insertError) {
                            errors.push({ id: page.id, error: insertError });
                        } else {
                            processed.push({ id: page.id, status: 'imported_inventario' });
                        }
                    }
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Error al procesar pagina';
                    errors.push({ id: page.id, error: message });
                }
            } // End for loop
        } // End while loop

        return NextResponse.json({
            success: true,
            count: processed.length,
            errors,
            processed_sample: processed.slice(0, 5)
        });

    } catch (error: unknown) {
        console.error('Import Error:', error);
        const message = error instanceof Error ? error.message : 'Error de importacion';
        const stack = error instanceof Error ? error.stack : undefined;
        return NextResponse.json({ error: message, stack }, { status: 500 });
    }
}
