
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const NOTION_DATABASE_ID_ADMIN = process.env.NOTION_DB_ADMIN_ID;
const NOTION_DATABASE_ID_RECEPCION = process.env.NOTION_DB_RECEPCION_ID;
const NOTION_DATABASE_ID_PACIENTES = process.env.NOTION_DB_PACIENTES_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

const IMPORTACION_PACIENTE_ID = 'e5193b04-5e9d-43c2-a35b-8abc5a4a0f59'; // Placeholder ID for Recepcion imports

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

        let targetDbId = NOTION_DATABASE_ID_ADMIN;
        if (source === 'recepcion') targetDbId = NOTION_DATABASE_ID_RECEPCION;

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
            }).then(r => r.json());

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((dbInfo as any).data_sources && (dbInfo as any).data_sources.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                targetDbId = (dbInfo as any).data_sources[0].id;
                if (debug) console.log(`Resolved Data Source ID: ${targetDbId}`);
            }
        } catch (e) {
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = {
                page_size: explicitLimit ? Math.min(explicitLimit - fetchedCount, 100) : 100,
                sorts: [
                    {
                        property: source === 'recepcion' ? 'FECHA' : 'Fecha',
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

            const data = await response.json();
            const results = data.results || [];
            hasMore = data.has_more;
            cursor = data.next_cursor; // Update cursor for next loop

            fetchedCount += results.length;

            for (const page of results) {
                if (!('properties' in page)) continue;

                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const props = page.properties as any;

                    // Common Fields
                    let fecha = new Date().toISOString();
                    let descripcion = 'Sin descripción';
                    let externalUrl = page.url;

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
                            usuario: 'Sistema' // Default user
                        }, { onConflict: undefined }); // No unique constraint easily mapped for recepcion yet, usually just insert. 
                        // Note: upsert without ON CONFLICT works as INSERT if no PK match (UUID generated).
                        // To prevent duplicates, we'd need a unique field. Recepcion table might not have one for external_url.
                        // For now we INSERT. 

                        if (insertError) {
                            errors.push({ id: page.id, error: insertError });
                        } else {
                            processed.push({ id: page.id, status: 'imported_recepcion' });
                        }

                    } else {
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
                        const hasAttachments = fileProp && fileProp.type === 'files' && fileProp.files.length > 0;
                        let nota = `Imported from Notion. Original ID: ${page.id}.`;
                        if (hasAttachments) nota += ` Has ${fileProp.files.length} attachment(s).`;

                        const { error: insertError } = await supabase.from('caja_admin_movimientos').upsert({
                            fecha_hora: fecha,
                            descripcion: descripcion,
                            subtipo: subTipo,
                            tipo_movimiento: tipoMovimiento,
                            usd_equivalente_total: p_moneda === 'USD' ? monto : (monto / (tc || 1)),
                            tc_bna_venta: tc || null,
                            external_url: page.url,
                            adjuntos: null,
                            nota: nota
                        }, { onConflict: 'external_url' });

                        if (insertError) {
                            errors.push({ id: page.id, error: insertError });
                        } else {
                            processed.push({ id: page.id, status: 'imported_admin' });
                        }
                    }

                } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                    errors.push({ id: page.id, error: e.message });
                }
            } // End for loop
        } // End while loop

        return NextResponse.json({
            success: true,
            count: processed.length,
            errors,
            processed_sample: processed.slice(0, 5)
        });

    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error('Import Error:', error);
        return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
}
