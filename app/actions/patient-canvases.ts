'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export interface CanvasDocRow {
  id: string;
  patient_id: string;
  name: string;
  ratio: string;
  layers: unknown[];   // CanvasLayer[] minus img field, stored as JSON
  bg_color: string;
  created_at: string;
  updated_at: string;
}

/** List all canvases for a patient, ordered by creation time */
export async function listPatientCanvasesAction(patientId: string): Promise<{ data: CanvasDocRow[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'No autenticado' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('patient_canvases')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[listPatientCanvases]', error);
    return { data: [], error: error.message };
  }
  return { data: data ?? [] };
}

/** Create a new blank canvas for a patient */
export async function createPatientCanvasAction(params: {
  patientId: string;
  name: string;
  ratio?: string;
}): Promise<{ data: CanvasDocRow | null; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'No autenticado' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('patient_canvases')
    .insert({
      patient_id: params.patientId,
      name: params.name,
      ratio: params.ratio ?? '1:1',
      layers: [],
      bg_color: '#ffffff',
    })
    .select()
    .single();

  if (error) {
    console.error('[createPatientCanvas]', error);
    return { data: null, error: error.message };
  }
  return { data };
}

/** Save (upsert) canvas layers + ratio for an existing canvas */
export async function savePatientCanvasAction(params: {
  id: string;
  layers: unknown[];   // serialized CanvasLayer[] (no img field)
  ratio: string;
  name?: string;
  bgColor?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    layers: params.layers,
    ratio: params.ratio,
  };
  if (params.name !== undefined) update.name = params.name;
  if (params.bgColor !== undefined) update.bg_color = params.bgColor;

  const { error } = await admin
    .from('patient_canvases')
    .update(update)
    .eq('id', params.id);

  if (error) {
    console.error('[savePatientCanvas]', error);
    return { error: error.message };
  }
  return {};
}

/** Delete a canvas */
export async function deletePatientCanvasAction(canvasId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('patient_canvases')
    .delete()
    .eq('id', canvasId);

  if (error) {
    console.error('[deletePatientCanvas]', error);
    return { error: error.message };
  }
  return {};
}

/** Rename a canvas */
export async function renamePatientCanvasAction(canvasId: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('patient_canvases')
    .update({ name })
    .eq('id', canvasId);

  if (error) return { error: error.message };
  return {};
}
