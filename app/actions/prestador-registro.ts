'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';
import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';
import { revalidatePath } from 'next/cache';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');
const MIN_FORM_COMPLETION_MS = 4000;

const REGISTRO_CATEGORIAS = ['odontologo', 'asistente', 'reception', 'laboratorio', 'limpieza', 'recaptacion', 'other'] as const;

type RegistroCategoria = typeof REGISTRO_CATEGORIAS[number];

function isRegistroCategoria(value: string): value is RegistroCategoria {
    return REGISTRO_CATEGORIAS.includes(value as RegistroCategoria);
}

function getCategoriaFromInput(value: string): RegistroCategoria {
    const normalized = normalizeCategoriaAlias(value);
    if (!normalized) return 'other';

    if (normalized === 'recepcion' || normalized === 'recepcion / administracion') {
        return 'reception';
    }

    return isRegistroCategoria(normalized) ? normalized : 'other';
}

function getAreaFromCategoria(categoria: RegistroCategoria): string {
    switch (categoria) {
        case 'odontologo':
            return 'Odontologia';
        case 'asistente':
            return 'Asistente Dental';
        case 'reception':
            return 'Recepcion';
        case 'laboratorio':
            return 'Laboratorio';
        case 'limpieza':
            return 'Limpieza';
        case 'recaptacion':
            return 'Recaptacion';
        default:
            return 'General';
    }
}

function getRoleLabelFromCategoria(categoria: RegistroCategoria): string {
    switch (categoria) {
        case 'odontologo':
            return 'Odontologo';
        case 'asistente':
            return 'Asistente';
        case 'reception':
            return 'Recepcion';
        case 'laboratorio':
            return 'Laboratorio';
        case 'limpieza':
            return 'Limpieza';
        case 'recaptacion':
            return 'Recaptacion';
        default:
            return 'Equipo AM';
    }
}

function getDefaultModeloPago(categoria: RegistroCategoria): 'horas' | 'prestaciones' {
    return categoria === 'odontologo' || categoria === 'laboratorio' ? 'prestaciones' : 'horas';
}

