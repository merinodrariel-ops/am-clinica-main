import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calculator, Printer, Search, User, Calendar, DollarSign, ChevronRight, CheckCircle2, AlertCircle, X, Zap, ShieldCheck, Star, MessageCircle } from 'lucide-react';

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
  whatsapp: string;
  cuit: string;
  direccion: string;
}

interface ContratosFinanciacionTabProps {
  initialPatientId?: string;
}

const EXECUTIVE_WHATSAPP_NUMBER = '5491100000000';

interface InlineEditFieldProps {
  value: string;
  placeholder?: string;
  onSave: (val: string) => void;
  multiline?: boolean;
}

function InlineEditField({ value, placeholder = '___________________________', onSave, multiline = false }: InlineEditFieldProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = () => {
    setEditing(false);
    onSave(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="inline-block w-full border-b-2 border-blue-500 outline-none bg-blue-50 text-black px-1 text-sm resize-none"
          rows={2}
        />
      );
    }
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="inline-block border-b-2 border-blue-500 outline-none bg-blue-50 text-black px-1 text-sm"
        style={{ minWidth: '120px', width: Math.max((draft.length || 10) * 8, 120) + 'px' }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="group/inline relative cursor-text"
      title="Clic para editar"
    >
      <span className={`border-b border-dashed border-gray-400 hover:border-blue-400 transition-colors ${!value ? 'text-gray-400 italic' : ''}`}>
        {value || placeholder}
      </span>
      <span className="print:hidden ml-1 opacity-0 group-hover/inline:opacity-60 transition-opacity text-blue-500 text-[10px] select-none">✏</span>
    </span>
  );
}

