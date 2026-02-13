
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_45%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-20">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-blue-700">Google Gravity</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">AM Clinica</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/privacy-policy"
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white/80 hover:bg-white"
            >
              Privacidad
            </Link>
            <Link
              href="/terms"
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white/80 hover:bg-white"
            >
              Terminos
            </Link>
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              Iniciar sesion
            </Link>
          </div>
        </header>

        <section className="mt-12 rounded-3xl border border-blue-100 bg-white/85 shadow-xl shadow-blue-100 p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-700">Plataforma operativa</p>
          <h2 className="mt-2 text-3xl md:text-4xl font-extrabold leading-tight text-slate-900">
            Gestion integral para clinica dental
          </h2>
          <p className="mt-4 text-slate-600 max-w-3xl">
            Google Gravity es el sistema interno de AM Clinica para administrar pacientes, agenda,
            caja, workflows clinicos, laboratorio e inventario en una sola plataforma segura.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Operacion diaria"
              description="Control de recepcion, caja administrativa, pagos y seguimiento de movimientos."
            />
            <InfoCard
              title="Flujo clinico"
              description="Gestion de etapas de tratamiento, laboratorio y trazabilidad por paciente."
            />
            <InfoCard
              title="Inventario"
              description="Catalogo inteligente con escaneo, fotos optimizadas y control de stock en tiempo real."
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              Acceder con Google
            </Link>
            <Link
              href="/privacy-policy"
              className="px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
            >
              Leer politica de privacidad
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </article>
  );
}
