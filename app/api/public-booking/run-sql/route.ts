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

        // Let's inspect all available environment variables (keys only!)
        const envKeys = Object.keys(process.env).filter(k => 
            k.includes('DB') || 
            k.includes('DATABASE') || 
            k.includes('POSTGRES') || 
            k.includes('SUPABASE') || 
            k.includes('URL') || 
            k.includes('KEY')
        );

        // Find any database connection string env
        let connString = '';
        let debugInfo = `Available env keys: ${envKeys.join(', ')}. `;

        if (process.env.DATABASE_URL) {
            connString = process.env.DATABASE_URL;
            debugInfo += 'Using DATABASE_URL. ';
        } else if (process.env.POSTGRES_URL) {
            connString = process.env.POSTGRES_URL;
            debugInfo += 'Using POSTGRES_URL. ';
        } else if (process.env.POSTGRES_URL_NON_POOLING) {
            connString = process.env.POSTGRES_URL_NON_POOLING;
            debugInfo += 'Using POSTGRES_URL_NON_POOLING. ';
        } else if (process.env.SUPABASE_DATABASE_URL) {
            connString = process.env.SUPABASE_DATABASE_URL;
            debugInfo += 'Using SUPABASE_DATABASE_URL. ';
        }

        let user = 'postgres.ybozzesadqcorvfqpsyo';
        let password = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || 'TBWogNx77j3kkuSG';
        let host = 'aws-1-sa-east-1.pooler.supabase.com';
        let port = 6543;
        let database = 'postgres';

        if (connString) {
            try {
                // Parse the connection string using URL parser
                const parsed = new URL(connString);
                user = decodeURIComponent(parsed.username || user);
                password = decodeURIComponent(parsed.password || password);
                host = parsed.hostname || host;
                port = parsed.port ? parseInt(parsed.port, 10) : 5432;
                database = parsed.pathname ? parsed.pathname.slice(1) : database;
                debugInfo += `Parsed connection string successfully. Host: ${host}, Port: ${port}, User: ${user}. `;
            } catch (e: any) {
                debugInfo += `Failed to parse connection string: ${e.message}. Using fallback. `;
            }
        } else {
            debugInfo += `No connection string env found. Using fallback pooler connection on port 6543. `;
        }

        console.log('Connecting with explicit properties. Host:', host, 'Port:', port, 'User:', user);

        const client = new Client({
            user,
            password,
            host,
            port,
            database,
            ssl: { 
                rejectUnauthorized: false 
            }
        });

        await client.connect();
        await client.query(sql);
        await client.end();

        return NextResponse.json({ 
            success: true, 
            message: 'Migration executed successfully!',
            debugInfo
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ 
            error: error.message || error,
            stack: error.stack,
            debugInfo: error.debugInfo || 'Error connecting to database'
        }, { status: 500 });
    }
}
