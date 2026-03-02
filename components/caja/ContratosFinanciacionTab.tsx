import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calculator, FileText, Printer, Search, User, Calendar, DollarSign, ChevronRight, CheckCircle2, AlertCircle, X, Zap, ShieldCheck, Star, MessageCircle } from 'lucide-react';

import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

// Tipos
interface PlanOption {
  id: string;
  months: number;
  installmentValue: number;
  totalCredit: number;
  tag?: string;
  color: string;
}

interface Paciente {
  id_paciente: string;
  nombre: string;
  apellido: string;
  documento: string;
  email: string;
  telefono: string;
  cuit: string;
  direccion: string;
}

interface ContratosFinanciacionTabProps {
  initialPatientId?: string;
}

const EXECUTIVE_WHATSAPP_NUMBER = '5491100000000';

export default function ContratosFinanciacionTab({ initialPatientId }: ContratosFinanciacionTabProps) {
  // Estados del Simulador
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [downPaymentPct, setDownPaymentPct] = useState<number>(30);
  const [cuit, setCuit] = useState<string>('');
  const [cuitError, setCuitError] = useState<string | null>(null);
  const [isCuitValid, setIsCuitValid] = useState<boolean | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'simulator' | 'contract'>('simulator');

  // Estados del Contrato
  const [patientData, setPatientData] = useState({
    nombre: '',
    dni: '',
    direccion: '',
    cuitCuil: '',
    email: '',
    tratamiento: '',
    piezas: '',
    plazo: ''
  });
  const [selectedPlanForContract, setSelectedPlanForContract] = useState<PlanOption | null>(null);

  // Estados de Búsqueda de Pacientes
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Tasa de interés anual (ej: 45%)
  const annualRate = 0.45;

  // Cargar paciente inicial
  useEffect(() => {
    if (!initialPatientId) return;
    let isMounted = true;
    async function loadInitialPatient() {
      const { data } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id_paciente', initialPatientId)
        .eq('is_deleted', false)
        .single();
      if (!isMounted || !data) return;
      handleSelectPatient(data as Paciente);
    }
    void loadInitialPatient();
    return () => {
      isMounted = false;
    };
  }, [initialPatientId]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Búsqueda en Supabase con Debounce
  useEffect(() => {
    const searchPatients = async () => {
      if (!searchQuery.trim() || searchQuery.length < 3) {
        setSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('pacientes')
          .select('*')
          .eq('is_deleted', false)
          .or(`nombre.ilike.%${searchQuery}%,apellido.ilike.%${searchQuery}%,documento.ilike.%${searchQuery}%`)
          .limit(5);

        if (error) throw error;
        setSearchResults(data || []);
        setShowSearchDropdown(true);
      } catch (error) {
        console.error('Error searching patients:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchPatients, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSelectPatient = (paciente: Paciente) => {
    setPatientData({
      ...patientData,
      nombre: `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim(),
      dni: paciente.documento || '',
      direccion: paciente.direccion || '',
      cuitCuil: paciente.cuit || '',
      email: paciente.email || ''
    });
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  // Formateadores
  const formatInput = (val: string) => {
    const numbers = val.replace(/\D/g, '');
    return numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatCuit = (val: string) => {
    const numbers = val.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 10) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 10)}-${numbers.slice(10, 11)}`;
  };

  const validateCuit = (cuitStr: string) => {
    const numbers = cuitStr.replace(/\D/g, '');
    if (numbers.length !== 11) {
      setCuitError('El CUIT/CUIL debe tener 11 dígitos');
      setIsCuitValid(false);
      return false;
    }
    setCuitError(null);
    setIsCuitValid(true);
    return true;
  };

  const handleCalculate = () => {
    if (!totalAmount) return;
    if (cuit && !validateCuit(cuit)) return;
    setShowResults(true);
  };

  const handleGoToContractStep = (plan?: PlanOption) => {
    if (plan) {
      setSelectedPlanForContract(plan);
    }
    setActiveTab('contract');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const handlePrintContract = () => {
    const printContent = document.getElementById('printable-contract');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Contrato de Prestación de Servicios Odontológicos</title>
            <style>
              body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #000; padding: 40px; max-width: 800px; margin: 0 auto; }
              h1 { text-align: center; font-size: 18px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
              h2 { font-size: 14px; text-transform: uppercase; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
              p { font-size: 12px; margin-bottom: 10px; text-align: justify; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
              .field { margin-bottom: 10px; }
              .label { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #555; }
              .value { font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 2px; min-height: 18px; }
              .signatures { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
              .signature-line { border-top: 1px solid #000; padding-top: 10px; font-size: 12px; }
              .financial-box { border: 1px solid #000; padding: 15px; margin-top: 20px; background-color: #f9f9f9; }
              @media print {
                body { padding: 0; }
                button { display: none; }
              }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
            <script>
              window.onload = () => {
                window.print();
                setTimeout(() => window.close(), 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const calculations = useMemo(() => {
    const amount = parseFloat(totalAmount.replace(/\./g, ''));
    if (isNaN(amount) || amount <= 0) return null;

    const downPayment = amount * (downPaymentPct / 100);
    const amountToFinance = amount - downPayment;

    const plans: PlanOption[] = [
      {
        id: '3m',
        months: 3,
        installmentValue: (amountToFinance * (1 + (annualRate * (3 / 12)))) / 3,
        totalCredit: amountToFinance * (1 + (annualRate * (3 / 12))),
        color: 'from-blue-400 to-indigo-500'
      },
      {
        id: '6m',
        months: 6,
        installmentValue: (amountToFinance * (1 + (annualRate * (6 / 12)))) / 6,
        totalCredit: amountToFinance * (1 + (annualRate * (6 / 12))),
        tag: 'Más Popular',
        color: 'from-emerald-400 to-teal-500'
      },
      {
        id: '12m',
        months: 12,
        installmentValue: (amountToFinance * (1 + (annualRate * (12 / 12)))) / 12,
        totalCredit: amountToFinance * (1 + (annualRate * (12 / 12))),
        color: 'from-orange-400 to-red-500'
      }
    ];

    return { amount, downPayment, amountToFinance, plans };
  }, [totalAmount, downPaymentPct]);

  const executiveWhatsappUrl = useMemo(() => {
    const cleanPhone = EXECUTIVE_WHATSAPP_NUMBER.replace(/\D/g, '');
    const selectedPlanText = selectedPlanForContract
      ? `${selectedPlanForContract.months} cuotas de ${formatCurrency(selectedPlanForContract.installmentValue)}`
      : 'A definir';

    const patientName = patientData.nombre.trim() || 'Paciente';
    const totalText = calculations ? formatCurrency(calculations.amount) : 'A definir';

    const message = [
      `Hola, soy ${patientName}.`,
      '',
      'Quiero hablar con un ejecutivo para resolver dudas sobre los planes de financiacion.',
      `Monto estimado: ${totalText}`,
      `Anticipo: ${downPaymentPct}%`,
      `Plan de cuotas: ${selectedPlanText}`,
      '',
      'Me ayudan por favor?',
    ].join('\n');

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }, [calculations, downPaymentPct, patientData.nombre, selectedPlanForContract]);

  return (
    <div className="bg-[#0a0a0a] text-white p-4 md:p-8 font-sans selection:bg-emerald-500/30 rounded-2xl max-w-full overflow-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Top Navigation / Toggle (Keeping it slightly more discreet than before since the header is larger) */}
        <div className="flex justify-center md:justify-end mb-8 z-10 relative">
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-white/5 shadow-xl">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-6 md:px-8 py-2 md:py-3 rounded-lg text-xs md:text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'simulator'
                  ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Simulador
            </button>
            <button
              onClick={() => setActiveTab('contract')}
              className={`px-6 md:px-8 py-2 md:py-3 rounded-lg text-xs md:text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'contract'
                  ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Contratos
            </button>
          </div>
        </div>

        {activeTab === 'simulator' ? (
          /* VISTA SIMULADOR REDISEÑADA */
          <div className="animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="text-center mb-12 md:mb-16 mt-4 md:mt-8">
              <h1 className="text-5xl md:text-7xl lg:text-[5rem] font-bold tracking-tight mb-6 hidden md:block leading-tight">
                Sonríe hoy.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-500">
                  Paga después.
                </span>
              </h1>
              <h1 className="text-4xl font-bold tracking-tight mb-6 md:hidden leading-snug">
                Sonríe hoy.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-500">Paga después.</span>
              </h1>
              <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg px-4">
                Transformamos tu sonrisa con tecnología de vanguardia y planes de pago diseñados a tu medida.
              </p>
            </div>

            {/* Tarjeta de Input Principal */}
            <div className="max-w-3xl mx-auto relative group mb-12 md:mb-20">
              {/* Efecto Glow de fondo */}
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 rounded-[2.5rem] blur-2xl opacity-50 transition duration-1000 group-hover:opacity-100 group-hover:blur-3xl"></div>

              <div className="relative bg-[#111] border border-white/5 rounded-[2rem] p-6 md:p-12 shadow-2xl overflow-hidden">
                {/* Monto input */}
                <div className="mb-10 md:mb-14 relative z-10">
                  <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 block">
                    INVERSIÓN EN TU SONRISA (USD)
                  </label>
                  <div className="flex items-end border-b border-white/10 pb-4 md:pb-6 group-focus-within:border-emerald-500/50 transition-colors">
                    <input
                      type="text"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(formatInput(e.target.value))}
                      className="w-full bg-transparent text-6xl md:text-8xl lg:text-[7rem] font-bold text-white focus:outline-none tracking-tighter placeholder:text-white/10"
                      placeholder="0"
                    />
                    <span className="text-xl md:text-3xl text-gray-500 font-medium mb-3 md:mb-4 ml-4">USD</span>
                  </div>
                </div>

                {/* Anticipo slider */}
                <div className="mb-12 relative z-10">
                  <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 block">
                    ANTICIPO INICIAL ({downPaymentPct}%)
                  </label>
                  <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                    <div className="flex-1 relative flex items-center h-8">
                      <input
                        type="range"
                        min="30"
                        max="50"
                        step="10"
                        value={downPaymentPct}
                        onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                        className="w-full absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      {/* Interfaz Custom del Slider */}
                      <div className="w-full h-3 bg-zinc-800 rounded-full border border-white/5 overflow-hidden relative pointer-events-none shadow-inner">
                        <div
                          className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-300"
                          style={{ width: `${(downPaymentPct - 30) / 20 * 100}%` }}
                        ></div>
                      </div>
                      <div
                        className="absolute w-6 h-6 bg-emerald-400 rounded-full shadow-[0_0_20px_rgba(52,211,153,0.8)] transition-all pointer-events-none transform -translate-y-1/2 top-1/2 border-[3px] border-[#111]"
                        style={{ left: `calc(${(downPaymentPct - 30) / 20 * 100}% - 12px)` }}
                      ></div>
                    </div>
                    {/* Botones de Porcentaje Rápido */}
                    <div className="flex gap-2 justify-between md:justify-end">
                      {[30, 40, 50].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setDownPaymentPct(pct)}
                          className={`px-4 md:px-5 py-2 md:py-3 rounded-xl text-sm font-bold transition-all flex-1 md:flex-none uppercase tracking-wider ${downPaymentPct === pct
                              ? 'bg-emerald-400 text-black shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                              : 'bg-zinc-800/80 text-gray-400 hover:text-white border border-white/5 hover:border-white/20'
                            }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-5 italic font-medium">Mínimo 30%, máximo 50% para financiación directa.</p>
                </div>

                {/* Botón Simular */}
                <button
                  onClick={() => {
                    if (!totalAmount) return;
                    setShowResults(true);
                    setTimeout(() => {
                      document.getElementById('resultados-simulador')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  disabled={!totalAmount || totalAmount === '0'}
                  className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-black font-black text-lg md:text-xl py-5 md:py-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_30px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transform hover:-translate-y-1 relative z-10 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    SIMULAR MI PLAN <Zap className="w-5 md:w-6 h-5 md:h-6" fill="currentColor" />
                  </span>
                  {/* Destello del botón */}
                  <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
                </button>
              </div>

              {/* Badges debajo de la tarjeta */}
              <div className="flex flex-wrap justify-center gap-2 md:gap-4 mt-8 px-2 max-w-2xl mx-auto">
                <div className="flex items-center justify-center flex-1 md:flex-none gap-2 px-3 md:px-5 py-2 md:py-3 rounded-full border border-white/10 bg-[#111] shadow-lg text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-widest transition-colors hover:text-gray-300 hover:border-white/20">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="hidden sm:inline">RESERVA DE </span>ADMISIÓN
                </div>
                <div className="flex items-center justify-center flex-1 md:flex-none gap-2 px-3 md:px-5 py-2 md:py-3 rounded-full border border-white/10 bg-[#111] shadow-lg text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-widest transition-colors hover:text-gray-300 hover:border-white/20">
                  <AlertCircle className="w-4 h-4 text-blue-500" />
                  VERIFICACIÓN<span className="hidden sm:inline"> DE CUIT</span>
                </div>
                <div className="flex items-center justify-center flex-1 md:flex-none gap-2 px-3 md:px-5 py-2 md:py-3 rounded-full border border-white/10 bg-[#111] shadow-lg text-[9px] md:text-xs font-bold text-gray-400 uppercase tracking-widest transition-colors hover:text-gray-300 hover:border-white/20">
                  <CheckCircle2 className="w-4 h-4 text-purple-500" />
                  SUJETO A APROBACIÓN
                </div>
              </div>
            </div>

            {/* SECCIÓN DE RESULTADOS */}
            {showResults && calculations && (
              <div id="resultados-simulador" className="max-w-5xl mx-auto mt-20 md:mt-32 animate-in slide-in-from-bottom-12 fade-in duration-1000 pt-10">
                <div className="text-center mb-16 px-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-black/40 text-xs font-bold text-white uppercase tracking-widest mb-6 backdrop-blur-sm">
                    <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    Planes Disponibles
                  </div>
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                    Elige la cuota ideal para ti
                  </h2>
                </div>

                <div className="grid md:grid-cols-3 gap-6 md:gap-8 px-4">
                  {calculations.plans.map((plan) => (
                    <div
                      key={plan.id}
                      onMouseEnter={() => setHoveredPlan(plan.id)}
                      onMouseLeave={() => setHoveredPlan(null)}
                      className={`relative bg-[#111] border rounded-[2rem] p-8 transition-all duration-500 cursor-pointer overflow-hidden group ${(hoveredPlan === plan.id || plan.tag === 'Más Popular') ? 'border-white/20 scale-[1.02] shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'border-white/5 shadow-xl'
                        }`}
                    >
                      {/* Gradient Background Hover */}
                      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${plan.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />

                      {/* Top border line for highlighted cards */}
                      {plan.tag === 'Más Popular' && (
                        <div className={`pointer-events-none absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${plan.color}`} />
                      )}

                      {plan.tag && (
                        <div className="absolute top-6 right-6 bg-emerald-500 text-black text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1">
                          <Star className="w-3 h-3 fill-black" />
                          {plan.tag}
                        </div>
                      )}

                      <div className="mb-8 mt-2">
                        <h3 className="text-3xl font-bold text-white mb-2">{plan.months} Cuotas</h3>
                        <p className="text-sm text-gray-500">Tasa recargo fija {annualRate * 100}% anual</p>
                      </div>

                      <div className="mb-10">
                        <p className="text-[10px] text-gray-500 font-bold mb-3 uppercase tracking-[0.2em]">Valor de cuota</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl lg:text-5xl font-mono font-bold text-white tracking-tighter">
                            {formatCurrency(plan.installmentValue).replace('US$', '').replace('$', '').trim()}
                          </span>
                          <span className="text-xl text-gray-500 font-medium tracking-widest">USD</span>
                        </div>
                      </div>

                      <div className="space-y-4 mb-10">
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                          <span className="text-gray-500 font-medium">Anticipo Integrado</span>
                          <span className="font-mono text-white text-base">{formatCurrency(calculations.downPayment)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                          <span className="text-gray-500 font-medium">A Financiar</span>
                          <span className="font-mono text-white text-base">{formatCurrency(calculations.amountToFinance)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm pb-2">
                          <span className="text-gray-500 font-medium">Costo Financiero</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            +{formatCurrency(plan.totalCredit - calculations.amountToFinance)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleGoToContractStep(plan);
                        }}
                        className={`w-full py-4 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 uppercase tracking-widest ${(hoveredPlan === plan.id || plan.tag === 'Más Popular')
                            ? 'bg-white text-black hover:bg-gray-200'
                            : 'bg-white/5 text-white hover:bg-white/10'
                          }`}
                      >
                        Generar Contrato
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* CTA Final */}
                <div className="text-center mt-32 mb-10 px-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-black/40 text-[10px] font-bold text-white uppercase tracking-widest mb-8 backdrop-blur-sm">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    Agenda prioritaria disponible
                  </div>
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-10">
                    ¿Listo para tu nueva versión?
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(executiveWhatsappUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-base md:text-lg px-8 py-4 md:py-5 rounded-2xl flex items-center justify-center gap-3 mx-auto transition-all shadow-[0_0_30px_rgba(52,211,153,0.3)] hover:shadow-[0_0_40px_rgba(52,211,153,0.4)] hover:-translate-y-1 w-full md:w-auto"
                  >
                    CONTACTAR A UN EJECUTIVO <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* VISTA CONTRATO */
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Formulario de Datos */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">

                {/* Buscador de Pacientes */}
                <div className="mb-8 relative" ref={searchRef}>
                  <label className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3 block">Buscar Paciente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (searchQuery.length >= 3) setShowSearchDropdown(true);
                      }}
                      placeholder="Nombre, apellido o DNI..."
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 transition-all"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Dropdown de resultados */}
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                      {searchResults.map((paciente) => (
                        <button
                          key={paciente.id_paciente}
                          onClick={() => handleSelectPatient(paciente)}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors flex flex-col gap-1"
                        >
                          <span className="font-medium text-sm text-white">{paciente.nombre} {paciente.apellido}</span>
                          <span className="text-xs text-gray-400 font-mono">DNI: {paciente.documento}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showSearchDropdown && searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
                    <div className="absolute z-10 w-full mt-2 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl p-4 text-center text-sm text-gray-400">
                      No se encontraron pacientes.
                    </div>
                  )}
                </div>

                <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-white/10 pb-4 mb-4">Datos del Paciente</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Nombre Completo</label>
                    <input
                      type="text"
                      value={patientData.nombre}
                      onChange={(e) => setPatientData({ ...patientData, nombre: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">DNI</label>
                    <input
                      type="text"
                      value={patientData.dni}
                      onChange={(e) => setPatientData({ ...patientData, dni: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Dirección</label>
                    <input
                      type="text"
                      value={patientData.direccion}
                      onChange={(e) => setPatientData({ ...patientData, direccion: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold flex justify-between">
                      CUIT/CUIL
                      {!patientData.cuitCuil && <span className="text-[8px] text-emerald-400">Dato faltante</span>}
                    </label>
                    <input
                      type="text"
                      value={patientData.cuitCuil}
                      onChange={(e) => setPatientData({ ...patientData, cuitCuil: formatCuit(e.target.value) })}
                      placeholder="00-00000000-0"
                      className="w-full bg-white/5 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Email</label>
                    <input
                      type="email"
                      value={patientData.email}
                      onChange={(e) => setPatientData({ ...patientData, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 border-b border-white/10 pb-4 pt-4 mb-4">Detalles del Tratamiento</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Descripción</label>
                    <textarea
                      value={patientData.tratamiento}
                      onChange={(e) => setPatientData({ ...patientData, tratamiento: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 h-20"
                      placeholder="Ej: Diseño de sonrisa con carillas"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Piezas</label>
                      <input
                        type="text"
                        value={patientData.piezas}
                        onChange={(e) => setPatientData({ ...patientData, piezas: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        placeholder="Ej: 10 piezas"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Plazo</label>
                      <input
                        type="text"
                        value={patientData.plazo}
                        onChange={(e) => setPatientData({ ...patientData, plazo: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        placeholder="Ej: 15 días"
                      />
                    </div>
                  </div>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-white/10 pb-4 pt-4 mb-4">Datos Financieros</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Monto Total (USD)</label>
                    <input
                      type="text"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(formatInput(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Ej: 1.000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Anticipo (%)</label>
                    <input
                      type="number"
                      value={downPaymentPct}
                      onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Plan de Cuotas</label>
                    <select
                      value={selectedPlanForContract?.months || ''}
                      onChange={(e) => {
                        const months = Number(e.target.value);
                        if (months && calculations) {
                          const plan = calculations.plans.find(p => p.months === months);
                          if (plan) setSelectedPlanForContract(plan);
                        } else {
                          setSelectedPlanForContract(null);
                        }
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
                    >
                      <option value="" className="bg-zinc-900">Seleccionar plan...</option>
                      {calculations?.plans.map(plan => (
                        <option key={plan.id} value={plan.months} className="bg-zinc-900">
                          {plan.months} cuotas de {formatCurrency(plan.installmentValue)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-white/10">
                  <button
                    onClick={handlePrintContract}
                    className="w-full flex justify-center items-center gap-2 bg-emerald-500 text-black px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    <Printer className="w-5 h-5" />
                    Imprimir Contrato
                  </button>
                </div>
              </div>
            </div>

            {/* Vista Previa del Documento */}
            <div className="lg:col-span-8">
              <div className="bg-white text-black p-8 md:p-12 rounded-xl shadow-2xl min-h-[800px] relative">

                {/* Etiqueta de Vista Previa */}
                <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[10px] font-bold px-4 py-1 rounded-bl-xl rounded-tr-xl uppercase tracking-widest">
                  Vista Previa
                </div>

                {/* Contenido Imprimible */}
                <div id="printable-contract" className="max-w-3xl mx-auto">
                  <h1>Contrato de Prestación de Servicios Odontológicos</h1>

                  <p>Entre <strong>ANTIGRAVITY DENTAL CLINIC</strong>, en adelante "LA CLÍNICA", y el paciente detallado a continuación, en adelante "EL PACIENTE", se celebra el presente contrato sujeto a las siguientes cláusulas:</p>

                  <h2>1. Datos del Paciente</h2>
                  <div className="grid">
                    <div className="field">
                      <div className="label">Nombre y Apellido</div>
                      <div className="value">{patientData.nombre || '___________________________'}</div>
                    </div>
                    <div className="field">
                      <div className="label">DNI</div>
                      <div className="value">{patientData.dni || '___________________________'}</div>
                    </div>
                    <div className="field">
                      <div className="label">CUIT/CUIL</div>
                      <div className="value">{patientData.cuitCuil || '___________________________'}</div>
                    </div>
                    <div className="field">
                      <div className="label">Dirección</div>
                      <div className="value">{patientData.direccion || '___________________________'}</div>
                    </div>
                  </div>

                  <h2>2. Detalle del Tratamiento</h2>
                  <div className="field">
                    <div className="label">Descripción Clínica</div>
                    <div className="value">{patientData.tratamiento || '_________________________________________________________________________________'}</div>
                  </div>
                  <div className="grid" style={{ marginTop: '10px' }}>
                    <div className="field">
                      <div className="label">Piezas Dentales Involucradas</div>
                      <div className="value">{patientData.piezas || '___________________________'}</div>
                    </div>
                    <div className="field">
                      <div className="label">Plazo Estimado de Ejecución</div>
                      <div className="value">{patientData.plazo || '___________________________'}</div>
                    </div>
                  </div>

                  <h2>3. Condiciones Económicas y Financiación</h2>
                  <p>EL PACIENTE se compromete a abonar el tratamiento bajo las siguientes condiciones financieras acordadas:</p>

                  <div className="financial-box">
                    <div className="grid" style={{ marginBottom: 0 }}>
                      <div className="field">
                        <div className="label">Monto Total del Tratamiento</div>
                        <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
                          {totalAmount ? formatCurrency(parseFloat(totalAmount.replace(/\./g, ''))) : 'USD 0'}
                        </div>
                      </div>
                      <div className="field">
                        <div className="label">Anticipo Abonado ({downPaymentPct}%)</div>
                        <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
                          {calculations ? formatCurrency(calculations.downPayment) : 'USD 0'}
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #ddd', margin: '15px 0', paddingTop: '15px' }}>
                      <div className="label" style={{ color: '#000', marginBottom: '5px' }}>Plan de Financiación Seleccionado</div>
                      {selectedPlanForContract ? (
                        <p style={{ fontSize: '14px', margin: 0 }}>
                          Saldo a financiar abonable en <strong>{selectedPlanForContract.months} cuotas fijas</strong> de <strong>{formatCurrency(selectedPlanForContract.installmentValue)}</strong>.
                        </p>
                      ) : (
                        <p style={{ fontSize: '14px', margin: 0, color: '#888', fontStyle: 'italic' }}>
                          (Seleccione un plan de cuotas en el panel lateral)
                        </p>
                      )}
                    </div>
                  </div>

                  <h2>4. Cláusulas Generales</h2>
                  <p>1. El incumplimiento en el pago de dos (2) cuotas consecutivas facultará a LA CLÍNICA a suspender el tratamiento hasta la regularización de la deuda.</p>
                  <p>2. Los valores expresados en USD (Dólares Estadounidenses) serán abonados en dicha moneda o en su equivalente en Pesos Argentinos a la cotización del dólar MEP del día del efectivo pago.</p>
                  <p>3. EL PACIENTE declara haber sido informado detalladamente sobre los alcances, riesgos y alternativas del tratamiento descrito en el apartado 2.</p>

                  <div className="signatures">
                    <div>
                      <div className="signature-line">Firma del Paciente</div>
                      <div style={{ fontSize: '10px', marginTop: '5px', color: '#555' }}>Aclaración: {patientData.nombre}</div>
                      <div style={{ fontSize: '10px', color: '#555' }}>DNI: {patientData.dni}</div>
                    </div>
                    <div>
                      <div className="signature-line">Por Antigravity Dental Clinic</div>
                      <div style={{ fontSize: '10px', marginTop: '5px', color: '#555' }}>Firma y Sello del Profesional</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
