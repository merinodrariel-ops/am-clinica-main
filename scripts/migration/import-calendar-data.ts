
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env
dotenv.config();

const CLEAN_APPOINTMENTS_PATH = '/tmp/calendar_clean_appointments.json';
const ARIEL_PROFILE_ID = 'f160be8c-6014-4cba-bdde-b2d926eb8831';

async function importData() {
    console.log('--- Starting Calendar Data Import ---');

    if (!fs.existsSync(CLEAN_APPOINTMENTS_PATH)) {
        console.error('File not found:', CLEAN_APPOINTMENTS_PATH);
        return;
    }

    const appointments = JSON.parse(fs.readFileSync(CLEAN_APPOINTMENTS_PATH, 'utf-8'));
    console.log(`Loaded ${appointments.length} appointments to import.`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in .env');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const appt of appointments) {
        try {
            if (appt.is_potential_noise) {
                console.log(`- Skipping appointment (potential noise): ${appt.summary}`);
                skipCount++;
                continue;
            }

            // Check if already exists (prevent duplicates if script is re-run)
            const { data: existing } = await supabase
                .from('agenda_appointments')
                .select('id')
                .eq('external_id', appt.original_event_id)
                .maybeSingle();

            if (existing) {
                console.log(`- Skipping appointment (already exists): ${appt.summary}`);
                skipCount++;
                continue;
            }

            // Insert
            const { error } = await supabase
                .from('agenda_appointments')
                .insert({
                    patient_id: appt.patient_id,
                    doctor_id: appt.doctor_id,
                    title: appt.summary,
                    start_time: appt.start_time,
                    end_time: appt.end_time,
                    status: appt.status || 'completed',
                    type: appt.type || 'consulta',
                    notes: appt.notes || '',
                    external_id: appt.original_event_id,
                    source: 'google_calendar_migration',
                    created_by: ARIEL_PROFILE_ID
                });

            if (error) {
                console.error(`- Error inserting ${appt.summary}:`, error.message);
                errorCount++;
            } else {
                console.log(`+ Imported: ${appt.summary}`);
                successCount++;
            }
        } catch (err) {
            console.error(`- Unexpected error for ${appt.summary}:`, err);
            errorCount++;
        }
    }

    console.log('\n--- Import Results ---');
    console.log(`Successfully Imported: ${successCount}`);
    console.log(`Skipped (Duplicates): ${skipCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('-----------------------');
}

importData();
