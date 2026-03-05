import { google } from 'googleapis';
import { Paciente } from './patients';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!email || !key) {
        console.error('Missing Google Service Account credentials');
        return null;
    }

    return new google.auth.GoogleAuth({
        credentials: {
            client_email: email,
            private_key: key,
        },
        scopes: SCOPES,
    });
}

export async function syncPatientToSheet(patient: Paciente) {
    const auth = getAuth();
    if (!auth) return { success: false, error: 'Auth failed' };

    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return { success: false, error: 'Missing Sheet ID' };

    try {
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Read existing rows to find duplicate (by DNI or Name)
        // We read columns A to J (assuming structure)
        // Structure matches the parser in sync-pacientes-sheets/route.ts but we define the write structure now.
        // Let's rely on headers or fixed columns. I'll search the whole sheet to be safe or typical columns.
        // Better: Read all data, find index.
        const range = 'A:J'; // Adjust as needed
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range,
        });

        const rows = response.data.values || [];
        const headers = rows[0] || [];

        // Define column mapping (flexible based on headers or default)
        // If headers exist, try to map. If not, assume default order.
        // Default Order:
        // A: Nombre Completo
        // B: DNI
        // C: Email
        // D: Telefono
        // E: Ciudad
        // F: Motivo (Observaciones)
        // G: Doctor
        // H: Referencia
        // I: Slides Link
        // J: Fecha Alta (New)

        // Helper to normalize text for comparison
        const norm = (s: string | undefined | null) => s?.toString().trim().toLowerCase() || '';

        // Find existing index
        let rowIndex = -1;
        const patientName = `${patient.nombre} ${patient.apellido}`.trim();
        const patientDni = patient.documento ? norm(patient.documento) : '';
        const patientEmail = patient.email ? norm(patient.email) : '';
        const patientPhone = patient.whatsapp ? norm(patient.whatsapp) : '';

        // Skip header
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowName = row[0] ? norm(row[0]) : '';
            const rowDni = row[1] ? norm(row[1]) : '';
            const rowEmail = row[2] ? norm(row[2]) : '';
            const rowPhone = row[3] ? norm(row[3]) : '';

            // Match by DNI
            if (patientDni && rowDni === patientDni) {
                rowIndex = i;
                break;
            }

            // Match by Email (Secondary)
            if (patientEmail && rowEmail === patientEmail) {
                rowIndex = i;
                break;
            }

            // Match by Name + Phone (Tertiary)
            if (!patientDni && !patientEmail && rowName === norm(patientName) && rowPhone === patientPhone) {
                rowIndex = i;
                break;
            }
        }

        // Prepare Row Data
        const nombreCompleto = `${patient.nombre} ${patient.apellido}`.trim();
        const values = [
            nombreCompleto,
            patient.documento || '',
            patient.email || '',
            patient.whatsapp || '',
            patient.ciudad || '',
            patient.observaciones_generales || '',
            '', // Doctor - not in patient object directly usually, unless assigned
            patient.origen_registro || '',
            patient.link_google_slides || '',
            new Date().toLocaleDateString('es-AR') // Fecha actualizacion
        ];

        if (rowIndex !== -1) {
            // Update
            // Smart update means we should probably respect Sheet data? 
            // The requirement says "Sincronizar DE Antigravity HACIA Google Sheets".
            // And "Nunca reemplazar un campo completo con uno vacío".

            const existingRow = rows[rowIndex];
            const mergedValues = values.map((val, idx) => {
                const existingVal = existingRow[idx];
                // If new value is empty/null, keep existing
                if (!val || val === '') return existingVal || '';
                // Else overwrite (most recent wins)
                return val;
            });

            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `A${rowIndex + 1}`, // 1-based index
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [mergedValues]
                }
            });
        } else {
            // Append
            await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: 'A1',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: [values]
                }
            });
        }

        return { success: true };

    } catch (error) {
        console.error('Sheet sync error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
