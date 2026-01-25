import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Create a Supabase client with the SERVICE ROLE key for admin actions
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Authentication & Authorization
        // We need to check if the requester is an OWNER.
        // We can extract the JWT from the Authorization header and verify it.
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Check profile role
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'owner') {
            return NextResponse.json({ error: 'Unauthorized: Owners only' }, { status: 403 });
        }

        // 2. Parse Body
        const { email, password, fullName, role } = await req.json();

        if (!email || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 3. Create User in Supabase Auth
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto confirm
            user_metadata: {
                full_name: fullName,
                role: role
            }
        });

        if (createError) {
            return NextResponse.json({ error: createError.message }, { status: 400 });
        }

        // Note: The 'profiles' entry is created automatically by the DB trigger 'on_auth_user_created'
        // However, the trigger uses 'new.raw_user_meta_data' which we populated above.

        return NextResponse.json({ success: true, user: newUser });
    } catch (error: any) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
