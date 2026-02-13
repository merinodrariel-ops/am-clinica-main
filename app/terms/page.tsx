import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terminos y Condiciones | Google Gravity',
    description: 'Terminos y condiciones de uso de Google Gravity (AM Clinica).',
};

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
                <header className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Google Gravity</p>
                    <h1 className="text-3xl font-bold">Terminos y Condiciones</h1>
                    <p className="text-sm text-slate-600">Ultima actualizacion: 13/02/2026</p>
                </header>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">1. Uso del servicio</h2>
                    <p>
                        Google Gravity es una plataforma interna para gestion clinica. El acceso esta permitido solo
                        para usuarios autorizados por AM Clinica.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">2. Cuentas y seguridad</h2>
                    <p>
                        El usuario es responsable por el uso de su cuenta y por mantener la confidencialidad de sus
                        credenciales. Cualquier actividad sospechosa debe reportarse de inmediato.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">3. Datos y contenido</h2>
                    <p>
                        Los datos cargados se utilizan para fines operativos de la clinica. El uso indebido,
                        extraccion no autorizada o divulgacion de informacion esta prohibido.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">4. Disponibilidad</h2>
                    <p>
                        Se realizan esfuerzos razonables para mantener disponibilidad continua, pero pueden existir
                        interrupciones por mantenimiento o causas externas.
                    </p>
                </section>

                <section className="space-y-3 text-sm leading-6 text-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900">5. Contacto</h2>
                    <p>
                        Para consultas legales o de uso del sistema:
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
