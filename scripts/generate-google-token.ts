import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { google } from 'googleapis';
import readline from 'readline';

/**
 * Script to generate a Refresh Token for Google APIs.
 * 
 * Usage: npx tsx scripts/generate-google-token.ts
 */

const CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
];

async function main() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ Error: GOOGLE_DRIVE_OAUTH_CLIENT_ID and GOOGLE_DRIVE_OAUTH_CLIENT_SECRET must be set in .env.local');
        return;
    }

    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Force to ensure we get a refresh token
    });

    console.log('\n🚀 Autoriza esta aplicación visitando esta URL:\n');
    console.log(authUrl);
    console.log('\n' + '='.repeat(80));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('\n👉 Pega el CÓDIGO de autorización aquí (o el valor del parámetro "code" en la URL de redirección): ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oauth2Client.getToken(code);
            console.log('\n✅ ¡Éxito! Copia estos tokens a tu archivo .env.local:\n');
            console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('\nY asegúrate de borrar la línea vieja de refresh token.');
        } catch (err) {
            console.error('\n❌ Error al obtener los tokens:', err instanceof Error ? err.message : err);
        }
    });
}

main().catch(console.error);
