#!/usr/bin/env node
import dotenv from 'dotenv';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';

import {
    createAppointmentDirect,
    findAvailableSlots,
    getAgenda,
    getPatientAppointments,
    getPatientSummary,
    listDoctors,
    searchPatients,
} from './core';
import { createMcpSupabaseClient } from './supabase';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabase = createMcpSupabaseClient();

function jsonText(value: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(value, null, 2),
            },
        ],
    };
}

const server = new McpServer({
    name: 'am-clinica-mcp',
    version: '0.1.0',
}, {
    instructions: [
        'Use these tools to safely operate AM Clinica patients and agenda.',
        'Never request direct SQL access. Use am_find_available_slots before am_create_appointment when possible.',
        'am_create_appointment creates real appointments immediately after validation.',
    ].join('\n'),
});

server.registerTool('am_search_patients', {
    title: 'Buscar pacientes',
    description: 'Search active AM Clinica patients by name, surname, email, document, or WhatsApp.',
    inputSchema: {
        query: z.string().min(2).describe('Search text, for example "gustavo oro" or a phone/email fragment.'),
        limit: z.number().int().min(1).max(25).default(10),
    },
}, async ({ query, limit }) => jsonText(await searchPatients(supabase, query, limit)));

server.registerTool('am_get_patient_summary', {
    title: 'Resumen de paciente',
    description: 'Get operational patient details and upcoming appointments.',
    inputSchema: {
        patientId: z.string().uuid(),
    },
}, async ({ patientId }) => jsonText(await getPatientSummary(supabase, patientId)));

server.registerTool('am_get_patient_appointments', {
    title: 'Turnos de paciente',
    description: 'List appointments for a patient.',
    inputSchema: {
        patientId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        upcomingOnly: z.boolean().default(false),
    },
}, async ({ patientId, limit, upcomingOnly }) => jsonText(await getPatientAppointments(supabase, patientId, limit, upcomingOnly)));

server.registerTool('am_list_doctors', {
    title: 'Listar doctores',
    description: 'List active clinical doctors/professionals available for appointments.',
    inputSchema: {},
}, async () => jsonText(await listDoctors(supabase)));

server.registerTool('am_get_agenda', {
    title: 'Ver agenda',
    description: 'Read agenda appointments in an ISO datetime range, optionally filtered by doctor.',
    inputSchema: {
        startTime: z.string().datetime({ offset: true }),
        endTime: z.string().datetime({ offset: true }),
        doctorId: z.string().uuid().optional(),
    },
}, async ({ startTime, endTime, doctorId }) => jsonText(await getAgenda(supabase, startTime, endTime, doctorId)));

server.registerTool('am_find_available_slots', {
    title: 'Buscar disponibilidad',
    description: 'Find available slots for a doctor on a clinic date. Uses doctor_schedules, existing appointments, and agenda blocks.',
    inputSchema: {
        doctorId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Clinic date in YYYY-MM-DD format.'),
        durationMinutes: z.number().int().min(10).max(240).default(30),
        stepMinutes: z.number().int().min(5).max(120).default(15),
    },
}, async ({ doctorId, date, durationMinutes, stepMinutes }) => jsonText(await findAvailableSlots(supabase, doctorId, date, durationMinutes, stepMinutes)));

server.registerTool('am_create_appointment', {
    title: 'Crear turno',
    description: 'Create a real appointment immediately after validating patient, doctor, time range, agenda conflicts, and agenda blocks.',
    inputSchema: {
        patientId: z.string().uuid(),
        doctorId: z.string().uuid(),
        startTime: z.string().datetime({ offset: true }),
        endTime: z.string().datetime({ offset: true }).optional(),
        durationMinutes: z.number().int().min(10).max(240).default(30),
        title: z.string().min(1).max(160).optional(),
        type: z.string().min(1).max(80).default('consulta'),
        status: z.enum(['confirmed', 'pending']).default('confirmed'),
        notes: z.string().max(2000).optional(),
    },
}, async (input) => jsonText(await createAppointmentDirect(supabase, input)));

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error('[am-clinica-mcp] fatal:', error);
    process.exit(1);
});
