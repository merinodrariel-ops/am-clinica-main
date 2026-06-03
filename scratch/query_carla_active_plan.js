const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const patientId = '069d82e1-a448-41f8-8a87-844f570a1316';

async function run() {
  const { data: plans } = await supabase
    .from('planes_financiacion')
    .select('*')
    .eq('paciente_id', patientId);
  console.log("Plans for Carla:");
  console.log(plans);

  const { data: movements } = await supabase
    .from('caja_recepcion_movimientos')
    .select('id, concepto_nombre, monto, moneda, cuota_nro, cuotas_total, created_at, saldo_a_favor_generado_usd, saldo_a_favor_aplicado_usd')
    .eq('paciente_id', patientId)
    .order('created_at', { ascending: false })
    .limit(3);
  console.log("\nLast 3 Movements for Carla:");
  console.log(movements);
}
run();
