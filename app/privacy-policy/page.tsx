import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Politica de Privacidad | Google Gravity',
    description: 'Politica de privacidad de Google Gravity (AM Clinica).',
};

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
                <header className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Google Gravity</p>
                    <h1 className="text-3xl font-bold">Politica de Privacidad</h1>
                    <p className="text-sm text-slate-600">Ultima actualizacion: 13/02/2026</p>
                </header>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">1. Que datos recolectamos</h2>
                    <p>
                        Google Gravity puede recolectar datos de acceso (email, nombre y foto de perfil de Google),
                        datos operativos de clinica (pacientes, agenda, caja, inventario) y datos tecnicos basicos
                        para seguridad y auditoria.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">2. Para que usamos los datos</h2>
                    <p>
                        Los datos se usan unicamente para autenticacion, autorizacion por roles, gestion operativa,
                        trazabilidad interna y mejora del servicio dentro de AM Clinica.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">3. Base legal y consentimiento</h2>
                    <p>
                        El tratamiento se realiza con base en el consentimiento del usuario y en el interes legitimo
                        de operar el sistema de gestion clinica de manera segura.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">4. Comparticion de datos</h2>
                    <p>
                        No vendemos datos personales. Podemos usar proveedores de infraestructura (por ejemplo,
                        autenticacion, almacenamiento y correo) bajo medidas de seguridad razonables.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">5. Seguridad</h2>
                    <p>
                        Aplicamos controles de acceso por rol, politicas RLS en base de datos, registros de auditoria
                        y buenas practicas de seguridad para minimizar riesgos.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">6. Derechos del usuario</h2>
                    <p>
                        El usuario puede solicitar acceso, rectificacion o baja de sus datos personales escribiendo a
                        <a className="text-blue-700 font-medium ml-1" href="mailto:merinodrariel@gmail.com">
                            merinodrariel@gmail.com
                        </a>
                        .
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">7. Contacto</h2>
                    <p>
                        Responsable: AM Clinica. Correo de contacto:
                        <a className="text-blue-700 font-medium ml-1" href="mailto:merinodrariel@gmail.com">
                            merinodrariel@gmail.com
                        </a>
                        .
                    </p>
                </section>
            </div>
        </main>
    );
}
