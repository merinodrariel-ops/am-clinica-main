import { NextResponse } from 'next/server';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (key !== 'TBWogNx77j3kkuSG') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Locate migration file
        const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260530_fix_transfer_dates_and_surcharges.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Connect via PG Client
        const client = new Client({
            connectionString: 'postgresql://postgres:TBWogNx77j3kkuSG@db.ybozzesadqcorvfqpsyo.supabase.co:5432/postgres',
            ssl: { rejectUnauthorized: false }
        });

        await client.connect();
        await client.query(sql);
        await client.end();

        return NextResponse.json({ success: true, message: 'Migration executed successfully!' });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: error.message || error }, { status: 500 });
    }
}
