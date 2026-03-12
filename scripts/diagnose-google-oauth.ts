import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { google } from 'googleapis';

/**
 * Diagnostic script for Google OAuth Access (Drive, Gmail, Calendar)
 * 
 * Usage: npx tsx scripts/diagnose-google-oauth.ts
 */

const CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

async function main() {
    console.log('=== DIAGNÓSTICO DE GOOGLE OAUTH ===\n');

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        console.error('❌ Error: Credenciales OAuth no configuradas en .env.local');
        console.log('Faltan:');
        if (!CLIENT_ID) console.log('- GOOGLE_DRIVE_OAUTH_CLIENT_ID');
        if (!CLIENT_SECRET) console.log('- GOOGLE_DRIVE_OAUTH_CLIENT_SECRET');
        if (!REFRESH_TOKEN) console.log('- GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN');
        return;
    }

    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    // 1. Test Drive Access
    console.log('\n--- 1. GOOGLE DRIVE ---');
    try {
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const res = await drive.about.get({ fields: 'user, storageQuota' });
        console.log(`✅ Conectado como: ${res.data.user?.emailAddress}`);
        console.log(`📊 Espacio usado: ${(Number(res.data.storageQuota?.usage) / 1024 / 1024 / 1024).toFixed(2)} GB`);
    } catch (err) {
        console.error('❌ Error vinculando Drive:', err instanceof Error ? err.message : err);
    }

    // 2. Test Calendar Access
    console.log('\n--- 2. GOOGLE CALENDAR ---');
    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const res = await calendar.calendarList.list();
        console.log(`✅ Calendarios encontrados: ${res.data.items?.length || 0}`);
        res.data.items?.slice(0, 3).forEach(c => console.log(`   📅 ${c.summary} (${c.id})`));
    } catch (err) {
        console.error('❌ Error vinculando Calendar:', err instanceof Error ? err.message : err);
    }

    // 3. Test Gmail Access
    console.log('\n--- 3. GMAIL ---');
    try {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const res = await gmail.users.getProfile({ userId: 'me' });
        console.log(`✅ Perfil de Gmail: ${res.data.emailAddress}`);
        console.log(`📧 Total mensajes: ${res.data.messagesTotal}`);
    } catch (err) {
        console.error('❌ Error vinculando Gmail:', err instanceof Error ? err.message : err);
        console.log('💡 Tip: Asegúrate de que el scope "https://www.googleapis.com/auth/gmail.readonly" o "gmail.send" esté incluido en el refresh token.');
    }

    console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
