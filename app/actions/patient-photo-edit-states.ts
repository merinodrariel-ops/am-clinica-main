'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export interface PatientPhotoEditStateRow {
  file_id: string;
  patient_id: string;
  rotation: number;
  brightness: number;
  draw_shapes: unknown[];
  text_annotations: unknown[];
  created_at: string;
  updated_at: string;
}

export async function listPatientPhotoEditStatesAction(patientId: string): Promise<{ data: PatientPhotoEditStateRow[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'No autenticado' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('patient_photo_edit_states')
    .select('*')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[listPatientPhotoEditStates]', error);
    return { data: [], error: error.message };
  }

  return { data: (data as PatientPhotoEditStateRow[]) ?? [] };
}

export async function savePatientPhotoEditStateAction(params: {
  fileId: string;
  patientId: string;
  rotation: number;
  brightness: number;
  drawShapes: unknown[];
  textAnnotations: unknown[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('patient_photo_edit_states')
    .upsert({
      file_id: params.fileId,
      patient_id: params.patientId,
      rotation: params.rotation,
      brightness: params.brightness,
      draw_shapes: params.drawShapes,
      text_annotations: params.textAnnotations,
      updated_by: user.id,
    }, { onConflict: 'file_id' });

  if (error) {
    console.error('[savePatientPhotoEditState]', error);
    return { error: error.message };
  }

  return {};
}
