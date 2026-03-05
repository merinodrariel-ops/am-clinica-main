import { NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
    const auth = await authorizeRequest(request);
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
        return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Check profiles and roles
        const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('id, email, full_name, categoria')
            .limit(10);

        return NextResponse.json({
            profiles: profiles || [],
            error: profError?.message
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
