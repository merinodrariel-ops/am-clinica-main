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

        let client: Client;
        let usedEnvUrl = false;
        let debugInfo = '';

        if (process.env.DATABASE_URL) {
            usedEnvUrl = true;
            const parsedUrl = new URL(process.env.DATABASE_URL);
            debugInfo = `DATABASE_URL env found. Host: ${parsedUrl.hostname}, Port: ${parsedUrl.port}, User: ${parsedUrl.username}`;
            client = new Client({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });
        } else {
            // Fallback to explicit pooler connection
            debugInfo = 'DATABASE_URL env NOT found. Using fallback pooler connection.';
            client = new Client({
                user: 'postgres.ybozzesadqcorvfqpsyo',
                password: 'TBWogNx77j3kkuSG',
                host: 'aws-1-sa-east-1.pooler.supabase.com',
                port: 5432,
                database: 'postgres',
                ssl: { rejectUnauthorized: false }
            });
        }

        console.log('Running migration with debug info:', debugInfo);
        await client.connect();
        await client.query(sql);
        await client.end();

        return NextResponse.json({ 
            success: true, 
            message: 'Migration executed successfully!',
            usedEnvUrl,
            debugInfo
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ 
            error: error.message || error,
            stack: error.stack,
            debugInfo: error.debugInfo || 'Check Vercel env'
        }, { status: 500 });
    }
}
