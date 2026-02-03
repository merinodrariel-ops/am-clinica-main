
import { Client } from '@notionhq/client';

if (!process.env.NOTION_API_KEY) {
    throw new Error('Missing NOTION_API_KEY environment variable');
}

if (!process.env.NOTION_DATABASE_ID) {
    throw new Error('Missing NOTION_DATABASE_ID environment variable');
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DB_PACIENTES_ID || process.env.NOTION_DATABASE_ID;

export interface Patient {
    id: string;
    name: string;
    source: string;
    dsdStageDate: string | null;
    originalDate: string | null;
    createdAt: string;
    lastEditedAt: string;
    phoneNumber: string | null;
    totalValue: number | null;
    status: string | null; // From 'DSD' or similar status field
}

export interface Payment {
    id: string;
    patientId: string;
    date: string;
    amount: number;
    method: string; // 'Efectivo', 'Transferencia', 'Tarjeta'
    concept: string; // 'Entrega inicial', 'Cuota 1', etc.
    status: string; // 'Pagado', 'Pendiente'
}

const MOCK_PATIENTS: Patient[] = [
    { id: '1', name: 'Juan Perez', source: 'Instagram', dsdStageDate: '2025-11-15', originalDate: '2025-01-10', createdAt: '2025-01-01', lastEditedAt: '2025-11-16', phoneNumber: '+54 9 11 1234 5678', totalValue: 1500, status: 'DSD' },
    { id: '2', name: 'Maria Garcia', source: 'Google', dsdStageDate: '2025-11-20', originalDate: '2024-12-05', createdAt: '2024-12-01', lastEditedAt: '2025-11-21', phoneNumber: '+54 9 11 8765 4321', totalValue: 3200, status: 'Rápidos' },
    { id: '3', name: 'Carlos Lopez', source: 'Recomendación', dsdStageDate: null, originalDate: '2024-03-15', createdAt: '2024-03-15', lastEditedAt: '2024-03-15', phoneNumber: null, totalValue: null, status: 'Complejos' },
];

const MOCK_PAYMENTS: Payment[] = [
    { id: 'p1', patientId: '1', date: '2025-11-01', amount: 500, method: 'Efectivo', concept: 'Entrega inicial', status: 'Pagado' },
    { id: 'p2', patientId: '1', date: '2025-12-01', amount: 500, method: 'Transferencia', concept: 'Cuota 1', status: 'Pagado' },
    { id: 'p3', patientId: '1', date: '2026-01-01', amount: 500, method: 'Tarjeta', concept: 'Cuota 2', status: 'Pendiente' },
    { id: 'p4', patientId: '2', date: '2025-11-20', amount: 1200, method: 'Transferencia', concept: 'Pago Total', status: 'Pagado' },
];

// Helper to resolve Data Source ID from a potentially synced Database View ID
async function resolveDataSourceId(dbId: string): Promise<string> {
    try {
        const dbInfo = await notion.databases.retrieve({ database_id: dbId });
        const ds = (dbInfo as unknown as { data_sources: { id: string }[] }).data_sources;
        if (ds && ds.length > 0) {
            return ds[0].id;
        }
    } catch (e) {
        console.error('Error resolving data source ID:', e);
    }
    return dbId;
}

export async function getPatients(): Promise<Patient[]> {
    if (!process.env.NOTION_API_KEY || process.env.NOTION_API_KEY === 'your_notion_api_key_here') {
        console.warn('Using MOCK data for patients list');
        return MOCK_PATIENTS;
    }

    try {
        const targetId = await resolveDataSourceId(DATABASE_ID!);
        let allResults: Record<string, unknown>[] = [];
        let hasMore = true;
        let cursor: string | undefined = undefined;

        while (hasMore) {
            const response = await notion.dataSources.query({
                data_source_id: targetId,
                start_cursor: cursor,
                sorts: [
                    {
                        property: 'Apellido y Nombre',
                        direction: 'ascending',
                    },
                ],
            });

            allResults = [...allResults, ...((response as unknown as { results: Record<string, unknown>[] }).results)];
            hasMore = (response as unknown as { has_more: boolean }).has_more;
            cursor = (response as unknown as { next_cursor: string | undefined }).next_cursor;
        }

        return allResults.map((page) => {
            const props = (page as { properties: Record<string, Record<string, unknown>> }).properties;

            // Helper to safely get property values
            const getName = (p: Record<string, unknown> | undefined) => (p as { title: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? 'Sin Nombre';
            const getSelect = (p: Record<string, unknown> | undefined) => (p as { select: { name: string } } | undefined)?.select?.name ?? 'Sin asignar';
            const getDate = (p: Record<string, unknown> | undefined) => (p as { date: { start: string } } | undefined)?.date?.start ?? null;
            const getNumber = (p: Record<string, unknown> | undefined) => (p as { number: number } | undefined)?.number ?? 0;
            const getPhone = (p: Record<string, unknown> | undefined) => (p as { phone_number: string } | undefined)?.phone_number ?? null;

            return {
                id: (page as { id: string }).id,
                name: getName(props['Apellido y Nombre']),
                source: getSelect(props['Fuente']),
                dsdStageDate: getDate(props['Fecha etapa DSD']),
                originalDate: getDate(props['Fecha original (importados)']),
                createdAt: (page as { created_time: string }).created_time,
                lastEditedAt: (page as { last_edited_time: string }).last_edited_time,
                phoneNumber: getPhone(props['Enviar mensajes']),
                totalValue: getNumber(props['Valor']),
                status: getSelect(props['DSD']),
            };
        });
    } catch (error) {
        console.warn('Error fetching from Notion, falling back to mock data', error);
        return MOCK_PATIENTS;
    }
}

export async function getPatientById(id: string) {
    if (!process.env.NOTION_API_KEY || process.env.NOTION_API_KEY === 'your_notion_api_key_here') {
        const mock = MOCK_PATIENTS.find(p => p.id === id) || MOCK_PATIENTS[0];
        return { ...mock, raw: {} };
    }

    // For retrieve page, we don't need data source ID resolution if extracting from page_id
    // But usually page_id is unique.
    const page = await notion.pages.retrieve({ page_id: id });
    const props = (page as unknown as { properties: Record<string, Record<string, unknown>> }).properties;

    const getName = (p: Record<string, unknown> | undefined) => (p as { title: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? 'Sin Nombre';
    const getSelect = (p: Record<string, unknown> | undefined) => (p as { select: { name: string } } | undefined)?.select?.name ?? 'Sin asignar';
    const getDate = (p: Record<string, unknown> | undefined) => (p as { date: { start: string } } | undefined)?.date?.start ?? null;
    const getNumber = (p: Record<string, unknown> | undefined) => (p as { number: number } | undefined)?.number ?? 0;
    const getPhone = (p: Record<string, unknown> | undefined) => (p as { phone_number: string } | undefined)?.phone_number ?? null;

    return {
        id: page.id,
        name: getName(props['Apellido y Nombre']),
        source: getSelect(props['Fuente']),
        dsdStageDate: getDate(props['Fecha etapa DSD']),
        originalDate: getDate(props['Fecha original (importados)']),
        createdAt: (page as unknown as { created_time: string }).created_time,
        lastEditedAt: (page as unknown as { last_edited_time: string }).last_edited_time,
        phoneNumber: getPhone(props['Enviar mensajes']),
        totalValue: getNumber(props['Valor']),
        status: getSelect(props['DSD']),
        raw: page, // For debugging or extra fields
    };
}

export async function getPageBlocks(id: string) {
    if (!process.env.NOTION_API_KEY || process.env.NOTION_API_KEY === 'your_notion_api_key_here') {
        return [
            { id: 'b1', type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Consulta Inicial (Mock)' }] } },
            { id: 'b2', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Paciente presenta molestias en sector posterior. Se indica radiografía.' }] } }
        ];
    }
    const response = await notion.blocks.children.list({
        block_id: id,
        page_size: 50,
    });
    return response.results;
}

export async function getPatientPayments(patientId: string): Promise<Payment[]> {
    // Simulating API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // For now, regardless of API key validity, we return MOCK data for payments
    // because we haven't set up the Notion database for payments yet.
    return MOCK_PAYMENTS.filter(p => p.patientId === patientId);
}

