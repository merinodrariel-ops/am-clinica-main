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
        const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
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

async function bootstrap() {
    console.log('Bootstrapping Owner User...');

    const email = 'owner@clinica.com';
    const password = env.INITIAL_SEED_PASSWORD || process.env.INITIAL_SEED_PASSWORD || 'password123';
    const fullName = 'Owner User';

    // 1. Check if user exists
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existing = users.find(u => u.email === email);

    if (existing) {
        console.log('User already exists (ID: ' + existing.id + '). Updating categoria to owner...');

        // Ensure profile exists and update it
        // Note: Logic allows update even if profile missing (UPSERT would be better but simple update is fine for now)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ categoria: 'owner', is_active: true })
            .eq('id', existing.id);

        if (profileError) {
            console.error('Error updating profile:', profileError);
        } else {
            console.log('Updated existing user profile to owner.');
        }
        return;
    }

    // 2. Create user
    // 2. Create user
    const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            full_name: fullName,
            categoria: 'owner'
        }
    });

    if (error) {
        console.error('Error creating user:', error);
        return;
    }

    console.log('Success! Created owner user:');
    console.log('Email:', email);
    console.log('Password:', password);
}

bootstrap();
