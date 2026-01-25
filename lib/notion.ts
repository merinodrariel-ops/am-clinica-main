/* eslint-disable @typescript-eslint/no-explicit-any */
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ds = (dbInfo as any).data_sources;
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
        let allResults: any[] = [];
        let hasMore = true;
        let cursor: string | undefined = undefined;

        while (hasMore) {
            const response: any = await notion.dataSources.query({
                data_source_id: targetId,
                start_cursor: cursor,
                sorts: [
                    {
                        property: 'Apellido y Nombre',
                        direction: 'ascending',
                    },
                ],
            });

            allResults = [...allResults, ...response.results];
            hasMore = response.has_more;
            cursor = response.next_cursor;
        }

        return allResults.map((page: any) => {
            const props = page.properties;

            // Helper to safely get property values
            const getName = (p: any) => p?.title?.[0]?.plain_text ?? 'Sin Nombre';
            const getSelect = (p: any) => p?.select?.name ?? 'Sin asignar';
            const getDate = (p: any) => p?.date?.start ?? null;
            const getNumber = (p: any) => p?.number ?? 0;
            const getPhone = (p: any) => p?.phone_number ?? null;

            return {
                id: page.id,
                name: getName(props['Apellido y Nombre']),
                source: getSelect(props['Fuente']),
                dsdStageDate: getDate(props['Fecha etapa DSD']),
                originalDate: getDate(props['Fecha original (importados)']),
                createdAt: page.created_time,
                lastEditedAt: page.last_edited_time,
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
    const props = (page as any).properties;

    const getName = (p: any) => p?.title?.[0]?.plain_text ?? 'Sin Nombre';
    const getSelect = (p: any) => p?.select?.name ?? 'Sin asignar';
    const getDate = (p: any) => p?.date?.start ?? null;
    const getNumber = (p: any) => p?.number ?? 0;
    const getPhone = (p: any) => p?.phone_number ?? null;

    return {
        id: page.id,
        name: getName(props['Apellido y Nombre']),
        source: getSelect(props['Fuente']),
        dsdStageDate: getDate(props['Fecha etapa DSD']),
        originalDate: getDate(props['Fecha original (importados)']),
        createdAt: (page as any).created_time,
        lastEditedAt: (page as any).last_edited_time,
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

