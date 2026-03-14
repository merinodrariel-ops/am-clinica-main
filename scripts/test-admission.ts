import { ensureStandardPatientFolders, createPatientDocuments } from '../lib/google-drive.ts';
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
    
    // 1. Ensure folders
    console.log('1. Ensuring folders for:', testPatient.apellido, testPatient.nombre);
    const driveResult = await ensureStandardPatientFolders(testPatient.apellido, testPatient.nombre);
    console.log('Drive result:', JSON.stringify(driveResult, null, 2));

    if (driveResult.motherFolderId) {
        // 2. Create documents
        console.log('2. Creating documents in:', driveResult.motherFolderId);
        const docResult = await createPatientDocuments(driveResult.motherFolderId, {
            nombre: testPatient.nombre,
            apellido: testPatient.apellido,
            dni: testPatient.dni,
            fecha: new Date().toLocaleDateString('es-AR'),
            whatsapp: testPatient.whatsapp,
            email: testPatient.email,
        });
        console.log('Doc result:', JSON.stringify(docResult, null, 2));
    } else {
        console.error('Failed to create mother folder');
    }
}

testAdmission().catch(console.error);
