import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const ids = fs.readFileSync('all_loser_ids.txt', 'utf8').split('\n').filter(id => id.trim() !== '');
    console.log(`Total IDs to process: ${ids.length}`);

    const batchSize = 200;
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} (${batch.length} IDs)...`);

        const { error } = await supabase
            .from('pacientes')
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                delete_reason: 'Limpieza de duplicados masiva (v2 - Batch)'
            })
            .in('id_paciente', batch);

        if (error) {
            console.error(`Error in batch ${i / batchSize + 1}:`, error);
        } else {
            console.log(`Batch ${i / batchSize + 1} completed.`);
        }
    }
    console.log('All batches processed.');
}

main().catch(console.error);
