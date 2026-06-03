const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Searching for patient Carla de Ivecchio...");
  const { data: patients, error: patientError } = await supabase
    .from('pacientes')
    .select('id_paciente, nombre, apellido, documento, saldo_a_favor_usd, is_deleted')
    .or('nombre.ilike.%Carla%,apellido.ilike.%Ivecchio%');

  if (patientError) {
    console.error("Patient query error:", patientError);
    return;
  }

  console.log("Patients found:", patients);

  if (!patients || patients.length === 0) {
    console.log("No patients found.");
    return;
  }

  const patientId = patients[0].id_paciente;

  console.log(`\nActive financing plans for patient ${patientId}:`);
  const { data: plans, error: plansError } = await supabase
    .from('planes_financiacion')
    .select('*')
    .eq('paciente_id', patientId);

  if (plansError) {
    console.error("Plans query error:", plansError);
  } else {
    console.log(plans);
  }

  console.log(`\nRecent payment movements for patient ${patientId}:`);
  const { data: movements, error: movementsError } = await supabase
    .from('caja_recepcion_movimientos')
    .select('*')
    .eq('paciente_id', patientId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (movementsError) {
    console.error("Movements query error:", movementsError);
  } else {
    console.log(movements);
  }
}

run();
