import { ensureStandardPatientFolders } from '../lib/google-drive.ts';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testAdmission() {
    const testPatient = {
        nombre: 'TEST_NAME',
        apellido: 'TEST_SURNAME',
        dni: '12345678',
        whatsapp: '5491100000000',
        email: 'test@example.com'
    };

    console.log('--- TESTING ADMISSION FLOW ---');
    
    // 1. Ensure patient root folder only
    console.log('1. Ensuring root folder for:', testPatient.apellido, testPatient.nombre);
    const driveResult = await ensureStandardPatientFolders(testPatient.apellido, testPatient.nombre);
    console.log('Drive result:', JSON.stringify(driveResult, null, 2));

    if (!driveResult.motherFolderId) {
        console.error('Failed to create mother folder');
    }
}

testAdmission().catch(console.error);
