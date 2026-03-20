import { EmailService } from '../lib/email-service';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testPremium() {
    console.log('--- TEST ENVÍO PREMIUM (REACT EMAIL) ---');
    const email = 'amesteticadental@gmail.com';
    const name = 'Ariel';
    
    console.log(`Enviando Welcome Premium a ${email}...`);
    const res1 = await EmailService.sendWelcome(name, email);
    console.log('Resultado Welcome:', res1);

    console.log(`\nEnviando Invitación Premium a ${email}...`);
    const res2 = await EmailService.sendInvitation(name, email, 'https://amesteticadental.com/setup', 'Director de Operaciones');
    console.log('Resultado Invitación:', res2);
}

testPremium().catch(console.error);
