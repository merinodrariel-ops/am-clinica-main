const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateOwner() {
    const email = 'dr.arielmerinopersonal@gmail.com';

    console.log(`Checking user: ${email}`);

    // 1. Fetch profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email); // Use select without single() to see all matches

    if (profileError) {
        console.error('Error fetching profile:', profileError.message);
        return;
    }

    console.log('Profiles found with this email:', profile);

    // 2. Check auth.users
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        console.error('Error listing auth users:', authError.message);
    } else {
        const user = users.find(u => u.email === email);
        if (user) {
            console.log('Auth User Details:', { id: user.id, email: user.email });

            const profileById = profile.find(p => p.id === user.id);
            if (profileById) {
                console.log('Mapping correct: Profile ID matches Auth User ID.');
            } else {
                console.log('MAPPING MISMATCH: No profile found with ID', user.id);
                if (profile.length > 0) {
                    console.log('Profile exists with different ID:', profile[0].id);
                }
            }
        } else {
            console.log('User not found in auth.users');
        }
    }
}

updateOwner();
