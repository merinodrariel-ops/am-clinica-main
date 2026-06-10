const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('personal').select('*').eq('id', 'b4827a4a-edb2-49bc-9afe-9a60a0441131');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
