import type { SupabaseClient } from '@supabase/supabase-js';

export type AmSupabaseClient = SupabaseClient;

export type PatientSearchResult = {
    id: string;
    nombre: string | null;
    apellido: string | null;
    fullName: string;
    whatsapp: string | null;
    email: string | null;
    documento: string | null;
    estado: string | null;
};

export type DoctorResult = {
    id: string;
    fullName: string;
    role: string | null;
};

export type AppointmentResult = {
    id: string;
    title: string | null;
    patientId: string | null;
    patientName: string | null;
    doctorId: string | null;
    doctorName: string | null;
    startTime: string;
    endTime: string;
    status: string;
    type: string;
    notes: string | null;
    source: string | null;
};

export type AvailabilitySlot = {
    startTime: string;
    endTime: string;
    doctorId: string;
    doctorName: string | null;
};

export type CreateAppointmentInput = {
    patientId: string;
    doctorId: string;
    startTime: string;
    endTime?: string;
    durationMinutes?: number;
    title?: string;
    type?: string;
    status?: string;
    notes?: string;
    createdBy?: string | null;
};

export type SlotConflict = {
    kind: 'appointment' | 'block';
    id: string;
    title: string | null;
    startTime: string;
    endTime: string;
};