export default function ContratosFinanciacionTab({ initialPatientId }: ContratosFinanciacionTabProps) {
  // Estados del Simulador
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [totalRecibido, setTotalRecibido] = useState<string>('');
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
    tipoTratamiento: '',
    tratamiento: '',
    maxilar: '',
    plazo: '',
    materiales: ''
  });

  const handleTipoTratamientoChange = (tipo: string) => {
    const updates: Partial<typeof patientData> = { tipoTratamiento: tipo };
    if (tipo === 'ortodoncia') updates.materiales = 'Alineadores invisibles';
    else if (tipo !== 'diseno_sonrisa') updates.materiales = '';
    else updates.materiales = '';
    setPatientData(prev => ({ ...prev, ...updates }));
  };
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

  const buildExecutiveWhatsappUrl = (plan?: PlanOption) => {
    const cleanPhone = EXECUTIVE_WHATSAPP_NUMBER.replace(/\D/g, '');
    const selectedPlan = plan || selectedPlanForContract;
    const selectedPlanText = selectedPlan
      ? `${selectedPlan.months} cuotas de ${formatCurrency(selectedPlan.installmentValue)}`
      : 'A definir';

    const patientName = patientData.nombre.trim() || 'Paciente';
    const totalText = calculations ? formatCurrency(calculations.amount) : 'A definir';

    const message = [
      `Hola, soy ${patientName}.`,
      '',
      'Quiero hablar con un ejecutivo para avanzar con mi sonrisa y resolver dudas sobre los planes.',
      `Monto estimado: ${totalText}`,
      `Recibido: ${calculations ? formatCurrency(calculations.recibido) : 'A definir'}`,
      `Plan de cuotas: ${selectedPlanText}`,
      '',
      'Me ayudan por favor?',
    ].join('\n');

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const handleContactExecutive = (plan?: PlanOption) => {
    if (plan) {
      setSelectedPlanForContract(plan);
    }
    window.open(buildExecutiveWhatsappUrl(plan), '_blank', 'noopener,noreferrer');
  };

  const handlePrintContract = () => {
    const printContent = document.getElementById('printable-contract');
    if (!printContent) return;

    // Clone the contract HTML and make InlineEditField spans editable
    const clone = printContent.cloneNode(true) as HTMLElement;

    // Replace InlineEditField interactive spans with contentEditable spans
    clone.querySelectorAll('[title="Clic para editar"]').forEach(el => {
      const span = el as HTMLElement;
      const textNode = span.querySelector('span:first-child');
      const text = textNode?.textContent || '';
      const editable = document.createElement('span');
      editable.contentEditable = 'true';
      editable.setAttribute('data-editable', 'true');
      editable.textContent = text;
      span.replaceWith(editable);
    });

    // Also make .value divs in financial-box editable
    clone.querySelectorAll('.value').forEach(el => {
      (el as HTMLElement).contentEditable = 'true';
      (el as HTMLElement).setAttribute('data-editable', 'true');
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

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
            [data-editable] { outline: none; cursor: text; }
            [data-editable]:hover { background-color: #fffbeb; }
            [data-editable]:focus { background-color: #eff6ff; }
            #edit-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px 16px; margin-bottom: 24px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-family: Arial, sans-serif; }
            #print-btn { background: #10b981; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; }
            #print-btn:hover { background: #059669; }
            @media print {
              #edit-banner { display: none !important; }
              body { padding: 0; }
              [data-editable] { cursor: default; }
            }
          </style>
        </head>
        <body>
          <div id="edit-banner">
            <span>&#9998; <strong>Podés editar cualquier campo antes de imprimir.</strong> Hacé clic sobre el texto subrayado para corregirlo.</span>
            <button id="print-btn" onclick="window.print()">Imprimir ahora</button>
          </div>
          ${clone.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const calculations = useMemo(() => {
    const amount = parseFloat(totalAmount.replace(/\./g, ''));
    if (isNaN(amount) || amount <= 0) return null;

    const recibido = parseFloat(totalRecibido.replace(/\./g, '')) || 0;
    const amountToFinance = Math.max(amount - recibido, 0);
    const pctRecibido = amount > 0 ? Math.round((recibido / amount) * 100) : 0;

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

    return { amount, recibido, amountToFinance, pctRecibido, plans };
  }, [totalAmount, totalRecibido]);

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
              Gestión interna
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
                          <span className="text-gray-500 font-medium">Ya Recibido</span>
                          <span className="font-mono text-white text-base">{formatCurrency(calculations.recibido)}</span>
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
                          handleContactExecutive(plan);
                        }}
                        className={`w-full py-4 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 uppercase tracking-widest ${(hoveredPlan === plan.id || plan.tag === 'Más Popular')
                            ? 'bg-white text-black hover:bg-gray-200'
                            : 'bg-white/5 text-white hover:bg-white/10'
                          }`}
                      >
                        QUIERO ESTE PLAN
                        <MessageCircle className="w-5 h-5" />
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
                      handleContactExecutive();
                    }}
                    className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-base md:text-lg px-8 py-4 md:py-5 rounded-2xl flex items-center justify-center gap-3 mx-auto transition-all shadow-[0_0_30px_rgba(52,211,153,0.3)] hover:shadow-[0_0_40px_rgba(52,211,153,0.4)] hover:-translate-y-1 w-full md:w-auto"
                  >
                    QUIERO MI SONRISA <MessageCircle className="w-5 h-5" />
                  </button>
                  <p className="mt-3 text-xs text-gray-400">
                    Te conectamos por WhatsApp con un ejecutivo para resolver dudas y ayudarte a elegir tu mejor plan.
                  </p>
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
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Tipo de tratamiento</label>
                    <select
                      value={patientData.tipoTratamiento}
                      onChange={(e) => handleTipoTratamientoChange(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
                    >
                      <option value="" className="bg-zinc-900">Seleccionar...</option>
                      <option value="ortodoncia" className="bg-zinc-900">Ortodoncia</option>
                      <option value="diseno_sonrisa" className="bg-zinc-900">Diseño de Sonrisa</option>
                      <option value="otro" className="bg-zinc-900">Otro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Descripción</label>
                    <textarea
                      value={patientData.tratamiento}
                      onChange={(e) => setPatientData({ ...patientData, tratamiento: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 h-20"
                      placeholder="Ej: Tratamiento de ortodoncia con alineadores"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Maxilar</label>
                      <select
                        value={patientData.maxilar}
                        onChange={(e) => setPatientData({ ...patientData, maxilar: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
                      >
                        <option value="" className="bg-zinc-900">Seleccionar...</option>
                        <option value="Maxilar Superior" className="bg-zinc-900">Maxilar Superior</option>
                        <option value="Maxilar Inferior" className="bg-zinc-900">Maxilar Inferior</option>
                        <option value="Ambos maxilares" className="bg-zinc-900">Ambos maxilares</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Plazo estimado</label>
                      <select
                        value={patientData.plazo}
                        onChange={(e) => setPatientData({ ...patientData, plazo: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
                      >
                        <option value="" className="bg-zinc-900">Seleccionar...</option>
                        <option value="Aproximadamente 1 año" className="bg-zinc-900">Aproximadamente 1 año</option>
                        <option value="Aproximadamente 2 años" className="bg-zinc-900">Aproximadamente 2 años</option>
                      </select>
                    </div>
                  </div>
                  {patientData.tipoTratamiento && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Materiales</label>
                      {patientData.tipoTratamiento === 'ortodoncia' ? (
                        <input
                          type="text"
                          value="Alineadores invisibles"
                          readOnly
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
                        />
                      ) : patientData.tipoTratamiento === 'diseno_sonrisa' ? (
                        <select
                          value={patientData.materiales}
                          onChange={(e) => setPatientData({ ...patientData, materiales: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 text-white"
                        >
                          <option value="" className="bg-zinc-900">Seleccionar...</option>
                          <option value="Resina" className="bg-zinc-900">Resina</option>
                          <option value="Cerámica" className="bg-zinc-900">Cerámica</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={patientData.materiales}
                          onChange={(e) => setPatientData({ ...patientData, materiales: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                          placeholder="Especificar materiales"
                        />
                      )}
                    </div>
                  )}
                </div>

                <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-white/10 pb-4 pt-4 mb-4">Datos Financieros</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Monto a financiar (USD)</label>
                    <input
                      type="text"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(formatInput(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Ej: 2.000"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Total ya recibido (USD)</label>
                    <input
                      type="text"
                      value={totalRecibido}
                      onChange={(e) => setTotalRecibido(formatInput(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Ej: 1.000"
                    />
                    {calculations && calculations.recibido > 0 && (
                      <p className="text-[10px] text-emerald-400 font-medium">
                        {calculations.pctRecibido}% recibido · {formatCurrency(calculations.amountToFinance)} a financiar
                      </p>
                    )}
                    {(!calculations || calculations.recibido === 0) && (
                      <p className="text-[10px] text-gray-500 italic">
                        Si el paciente no adelantó nada, dejá en blanco.
                      </p>
                    )}
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
                  <h1>CONTRATO DE FINANCIACIÓN DE TRATAMIENTO ODONTOLÓGICO CON GARANTÍA DE PAGARÉ</h1>

                  <p style={{ textAlign: 'center', fontSize: '12px', marginBottom: '20px' }}>
                    Lugar y Fecha: Buenos Aires, CABA, a los {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.
                  </p>

                  <h2>PARTES INTERVINIENTES</h2>
                  <p><strong>LA CLÍNICA:</strong> FULLSTHETIC S.A., CUIT N.º 30-71774842-1, domiciliada en Camila O'Gorman 412 - 101, CABA, representada por su Presidente Ariel Merino.</p>
                  <p>
                    <strong>EL PACIENTE:</strong>{' '}
                    <InlineEditField
                      value={patientData.nombre}
                      placeholder="Nombre y Apellido"
                      onSave={(v) => setPatientData(prev => ({ ...prev, nombre: v }))}
                    />{', DNI N.º '}
                    <InlineEditField
                      value={patientData.dni}
                      placeholder="___________"
                      onSave={(v) => setPatientData(prev => ({ ...prev, dni: v }))}
                    />{', domicilio en '}
                    <InlineEditField
                      value={patientData.direccion}
                      placeholder="___________________________"
                      onSave={(v) => setPatientData(prev => ({ ...prev, direccion: v }))}
                    />{', CUIT/CUIL N.º '}
                    <InlineEditField
                      value={patientData.cuitCuil}
                      placeholder="_______________"
                      onSave={(v) => setPatientData(prev => ({ ...prev, cuitCuil: v }))}
                    />{', correo '}
                    <InlineEditField
                      value={patientData.email}
                      placeholder="___________________________"
                      onSave={(v) => setPatientData(prev => ({ ...prev, email: v }))}
                    />.
                  </p>

                  <h2>CLÁUSULA PRIMERA: OBJETO DEL CONTRATO</h2>
                  <p>LA CLÍNICA se obliga a prestar servicios profesionales odontológicos con los siguientes detalles:</p>
                  <div className="grid" style={{ marginTop: '8px' }}>
                    <div className="field">
                      <div className="label">Descripción</div>
                      <div className="value">
                        <InlineEditField
                          value={patientData.tratamiento}
                          placeholder="_________________________________________________________________________________"
                          onSave={(v) => setPatientData(prev => ({ ...prev, tratamiento: v }))}
                          multiline
                        />
                      </div>
                    </div>
                    <div className="field">
                      <div className="label">Maxilar</div>
                      <div className="value">
                        <InlineEditField
                          value={patientData.maxilar}
                          placeholder="___________________________"
                          onSave={(v) => setPatientData(prev => ({ ...prev, maxilar: v }))}
                        />
                      </div>
                    </div>
                    {patientData.materiales && (
                      <div className="field">
                        <div className="label">Materiales Principales</div>
                        <div className="value">
                          <InlineEditField
                            value={patientData.materiales}
                            placeholder="___________________________"
                            onSave={(v) => setPatientData(prev => ({ ...prev, materiales: v }))}
                          />
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <div className="label">Plazo Estimado</div>
                      <div className="value">
                        <InlineEditField
                          value={patientData.plazo}
                          placeholder="___________________________"
                          onSave={(v) => setPatientData(prev => ({ ...prev, plazo: v }))}
                        />
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', marginTop: '8px', fontStyle: 'italic' }}>Se advierte que la inasistencia no justificada podrá ocasionar una reprogramación del plazo.</p>

                  <h2>CLÁUSULA SEGUNDA: PRESUPUESTO Y FORMA DE PAGO</h2>
                  <div className="financial-box">
                    <div className="grid" style={{ marginBottom: 0 }}>
                      {calculations && calculations.recibido > 0 && (
                        <div className="field">
                          <div className="label">Costo total del tratamiento</div>
                          <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
                            {totalAmount ? formatCurrency(parseFloat(totalAmount.replace(/\./g, ''))) : '___________'} (USD)
                          </div>
                        </div>
                      )}

                      {calculations && calculations.recibido > 0 && (
                        <div className="field">
                          <div className="label">Recibido con anterioridad a la firma</div>
                          <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
                            {formatCurrency(calculations.recibido)} (USD)
                          </div>
                        </div>
                      )}

                      <div className="field">
                        <div className="label">Monto a financiar</div>
                        <div className="value" style={{ border: 'none', fontSize: '14px', fontWeight: 'bold' }}>
                          {calculations ? formatCurrency(calculations.amountToFinance) : '___________'} (USD)
                        </div>
                      </div>

                      {selectedPlanForContract && (
                        <div className="field">
                          <div className="label">Plan de financiación</div>
                          <div className="value" style={{ border: 'none', fontSize: '13px', fontWeight: 'bold' }}>
                            {selectedPlanForContract.months} cuotas mensuales de {formatCurrency(selectedPlanForContract.installmentValue)} (USD)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {calculations && calculations.recibido > 0 && (
                    <p style={{ fontSize: '11px', marginTop: '8px', fontStyle: 'italic', color: '#92400e' }}>
                      LA CLÍNICA deja constancia de haber recibido la suma de {formatCurrency(calculations.recibido)} (USD) con anterioridad a la presente firma. El presente contrato regula exclusivamente la financiación del saldo restante de {formatCurrency(calculations.amountToFinance)} (USD).
                    </p>
                  )}

                  <h2>CLÁUSULA TERCERA: CONDICIONES DE LA FINANCIACIÓN</h2>
                  {selectedPlanForContract ? (
                    <p>El saldo se pagará en <strong>{selectedPlanForContract.months} cuotas mensuales, iguales y consecutivas</strong> de <strong>{formatCurrency(selectedPlanForContract.installmentValue)} (USD)</strong> cada una, con vencimiento el día <strong>7</strong> de cada mes calendario. La primera cuota vencerá el día 7 del mes siguiente a la firma del presente, contando EL PACIENTE con los días 1 al 7 de dicho mes para efectuar el pago sin recargo.</p>
                  ) : (
                    <p style={{ color: '#888', fontStyle: 'italic' }}>(Seleccione un plan de cuotas en el panel lateral)</p>
                  )}
                  <p><strong>Medios de Pago Aceptados:</strong> Efectivo en sede; transferencia bancaria o tarjeta de crédito/débito (sujetos a recargos). Los pagos podrán realizarse en Pesos Argentinos (ARS) según la cotización vendedora del Banco Nación Argentina (BNA) del día anterior al efectivo pago.</p>

                  <h2>CLÁUSULA CUARTA: GARANTÍA</h2>
                  <p>EL PACIENTE suscribe y entrega {selectedPlanForContract ? <strong>{selectedPlanForContract.months} pagaré(s)</strong> : '___'}, cada uno por el valor de una cuota, con vencimientos coincidentes con las fechas de pago pactadas. Dichos pagarés serán devueltos al PACIENTE contra la cancelación de cada cuota correspondiente.</p>

                  <h2>CLÁUSULA QUINTA: MORA E INCUMPLIMIENTO</h2>
                  <p>La falta de pago en la fecha de vencimiento constituirá mora automática, sin necesidad de interpelación judicial o extrajudicial alguna. En tal caso:</p>
                  <p>a) Se devengará un interés punitorio del <strong>3% diario</strong> sobre el capital adeudado.</p>
                  <p>b) La mora en el pago de dos (2) cuotas consecutivas facultará a LA CLÍNICA a: declarar la caducidad de todos los plazos; suspender la continuación del Tratamiento hasta la regularización total de la deuda; e iniciar la ejecución judicial de los pagarés suscriptos.</p>

                  <h2>CLÁUSULA SEXTA: DESISTIMIENTO</h2>
                  <p>EL PACIENTE podrá desistir del Tratamiento en cualquier momento, notificando fehacientemente a LA CLÍNICA. En dicho caso, deberá abonar los honorarios profesionales correspondientes a los servicios ya prestados y el costo de los materiales específicamente adquiridos para su tratamiento que no sean reutilizables. No se realizarán reintegros por pagos ya efectuados correspondientes a etapas del tratamiento completadas.</p>

                  <h2>CLÁUSULA SÉPTIMA: CONSENTIMIENTO INFORMADO</h2>
                  <p>EL PACIENTE declara haber recibido de LA CLÍNICA información clara, precisa y detallada sobre la naturaleza del Tratamiento, sus beneficios, riesgos potenciales, alternativas disponibles y costos involucrados, mediante Consentimiento Informado firmado en este acto como Anexo al presente contrato.</p>

                  <h2>CLÁUSULA OCTAVA: JURISDICCIÓN Y DOMICILIOS</h2>
                  <p>Las partes constituyen domicilios especiales en los indicados en el encabezado del presente y se someten a la jurisdicción y competencia de los Tribunales Ordinarios en lo Comercial de la Ciudad Autónoma de Buenos Aires, renunciando expresamente a cualquier otro fuero o jurisdicción que pudiere corresponderles.</p>

                  <div className="signatures">
                    <div>
                      <div className="signature-line">Firma del Paciente</div>
                      <div style={{ fontSize: '10px', marginTop: '5px', color: '#555' }}>
                        Aclaración: <InlineEditField
                          value={patientData.nombre}
                          placeholder="___________________________"
                          onSave={(v) => setPatientData(prev => ({ ...prev, nombre: v }))}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: '#555' }}>
                        DNI: <InlineEditField
                          value={patientData.dni}
                          placeholder="___________"
                          onSave={(v) => setPatientData(prev => ({ ...prev, dni: v }))}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="signature-line">Presidente de FULLSTHETIC S.A.</div>
                      <div style={{ fontSize: '10px', marginTop: '5px', color: '#555' }}>Ariel Merino</div>
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
