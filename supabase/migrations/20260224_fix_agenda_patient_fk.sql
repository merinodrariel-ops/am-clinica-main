-- Fix agenda_appointments: patient_id FK points to non-existent "patients" table.
-- The actual patient table is "pacientes" with PK "id_paciente".
-- This migration drops the broken FK and adds the correct one.

ALTER TABLE public.agenda_appointments
    DROP CONSTRAINT IF EXISTS agenda_appointments_patient_id_fkey;

ALTER TABLE public.agenda_appointments
    ADD CONSTRAINT agenda_appointments_patient_id_fkey
    FOREIGN KEY (patient_id)
    REFERENCES public.pacientes(id_paciente)
    ON DELETE SET NULL;

-- Also fix the patient join query expectation in getAppointments:
-- The app does: patient:patient_id (full_name, phone)
-- But pacientes has: nombre, apellido, telefono (no full_name column)
-- We add a generated column so the join works transparently.
ALTER TABLE public.pacientes
    ADD COLUMN IF NOT EXISTS full_name TEXT GENERATED ALWAYS AS (nombre || ' ' || apellido) STORED;
