import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface MappedColumn {
    csvColumn: string;
    dbField: string;
}

interface CSVRow {
    [key: string]: string;
}

export async function POST(request: NextRequest) {
    try {
        const { data, mappings, fileName } = await request.json() as {
            data: CSVRow[];
            mappings: MappedColumn[];
            fileName: string;
        };

        // Get auth token from request
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        // Create admin client for import
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get current user from token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
        }

        // Check user role
        const { data: profile } = await supabase
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();

        if (!profile || !['owner', 'admin'].includes(profile.categoria)) {
            return NextResponse.json({ error: 'Sin permisos de importación' }, { status: 403 });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: { row: number; message: string }[] = [];

        // Process each row
        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            try {
                // Build record from mappings
                const record: Record<string, unknown> = {
                    origen: 'importado_csv',
                    importado_por: user.id,
                    fecha_importacion: new Date().toISOString(),
                    archivo_origen: fileName,
                    estado_registro: 'activo',
                    created_by: user.id,
                };

                // Map CSV columns to DB fields
                for (const mapping of mappings) {
                    const value = row[mapping.csvColumn];

                    switch (mapping.dbField) {
                        case 'fecha_hora':
                            // Parse date in various formats
                            record.fecha_hora = parseDate(value);
                            break;
                        case 'monto':
                            // Clean and parse amount
                            record.monto = parseFloat(value.replace(/[,$\s]/g, '').replace(',', '.')) || 0;
                            break;
                        case 'metodo_pago':
                            record.metodo_pago = normalizeMetodoPago(value);
                            break;
                        case 'moneda':
                            record.moneda = normalizeMoneda(value);
                            break;
                        case 'paciente_nombre':
                            // Try to find or create patient
                            const patientResult = await findOrCreatePatient(supabase, value);
                            if (patientResult.id) {
                                record.paciente_id = patientResult.id;
                            }
                            break;
                        case 'concepto_nombre':
                            record.concepto_nombre = value || 'Sin especificar';
                            break;
                        case 'profesional':
                            record.usuario = value || null;
                            break;
                        case 'observaciones':
                            record.observaciones = value || null;
                            break;
                    }
                }

                // Set defaults if missing
                if (!record.fecha_hora) {
                    record.fecha_hora = new Date().toISOString();
                }
                if (!record.moneda) {
                    record.moneda = 'USD';
                }
                if (!record.metodo_pago) {
                    record.metodo_pago = 'Efectivo';
                }
                if (!record.concepto_nombre) {
                    record.concepto_nombre = 'Ingreso importado';
                }

                // Calculate USD equivalent
                if (record.moneda === 'USD') {
                    record.usd_equivalente = record.monto;
                }

                // Insert into caja_recepcion_movimientos
                const { error: insertError } = await supabase
                    .from('caja_recepcion_movimientos')
                    .insert(record);

                if (insertError) {
                    throw insertError;
                }

                successCount++;
            } catch (error) {
                errorCount++;
                errors.push({
                    row: i + 2,
                    message: error instanceof Error ? error.message : 'Error desconocido'
                });
            }
        }

        return NextResponse.json({
            success: successCount,
            errors: errorCount,
            errorDetails: errors.slice(0, 10) // Return first 10 errors
        });

    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json(
            { error: 'Error en la importación' },
            { status: 500 }
        );
    }
}

function parseDate(value: string): string {
    if (!value) return new Date().toISOString();

    // Try various formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY
    const patterns = [
        /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/, // DD/MM/YYYY or DD-MM-YYYY
        /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/, // YYYY-MM-DD
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match) {
            if (pattern === patterns[0]) {
                // DD/MM/YYYY format
                const day = parseInt(match[1]);
                const month = parseInt(match[2]);
                const year = parseInt(match[3]);
                return new Date(year, month - 1, day, 12, 0, 0).toISOString();
            } else {
                // YYYY-MM-DD format
                const year = parseInt(match[1]);
                const month = parseInt(match[2]);
                const day = parseInt(match[3]);
                return new Date(year, month - 1, day, 12, 0, 0).toISOString();
            }
        }
    }

    // Try native Date parsing as fallback
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }

    return new Date().toISOString();
}

function normalizeMetodoPago(value: string): string {
    const normalized = value.toLowerCase().trim();
    if (normalized.includes('efectivo') || normalized.includes('cash')) return 'Efectivo';
    if (normalized.includes('transfer')) return 'Transferencia';
    if (normalized.includes('mercado') || normalized.includes('mp')) return 'MercadoPago';
    if (normalized.includes('cripto') || normalized.includes('usdt')) return 'Cripto';
    return 'Efectivo';
}

function normalizeMoneda(value: string): string {
    const normalized = value.toUpperCase().trim();
    if (normalized.includes('USD') || normalized.includes('DOLAR') || normalized.includes('$')) return 'USD';
    if (normalized.includes('ARS') || normalized.includes('PESO')) return 'ARS';
    if (normalized.includes('USDT') || normalized.includes('CRIPTO')) return 'USDT';
    return 'USD';
}

async function findOrCreatePatient(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    nombre: string
): Promise<{ id: string | null }> {
    if (!nombre || nombre.trim() === '') {
        return { id: null };
    }

    const parts = nombre.trim().split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    // Try to find existing patient
    const { data: existing } = await supabase
        .from('pacientes')
        .select('id_paciente')
        .ilike('nombre', `%${firstName}%`)
        .ilike('apellido', `%${lastName}%`)
        .limit(1)
        .single();

    if (existing) {
        return { id: existing.id_paciente };
    }

    // Create new patient
    const { data: newPatient, error } = await supabase
        .from('pacientes')
        .insert({
            nombre: firstName,
            apellido: lastName || 'Sin apellido',
            estado_paciente: 'activo',
            origen_registro: 'csv_import'
        })
        .select('id_paciente')
        .single();

    if (error) {
        console.warn('Could not create patient:', error);
        return { id: null };
    }

    return { id: newPatient.id_paciente };
}

