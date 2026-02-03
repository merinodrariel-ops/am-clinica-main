import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual Env Parsing
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
    }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
const supabaseClient = createClient(SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const TARGET_EMAIL = 'dr.arielmerinopersonal@gmail.com';
const TARGET_PASSWORD = '1234567890123';

async function forceReset() {
    console.log(`Starting force reset for ${TARGET_EMAIL}...`);

    // 1. Find User
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users.find(u => u.email === TARGET_EMAIL);

    // 2. Delete if exists
    if (existingUser) {
        console.log(`User found (${existingUser.id}). Deleting...`);
        const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
        if (delError) {
            console.error('Error deleting user:', delError);
            return;
        }
        console.log('User deleted.');
    } else {
        console.log('User not found initially.');
    }

    // 3. Create User fresh
    console.log('Creating user fresh...');
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD,
        email_confirm: true,
        user_metadata: {
            full_name: 'Dr. Ariel Merino (Owner)',
            role: 'owner'
        }
    });

    if (createError) {
        console.error('Error creating user:', createError);
        return;
    }
    console.log(`User created: ${newUser.user?.id}`);

    // 4. Verify Login via Client API
    console.log('Verifying login with Supabase Client...');
    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD
    });

    if (loginError) {
        console.error('LOGIN VERIFICATION FAILED:', loginError);
    } else {
        console.log('LOGIN VERIFICATION SUCCESSFUL!');
        console.log('Session User:', loginData.user?.email);
    }
}

forceReset();
