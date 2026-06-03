const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const patientId = '069d82e1-a448-41f8-8a87-844f570a1316';
const mov1Id = 'dbddaddd-421d-4e87-9ebf-7a624aa6b199'; // Cuota 1
const mov2Id = 'a1e0ebca-1645-4145-882c-f7f18bcc73f8'; // Cuota 2
const mov3Id = '308770d5-5210-4c7b-bc7a-e6a072121a29'; // Cuota 3

async function run() {
  console.log("Starting update of Carla's payment records...");

  // Update Mov 1
  console.log(`Updating Movement 1 (${mov1Id})...`);
  const { error: err1 } = await supabase
    .from('caja_recepcion_movimientos')
    .update({ saldo_a_favor_generado_usd: 13.33 })
    .eq('id', mov1Id);
  if (err1) console.error("Error updating mov 1:", err1);

  // Update Mov 2
  console.log(`Updating Movement 2 (${mov2Id})...`);
  const { error: err2 } = await supabase
    .from('caja_recepcion_movimientos')
    .update({ saldo_a_favor_generado_usd: 13.33 })
    .eq('id', mov2Id);
  if (err2) console.error("Error updating mov 2:", err2);

  // Update Mov 3 (monto was 686.67, set to 700.00)
  console.log(`Updating Movement 3 (${mov3Id})...`);
  const { error: err3 } = await supabase
    .from('caja_recepcion_movimientos')
    .update({ 
      monto: 700.00, 
      usd_equivalente: 700.00, 
      saldo_a_favor_generado_usd: 13.33 
    })
    .eq('id', mov3Id);
  if (err3) console.error("Error updating mov 3:", err3);

  // Update Patient profile credit balance
  console.log(`Updating Patient credit balance to 39.99 USD...`);
  const { error: errPatient } = await supabase
    .from('pacientes')
    .update({ saldo_a_favor_usd: 39.99 })
    .eq('id_paciente', patientId);
  if (errPatient) console.error("Error updating patient:", errPatient);

  console.log("Database updates finished. Verifying results...");

  const { data: verifyMovs } = await supabase
    .from('caja_recepcion_movimientos')
    .select('id, concepto_nombre, monto, cuota_nro, saldo_a_favor_generado_usd')
    .eq('paciente_id', patientId)
    .order('created_at', { ascending: false })
    .limit(3);
  console.log("Verified last 3 movements:", verifyMovs);

  const { data: verifyPatient } = await supabase
    .from('pacientes')
    .select('id_paciente, nombre, apellido, saldo_a_favor_usd')
    .eq('id_paciente', patientId)
    .single();
  console.log("Verified patient record:", verifyPatient);
}

run();
