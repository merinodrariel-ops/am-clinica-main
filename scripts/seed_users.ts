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

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SERVICE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

const USERS = [
    {
        email: 'dr.arielmerinopersonal@gmail.com',
        password: '1234567890123',
        fullName: 'Dr. Ariel Merino (Owner)',
        categoria: 'owner'
    },
    {
        email: 'amesteticadentaladm@gmail.com', // Corrected from 'amd' to 'adm'
        password: '1234567890123',
        fullName: 'Administración',
        categoria: 'admin'
    },
    {
        email: 'drarielmerino@gmail.com',
        password: '1234567890123',
        fullName: 'Recepción',
        categoria: 'reception'
    }
];

const WRONG_EMAIL_TO_DELETE = 'amesteticadentalamd@gmail.com';

async function seedUsers() {
    console.log('Seeding initial users...');

    // Cleanup Step
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers();

    // Delete wrong user if exists
    const wrongUser = allUsers.find(u => u.email === WRONG_EMAIL_TO_DELETE);
    if (wrongUser) {
        console.log(`Deleting incorrect user: ${WRONG_EMAIL_TO_DELETE}...`);
        await supabaseAdmin.auth.admin.deleteUser(wrongUser.id);
        console.log('Deleted.');
    }

    for (const user of USERS) {
        console.log(`Processing: ${user.email} (${user.categoria})...`);

        // Check if exists
        const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = existingUsers.find(u => u.email === user.email);

        if (existing) {
            console.log(`User ${user.email} already exists.`);
            // Update Password
            const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
                existing.id,
                { password: user.password }
            );
            if (updateAuthError) console.error('Error updating password:', updateAuthError);
            else console.log('Password updated.');

            // Update Categoria/Profile
            const { error: updateProfileError } = await supabaseAdmin
                .from('profiles')
                .update({
                    categoria: user.categoria,
                    full_name: user.fullName,
                    is_active: true
                })
                .eq('id', existing.id);

            if (updateProfileError) console.error('Error updating profile:', updateProfileError);
            else console.log('Profile categoria updated.');

        } else {
            // Create New
            const { error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: user.email,
                password: user.password,
                email_confirm: true,
                user_metadata: {
                    full_name: user.fullName,
                    categoria: user.categoria
                }
            });

            if (createError) {
                console.error(`Error creating ${user.email}:`, createError);
            } else {
                console.log(`Created ${user.email} successfully.`);
            }
        }
        console.log('---');
    }
    console.log('Done.');
}

seedUsers();
