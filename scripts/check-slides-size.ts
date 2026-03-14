import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const p1 = '1cohk-k-CEpsyIL8G7MN74asprq1c0EXpHuVR4AhFvR8'; // 2024
    const p2 = '1VV6HcKdogj2NDFktQMXP9o-MRMgkdKuQGlZ4ME6ZVj8'; // 2026
    
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    const slides = google.slides({ version: 'v1', auth });

    try {
        const res1 = await slides.presentations.get({ presentationId: p1 });
        console.log(`2024 Presentation (${p1}) - Slides count:`, res1.data.slides?.length || 0);
    } catch (e: any) {
        console.log(`2024 Error:`, e.message);
    }
    
    try {
        const res2 = await slides.presentations.get({ presentationId: p2 });
        console.log(`2026 Presentation (${p2}) - Slides count:`, res2.data.slides?.length || 0);
    } catch (e: any) {
        console.log(`2026 Error:`, e.message);
    }
}

main().catch(console.error);
