import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

// Initialize Supabase Client lazily
const getSupabase = () => createAdminClient();

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwXYeMlpxFSKlCi6tOiJtaxQqcAHUPOAAqVPpzalimICRNj0QsfRcDR3ye2Cr80TOH1xSN6QYsHTYc/pub?gid=1185177260&single=true&output=csv';

export const dynamic = 'force-dynamic';

type CsvRow = Record<string, string>;

interface ExistingPatientRow {
    id_paciente: string;
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
    ciudad: string | null;
    link_google_slides: string | null;
    observaciones_generales: string | null;
    documento: string | null;
}

interface PatientUpdates {
    link_google_slides?: string;
    observaciones_generales?: string;
    referencia_origen?: string;
    [key: string]: any; // Allow other fields
}

// ... imports

export async function GET() {
    const supabase = getSupabase();
    try {
        const response = await fetch(SHEET_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch sheet: ${response.statusText}`);
        }

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length === 0) {
            return NextResponse.json({ success: true, message: 'No data found in sheet', stats: { newlyImported: 0, skippedDuplicates: 0, errors: 0 } });
        }

        const stats = {
            total: rows.length,
            newlyImported: 0,
            skippedDuplicates: 0,
            updatedRecords: 0,
            errors: 0
        };

        const imported = [];

        // Helper to find column by flexible keyword matching
        const findValue = (row: CsvRow, keywords: string[]) => {
            const keys = Object.keys(row);
            const foundKey = keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
            return foundKey ? row[foundKey] || '' : '';
        };

        for (const row of rows) {
            try {
                // Map columns
                const nombreCompleto = findValue(row, ['nombre', 'apellido', 'paciente']) || '';
                const dni = findValue(row, ['dni', 'documento', 'id']) || '';
                const email = (findValue(row, ['correo', 'email']) || '').toLowerCase().trim();
                const telefono = findValue(row, ['teléfono', 'whatsapp', 'celular']) || '';
                const ciudad = findValue(row, ['barrio', 'ciudad', 'vive']) || '';
                const motivo = findValue(row, ['motivo', 'consulta', 'consulta']) || '';
                const doctor = findValue(row, ['doctor', 'profesional', 'asignado']) || '';
                const referencia = findValue(row, ['enteraste', 'referencia', 'origen', 'redes']) || '';
                const slidesLink = findValue(row, ['ficha', 'slides', 'presentación']) || '';

                if (!nombreCompleto || (!dni && !email)) continue;

                // Split name
                const parts = nombreCompleto.trim().split(' ');
                let apellido = '';
                let nombre = '';
                if (parts.length >= 2) {
                    apellido = parts.pop() || '';
                    nombre = parts.join(' ');
                } else {
                    nombre = nombreCompleto;
                    apellido = '-';
                }

                // Prepare observations
                const obs = [];
                if (motivo) obs.push(`Motivo: ${motivo}`);
                if (doctor) obs.push(`Doctor Asignado: ${doctor}`);
                if (referencia) obs.push(`Referencia: ${referencia}`);
                const observaciones = obs.length > 0 ? obs.join(' | ') : null;

                // Check for duplicates
                // STRICT RULE: Priority DNI.
                let existing: ExistingPatientRow | null = null;

                if (dni) {
                    const { data, error } = await supabase
                        .from('pacientes')
                        .select('id_paciente, nombre, apellido, email, telefono, ciudad, link_google_slides, observaciones_generales, documento')
                        .eq('documento', dni)
                        .eq('is_deleted', false)
                        .limit(1);

                    if (data && data.length > 0) {
                        existing = data[0];
                    }
                }

                // Fallback to Email only if DNI wasn't found (or wasn't provided)
                if (!existing && email) {
                    const { data, error } = await supabase
                        .from('pacientes')
                        .select('id_paciente, nombre, apellido, email, telefono, ciudad, link_google_slides, observaciones_generales, documento')
                        .eq('email', email)
                        .eq('is_deleted', false)
                        .limit(1);

                    if (data && data.length > 0) {
                        existing = data[0];
                    }
                }

                // Fallback to Nombre + Apellido if neither DNI nor Email matched
                if (!existing && nombre && apellido) {
                    const { data, error } = await supabase
                        .from('pacientes')
                        .select('id_paciente, nombre, apellido, email, telefono, ciudad, link_google_slides, observaciones_generales, documento')
                        .eq('nombre', nombre)
                        .eq('apellido', apellido)
                        .eq('is_deleted', false)
                        .limit(1);

                    if (data && data.length > 0) {
                        existing = data[0];
                    }
                }

                if (existing) {
                    // DUPLICATE FOUND - UPDATE LOGIC
                    const updates: Record<string, any> = {};

                    // Helper: Update field if new value is present and different.
                    // "Nunca reemplazar un campo completo con uno vacío"
                    const updateIfBetter = (field: keyof typeof existing, newValue: string | null) => {
                        if (newValue && newValue.trim() !== '') {
                            // If existing is empty/null, OR if we have a conflict (we take the most recent aka the sheet)
                            if (existing![field] !== newValue) {
                                updates[field as string] = newValue;
                            }
                        }
                    };

                    updateIfBetter('nombre', nombre);
                    updateIfBetter('apellido', apellido);
                    updateIfBetter('email', email); // only if not primary key for search? It's fine.
                    updateIfBetter('telefono', telefono);
                    updateIfBetter('ciudad', ciudad);
                    updateIfBetter('link_google_slides', slidesLink);

                    // Explicitly handle fields that might not be in existing selection if I didn't select them? 
                    // I selected specific fields above. 'referencia' is not in standard select unless I add it.
                    // For safety, let's stick to what we fetched or add reference update

                    if (referencia) updates['referencia_origen'] = referencia;

                    // Observaciones: Append instead of replace to avoid losing history
                    if (observaciones) {
                        if (!existing.observaciones_generales) {
                            updates.observaciones_generales = observaciones;
                        } else if (!existing.observaciones_generales.includes(observaciones)) {
                            updates.observaciones_generales = `${existing.observaciones_generales}\n${observaciones}`;
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        await supabase
                            .from('pacientes')
                            .update(updates)
                            .eq('id_paciente', existing.id_paciente);

                        stats.updatedRecords++;
                    } else {
                        stats.skippedDuplicates++;
                    }
                    continue;
                }

                // Insert new patient
                const { error: insertError } = await supabase
                    .from('pacientes')
                    .insert({
                        nombre,
                        apellido,
                        documento: dni || null,
                        email: email || null,
                        telefono: telefono || null,
                        ciudad: ciudad || null,
                        link_google_slides: slidesLink || null,
                        observaciones_generales: observaciones,
                        estado_paciente: 'Activo',
                        origen_registro: 'Google Form',
                        referencia_origen: referencia || null
                    });

                if (insertError) {
                    console.error('Insert error:', insertError);
                    stats.errors++;
                } else {
                    stats.newlyImported++;
                    imported.push({ nombre, apellido, email });
                }

            } catch (rowError) {
                console.error('Error processing row:', rowError);
                stats.errors++;
            }
        }

        return NextResponse.json({
            success: true,
            stats,
            imported
        });

    } catch (error: unknown) {
        console.error('Sync error:', error);
        const message = error instanceof Error ? error.message : 'Error al sincronizar pacientes';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

function parseCSV(text: string): CsvRow[] {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    // Google Sheets might return CSV with quotes
    const parseLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = parseLine(lines[0]);
    const data: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseLine(lines[i]);
        const entry: CsvRow = {};
        headers.forEach((h, idx) => {
            entry[h] = values[idx] || '';
        });
        data.push(entry);
    }

    return data;
}
