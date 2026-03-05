import { sendWelcomeEmailAction } from './app/actions/email';

async function main() {
    const res = await sendWelcomeEmailAction('Paciente Test', 'test@example.com');
    console.log(res);
}

main().catch(console.error);
