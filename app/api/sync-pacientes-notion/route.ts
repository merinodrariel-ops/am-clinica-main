import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';

// Initialize Supabase Client lazily
const getSupabase = () => createAdminClient();

const NOTION_DATABASE_ID_PACIENTES = process.env.NOTION_DB_PACIENTES_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minute timeout for large syncs

interface NotionPatient {
    id: string;
    notionId: number;
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
    documento: string | null;
    ciudad: string | null;
    localidad: string | null;
    direccion: string | null;
    fechaCreacion: string;
    motivoConsulta: string | null;
    comoNosEncontraste: string | null;
    url: string;
}

interface SyncResult {
    success: boolean;
    stats: {
        totalInNotion: number;
        alreadyInSupabase: number;
        newlyImported: number;
        skippedDuplicates: number;
        errors: number;
    };
    imported: { nombre: string; apellido: string; email: string | null }[];
    duplicates: { nombre: string; reason: string }[];
    errors: { id: string; error: string }[];
    nextCursor: string | null;
    hasMore: boolean;
}

// Extract plain text from Notion rich text array
function extractText(richText: unknown): string | null {
    if (!Array.isArray(richText) || richText.length === 0) return null;
    return richText.map((t: { plain_text?: string }) => t.plain_text || '').join('').trim() || null;
}

// Extract phone number
function extractPhone(phoneNumber: unknown): string | null {
    if (typeof phoneNumber !== 'string') return null;
    // Clean phone number - remove spaces, dashes, and common prefixes
    return phoneNumber.replace(/[\s\-()]/g, '').replace(/^\+?54\s*9?\s*/, '') || null;
}

// Parse Notion patient page to our format
function parseNotionPatient(page: Record<string, unknown>): NotionPatient | null {
    try {
        const props = page.properties as Record<string, unknown>;
        if (!props) return null;

        // Get unique ID from Notion
        const uniqueIdProp = props['ID'] as { unique_id?: { number?: number } } | undefined;
        const notionId = uniqueIdProp?.unique_id?.number || 0;

        // Title field (Apellido y Nombre)
        const titleProp = props['Apellido y Nombre'] as { title?: Array<{ plain_text?: string }> } | undefined;
        const fullName = extractText(titleProp?.title) || '';

        // Individual name fields
        const nombreProp = props['Nombre'] as { rich_text?: unknown } | undefined;
        const apellidoProp = props['Apellido'] as { rich_text?: unknown } | undefined;

        let nombre = extractText(nombreProp?.rich_text);
        let apellido = extractText(apellidoProp?.rich_text);

        // If individual fields are empty, try to parse from title
        if (!nombre && !apellido && fullName) {
            const parts = fullName.split(' ');
            if (parts.length >= 2) {
                // Assume first word(s) are apellido, rest is nombre
                apellido = parts[0];
                nombre = parts.slice(1).join(' ');
            } else {
                nombre = fullName;
                apellido = '';
            }
        }

        // Email
        const emailProp = props['Email'] as { email?: string } | undefined;
        const email = emailProp?.email?.toLowerCase().trim() || null;

        // Phone/WhatsApp
        const whatsappProp = props['WhatsApp'] as { phone_number?: string } | undefined;
        const telefono = extractPhone(whatsappProp?.phone_number);

        // DNI/Documento
        const dniProp = props['DNI'] as { rich_text?: unknown } | undefined;
        const documento = extractText(dniProp?.rich_text);

        // Location fields
        const ciudadProp = props['Ciudad'] as { select?: { name?: string } } | undefined;
        const localidadProp = props['Localidad'] as { select?: { name?: string } } | undefined;
        const direccionProp = props['Ciudad/Barrio'] as { rich_text?: unknown } | undefined;

        const ciudad = ciudadProp?.select?.name || null;
        const localidad = localidadProp?.select?.name || null;
        const direccion = extractText(direccionProp?.rich_text);

        // Creation date
        const fechaCreacionProp = props['Fecha creación'] as { created_time?: string } | undefined;
        const fechaCreacion = fechaCreacionProp?.created_time || new Date().toISOString();

        // Motivo consulta
        const motivoProp = props['Motivo de la consulta'] as { rich_text?: unknown } | undefined;
        const motivoConsulta = extractText(motivoProp?.rich_text);

        // Como nos encontraste
        const comoProp = props['¿Cómo nos encontraste?'] as { multi_select?: Array<{ name?: string }> } | undefined;
        const comoNosEncontraste = comoProp?.multi_select?.map((s: { name?: string }) => s.name).join(', ') || null;

        return {
            id: page.id as string,
            notionId,
            nombre: nombre || '',
            apellido: apellido || '',
            email: email && email.includes('@') ? email : null,
            telefono,
            documento,
            ciudad,
            localidad,
            direccion,
            fechaCreacion,
            motivoConsulta,
            comoNosEncontraste,
            url: page.url as string
        };
    } catch (e) {
        console.error('Error parsing patient:', e);
        return null;
    }
}

