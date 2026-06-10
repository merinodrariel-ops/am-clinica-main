const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('personal')
    .select('nombre, apellido, tipo, area, especialidad, whatsapp, activo')
    .eq('activo', true);
    
  if (error) {
    console.error(error);
  } else {
    console.log("All active staff:");
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
