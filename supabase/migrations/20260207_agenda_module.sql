-- Create enum types for status and appointment type
CREATE TYPE appointment_status AS ENUM ('confirmed', 'pending', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE appointment_type AS ENUM ('consulta', 'tratamiento', 'control', 'urgencia', 'otro');

-- Create agenda_appointments table
CREATE TABLE IF NOT EXISTS agenda_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  title TEXT,
  status appointment_status DEFAULT 'confirmed',
  type appointment_type DEFAULT 'consulta',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Enable Row Level Security
ALTER TABLE agenda_appointments ENABLE ROW LEVEL SECURITY;

-- Create policies

-- Policy for reading appointments:
-- Owners, Admins, Reception, pricing_manager, developer, and partner_viewer can view all appointments.
-- (Ideally, we might want to restrict partner_viewer or others, but for now open visibility is safer for collaboration)
CREATE POLICY "Enable read access for authenticated users" ON agenda_appointments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy for inserting appointments:
-- Owners, Admins, Reception can create.
CREATE POLICY "Enable insert for staff" ON agenda_appointments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'reception', 'developer')
    )
  );

-- Policy for updating appointments:
-- Owners, Admins, Reception can update.
CREATE POLICY "Enable update for staff" ON agenda_appointments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'reception', 'developer')
    )
  );

-- Policy for deleting appointments:
-- Owners and Admins can delete.
CREATE POLICY "Enable delete for admins" ON agenda_appointments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'developer')
    )
  );

-- Create indexes for performance
CREATE INDEX idx_agenda_appointments_start_time ON agenda_appointments(start_time);
CREATE INDEX idx_agenda_appointments_patient_id ON agenda_appointments(patient_id);
CREATE INDEX idx_agenda_appointments_doctor_id ON agenda_appointments(doctor_id);
