import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
