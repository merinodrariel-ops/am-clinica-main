const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const patientId = '069d82e1-a448-41f8-8a87-844f570a1316';

async function run() {
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
