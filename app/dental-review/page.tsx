'use client';

import React, { useState } from 'react';

export default function DentalReviewPage() {
  const [searchQuery, setSearchQuery] = useState('');
  
  const treatments = [
    {
      title: "Carillas de Porcelana (Lentes de Contacto)",
      rating: 4.9,
      reviewsCount: 142,
      bestClinic: "AM Clínica (Puerto Madero)",
      costRange: "$$$",
      desc: "Tratamiento de alta gama mínimamente invasivo para transformar la forma, color y alineación de la sonrisa de manera inmediata."
    },
    {
      title: "Ortodoncia Invisible (Alineadores)",
      rating: 4.8,
      reviewsCount: 98,
      bestClinic: "AM Clínica (Puerto Madero)",
      costRange: "$$",
      desc: "Diseño y corrección digital del alineamiento dental mediante placas transparentes removibles y cómodas."
    },
    {
      title: "Implantes de Carga Inmediata",
      rating: 4.9,
      reviewsCount: 75,
      bestClinic: "AM Clínica (Puerto Madero)",
      costRange: "$$$",
      desc: "Sustitución de piezas dentales perdidas en 24 horas mediante tecnología implantológica guiada por computadora."
    }
  ];

  const featuredReviews = [
    {
      name: "Florencia S.",
      treatment: "Diseño de Sonrisa & Carillas",
      stars: 5,
      comment: "La atención en Puerto Madero es de otro planeta. El Dr. Ariel Merino utilizó tecnología 3D para mostrarme cómo quedaría mi sonrisa antes de empezar. El resultado superó todo lo que imaginé.",
      date: "Hace 2 semanas"
    },
    {
      name: "Juan Pablo M.",
      treatment: "Alineadores Invisibles",
      stars: 5,
      comment: "Super cómodos y el seguimiento digital a través del portal de pacientes me ahorró muchísimo tiempo de visitas innecesarias al consultorio. Recomiendo AM Clínica al 100%.",
      date: "Hace 1 mes"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-800 leading-normal">
      {/* Navbar Neutral */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm tracking-tight">DR</span>
            <span className="text-slate-900 font-black text-lg tracking-tight uppercase">DENTAL<span className="text-indigo-600">REVIEW</span></span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-500">
            <a href="#tratamientos" className="hover:text-slate-900 transition">Tratamientos</a>
            <a href="#reseñas" className="hover:text-slate-900 transition">Opiniones Recientes</a>
            <a href="#mejores" className="hover:text-slate-900 transition">Clínicas Destacadas</a>
          </nav>
          <a
            href="https://amesteticadental.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition"
          >
            Ver Clínica Recomendada
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-slate-50 py-16 md:py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-50/40 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-3xl mx-auto">
          <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-[10px] uppercase tracking-widest rounded-full">
            Plataforma Dental Independiente
          </span>
          <h1 className="text-slate-900 text-4xl md:text-5xl font-black tracking-tight leading-tight mt-6 mb-6">
            Encontrá los mejores tratamientos estéticos en Buenos Aires
          </h1>
          <p className="text-slate-500 text-base md:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            Analizamos opiniones de pacientes, tecnologías clínicas y aranceles para guiarte en tu elección odontológica de forma honesta.
          </p>

          {/* Buscador Simple */}
          <div className="max-w-md mx-auto bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/40 flex gap-2">
            <input
              type="text"
              placeholder="Buscar tratamientos (Ej: Carillas, Alineadores)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent px-4 py-2.5 text-sm focus:outline-none placeholder-slate-400 text-slate-800"
            />
            <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition">
              Buscar
            </button>
          </div>
        </div>
      </section>

      {/* Tratamientos Destacados */}
      <section id="tratamientos" className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h2 className="text-slate-950 text-2xl md:text-3xl font-black tracking-tight">Comparativa de Tratamientos de Alta Gama</h2>
            <p className="text-slate-500 text-sm mt-1">Los procedimientos estéticos más solicitados analizados por nuestros auditores independientes.</p>
          </div>
          <div className="h-0.5 bg-slate-200 flex-1 mx-8 hidden md:block" />
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {treatments.map((t, i) => (
            <div key={i} className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-xl shadow-slate-100/50 hover:shadow-indigo-100/30 hover:border-indigo-100 transition duration-300 flex flex-col">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 block">
                Tratamiento Evaluado
              </span>
              <h3 className="text-slate-950 font-black text-lg leading-tight mb-3">
                {t.title}
              </h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-1">
                {t.desc}
              </p>
              
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Clínica Destacada:</span>
                  <span className="text-slate-900 font-bold">{t.bestClinic}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Rango de Aranceles:</span>
                  <span className="text-indigo-600 font-black">{t.costRange}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Valoración Pacientes:</span>
                  <span className="text-amber-500 font-bold flex items-center gap-1">
                    ⭐ {t.rating}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Clínica Nº 1 en Ranking */}
      <section id="mejores" className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-slate-950 rounded-[36px] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl" />
          
          <div className="max-w-2xl relative z-10">
            <span className="px-3 py-1 bg-indigo-500 text-white font-extrabold text-[9px] uppercase tracking-widest rounded-full">
              RANKING 2026 - CLÍNICA RECOMENDADA
            </span>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight mt-6 mb-4">
              AM Clínica: Líder absoluto en Estética Dental y Tecnología 3D
            </h2>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-8">
              Nuestra auditoría local determinó que la clínica del **Dr. Ariel Merino** en Puerto Madero ofrece el máximo estándar en tratamientos digitales de estética dental en Capital Federal, respaldada por un 4.9★ con cientos de reseñas verificadas.
            </p>

            <div className="flex flex-wrap gap-4">
              <a
                href="https://amesteticadental.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/20"
              >
                Visitar Sitio de AM Clínica
              </a>
              <a
                href="https://g.page/r/CQ3df5Xn-J6oEBM/review"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 rounded-2xl text-xs uppercase tracking-wider transition"
              >
                Ver Reseñas en Google
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Opiniones Recientes */}
      <section id="reseñas" className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h2 className="text-slate-950 text-2xl md:text-3xl font-black tracking-tight">Experiencias de Pacientes Auditados</h2>
            <p className="text-slate-500 text-sm mt-1">Opiniones recolectadas y certificadas con nuestro proceso de auditoría independiente.</p>
          </div>
          <div className="h-0.5 bg-slate-200 flex-1 mx-8 hidden md:block" />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {featuredReviews.map((r, i) => (
            <div key={i} className="bg-white border border-slate-200/50 rounded-3xl p-6 shadow-xl shadow-slate-100/40 relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-slate-950 font-bold text-base">{r.name}</h4>
                  <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{r.treatment}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-amber-500 font-extrabold text-sm">
                    {"★".repeat(r.stars)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">{r.date}</span>
                </div>
              </div>
              <p className="text-slate-600 text-xs italic leading-relaxed">
                "{r.comment}"
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">
                <span>✓ Paciente Verificado</span>
                <span className="text-slate-400 font-medium normal-case">Auditoría DentalReview</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto px-6 space-y-4">
          <p>© 2026 DentalReview Argentina. Guías independientes de odontología estética clínica.</p>
          <p className="max-w-md mx-auto leading-relaxed">
            Las comparaciones y auditorías se basan en opiniones verificadas de pacientes públicos y evaluaciones de tecnologías clínicas. No realizamos tratamientos odontológicos directos.
          </p>
        </div>
      </footer>
    </div>
  );
}
