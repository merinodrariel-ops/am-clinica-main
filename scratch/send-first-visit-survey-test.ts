import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { render } from '@react-email/render';
import { SurveyFirstVisitEmail } from '../emails/SurveyFirstVisit';
import { sendResendEmail } from '../lib/resend-email';

async function main() {
    const toEmail = 'dr.arielmerinopersonal@gmail.com';
    console.log(`Rendering first-visit survey email for ${toEmail}...`);

    // Using "dummy-token" which is natively supported and bypassed for testing by the survey page.
    const html = await render(SurveyFirstVisitEmail({
        patientName: 'Dr. Ariel Merino',
        surveyToken: 'dummy-token'
    }));

    console.log('Sending email via Resend...');
    const result = await sendResendEmail({
        to: toEmail,
        subject: '¿Cómo fue tu primera visita? — AM Clínica',
        html: html
    });

    if (result.success) {
        console.log(`🎉 Success! Email sent successfully. Resend Message ID: ${result.id}`);
    } else {
        console.error(`❌ Failed to send email: ${result.error}`);
    }
}

main().catch(console.error);
