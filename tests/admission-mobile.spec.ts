import { test, expect, devices } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

test('admission form accepts birth date on mobile and advances to step 2', async ({ browser }) => {
    const context = await browser.newContext({
        ...devices['iPhone 13'],
        locale: 'es-AR',
    });
    const page = await context.newPage();

    const unique = String(Date.now());
    const dni = String(30000000 + Number(unique.slice(-6)) % 5000000);
    const email = `ana.${unique}@example.com`;

    await page.goto(process.env.ADMISSION_BASE_URL || 'http://127.0.0.1:3001/admision', {
        waitUntil: 'domcontentloaded',
    });

    await page.getByRole('button', { name: /empezar registro/i }).click();
    await expect(page.getByPlaceholder('Nombre')).toBeVisible();

    await page.getByPlaceholder('Nombre').fill('Ana');
    await page.getByPlaceholder('Apellido').fill('Pérez');
    await page.getByPlaceholder('DNI / Pasaporte').fill(dni);

    const dob = page.getByPlaceholder('Fecha de Nacimiento');
    await expect(dob).toHaveAttribute('type', 'date');
    await dob.fill('1990-05-12');

    await page.getByPlaceholder('CUIT / CUIL (ej: 20-12345678-9)').fill('20-12345678-9');
    await page.getByPlaceholder('Ciudad').fill('Montevideo');
    await page.getByPlaceholder('Barrio / Zona').fill('Centro');
    await page.getByPlaceholder('Correo Electrónico').fill(email);
    await page.getByPlaceholder('Número de WhatsApp').fill('123456789');

    const nextButton = page.getByRole('button', { name: /siguiente/i });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page.getByRole('heading', { name: /historial médico/i })).toBeVisible();

    await context.close();
});

test('admission redirects existing patients to data update on mobile', async ({ browser }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    test.skip(!supabaseUrl || !serviceRoleKey, 'Supabase credentials are required to find an existing patient');

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data, error } = await supabase
        .from('pacientes')
        .select('documento')
        .eq('is_deleted', false)
        .not('documento', 'is', null)
        .limit(25);

    if (error) throw error;

    const existingDni = (data || [])
        .map((patient) => String(patient.documento || '').replace(/\D/g, ''))
        .find((dni) => dni.length >= 7 && dni.length <= 14);

    test.skip(!existingDni, 'No existing patient with a valid DNI was found');

    const context = await browser.newContext({
        ...devices['iPhone 13'],
        locale: 'es-AR',
    });
    const page = await context.newPage();

    await page.goto(process.env.ADMISSION_BASE_URL || 'http://127.0.0.1:3001/admision', {
        waitUntil: 'domcontentloaded',
    });

    await page.getByRole('button', { name: /empezar registro/i }).click();
    await expect(page.getByPlaceholder('Nombre')).toBeVisible();

    await page.getByPlaceholder('Nombre').fill('Paciente');
    await page.getByPlaceholder('Apellido').fill('Existente');
    await page.getByPlaceholder('DNI / Pasaporte').fill(existingDni!);
    await page.getByPlaceholder('Fecha de Nacimiento').click();

    await expect(page).toHaveURL(new RegExp(`/actualizar-datos\\?d=${existingDni}`), { timeout: 15_000 });

    await context.close();
});