function sanitizeText(value?: string | null): string {
    return (value || '').trim().replace(/\s+/g, ' ');
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDocumento(value: string): boolean {
    return /^\d{7,11}$/.test(value);
}

function isValidWhatsapp(value: string): boolean {
    return /^\+?\d{10,15}$/.test(value);
}

export interface PrestadorAutoRegistroInput {
    // Paso 1
    nombre: string;
    apellido: string;
    documento: string;
    fecha_nacimiento?: string;
    // Paso 2
    email: string;
    whatsapp: string;
    direccion?: string;
    barrio_localidad?: string;
    // Paso 3
    categoria: string;
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    // Paso 4
    cbu?: string;
    cbu_alias?: string;
    cuit?: string;
    company?: string;
    form_started_at?: number;
}

export async function registerPrestadorPublico(
    data: PrestadorAutoRegistroInput
): Promise<{ success?: true; error?: string }> {
    const adminSupabase = createAdminClient();
    const nombre = sanitizeText(data.nombre);
    const apellido = sanitizeText(data.apellido);
    const documento = (data.documento || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const whatsapp = (data.whatsapp || '').trim();
    const direccion = sanitizeText(data.direccion);
    const barrioLocalidad = sanitizeText(data.barrio_localidad);
    const company = sanitizeText(data.company);
    const formStartedAt = typeof data.form_started_at === 'number' ? data.form_started_at : 0;
    const categoria = getCategoriaFromInput(data.categoria);
    const area = getAreaFromCategoria(categoria);
    const tipo = categoria === 'odontologo' ? 'odontologo' : 'prestador';
    const modeloPago = getDefaultModeloPago(categoria);

    // Honeypot + minimum completion time to block simple bots.
    if (company) {
        return { success: true };
    }

    if (!nombre || !apellido || !isValidDocumento(documento) || !isValidEmail(email) || !isValidWhatsapp(whatsapp)) {
        return { error: 'Revisá los datos ingresados e intentá nuevamente.' };
    }

    if (!formStartedAt || Date.now() - formStartedAt < MIN_FORM_COMPLETION_MS) {
        return { error: 'Esperá unos segundos y volvé a enviar el formulario.' };
    }

    // Duplicate check by documento
    const { data: existing } = await adminSupabase
        .from('personal')
        .select('id')
        .eq('documento', documento)
        .maybeSingle();

    if (existing) {
        return { error: 'Ya existe un prestador registrado con ese DNI.' };
    }

    const { data: insertedPersonal, error } = await adminSupabase.from('personal').insert({
        nombre,
        apellido,
        documento,
        email,
        whatsapp,
        direccion: direccion || null,
        barrio_localidad: barrioLocalidad || null,
        area,
        tipo,
        categoria,
        condicion_afip: data.condicion_afip || null,
        modelo_pago: modeloPago,
        valor_hora_ars: 0,
        cbu: data.cbu || null,
        cbu_alias: data.cbu_alias || null,
        cuit: data.cuit || null,
        activo: true,
        fuente_registro: 'autoregistro',
        fecha_ingreso: new Date().toISOString().split('T')[0],
    }).select('id').single();

    if (error) {
        console.error('registerPrestadorPublico error:', error);
        return { error: 'Error al registrar. Intentá de nuevo.' };
    }

    // Crear cuenta de acceso e invitar automáticamente por email.
    // Si ya tiene una cuenta (reintento), generateLink con type 'recovery' también funciona.
    try {
        const fullName = `${nombre} ${apellido}`;
        const nextMetadata = {
            full_name: fullName,
            categoria,
        };

        // Intentar crear el usuario (puede ya existir si rellenó el form antes)
        const { data: existingAuthUser } = await adminSupabase.auth.admin.listUsers();
        const authUser = existingAuthUser?.users?.find((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => u.email === email);
        const alreadyExists = Boolean(authUser);
        let authUserId = authUser?.id || null;

        let linkType: 'invite' | 'recovery' = 'invite';
        if (alreadyExists) {
            if (authUser?.id) {
                await adminSupabase.auth.admin.updateUserById(authUser.id, {
                    user_metadata: {
                        ...(authUser.user_metadata || {}),
                        ...nextMetadata,
                    },
                });

                await adminSupabase
                    .from('profiles')
                    .update({
                        full_name: fullName,
                        categoria,
                    })
                    .eq('id', authUser.id);
            }
            linkType = 'recovery';
        } else {
            // Crear usuario en auth con metadata
            const { data: createdUser, error: createUserError } = await adminSupabase.auth.admin.createUser({
                email,
                user_metadata: nextMetadata,
                email_confirm: false,
            });
            if (createUserError) {
                throw createUserError;
            }
            authUserId = createdUser.user?.id || null;
            linkType = 'invite';
        }

        if (authUserId) {
            await adminSupabase
                .from('profiles')
                .upsert({
                    id: authUserId,
                    email,
                    full_name: fullName,
                    categoria,
                });

            if (insertedPersonal?.id) {
                await adminSupabase
                    .from('personal')
                    .update({ user_id: authUserId, categoria, activo: true, modelo_pago: modeloPago })
                    .eq('id', insertedPersonal.id);
            }
        }

        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
            type: linkType,
            email,
            options: {
                redirectTo: `${APP_URL}/auth/callback?next=/auth/update-password`,
                data: nextMetadata,
            },
        });

        if (!linkError && linkData?.properties?.action_link) {
            const emailResult = await EmailService.sendInvitation(
                fullName,
                email,
                linkData.properties.action_link,
                getRoleLabelFromCategoria(categoria),
            );

            if (!emailResult.success) {
                console.error('[registerPrestadorPublico] invite email error:', emailResult.error);
                return { error: 'El registro se creó, pero no pudimos enviar el acceso por email. Intentá nuevamente o pedí reenvío desde administración.' };
            }
        } else {
            console.error('[registerPrestadorPublico] invite link error:', linkError);
            return { error: 'El registro se creó, pero no pudimos generar el acceso por email. Intentá nuevamente o pedí reenvío desde administración.' };
        }
    } catch (inviteErr) {
        console.error('[registerPrestadorPublico] invite error:', inviteErr);
        return { error: 'El registro se creó, pero no pudimos completar el acceso por email. Intentá nuevamente o pedí reenvío desde administración.' };
    }

    revalidatePath('/caja-admin/personal');
    return { success: true };
}
