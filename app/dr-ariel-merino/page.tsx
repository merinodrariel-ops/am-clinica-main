'use client';

import React from 'react';

export default function DrArielMerinoPage() {
  const specialties = [
    {
      title: "Diseño de Sonrisa Digital (DSD 3D)",
      desc: "Simulaciones tridimensionales que permiten proyectar con precisión micrométrica el resultado estético antes de tocar una sola pieza dental."
    },
    {
      title: "Lentes de Contacto Dental & Carillas",
      desc: "Carillas ultrafinas de porcelana pura esculpidas digitalmente para lograr una armonía biológica, funcional y estética de alta gama."
    },
    {
      title: "Estética Mínimamente Invasiva",
      desc: "Tratamientos conservadores que preservan al máximo la estructura natural del diente gracias al uso de microscopía y adhesión molecular."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-800 leading-normal">
      
      {/* Header Minimalista */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-slate-950 font-black text-base tracking-tight uppercase">DR. ARIEL MERINO</span>
            <span className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.2em]">Odontología de Vanguardia</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold uppercase tracking-wider text-slate-500">
            <a href="#trayectoria" className="hover:text-slate-950 transition">Trayectoria</a>
            <a href="#enfoque" className="hover:text-slate-950 transition">Enfoque Clínico</a>
            <a href="#prensa" className="hover:text-slate-950 transition">Prensa y Medios</a>
          </nav>
          <a
            href="https://amesteticadental.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/10"
          >
            Consultar Agenda
          </a>
        </div>
      </header>

      {/* Hero Section - Marca Personal */}
      <section className="bg-white py-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/30 rounded-full blur-3xl -z-10" />
        
        <div className="max-w-5xl mx-auto grid md:grid-cols-12 gap-12 items-center">
          {/* Columna Texto */}
          <div className="md:col-span-7 space-y-6">
            <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-[10px] uppercase tracking-widest rounded-full">
              Director Médico de AM Clínica
            </span>
            <h1 className="text-slate-950 text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Diseñando sonrisas que transforman vidas
            </h1>
            <p className="text-slate-500 text-base leading-relaxed">
              Soy el **Dr. Ariel Merino**. Durante más de 15 años, me he especializado en la convergencia de la odontología reconstructiva, la estética dental de alta gama y la tecnología digital en Buenos Aires. 
            </p>
            <p className="text-slate-500 text-base leading-relaxed">
              Mi filosofía se centra en la excelencia estética a través de la **mínima invasión**, utilizando herramientas de simulación 3D para que cada paciente sea co-diseñador de su nueva sonrisa de forma segura y predecible.
            </p>
            <div className="pt-4">
              <a
                href="https://amesteticadental.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex justify-center items-center px-6 py-4 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition shadow-xl"
              >
                Conocer AM Clínica Puerto Madero
              </a>
            </div>
          </div>

          {/* Columna Estética Visual (Foto Representativa) */}
          <div className="md:col-span-5 flex justify-center">
            <div className="w-72 h-96 md:w-80 md:h-[420px] rounded-[48px] bg-gradient-to-tr from-indigo-100 via-indigo-50 to-cyan-50 border border-indigo-100 shadow-2xl relative flex items-center justify-center p-8 overflow-hidden transform hover:scale-[1.02] transition duration-300">
              <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px]" />
              <div className="text-center relative z-10 space-y-4">
                <span className="text-slate-900 font-black text-2xl tracking-tighter block">Dr. Ariel Merino</span>
                <span className="text-indigo-600 text-xs font-extrabold uppercase tracking-widest block">Estética Dental Digital</span>
                <div className="w-16 h-0.5 bg-slate-350 mx-auto" />
                <p className="text-slate-500 text-xs italic leading-relaxed max-w-[200px] mx-auto">
                  "El arte de la odontología no está en lo que se agrega, sino en la naturalidad que se preserva."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enfoque Clínico */}
      <section id="enfoque" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-slate-950 text-3xl font-black tracking-tight">Mi Enfoque y Especialidades</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Aplicando protocolos clínicos modernos y tecnología CAD/CAM avanzada para asegurar el máximo estándar estético y funcional.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {specialties.map((s, i) => (
            <div key={i} className="bg-white border border-slate-200/50 rounded-3xl p-6 shadow-xl shadow-slate-100/50 flex flex-col hover:border-indigo-100 transition duration-200">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 border border-indigo-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-slate-950 font-black text-base leading-tight mb-3">
                {s.title}
              </h3>
              <p className="text-slate-500 text-xs leading-relaxed flex-1">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Prensa y Medios (Forbes) */}
      <section id="prensa" className="bg-white py-20 px-6 border-y border-slate-100">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 font-extrabold text-[9px] uppercase tracking-widest rounded-full">
            PRESENCIA EN PRENSA
          </span>
          <blockquote className="text-slate-900 text-xl md:text-2xl font-extrabold leading-relaxed tracking-tight max-w-3xl mx-auto">
            "El Dr. Ariel Merino se ha posicionado en el barrio de Puerto Madero como el pionero y referente indiscutido del Diseño de Sonrisa Digital 3D, atrayendo a una amplia gama de pacientes locales e internacionales."
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <span className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white font-extrabold text-[10px]">F</span>
            <span className="text-slate-950 font-black text-sm uppercase tracking-widest">FORBES ARGENTINA</span>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section id="trayectoria" className="max-w-5xl mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-tr from-slate-900 to-indigo-950 rounded-[40px] p-10 md:p-14 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
          
          <div className="max-w-xl mx-auto space-y-6 relative z-10">
            <h2 className="text-3xl font-black tracking-tight leading-tight">
              ¿Listo para co-diseñar tu sonrisa ideal?
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Te invito a agendar una consulta de evaluación digital conmigo en las exclusivas instalaciones de **AM Clínica** en Puerto Madero. Evaluaremos tu caso en 3D y diseñaremos tu tratamiento a medida.
            </p>
            <div className="pt-2">
              <a
                href="https://amesteticadental.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/20"
              >
                Agendar Consulta Presencial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 py-8 text-center text-[11px] text-slate-400 border-t border-slate-100">
        <p>© 2026 Dr. Ariel Merino — Odontología de Alta Gama. Puerto Madero, Buenos Aires, Argentina.</p>
      </footer>
    </div>
  );
}
