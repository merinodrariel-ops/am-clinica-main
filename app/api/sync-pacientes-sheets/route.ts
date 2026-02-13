import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwXYeMlpxFSKlCi6tOiJtaxQqcAHUPOAAqVPpzalimICRNj0QsfRcDR3ye2Cr80TOH1xSN6QYsHTYc/pub?gid=1185177260&single=true&output=csv';

export const dynamic = 'force-dynamic';

type CsvRow = Record<string, string>;

interface ExistingPatientRow {
    id_paciente: string;
    link_google_slides: string | null;
    observaciones_generales: string | null;
}

interface PatientUpdates {
    link_google_slides?: string;
    observaciones_generales?: string;
    referencia_origen?: string;
}

export async function GET() {
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
                let query = supabase.from('pacientes').select('id_paciente, link_google_slides, observaciones_generales');

                if (dni) {
                    query = query.or(`documento.eq.${dni}${email ? `,email.eq.${email}` : ''}`);
                } else {
                    query = query.eq('email', email);
                }

                const { data: existing } = await query.single<ExistingPatientRow>();

                if (existing) {
                    // Update if missing data
                    const updates: PatientUpdates = {};
                    if (slidesLink && !existing.link_google_slides) {
                        updates.link_google_slides = slidesLink;
                    }
                    // If we have new observations, append them if not already there
                    if (observaciones && (!existing.observaciones_generales || !existing.observaciones_generales.includes(motivo))) {
                        updates.observaciones_generales = existing.observaciones_generales
                            ? `${existing.observaciones_generales}\n${observaciones}`
                            : observaciones;
                    }
                    if (referencia) {
                        updates.referencia_origen = referencia;
                    }

                    if (Object.keys(updates).length > 0) {
                        await supabase
                            .from('pacientes')
                            .update(updates)
                            .eq('id_paciente', existing.id_paciente);
                    }

                    stats.skippedDuplicates++;
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
