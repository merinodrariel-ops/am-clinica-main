import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (key !== 'TBWogNx77j3kkuSG') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const connString = process.env.DATABASE_URL || 'postgresql://postgres.ybozzesadqcorvfqpsyo:TBWogNx77j3kkuSG@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require';

        // Parse connection parameters
        const parsed = new URL(connString);
        const user = decodeURIComponent(parsed.username);
        const password = decodeURIComponent(parsed.password);
        const host = parsed.hostname;
        const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
        const database = parsed.pathname ? parsed.pathname.slice(1) : 'postgres';

        const client = new Client({
            user,
            password,
            host,
            port,
            database,
            ssl: { rejectUnauthorized: false }
        });

        await client.connect();
        
        // Let's check policies on transferencias_caja
        const resPolicies = await client.query(`
            SELECT policyname, cmd, roles, qual, with_check 
            FROM pg_policies 
            WHERE tablename = 'transferencias_caja';
        `);

        // Let's check if RLS is enabled on transferencias_caja
        const resRls = await client.query(`
            SELECT relname, relrowsecurity 
            FROM pg_class 
            WHERE relname = 'transferencias_caja';
        `);

        await client.end();

        return NextResponse.json({ 
            success: true, 
            rlsEnabled: resRls.rows[0]?.relrowsecurity,
            policies: resPolicies.rows
        });
    } catch (error: any) {
        return NextResponse.json({ 
            error: error.message || error,
            stack: error.stack
        }, { status: 500 });
    }
}
