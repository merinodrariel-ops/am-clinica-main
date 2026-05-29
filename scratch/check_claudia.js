const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('personal')
    .select('id, nombre, apellido, area, rol, valor_hora_ars, tipo, activo')
    .ilike('nombre', '%Claudia%');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
    
    if (data.length > 0) {
        const id = data[0].id;
        const { data: logs } = await supabase.from('registro_horas')
            .select('horas, fecha, estado')
            .eq('personal_id', id)
            .gte('fecha', '2026-04-01')
            .lte('fecha', '2026-04-30');
        console.log('Logs Abril:', logs?.length || 0);
        const totalHours = logs?.reduce((s, l) => s + Number(l.horas || 0), 0) || 0;
        console.log('Total Horas Abril:', totalHours);
        
        const { data: liq } = await supabase.from('liquidaciones_mensuales')
            .select('*')
            .eq('personal_id', id)
            .eq('mes', '2026-04-01');
        console.log('Liquidación Abril:', JSON.stringify(liq, null, 2));
    }
  }
}
run();