// Check if patient exists in Supabase
async function findExistingPatient(patient: NotionPatient, supabase: any): Promise<{ exists: boolean; reason?: string }> {
    // Check by email (most reliable)
    if (patient.email) {
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente')
            .eq('email', patient.email)
            .limit(1);

        if (data && data.length > 0) {
            return { exists: true, reason: `email: ${patient.email}` };
        }
    }

    // Check by DNI/documento
    if (patient.documento && patient.documento.length >= 6) {
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente')
            .eq('documento', patient.documento)
            .limit(1);

        if (data && data.length > 0) {
            return { exists: true, reason: `documento: ${patient.documento}` };
        }
    }

    // Check by phone number (if exists and is substantial)
    if (patient.telefono && patient.telefono.length >= 8) {
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente')
            .or(`telefono.ilike.%${patient.telefono}%,whatsapp_numero.ilike.%${patient.telefono}%`)
            .limit(1);

        if (data && data.length > 0) {
            return { exists: true, reason: `telefono: ${patient.telefono}` };
        }
    }

    // Check by exact name match (last resort, less reliable)
    if (patient.nombre && patient.apellido) {
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente')
            .ilike('nombre', patient.nombre)
            .ilike('apellido', patient.apellido)
            .limit(1);

        if (data && data.length > 0) {
            return { exists: true, reason: `nombre: ${patient.nombre} ${patient.apellido}` };
        }
    }

    return { exists: false };
}

// Insert patient into Supabase
async function insertPatient(patient: NotionPatient, supabase: any): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('pacientes').insert({
        nombre: patient.nombre || 'Sin nombre',
        apellido: patient.apellido || '',
        email: patient.email,
        telefono: patient.telefono,
        documento: patient.documento,
        ciudad: patient.ciudad,
        zona_barrio: patient.localidad,
        direccion: patient.direccion,
        observaciones_generales: [
            patient.motivoConsulta ? `Motivo: ${patient.motivoConsulta}` : null,
            patient.comoNosEncontraste ? `Origen: ${patient.comoNosEncontraste}` : null,
            `Notion URL: ${patient.url}`
        ].filter(Boolean).join(' | '),
        fecha_alta: patient.fechaCreacion,
        origen_registro: 'notion_sync',
        estado_paciente: 'activo'
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function GET(request: Request) {
    const supabase = getSupabase();
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    try {
        if (!NOTION_API_KEY) {
            return NextResponse.json({ error: 'Missing NOTION_API_KEY' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor') || undefined;
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam) : null; // null = fetch all
        const dryRun = searchParams.get('dry_run') === 'true';
        const debug = searchParams.get('debug') === 'true';

        const result: SyncResult = {
            success: true,
            stats: {
                totalInNotion: 0,
                alreadyInSupabase: 0,
                newlyImported: 0,
                skippedDuplicates: 0,
                errors: 0
            },
            imported: [],
            duplicates: [],
            errors: [],
            nextCursor: null,
            hasMore: false
        };

        let currentCursor = cursor;
        let hasMore = true;
        let processedCount = 0;

        // Pagination loop
        while (hasMore) {
            if (limit && processedCount >= limit) break;

            const pageSize = limit ? Math.min(limit - processedCount, 100) : 100;

            // Query Notion database
            const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID_PACIENTES}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_size: pageSize,
                    start_cursor: currentCursor,
                    sorts: [{ property: 'Fecha creación', direction: 'descending' }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Notion API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const pages = data.results || [];
            hasMore = data.has_more;
            currentCursor = data.next_cursor;

            if (debug) {
                console.log(`Fetched ${pages.length} patients from Notion. Has more: ${hasMore}`);
            }

            // Process each patient
            for (const page of pages) {
                processedCount++;
                result.stats.totalInNotion++;

                const patient = parseNotionPatient(page);
                if (!patient) {
                    result.errors.push({ id: page.id, error: 'Failed to parse patient data' });
                    result.stats.errors++;
                    continue;
                }

                // Skip patients without name
                if (!patient.nombre && !patient.apellido) {
                    result.errors.push({ id: page.id, error: 'Patient has no name' });
                    result.stats.errors++;
                    continue;
                }

                // Check for duplicates
                const existingCheck = await findExistingPatient(patient, supabase);
                if (existingCheck.exists) {
                    result.duplicates.push({
                        nombre: `${patient.nombre} ${patient.apellido}`.trim(),
                        reason: existingCheck.reason || 'Unknown'
                    });
                    result.stats.alreadyInSupabase++;
                    result.stats.skippedDuplicates++;
                    continue;
                }

                // Insert if not dry run
                if (!dryRun) {
                    const insertResult = await insertPatient(patient, supabase);
                    if (insertResult.success) {
                        result.imported.push({
                            nombre: patient.nombre,
                            apellido: patient.apellido,
                            email: patient.email
                        });
                        result.stats.newlyImported++;
                    } else {
                        result.errors.push({ id: page.id, error: insertResult.error || 'Insert failed' });
                        result.stats.errors++;
                    }
                } else {
                    // In dry run, just count as "would import"
                    result.imported.push({
                        nombre: patient.nombre,
                        apellido: patient.apellido,
                        email: patient.email
                    });
                    result.stats.newlyImported++;
                }
            }
        }

        result.nextCursor = currentCursor || null;
        result.hasMore = hasMore;

        return NextResponse.json({
            ...result,
            dryRun,
            message: dryRun
                ? `DRY RUN - Found ${result.stats.newlyImported} patients to import (${result.stats.skippedDuplicates} duplicates)`
                : `Imported ${result.stats.newlyImported} new patients (${result.stats.skippedDuplicates} duplicates skipped)`
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Sync Error:', error);
        return NextResponse.json({
            success: false,
            error: errorMessage
        }, { status: 500 });
    }
}

// POST method for triggering full sync with progress tracking
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const dryRun = body.dry_run === true;
        const batchSize = body.batch_size || 100;

        // Redirect to GET with full sync params
        const url = new URL(request.url);
        url.searchParams.set('dry_run', dryRun.toString());
        url.searchParams.set('limit', batchSize.toString());

        // For POST, we just call GET logic preserving headers for auth
        return GET(new Request(url.toString(), { headers: request.headers }));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({
            success: false,
            error: errorMessage
        }, { status: 500 });
    }
}
