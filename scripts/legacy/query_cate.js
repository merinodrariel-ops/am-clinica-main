const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('personal')
    .select('nombre, apellido, tipo, area, especialidad, descripcion, whatsapp, email, foto_url, activo')
    .or('nombre.ilike.%cate%,nombre.ilike.%caty%,apellido.ilike.%cate%');
    
  if (error) {
    console.error(error);
  } else {
    console.log("Found matches for 'cate':");
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
