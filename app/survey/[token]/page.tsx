'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function SurveyPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100 to-indigo-50/20 flex items-center justify-center font-sans">
        <div className="text-slate-400 text-lg font-medium animate-pulse flex items-center gap-2">
          <svg className="animate-spin h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Cargando...
        </div>
      </div>
    }>
      <SurveyPageContent />
    </Suspense>
  );
}

function SurveyPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Datos del formulario de feedback privado (1-3 estrellas)
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Link de Google Review de AM Clínica
  const GOOGLE_REVIEW_URL = 'https://g.page/r/CQ3df5Xn-J6oEBM/review';

  useEffect(() => {
    async function loadSurvey() {
      if (!token) {
        setError('Acceso no válido');
        setLoading(false);
        return;
      }

      // BYPASS PARA TESTING CON TOKENS FICTICIOS
      if (token === 'test-token-google-review' || token === 'dummy-token') {
        setNombre('Dr. Ariel Merino');
        setEmail('drarielmerino@gmail.com');
        
        const ratingParam = searchParams.get('rating');
        const initialRating = ratingParam ? parseInt(ratingParam) : null;
        
        if (initialRating && initialRating >= 1 && initialRating <= 5) {
          setRating(initialRating);
          if (initialRating >= 4) {
            setRedirecting(true);
            window.location.href = GOOGLE_REVIEW_URL;
            return;
          }
        }
        setLoading(false);
        return;
      }

      try {
        // Query relacional en Supabase para obtener la encuesta, paciente y doctor
        const { data: survey, error: surveyErr } = await supabase
          .from('satisfaction_surveys')
          .select(`
            id,
            rating,
            feedback,
            appointment_id
          `)
          .eq('token', token)
          .single();

        if (surveyErr || !survey) {
          console.error('Error al cargar la encuesta:', surveyErr);
          setError('El enlace de feedback ha expirado o no es válido');
          setLoading(false);
          return;
        }

        // Obtener la información del paciente para rellenar automáticamente el formulario si es necesario
        let defaultNombre = '';
        let defaultEmail = '';

        if (survey.appointment_id) {
          const { data: appt } = await supabase
            .from('agenda_appointments')
            .select(`
              id,
              pacientes:patient_id (nombre, apellido, email)
            `)
            .eq('id', survey.appointment_id)
            .single();

          if (appt && (appt as any).pacientes) {
            const pac = (appt as any).pacientes;
            defaultNombre = `${pac.nombre || ''} ${pac.apellido || ''}`.trim();
            defaultEmail = pac.email || '';
            setNombre(defaultNombre);
            setEmail(defaultEmail);
          }
        }

        // Procesar rating si viene en la URL (?rating=X)
        const ratingParam = searchParams.get('rating');
        const initialRating = ratingParam ? parseInt(ratingParam) : null;

        if (initialRating && initialRating >= 1 && initialRating <= 5) {
          setRating(initialRating);
          
          // Registrar de inmediato en la base de datos
          await supabase
            .from('satisfaction_surveys')
            .update({
              rating: initialRating,
              responded_at: new Date().toISOString()
            })
            .eq('token', token);

          // REDIRECCIÓN INSTANTÁNEA SI ES 4 O 5 ESTRELLAS
          if (initialRating >= 4) {
            setRedirecting(true);
            window.location.href = GOOGLE_REVIEW_URL;
            return;
          }
        } else if (survey.rating) {
          setRating(survey.rating);
          // Si ya estaba guardado como 4 o 5 estrellas, y reingresa, redirigir también
          if (survey.rating >= 4) {
            setRedirecting(true);
            window.location.href = GOOGLE_REVIEW_URL;
            return;
          }
        }

        if (survey.feedback) {
          setFeedbackText(survey.feedback);
          setFeedbackSubmitted(true);
        }
      } catch (err) {
        console.error('Excepción al cargar encuesta:', err);
        setError('Ocurrió un error al procesar el enlace de feedback');
      } finally {
        setLoading(false);
      }
    }

    loadSurvey();
  }, [token, searchParams, supabase]);

  // Manejar el click en las estrellas de forma interactiva en pantalla
  async function handleRatingClick(selectedRating: number) {
    setRating(selectedRating);

    // Bypass para testing de tokens ficticios
    if (token === 'test-token-google-review' || token === 'dummy-token') {
      if (selectedRating >= 4) {
        setRedirecting(true);
        window.location.href = GOOGLE_REVIEW_URL;
      }
      return;
    }

    try {
      await supabase
        .from('satisfaction_surveys')
        .update({
          rating: selectedRating,
          responded_at: new Date().toISOString()
        })
        .eq('token', token);

      // REDIRECCIÓN INSTANTÁNEA SI VOTA 4 O 5 ESTRELLAS EN LA WEB
      if (selectedRating >= 4) {
        setRedirecting(true);
        window.location.href = GOOGLE_REVIEW_URL;
      }
    } catch (err) {
      console.error('Error guardando estrellas:', err);
    }
  }

  // Enviar el formulario de feedback privado (1-3 estrellas)
  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackText.trim() || rating === null) return;

    setSubmittingFeedback(true);
    try {
      const response = await fetch('/api/survey/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          feedback: feedbackText,
          rating,
          nombre,
          email
        })
      });

      if (response.ok) {
        setFeedbackSubmitted(true);
      } else {
        alert('Ocurrió un error al enviar tu reseña. Intenta nuevamente.');
      }
    } catch (err) {
      console.error('Error enviando comentario:', err);
      alert('Error de conexión al enviar.');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100 to-indigo-50/30 flex items-center justify-center font-sans">
        <div className="bg-white/80 backdrop-blur-md border border-slate-100 rounded-[32px] p-8 max-w-sm w-full text-center shadow-xl shadow-slate-200/50">
          <svg className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <h2 className="text-slate-900 text-lg font-extrabold mb-1">
            {redirecting ? '¡Excelente calificación!' : 'Cargando encuesta...'}
          </h2>
          <p className="text-slate-500 text-xs">
            {redirecting ? 'Redirigiéndote a Google Reviews...' : 'Preparando el portal...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100 to-indigo-50/20 flex items-center justify-center font-sans p-4">
        <div className="bg-white/80 backdrop-blur-md border border-slate-100 rounded-[32px] p-8 max-w-md w-full text-center shadow-xl shadow-slate-200/50">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 text-rose-500 mb-6 border border-rose-100">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-slate-900 text-[22px] font-extrabold tracking-tight mb-2">Enlace no válido</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">{error}</p>
          <a
            href="https://amesteticadental.com"
            className="inline-flex justify-center items-center w-full px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-2xl transition duration-200 shadow-lg shadow-slate-900/10"
          >
            Volver a la web
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100 to-indigo-50/30 flex items-center justify-center font-sans p-4 leading-normal">
      <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-[32px] max-w-md w-full p-8 shadow-2xl shadow-slate-300/30 overflow-hidden relative">

        {/* Adornos estéticos fluidos de fondo */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50/50 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-50/40 rounded-full blur-3xl -z-10" />

        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-[16px] shadow-lg shadow-indigo-600/20 mb-3 border border-indigo-500/20 text-white font-black text-lg tracking-tighter">
            AM
          </div>
          <h1 className="text-slate-950 text-base font-black tracking-widest uppercase">
            AM CLÍNICA
          </h1>
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.25em] mt-0.5">
            Odontología de Vanguardia
          </p>
        </div>

        {/* --- PASO 1: Elegir Calificación si no tiene --- */}
        {rating === null ? (
          <div className="text-center">
            <h2 className="text-slate-900 text-[20px] font-black leading-tight tracking-tight mb-2">
              ¿Cómo fue tu primera consulta?
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Nos encantaría conocer tu opinión sincera. Por favor, califica tu experiencia hoy:
            </p>

            {/* Estrellas Interactivas */}
            <div className="flex justify-center items-center gap-2.5 my-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRatingClick(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="focus:outline-none transition duration-150 transform hover:scale-120 active:scale-95"
                >
                  <svg
                    className={`w-10 h-10 transition-all duration-200 ${
                      (hoverRating !== null ? star <= hoverRating : rating !== null ? star <= rating : false)
                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_2px_6px_rgba(245,158,11,0.2)]'
                        : 'text-slate-200 hover:text-amber-300'
                    }`}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-slate-400 text-xs italic">
              Toca una estrella para registrar tu valoración.
            </p>
          </div>
        ) : (
          /* --- PASO 2: Formulario de feedback privado para 1, 2 o 3 estrellas --- */
          <div>
            {!feedbackSubmitted ? (
              <form onSubmit={handleSubmitFeedback} className="space-y-4">
                <div className="text-center mb-4">
                  <h2 className="text-slate-950 text-[18px] font-black leading-tight tracking-tight mb-1">
                    Queremos entender qué ocurrió hoy
                  </h2>
                  <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                    Lamentamos mucho que tu experiencia no haya sido excelente. Por favor déjanos tu reclamo de forma privada y lo revisaremos con prioridad absoluta.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-800 text-[11px] font-extrabold uppercase tracking-wider mb-1.5">
                      Nombre y Apellido
                    </label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ingresa tu nombre..."
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-slate-800 placeholder-slate-400 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-800 text-[11px] font-extrabold uppercase tracking-wider mb-1.5">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@ejemplo.com"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-slate-800 placeholder-slate-400 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-800 text-[11px] font-extrabold uppercase tracking-wider mb-1.5">
                      ¿Qué queja o sugerencia tienes?
                    </label>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Cuéntanos en detalle qué ocurrió hoy en tu visita..."
                      rows={3}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-slate-800 placeholder-slate-400 transition resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingFeedback || !feedbackText.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs uppercase tracking-wider transition duration-150 transform active:scale-98"
                  >
                    {submittingFeedback ? 'Enviando...' : 'Enviar Reseña Privada'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-4 border border-emerald-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-slate-950 text-[18px] font-black leading-tight tracking-tight mb-2">
                  ¡Mensaje Recibido!
                </h2>
                <p className="text-slate-500 text-xs leading-relaxed mb-6 max-w-xs mx-auto">
                  Muchas gracias por contarnos lo sucedido. Tus comentarios han sido derivados de inmediato y con prioridad a la dirección de **AM Clínica** para ser solucionados.
                </p>
                <a
                  href="https://amesteticadental.com"
                  className="inline-flex justify-center items-center w-full px-5 py-3 bg-slate-950 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs uppercase tracking-wider transition"
                >
                  Volver a la web
                </a>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
