'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, CreditCard, Clock, Plus, ArrowRightLeft, DollarSign, Calendar, ExternalLink, RefreshCw, X, Copy, CheckCircle, Check, FileText, AlertTriangle, Pencil, MessageCircle, QrCode, Bitcoin, Landmark, Smartphone, History, Eye, EyeOff, Share2, Search, Filter, ChevronDown, FileImage, Layout, Trash2, Users } from 'lucide-react';
import { ComprobanteLink } from '@/components/caja/ComprobanteLink';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

const FinanciacionTab = dynamic(() => import('@/components/caja/FinanciacionTab'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
    ),
});

const ContratosFinanciacionTab = dynamic(() => import('@/components/caja/ContratosFinanciacionTab'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        </div>
    ),
});

const PresentacionesSyncTab = dynamic(() => import('@/components/caja/PresentacionesSyncTab'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
    ),
});

type CajaTab = 'caja' | 'financiacion' | 'contratos' | 'presentaciones';
import clsx from 'clsx';
import { formatCurrency } from '@/lib/bna';
import { supabase } from '@/lib/supabase';
import NuevoIngresoForm from '@/components/caja/NuevoIngresoForm';
import ArqueoPanel from '@/components/caja/ArqueoPanel';
import TransferenciaAdmin from '@/components/caja/TransferenciaAdmin';
import HistorialEdicionesModal from '@/components/caja/HistorialEdicionesModal';
import NuevoGastoForm from '@/components/caja/NuevoGastoForm';
import { ReciboGenerator, generateReciboNumber } from '@/components/caja/ReciboGenerator';
import { logMovimientoEdit, deleteMovimiento, getCurrentBalanceRecepcion } from '@/lib/caja-recepcion';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';
import { sendSecurityAlertAction } from '@/app/actions/email';
import { formatDateForLocale, getLocalISODate, getLocalYearMonth, toDateInputValue } from '@/lib/local-date';
import { useAuth } from '@/contexts/AuthContext';
import RoleGuard from '@/components/auth/RoleGuard';


// Types
interface Stats {
    totalDiaUsd: number;
    totalMesUsd: number;
    porMetodo: Record<string, number>;
    porCategoria: Record<string, number>;
    movimientosHoy: number;
    pendientes: number;
    totalPacientes: number;
    nuevosPacientes: number;
}

interface Movimiento {
    id: string;
    fecha_hora: string;
    fecha_movimiento?: string;
    paciente?: {
        nombre: string;
        apellido: string;
        id_paciente: string;
        telefono?: string | null;
        email?: string | null;
        financ_estado?: string;
        financ_monto_total?: number;
        financ_cuotas_total?: number;
    };
    concepto_nombre: string;
    categoria: string | null;
    monto: number;
    moneda: string;
    metodo_pago: string;
    estado: string;
    usd_equivalente: number | null;
    cuota_nro?: number | null;
    cuotas_total?: number | null;
    registro_editado?: boolean;
    comprobante_url?: string | null;
    origen?: string;
}

interface BnaRate {
    venta: number;
    fecha: string;
    fuente: string;
    warning?: boolean;
    error?: boolean;
}

interface AperturaAudit {
    fecha: string;
    usuario: string;
    hora_inicio: string | null;
    created_at: string;
    estado: 'abierto' | 'cerrado';
}

// Payment data for copy functionality
// Payment data types and constant
type PaymentCategory = 'banco' | 'mp' | 'cripto';

interface PaymentMethod {
    category: PaymentCategory;
    group: string;
    label: string;
    details: Record<string, string>;
    qrValue?: string; // Specific value for QR generation
}

const PAYMENT_DATA: Record<string, PaymentMethod> = {
    santander_empresa_ars: {
        category: 'banco',
        group: 'Empresa (Fullesthetic)',
        label: 'SANTANDER EMPRESA PESOS (Factura A)',
        details: {
            'Cuenta': 'CC 760-014436/2',
            'CBU': '0720760220000001443622',
            'Alias': 'amesteticadental',
            'Razón Social': 'FULLESTHETIC SA',
            'CUIT': '30717748421'
        },
        qrValue: '0720760220000001443622' // CBU
    },
    santander_empresa_usd: {
        category: 'banco',
        group: 'Empresa (Fullesthetic)',
        label: 'SANTANDER EMPRESA DÓLARES (Factura A)',
        details: {
            'Cuenta': 'CC 760-014785/9',
            'CBU': '07207602210000001478591',
            'Alias': 'AMesteticaDentalUSD',
            'Razón Social': 'FULLESTHETIC SA',
            'CUIT': '30717748421'
        },
        qrValue: '07207602210000001478591' // CBU
    },
    santander_personal: {
        category: 'banco',
        group: 'Personal',
        label: 'SANTANDER PERSONAL (DÓLARES Y PESOS)',
        details: {
            'Titular': 'ARIEL ALEXIS MERINO BAHAMONDEZ',
            'CUIT': '20-33447153-6',
            'Cuenta': '760-011706/1',
            'CBU': '0720760288000001170618',
            'Alias': 'dr.arielmerino'
        },
        qrValue: '0720760288000001170618' // CBU
    },
    mp_ars: {
        category: 'mp',
        group: 'Mercado Pago',
        label: 'MERCADO PAGO PESOS',
        details: {
            'Alias': 'amdentalpesos',
            'CVU': '0000003100006597395484'
        },
        qrValue: '0000003100006597395484' // CVU
    },
    mp_usd: {
        category: 'mp',
        group: 'Mercado Pago',
        label: 'MERCADO PAGO DÓLARES',
        details: {
            'Alias': 'mozo.aceptas.catre',
            'CBU': '3220001888065006450017',
            'Nota': 'Al transferir figura Banco Industrial (BIND)'
        },
        qrValue: '3220001888065006450017' // CBU/CVU
    },
    cripto_usdt: {
        category: 'cripto',
        group: 'Cripto',
        label: 'CRIPTO – USDT TRC20',
        details: {
            'Dirección': 'TLYiSCFSHtqPySok77PofZ5YwiBwHJTCjU',
            'Red': 'TRC20'
        },
        qrValue: 'TLYiSCFSHtqPySok77PofZ5YwiBwHJTCjU' // Dirección
    },
};

const GOOGLE_REVIEW_LINK = 'https://g.page/r/CQ3df5Xn-J6oEBM/review';

import { Suspense } from 'react';

function CajaRecepcionContent() {
    const searchParams = useSearchParams();
    const { role } = useAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [bnaRate, setBnaRate] = useState<BnaRate | null>(null);
    const [aperturaAudit, setAperturaAudit] = useState<AperturaAudit | null>(null);
    const [mesActual, setMesActual] = useState(() => getLocalYearMonth());
    const [showNuevoGasto, setShowNuevoGasto] = useState(false);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMetodo, setFilterMetodo] = useState('');
    const initialTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState<CajaTab>(
        initialTab === 'financiacion' || initialTab === 'contratos' || initialTab === 'presentaciones'
            ? (initialTab as CajaTab)
            : 'caja'
    );

    const [showNuevoIngreso, setShowNuevoIngreso] = useState(false);
    const [showTransferencia, setShowTransferencia] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [historialMovId, setHistorialMovId] = useState<string | null>(null);
    const [showSidebar, setShowSidebar] = useState(false);
    const [efectivo, setEfectivo] = useState<{ usd: number; ars: number } | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('am.caja-recepcion.sidebar.visible');
        if (saved === '1') setShowSidebar(true);
    }, []);

    useEffect(() => {
        localStorage.setItem('am.caja-recepcion.sidebar.visible', showSidebar ? '1' : '0');
    }, [showSidebar]);

    const today = useMemo(() => getLocalISODate(), []);

    // Edit date modal state
    const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
    const [editMonto, setEditMonto] = useState(0);
    const [displayMonto, setDisplayMonto] = useState("");
    const [editMoneda, setEditMoneda] = useState("ARS");
    const [editMetodo, setEditMetodo] = useState("");
    const [editConcepto, setEditConcepto] = useState("");
    const [editCategoria, setEditCategoria] = useState("");
    const [editEstado, setEditEstado] = useState("");
    const [newFecha, setNewFecha] = useState("");
    const [editMotivo, setEditMotivo] = useState("");
    const [editComprobanteUrl, setEditComprobanteUrl] = useState<string | null>(null);
    const [savingDate, setSavingDate] = useState(false);

    // Deletion modal state
    const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
    const [deletionConfirmation, setDeletionConfirmation] = useState("");
    const [deletionReason, setDeletionReason] = useState("");

    // QR Modal state
    const [qrModal, setQrModal] = useState<{ open: boolean; value: string; title: string }>({
        open: false,
        value: '',
        title: ''
    });

    // Recibo Modal state
    const [reciboMov, setReciboMov] = useState<Movimiento | null>(null);
    const [isReciboMinimized, setIsReciboMinimized] = useState(false);

    useEffect(() => {
        if (!reciboMov) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setReciboMov(null);
                setIsReciboMinimized(false);
            }
        };

        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [reciboMov]);

    function getWhatsappLink(text: string) {
        return `https://wa.me/?text=${encodeURIComponent(text)}`;

    }


    const loadData = useCallback(async () => {
        try {
            // Fetch cash balance
            const balance = await getCurrentBalanceRecepcion();
            setEfectivo({ usd: balance.saldoUsd, ars: balance.saldoArs });

            // Fetch BNA rate
            const rateRes = await fetch('/api/bna-cotizacion');
            const rateData = await rateRes.json();
            setBnaRate(rateData);

            // Range calculation for the month
            const nextMonth = new Date(mesActual + '-01');
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const nextMonthStr = getLocalYearMonth(nextMonth);

            // Fetch movements for selected month from Supabase
            const { data: movMesRaw, error: movError } = await supabase
                .from('caja_recepcion_movimientos')
                .select(`
                    *,
                    paciente:pacientes(
                        id_paciente, 
                        nombre, 
                        apellido,
                        telefono,
                        email,
                        financ_estado,
                        financ_monto_total,
                        financ_cuotas_total
                    )
                `)
                .gte('fecha_movimiento', `${mesActual}-01`)
                .lt('fecha_movimiento', `${nextMonthStr}-01`)
                .order('fecha_hora', { ascending: false });

            // Cast to Movimiento[] to avoid any
            const movs = movMesRaw as unknown as Movimiento[] | null;

            if (movError) {
                console.error('Error fetching movements:', movError);
            } else {
                // If there are Notion imports, try to find matching patients
                const hasNotionImports = (movs || []).some(m => m.paciente?.id_paciente === 'e5193b04-5e9d-43c2-a35b-8abc5a4a0f59');

                if (hasNotionImports) {
                    const { data: allPacientes } = await supabase
                        .from('pacientes')
                        .select('id_paciente, nombre, apellido, telefono, email, financ_estado, financ_monto_total, financ_cuotas_total');

                    if (allPacientes) {
                        const enrichedMovs = (movs || []).map(m => {
                            if (m.paciente?.id_paciente === 'e5193b04-5e9d-43c2-a35b-8abc5a4a0f59') {
                                const concepto = m.concepto_nombre.toLowerCase().trim();

                                // Ignore system entries
                                if (concepto.includes('cierre') || concepto.includes('inicio')) return m;

                                // Try to find a patient whose name + apellido or vice versa is in concepto_nombre
                                const found = allPacientes.find(p => {
                                    const fullName = `${p.nombre} ${p.apellido}`.toLowerCase();
                                    const reverseName = `${p.apellido} ${p.nombre}`.toLowerCase();
                                    const lastName = p.apellido.toLowerCase();
                                    const firstName = p.nombre.toLowerCase();

                                    return (
                                        concepto.includes(fullName) ||
                                        concepto.includes(reverseName) ||
                                        (concepto.includes(lastName) && concepto.includes(firstName))
                                    );
                                });

                                if (found) {
                                    return {
                                        ...m,
                                        paciente: {
                                            id_paciente: found.id_paciente,
                                            nombre: found.nombre,
                                            apellido: found.apellido,
                                            telefono: found.telefono,
                                            email: found.email,
                                            financ_estado: found.financ_estado,
                                            financ_monto_total: found.financ_monto_total,
                                            financ_cuotas_total: found.financ_cuotas_total
                                        }
                                    };
                                }
                            }
                            return m;
                        });
                        setMovimientos(enrichedMovs);
                    } else {
                        setMovimientos(movs || []);
                    }
                } else {
                    setMovimientos(movs || []);
                }
            }

            const { data: aperturaRaw } = await supabase
                .from('caja_recepcion_arqueos')
                .select('fecha, usuario, hora_inicio, created_at, estado')
                .eq('fecha', today)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            setAperturaAudit((aperturaRaw as AperturaAudit | null) || null);

            // Calculate stats - GROSS INCOME (Ingresos Brutos)
            // We only sum positive amounts for "Ingresos". Negative amounts are "Egresos" or "Transfers".
            const pagados = (movs || []).filter((m) => m.estado !== 'anulado');

            const pagadosHoy = pagados.filter(m => {
                const datePart = m.fecha_movimiento || m.fecha_hora.split('T')[0];
                return datePart === today;
            });

            // Sum only positive values for Inkome
            const totalDiaUsd = pagadosHoy.reduce((sum, m) => sum + (m.usd_equivalente && m.usd_equivalente > 0 ? m.usd_equivalente : 0), 0);
            const totalMesUsd = pagados.reduce((sum, m) => sum + (m.usd_equivalente && m.usd_equivalente > 0 ? m.usd_equivalente : 0), 0);

            const pendientes = (movs || []).filter((m) => m.estado === 'pendiente');

            const { count: totalCount } = await supabase
                .from('pacientes')
                .select('id_paciente', { count: 'exact', head: true })
                .eq('is_deleted', false);

            const { count: newCount } = await supabase
                .from('pacientes')
                .select('id_paciente', { count: 'exact', head: true })
                .gte('fecha_alta', `${mesActual}-01`)
                .eq('is_deleted', false);

            setStats({
                totalDiaUsd: Math.round(totalDiaUsd * 100) / 100,
                totalMesUsd: Math.round(totalMesUsd * 100) / 100,
                porMetodo: {},
                porCategoria: {},
                movimientosHoy: pagadosHoy.length,
                pendientes: pendientes.length,
                totalPacientes: totalCount || 0,
                nuevosPacientes: newCount || 0,
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }, [mesActual, today]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    function copyToClipboard(key: string, text: string) {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    }

    function formatPaymentData(key: keyof typeof PAYMENT_DATA): string {
        const data = PAYMENT_DATA[key];
        const lines = [data.label];
        Object.entries(data.details).forEach(([label, value]) => {
            lines.push(`${label}: ${value}`);
        });
        return lines.join('\n');
    }

    function openEditMovimiento(mov: Movimiento) {
        setEditingMov(mov);
        setEditMonto(mov.monto);
        setEditMoneda(mov.moneda);
        setEditMetodo(mov.metodo_pago);
        setEditConcepto(mov.concepto_nombre);
        setEditCategoria(mov.categoria || "");
        setEditEstado(mov.estado);
        setNewFecha(toDateInputValue(mov.fecha_movimiento || mov.fecha_hora));
        setEditMotivo("");
        setEditComprobanteUrl(mov.comprobante_url || null);

        // Format display monto
        const valStr = mov.monto.toString().replace('.', ',');
        const parts = valStr.split(',');
        const formattedInteger = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        setDisplayMonto(formattedInteger + (parts[1] ? ',' + parts[1] : ''));
    }

    async function handleUpdateMovimiento() {
        if (!editingMov) return;
        if (!editMotivo.trim()) {
            // Assuming toast is available, otherwise use alert
            // toast.error("Debe ingresar un motivo para el cambio");
            alert("Debe ingresar un motivo para el cambio");
            return;
        }

        setSavingDate(true);
        try {
            // Log changes before updating
            const currentMovDate = editingMov.fecha_movimiento || editingMov.fecha_hora.split('T')[0];
            if (newFecha !== currentMovDate) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'fecha_movimiento',
                    editingMov.fecha_movimiento || null,
                    newFecha,
                    editMotivo
                );
            }
            if (editMonto !== editingMov.monto) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'monto',
                    editingMov.monto.toString(),
                    editMonto.toString(),
                    editMotivo
                );
            }
            if (editMoneda !== editingMov.moneda) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'moneda',
                    editingMov.moneda,
                    editMoneda,
                    editMotivo
                );
            }
            if (editMetodo !== editingMov.metodo_pago) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'metodo_pago',
                    editingMov.metodo_pago,
                    editMetodo,
                    editMotivo
                );
            }
            if (editConcepto !== editingMov.concepto_nombre) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'concepto_nombre',
                    editingMov.concepto_nombre,
                    editConcepto,
                    editMotivo
                );
            }
            if (editCategoria !== (editingMov.categoria || "")) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'categoria',
                    editingMov.categoria || null,
                    editCategoria,
                    editMotivo
                );
            }
            if (editEstado !== editingMov.estado) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'estado',
                    editingMov.estado,
                    editEstado,
                    editMotivo
                );
            }

            // Security Alert Trigger (if amount or status changed)
            try {
                const isCriticalChange = (editMonto !== editingMov.monto) || (editEstado !== editingMov.estado) || (editMoneda !== editingMov.moneda);
                const isHighAmount = (editMoneda === 'USD' && editMonto >= 50) || (editMoneda === 'ARS' && editMonto >= 10000);

                if (isCriticalChange || isHighAmount) {
                    const { data: { user } } = await supabase.auth.getUser();
                    await sendSecurityAlertAction({
                        userName: user?.email || 'Usuario Desconocido',
                        movementId: editingMov.id,
                        field: editMonto !== editingMov.monto ? 'Monto' : (editEstado !== editingMov.estado ? 'Estado' : 'Moneda'),
                        oldValue: `${editingMov.monto} ${editingMov.moneda} (${editingMov.estado})`,
                        newValue: `${editMonto} ${editMoneda} (${editEstado})`,
                        reason: editMotivo,
                        patientName: editingMov.paciente ? `${editingMov.paciente.apellido}, ${editingMov.paciente.nombre}` : undefined
                    });
                }
            } catch (alertErr) {
                console.error('Error sending security alert:', alertErr);
            }

            const updates: {
                fecha_movimiento: string;
                monto: number;
                moneda: string;
                metodo_pago: string;
                concepto_nombre: string;
                categoria: string;
                estado: string;
                registro_editado: boolean;
                comprobante_url: string | null;
                usd_equivalente?: number;
            } = {
                fecha_movimiento: newFecha,
                monto: editMonto,
                moneda: editMoneda,
                metodo_pago: editMetodo,
                concepto_nombre: editConcepto,
                categoria: editCategoria,
                estado: editEstado,
                registro_editado: true, // Mark as edited
                comprobante_url: editComprobanteUrl
            };

            // Recalculate USD equivalent if amount/currency changed or if it was null
            if (editMoneda === 'USD') {
                updates.usd_equivalente = editMonto;
            } else if (editMoneda === 'ARS' && bnaRate?.venta) {
                updates.usd_equivalente = editMonto / bnaRate.venta;
            }

            const { error } = await supabase
                .from('caja_recepcion_movimientos')
                .update(updates)
                .eq('id', editingMov.id);

            if (error) throw error;

            // Reload data
            await loadData();
            setEditingMov(null);
            setEditMotivo('');
        } catch (err) {
            console.error('Error updating movement:', err);
            alert('Error al guardar los cambios');
        } finally {
            setSavingDate(false);
        }
    }

    // --- Helper for Privacy Mode ---
    const formatPrivacy = (content: React.ReactNode) => {
        if (!privacyMode) return content;
        return <span className="blur-sm select-none">••••</span>;
    };

    // --- Helper for Daily Summary ---
    const getDailySummary = () => {
        const ingresosArs = movimientos.filter(m => m.moneda === 'ARS' && m.estado !== 'anulado' && m.categoria !== 'Egreso').reduce((a, b) => a + b.monto, 0);
        const ingresosUsd = movimientos.filter(m => (m.moneda === 'USD' || m.moneda === 'USDT') && m.estado !== 'anulado' && m.categoria !== 'Egreso').reduce((a, b) => a + b.monto, 0);
        const gastosArs = movimientos.filter(m => m.categoria === 'Egreso' && m.estado !== 'anulado').reduce((a, b) => a + Math.abs(b.monto), 0);
        const movCount = movimientos.filter(m => m.estado !== 'anulado').length;
        const pendingCount = movimientos.filter(m => m.estado === 'pendiente').length;

        const summaryText = `📅 *Reporte Cierre - ${new Date().toLocaleDateString('es-AR')}*

✅ *Ingresos:*
• ARS: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ingresosArs)}
• USD: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ingresosUsd)}

📉 *Gastos/Salidas:*
• ARS: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(gastosArs)}

👥 *Movimientos:* ${movCount}
⚠️ *Pendientes:* ${pendingCount}

_Caja Recepción - AM Clínica_`;

        return summaryText;
    };

    // --- Helper for Receipt ---
    const getReceiptMessage = (mov: Movimiento) => {
        const patientName = mov.paciente ? `${mov.paciente.nombre} ${mov.paciente.apellido}` : 'Paciente General';
        const formattedAmount = new Intl.NumberFormat(mov.moneda === 'ARS' ? 'es-AR' : 'en-US', { style: 'currency', currency: mov.moneda }).format(mov.monto);

        return `🧾 *Comprobante de Pago*
📅 *Fecha:* ${formatDateForLocale(mov.fecha_movimiento || mov.fecha_hora)}
👤 *Paciente:* ${patientName}
💰 *Monto:* ${formattedAmount}
📝 *Concepto:* ${mov.concepto_nombre}

✅ *Estado:* ${mov.estado.toUpperCase()}

Gracias por su visita!
_AM Clínica_`;
    };

    // --- Helper for Collection Reminder ---
    const getCollectionMessage = (mov: Movimiento) => {
        const formattedAmount = new Intl.NumberFormat(mov.moneda === 'ARS' ? 'es-AR' : 'en-US', { style: 'currency', currency: mov.moneda }).format(mov.monto);
        const patientName = mov.paciente ? `${mov.paciente.nombre} ${mov.paciente.apellido}` : 'Paciente';

        return `👋 *Hola ${patientName}! Recordatorio de Saldo*

Te escribimos amablemente de *AM Estética Dental* para recordarte que quedó un saldo pendiente de tu última visita:

🗓 *Fecha:* ${formatDateForLocale(mov.fecha_movimiento || mov.fecha_hora)}
🦷 *Concepto:* ${mov.concepto_nombre}
💰 *Saldo Pendiente:* ${formattedAmount}

Podés abonarlo por transferencia o en tu próxima visita. ¡Gracias! ✨`;
    };

    const isSenaConcept = (concepto: string) => {
        const normalized = (concepto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        return normalized.includes('sena') || normalized.includes('senado') || normalized.includes('anticipo');
    };

    const getSenaFlowMeta = (concepto: string) => {
        const normalized = (concepto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        if (!isSenaConcept(concepto)) return null;

        if (normalized.includes('ortodoncia') || normalized.includes('alineador') || normalized.includes('retenedor')) {
            return {
                label: 'ORTODONCIA',
                className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
            };
        }

        if (normalized.includes('diseno') || normalized.includes('sonrisa') || normalized.includes('carilla')) {
            return {
                label: 'DISENO',
                className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
            };
        }

        if (normalized.includes('cirugia') || normalized.includes('implante') || normalized.includes('injerto')) {
            return {
                label: 'CIRUGIA',
                className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700',
            };
        }

        return {
            label: 'GENERAL',
            className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        };
    };

    const filteredMovimientos = movimientos.filter(mov => {
        const matchesSearch = searchTerm === '' ||
            `${mov.paciente?.nombre} ${mov.paciente?.apellido}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mov.concepto_nombre.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesMetodo = filterMetodo === '' || mov.metodo_pago === filterMetodo;

        return matchesSearch && matchesMetodo;
    });

    return (
        <RoleGuard allowedRoles={['owner', 'admin', 'reception']}>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-white/40 bg-clip-text text-transparent">
                            Caja Recepción
                        </h1>
                        <p className="text-slate-400 font-medium">
                            Gestión inteligente de cobros y pacientes
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Patients Count - The emotional trigger */}
                        <div className="glass-card px-5 py-2.5 rounded-2xl flex items-center gap-4 border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.1)] group transition-all duration-500 hover:border-teal-500/40">
                            <div className="h-10 w-10 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                                <Users className="text-teal-400" size={20} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Total Comunidad</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white">{stats?.totalPacientes?.toLocaleString() || '0'}</span>
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 font-bold border border-teal-500/30 animate-pulse">
                                        +{stats?.nuevosPacientes || 0}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 p-1.5 glass-card rounded-2xl border-white/5">
                            <button
                                onClick={() => {
                                    const summary = getDailySummary();
                                    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
                                }}
                                className="p-2.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-xl transition-all"
                                title="Enviar Cierre del Día"
                            >
                                <Share2 size={20} />
                            </button>

                            <button
                                onClick={() => setPrivacyMode(!privacyMode)}
                                className="p-2.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-xl transition-all"
                                title={privacyMode ? "Mostrar montos" : "Ocultar montos"}
                            >
                                {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>

                        <Link
                            href="/caja-recepcion/tarifario"
                            className="flex items-center gap-2 px-5 py-3 glass-card hover:bg-white/5 rounded-2xl text-slate-200 font-semibold transition-all border-white/10"
                        >
                            <FileText size={18} className="text-teal-400" />
                            Tarifario
                        </Link>

                        <button
                            onClick={() => setShowNuevoIngreso(true)}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-teal-500/20 bg-teal-500 hover:bg-teal-400 hover:scale-[1.03] active:scale-[0.97] text-navy-950"
                        >
                            <Plus size={20} strokeWidth={3} />
                            Nuevo Ingreso
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 mb-8 p-1 rounded-xl" style={{ background: 'hsla(230, 15%, 12%, 0.6)', border: '1px solid hsla(230, 15%, 20%, 0.5)' }}>
                    <button
                        onClick={() => setActiveTab('caja')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'caja' ? '' : 'hover:bg-white/5'}`}
                        style={activeTab === 'caja' ? {
                            background: 'hsla(165, 100%, 42%, 0.12)',
                            color: 'hsl(165, 85%, 50%)',
                            border: '1px solid hsla(165, 100%, 42%, 0.2)',
                        } : { color: 'hsl(230 10% 50%)' }}
                    >
                        <DollarSign size={16} />
                        Caja
                    </button>
                    <button
                        onClick={() => setActiveTab('financiacion')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'financiacion' ? '' : 'hover:bg-white/5'}`}
                        style={activeTab === 'financiacion' ? {
                            background: 'hsla(270, 67%, 55%, 0.12)',
                            color: 'hsl(270, 67%, 65%)',
                            border: '1px solid hsla(270, 67%, 55%, 0.2)',
                        } : { color: 'hsl(230 10% 50%)' }}
                    >
                        <CreditCard size={16} />
                        Financiación
                    </button>
                    <button
                        onClick={() => setActiveTab('contratos')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'contratos' ? '' : 'hover:bg-white/5'}`}
                        style={activeTab === 'contratos' ? {
                            background: 'hsla(165, 100%, 42%, 0.12)',
                            color: 'hsl(165, 85%, 50%)',
                            border: '1px solid hsla(165, 100%, 42%, 0.2)',
                        } : { color: 'hsl(230 10% 50%)' }}
                    >
                        <FileText size={16} />
                        ContratoMaker
                    </button>
                    <button
                        onClick={() => setActiveTab('presentaciones')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'presentaciones' ? '' : 'hover:bg-white/5'}`}
                        style={activeTab === 'presentaciones' ? {
                            background: 'hsla(200, 100%, 55%, 0.12)',
                            color: 'hsl(195, 95%, 68%)',
                            border: '1px solid hsla(200, 100%, 55%, 0.2)',
                        } : { color: 'hsl(230 10% 50%)' }}
                    >
                        <FileImage size={16} />
                        Presentaciones
                    </button>
                </div>

                {/* Tab Content: Financiación */}
                {activeTab === 'financiacion' && <FinanciacionTab />}

                {/* Tab Content: Contratos */}
                {activeTab === 'contratos' && (
                    <ContratosFinanciacionTab initialPatientId={searchParams.get('patientId') || undefined} />
                )}

                {/* Tab Content: Presentaciones */}
                {activeTab === 'presentaciones' && (
                    <PresentacionesSyncTab initialPatientId={searchParams.get('patientId') || undefined} />
                )}

                {/* Tab Content: Caja */}
                {activeTab === 'caja' && (<>

                    {/* Arqueo Panel */}
                    <div className="mb-6">
                        <ArqueoPanel bnaRate={bnaRate?.venta || 0} onArqueoChange={loadData} />
                    </div>

                    {/* BNA Rate Banner */}
                    {bnaRate && (
                        <div className={clsx(
                            "mb-6 p-4 rounded-xl flex items-center justify-between",
                            bnaRate.error || bnaRate.warning
                                ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                                : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                        )}>
                            <div className="flex items-center gap-3">
                                <DollarSign size={20} className={bnaRate.error ? "text-yellow-600" : "text-green-600"} />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        Dólar Banco Nación (Venta): ${bnaRate.venta?.toLocaleString('es-AR') || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Fuente: {bnaRate.fuente} • Actualizado: {new Date(bnaRate.fecha).toLocaleTimeString('es-AR')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href="https://www.bna.com.ar/Personas"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                >
                                    Ver BNA <ExternalLink size={14} />
                                </a>
                                <button
                                    onClick={loadData}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                >
                                    <RefreshCw size={16} className="text-gray-500" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Efectivo en Caja — recuadro principal */}
                    <div className="relative mb-8 overflow-hidden rounded-[2rem] glass-card border-none">
                        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-navy-900/50" />
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-teal-500/10 blur-[100px] rounded-full" />

                        <div className="relative p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="h-20 w-20 rounded-3xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(20,184,166,0.15)] glow-teal">
                                    <DollarSign size={40} className="text-teal-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-teal-400/60 uppercase tracking-[0.2em] mb-1">Efectivo Disponible</p>
                                    <h2 className="text-5xl font-black text-white tracking-tighter">
                                        {formatPrivacy(efectivo ? formatCurrency(efectivo.usd, 'USD') : '—')}
                                    </h2>
                                    {efectivo && efectivo.ars > 0 && (
                                        <p className="text-lg font-bold text-slate-400 mt-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            {formatPrivacy(new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(efectivo.ars))} <span className="text-xs font-medium">ARS</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowTransferencia(true)}
                                    className="flex flex-col items-center justify-center w-24 h-24 rounded-3xl glass-card hover:bg-white/5 border-white/5 transition-all group"
                                >
                                    <ArrowRightLeft size={24} className="text-orange-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Giro</span>
                                </button>
                                <button
                                    onClick={() => setShowNuevoGasto(true)}
                                    className="flex flex-col items-center justify-center w-24 h-24 rounded-3xl glass-card hover:bg-red-500/10 border-white/5 transition-all group"
                                >
                                    <TrendingUp size={24} className="text-red-400 rotate-180 group-hover:translate-y-1 transition-transform" />
                                    <span className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Gasto</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {[
                            { label: 'Ingresos Hoy', value: stats?.totalDiaUsd, icon: DollarSign, color: 'teal', sub: 'Hoy', privacy: true },
                            { label: 'Ingresos Mes', value: stats?.totalMesUsd, icon: TrendingUp, color: 'blue', sub: 'Mes', privacy: true },
                            { label: 'Operaciones', value: stats?.movimientosHoy, icon: CreditCard, color: 'indigo', sub: 'Hoy', privacy: false },
                            { label: 'Pendientes', value: stats?.pendientes, icon: Clock, color: 'amber', sub: 'Action', privacy: false, alert: (stats?.pendientes || 0) > 0 }
                        ].map((card, i) => (
                            <div key={i} className="glass-card p-6 rounded-3xl border-white/5 hover:border-white/10 transition-all group">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={clsx(
                                        "h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                                        card.color === 'teal' ? "bg-teal-500/10 text-teal-400" :
                                            card.color === 'blue' ? "bg-blue-500/10 text-blue-400" :
                                                card.color === 'indigo' ? "bg-indigo-500/10 text-indigo-400" :
                                                    "bg-amber-500/10 text-amber-400"
                                    )}>
                                        <card.icon size={24} />
                                    </div>
                                    {card.alert && (
                                        <span className="flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{card.label}</p>
                                <p className="text-3xl font-black text-white">
                                    {card.privacy
                                        ? formatPrivacy(formatCurrency(Number(card.value) || 0, 'USD'))
                                        : card.value || 0
                                    }
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Main Content Grid */}
                    <div className={clsx(
                        "grid grid-cols-1 gap-6 transition-all duration-300",
                        showSidebar ? "lg:grid-cols-3" : "grid-cols-1"
                    )}>
                        {/* Movements Table */}
                        <div className={clsx(
                            "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-300",
                            showSidebar ? "lg:col-span-2" : "col-span-1"
                        )}>
                            <div className="px-5 py-3 border-b border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-900/20">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                            Auditoria express
                                        </span>
                                        <span className="text-indigo-700 dark:text-indigo-300">Apertura de caja (hoy)</span>
                                    </div>

                                    {aperturaAudit ? (
                                        <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-200">
                                            <span className="font-semibold">{aperturaAudit.usuario || 'Usuario'}</span>
                                            <span>•</span>
                                            <span>
                                                {new Date(aperturaAudit.hora_inicio || aperturaAudit.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className={clsx(
                                                'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                                                aperturaAudit.estado === 'abierto'
                                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
                                                    : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-700'
                                            )}>
                                                {aperturaAudit.estado.toUpperCase()}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-amber-700 dark:text-amber-300 font-medium">Sin apertura registrada hoy</span>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-900/50">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                                    <h3 className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                        Movimientos
                                    </h3>

                                    {/* Notion-style Search Bar */}
                                    <div className="relative flex-1 max-w-sm">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente o concepto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>

                                    {/* Method Filter */}
                                    <div className="relative">
                                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <select
                                            value={filterMetodo}
                                            onChange={(e) => setFilterMetodo(e.target.value)}
                                            className="pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                                        >
                                            <option value="">Todos los métodos</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="MercadoPago">Mercado Pago</option>
                                            <option value="Cripto">Cripto</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                                    </div>
                                </div>

                                {/* Month Selector */}
                                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-4 py-2 border border-gray-200 dark:border-gray-700 shadow-sm">
                                    <Calendar size={18} className="text-blue-500" />
                                    <input
                                        type="month"
                                        value={mesActual}
                                        onChange={(e) => setMesActual(e.target.value)}
                                        className="bg-transparent border-none outline-none text-sm font-medium focus:ring-0 cursor-pointer"
                                    />
                                </div>

                                {/* Sidebar Toggle */}
                                <button
                                    onClick={() => setShowSidebar(!showSidebar)}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all shadow-sm",
                                        showSidebar
                                            ? "bg-blue-50 text-blue-600 border-blue-200"
                                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                    )}
                                    title={showSidebar ? "Expandir lista de ingresos" : "Contraer lista de ingresos"}
                                >
                                    <div className="relative">
                                        <Layout size={18} />
                                        {!showSidebar && (
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                        )}
                                    </div>
                                    <span className="hidden sm:inline">
                                        {showSidebar ? 'Expandir' : 'Contraer'}
                                    </span>
                                </button>
                            </div>

                            {/* Movements Table */}
                            <div className={clsx(
                                "glass-card rounded-3xl overflow-hidden transition-all duration-300",
                                showSidebar ? "lg:col-span-2" : "col-span-1"
                            )}>
                                {movimientos.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-20 text-slate-500">
                                        <div className="h-20 w-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                                            <Clock size={32} className="opacity-20" />
                                        </div>
                                        <p className="font-medium">No hay movimientos registrados</p>
                                        <p className="text-sm opacity-50">Los ingresos aparecerán aquí</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/5 bg-white/2">
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase">Hora / Fecha</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase">Paciente</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase text-center">Concepto</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase">Método</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase text-right">Monto USD</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase text-center">Estado</th>
                                                    <th className="px-6 py-4 text-[10px] font-black tracking-widest text-slate-500 uppercase text-center">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/[0.02]">
                                                {filteredMovimientos.map((mov: Movimiento) => (
                                                    <tr
                                                        key={mov.id}
                                                        className="group hover:bg-white/[0.02] transition-all"
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-black text-white group-hover:text-teal-400 transition-colors">
                                                                    {new Date(mov.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                                                                    {formatDateForLocale(mov.fecha_movimiento || mov.fecha_hora, 'es-AR', { day: '2-digit', month: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {mov.categoria === 'Egreso' ? (
                                                                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                                                    <span className="p-1 bg-red-100 dark:bg-red-900/30 rounded-full">
                                                                        <TrendingUp className="rotate-180" size={14} />
                                                                    </span>
                                                                    <span>Gasto / Salida</span>
                                                                </div>
                                                            ) : mov.categoria === 'Caja' || mov.concepto_nombre.toLowerCase().includes('cierre') || mov.concepto_nombre.toLowerCase().includes('inicio') ? (
                                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold italic">
                                                                    <span className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                                                                        <RefreshCw size={14} />
                                                                    </span>
                                                                    <span>OPERACIÓN CAJA</span>
                                                                </div>
                                                            ) : (
                                                                mov.paciente ? (
                                                                    <Link
                                                                        href={`/patients/${mov.paciente.id_paciente}?tab=financiamiento`}
                                                                        className="group flex flex-col items-start"
                                                                    >
                                                                        <span className="group-hover:text-blue-600 group-hover:underline transition-colors text-blue-600 dark:text-blue-400">
                                                                            {`${mov.paciente.apellido}, ${mov.paciente.nombre}`}
                                                                        </span>
                                                                        {mov.paciente.financ_estado === 'activo' && (
                                                                            <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                                                                Financiación Activa
                                                                            </span>
                                                                        )}
                                                                    </Link>
                                                                ) : '-'
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-slate-300">{mov.concepto_nombre}</span>
                                                                    {isSenaConcept(mov.concepto_nombre) && (
                                                                        <span className="pill-sena">SENA</span>
                                                                    )}
                                                                    {mov.registro_editado && (
                                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                                            EDITADO
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {mov.cuota_nro && mov.cuota_nro > 0 && (
                                                                    <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                                                                        Cuota {mov.cuota_nro} de {mov.cuotas_total || '?'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {mov.metodo_pago}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={clsx(
                                                                "text-lg font-black tracking-tight",
                                                                mov.categoria === 'Egreso' ? "text-rose-500" : "text-white"
                                                            )}>
                                                                {formatPrivacy(formatCurrency(mov.usd_equivalente || mov.monto, 'USD'))}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={clsx(
                                                                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                                                (mov.categoria === 'Caja' || mov.concepto_nombre.toLowerCase().includes('cierre') || mov.concepto_nombre.toLowerCase().includes('inicio'))
                                                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                                    : (
                                                                        mov.estado === 'pagado' ? "bg-teal-500/10 text-teal-400 border-teal-500/20" :
                                                                            mov.estado === 'pendiente' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                                                                "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                                    )
                                                            )}>
                                                                {(mov.categoria === 'Caja' || mov.concepto_nombre.toLowerCase().includes('cierre') || mov.concepto_nombre.toLowerCase().includes('inicio'))
                                                                    ? (mov.concepto_nombre.toLowerCase().includes('cierre') ? 'Cierre' : 'Inicio')
                                                                    : mov.estado}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {mov.registro_editado && (
                                                                    <span title="Este registro ha sido editado">
                                                                        <AlertTriangle size={16} className="text-amber-500" />
                                                                    </span>
                                                                )}
                                                                {mov.origen === 'importado_csv' && (
                                                                    <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                                                                        CSV
                                                                    </span>
                                                                )}
                                                                {mov.comprobante_url && (
                                                                    <ComprobanteLink
                                                                        storedValue={mov.comprobante_url}
                                                                        area="caja-recepcion"
                                                                        className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-600 hover:text-green-700 transition-colors"
                                                                        iconSize={16}
                                                                        label="Ver comprobante adjunto"
                                                                    />
                                                                )}

                                                                {mov.categoria !== 'Egreso' && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => {
                                                                                const isCollection = mov.estado === 'pendiente';
                                                                                const msg = isCollection ? getCollectionMessage(mov) : getReceiptMessage(mov);
                                                                                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                                                                            }}
                                                                            className={clsx(
                                                                                "p-1.5 rounded-lg transition-colors",
                                                                                mov.estado === 'pendiente'
                                                                                    ? "hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 hover:text-amber-600"
                                                                                    : "hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500 hover:text-green-600"
                                                                            )}
                                                                            title={mov.estado === 'pendiente' ? "Enviar Recordatorio de Cobro" : "Enviar Comprobante (texto)"}
                                                                        >
                                                                            <MessageCircle size={16} />
                                                                        </button>
                                                                        {mov.estado === 'pagado' && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setReciboMov(mov);
                                                                                    setIsReciboMinimized(false);
                                                                                }}
                                                                                className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg text-purple-500 hover:text-purple-600 transition-colors"
                                                                                title="Generar Recibo Visual (imagen)"
                                                                            >
                                                                                <FileImage size={16} />
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}
                                                                <button
                                                                    onClick={() => openEditMovimiento(mov)}
                                                                    className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                                                                    title="Editar movimiento (Monto, Fecha, Moneda)"
                                                                >
                                                                    <Pencil size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setHistorialMovId(mov.id)}
                                                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                                                    title="Ver historial de ediciones"
                                                                >
                                                                    <History size={16} />
                                                                </button>
                                                                {(role === 'admin' || role === 'owner' || role === 'developer') && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setDeletingMovId(mov.id);
                                                                            setDeletionConfirmation("");
                                                                            setDeletionReason("");
                                                                        }}
                                                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-400 hover:text-red-600 transition-colors"
                                                                        title="Eliminar movimiento"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Payment Data Panel */}
                            <AnimatePresence>
                                {showSidebar && (
                                    <motion.div
                                        initial={{ opacity: 0, x: 20, width: 0 }}
                                        animate={{ opacity: 1, x: 0, width: 'auto' }}
                                        exit={{ opacity: 0, x: 20, width: 0 }}
                                        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-fit sticky top-6 overflow-hidden"
                                    >
                                        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                            <div>
                                                <h3 className="font-semibold text-gray-900 dark:text-white">Datos para Cobro</h3>
                                                <p className="text-xs text-gray-500 mt-1">Click para copiar</p>
                                            </div>
                                            <button
                                                onClick={() => setShowSidebar(false)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>

                                        <div className="p-4 space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
                                            <div className="space-y-6">
                                                {/* Bancos */}
                                                <div>
                                                    <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                                        <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                                            <Landmark size={18} className="text-red-600 dark:text-red-400" />
                                                        </div>
                                                        Transferencias Bancarias
                                                    </h4>
                                                    <div className="space-y-3 pl-2 border-l-2 border-gray-100 dark:border-gray-700 ml-3">
                                                        {/* Empresa */}
                                                        <div>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pl-3">Empresa (Fullesthetic)</p>
                                                            <div className="space-y-2">
                                                                {['santander_empresa_ars', 'santander_empresa_usd'].map((key) => {
                                                                    const data = PAYMENT_DATA[key];
                                                                    if (!data) return null;
                                                                    return (
                                                                        <div
                                                                            key={key}
                                                                            className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ml-3"
                                                                        >
                                                                            <div
                                                                                className="flex-1 cursor-pointer"
                                                                                onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                                            >
                                                                                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('SANTANDER EMPRESA ', '').replace(' (Factura A)', '')}</p>
                                                                                <p className="text-xs text-gray-500 mt-0.5">{data.details['Cuenta'] || data.details['Alias']}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                {data.qrValue && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                                        }}
                                                                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                                        title="Ver QR"
                                                                                    >
                                                                                        <QrCode size={18} />
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                                    }}
                                                                                    className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                                    title="Enviar por WhatsApp"
                                                                                >
                                                                                    <MessageCircle size={18} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        copyToClipboard(key, formatPaymentData(key));
                                                                                    }}
                                                                                    className={clsx(
                                                                                        "p-2 rounded-lg transition-colors",
                                                                                        copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                                    )}
                                                                                    title="Copiar datos"
                                                                                >
                                                                                    {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Personal */}
                                                        <div>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pl-3">Personal</p>
                                                            <div className="space-y-2">
                                                                {['santander_personal'].map((key) => {
                                                                    const data = PAYMENT_DATA[key];
                                                                    if (!data) return null;
                                                                    return (
                                                                        <div
                                                                            key={key}
                                                                            className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ml-3"
                                                                        >
                                                                            <div
                                                                                className="flex-1 cursor-pointer"
                                                                                onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                                            >
                                                                                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('SANTANDER PERSONAL ', '')}</p>
                                                                                <p className="text-xs text-gray-500 mt-0.5">{data.details['Alias']}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                {data.qrValue && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                                        }}
                                                                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                                        title="Ver QR"
                                                                                    >
                                                                                        <QrCode size={18} />
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                                    }}
                                                                                    className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                                    title="Enviar por WhatsApp"
                                                                                >
                                                                                    <MessageCircle size={18} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        copyToClipboard(key, formatPaymentData(key));
                                                                                    }}
                                                                                    className={clsx(
                                                                                        "p-2 rounded-lg transition-colors",
                                                                                        copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                                    )}
                                                                                    title="Copiar datos"
                                                                                >
                                                                                    {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Mercado Pago */}
                                                <div>
                                                    <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                                            <Smartphone size={18} className="text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        Mercado Pago
                                                    </h4>
                                                    <div className="space-y-2 pl-5">
                                                        {['mp_ars', 'mp_usd'].map((key) => {
                                                            const data = PAYMENT_DATA[key];
                                                            if (!data) return null;
                                                            return (
                                                                <div
                                                                    key={key}
                                                                    className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                                                >
                                                                    <div
                                                                        className="flex-1 cursor-pointer"
                                                                        onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                                    >
                                                                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('MERCADO PAGO ', '')}</p>
                                                                        <p className="text-xs text-gray-500 mt-0.5">{data.details['Alias']}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        {data.qrValue && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                                }}
                                                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                                title="Ver QR"
                                                                            >
                                                                                <QrCode size={18} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                            }}
                                                                            className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                            title="Enviar por WhatsApp"
                                                                        >
                                                                            <MessageCircle size={18} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                copyToClipboard(key, formatPaymentData(key));
                                                                            }}
                                                                            className={clsx(
                                                                                "p-2 rounded-lg transition-colors",
                                                                                copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                            )}
                                                                            title="Copiar datos"
                                                                        >
                                                                            {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Cripto */}
                                                <div>
                                                    <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                                        <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                                            <Bitcoin size={18} className="text-green-600 dark:text-green-400" />
                                                        </div>
                                                        Cripto
                                                    </h4>
                                                    <div className="space-y-2 pl-5">
                                                        {['cripto_usdt'].map((key) => {
                                                            const data = PAYMENT_DATA[key];
                                                            if (!data) return null;
                                                            return (
                                                                <div
                                                                    key={key}
                                                                    className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                                                >
                                                                    <div
                                                                        className="flex-1 cursor-pointer"
                                                                        onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                                    >
                                                                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label}</p>
                                                                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{data.details['Dirección']}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        {data.qrValue && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                                }}
                                                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                                title="Ver QR"
                                                                            >
                                                                                <QrCode size={18} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                            }}
                                                                            className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                            title="Enviar por WhatsApp"
                                                                        >
                                                                            <MessageCircle size={18} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                copyToClipboard(key, formatPaymentData(key));
                                                                            }}
                                                                            className={clsx(
                                                                                "p-2 rounded-lg transition-colors",
                                                                                copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                            )}
                                                                            title="Copiar datos"
                                                                        >
                                                                            {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mensaje base:</p>
                                            <div
                                                className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                onClick={() => copyToClipboard('msg', 'Te paso los datos para realizar la transferencia. Por favor enviá el comprobante luego del pago.')}
                                            >
                                                &quot;Te paso los datos para realizar la transferencia. Por favor enviá el comprobante luego del pago.&quot;
                                                {copiedKey === 'msg' && <CheckCircle size={14} className="inline ml-2 text-green-500" />}
                                            </div>

                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Links útiles (copiar y pegar):</p>
                                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-700">
                                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Referencia Google</p>
                                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 break-all">{GOOGLE_REVIEW_LINK}</p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard('google_review_link', GOOGLE_REVIEW_LINK)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    >
                                                        {copiedKey === 'google_review_link' ? <CheckCircle size={13} className="text-green-500" /> : <Copy size={13} />}
                                                        {copiedKey === 'google_review_link' ? 'Copiado' : 'Copiar link'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(getWhatsappLink(`Gracias por confiar en AM Clinica Dental. Tu experiencia es muy importante para nosotros. Si querés, podés dejarnos tu referencia acá: ${GOOGLE_REVIEW_LINK}`), '_blank')}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                                    >
                                                        <MessageCircle size={13} />
                                                        Compartir por WhatsApp
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Nuevo Ingreso Modal */}
                        {/* Expense Modal */}
                        <NuevoGastoForm
                            isOpen={showNuevoGasto}
                            onClose={() => setShowNuevoGasto(false)}
                            onSuccess={loadData}
                            bnaRate={bnaRate?.venta || 0}
                        />

                        {/* Existing Income Modal */}
                        <NuevoIngresoForm
                            isOpen={showNuevoIngreso}
                            onClose={() => setShowNuevoIngreso(false)}
                            onSuccess={loadData}
                            bnaRate={bnaRate?.venta || 0}
                        />

                        {/* Transferencia Modal */}
                        <TransferenciaAdmin
                            isOpen={showTransferencia}
                            onClose={() => setShowTransferencia(false)}
                            onSuccess={loadData}
                            bnaRate={bnaRate?.venta || 0}
                        />

                        {/* Historial Ediciones Modal */}
                        <HistorialEdicionesModal
                            isOpen={!!historialMovId}
                            onClose={() => setHistorialMovId(null)}
                            registroId={historialMovId || ''}
                            tabla="caja_recepcion_movimientos"
                        />

                        {/* Recibo Visual Modal */}
                        {reciboMov && !isReciboMinimized && (
                            <div
                                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                                onClick={() => setReciboMov(null)}
                            >
                                <div
                                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-xl w-full max-h-[92vh] overflow-hidden flex flex-col"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                                <FileImage size={20} className="text-purple-500" />
                                                Recibo de Pago
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Genera una imagen del recibo para compartir
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setIsReciboMinimized(true)}
                                                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                            >
                                                Minimizar
                                            </button>
                                            <button
                                                onClick={() => setReciboMov(null)}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                            >
                                                <X size={20} className="text-gray-500" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 md:p-6 overflow-y-auto">
                                        <ReciboGenerator
                                            data={{
                                                numero: generateReciboNumber(),
                                                fecha: new Date(reciboMov.fecha_hora),
                                                paciente: reciboMov.paciente
                                                    ? `${reciboMov.paciente.nombre} ${reciboMov.paciente.apellido}`
                                                    : 'Paciente General',
                                                concepto: reciboMov.concepto_nombre,
                                                monto: reciboMov.monto,
                                                moneda: reciboMov.moneda,
                                                metodoPago: reciboMov.metodo_pago,
                                                atendidoPor: 'AM Clínica',
                                            }}
                                            onGenerated={(result) => {
                                                console.log('Recibo generado:', result.imageUrl);
                                            }}
                                            recipientPhone={reciboMov.paciente?.telefono || null}
                                            recipientEmail={reciboMov.paciente?.email || null}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {reciboMov && isReciboMinimized && (
                            <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-[280px]">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Recibo minimizado</p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {reciboMov.paciente
                                                ? `${reciboMov.paciente.nombre} ${reciboMov.paciente.apellido}`
                                                : 'Paciente General'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setReciboMov(null)}
                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    >
                                        <X size={16} className="text-gray-500" />
                                    </button>
                                </div>

                                <button
                                    onClick={() => setIsReciboMinimized(false)}
                                    className="mt-3 w-full px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                    Restaurar recibo
                                </button>
                            </div>
                        )}

                        {/* Edit Date Modal */}

                        {editingMov && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
                                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                Editar movimiento de ingreso
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {editingMov.paciente
                                                    ? `${editingMov.paciente.apellido}, ${editingMov.paciente.nombre}`
                                                    : editingMov.concepto_nombre}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setEditingMov(null)}
                                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <X size={20} className="text-gray-500" />
                                        </button>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        {/* Fecha */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                <Calendar size={14} className="inline mr-2" />
                                                Fecha del movimiento
                                            </label>
                                            <input
                                                type="date"
                                                value={newFecha}
                                                onChange={(e) => setNewFecha(e.target.value)}
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        {/* Monto y Moneda */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Monto
                                                </label>
                                                <input
                                                    type="text"
                                                    value={displayMonto}
                                                    onChange={(e) => {
                                                        // 1. Get raw input (digits and comma only)
                                                        let val = e.target.value.replace(/[^0-9,]/g, '');

                                                        // 2. Handle multiple commas (keep first)
                                                        const parts = val.split(',');
                                                        if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');

                                                        // 3. Format integer part with dots
                                                        const integerPart = parts[0].replace(/\./g, '');
                                                        // Prevent leading zeros unless it's just "0"
                                                        const cleanInteger = integerPart === '' ? '' : Number(integerPart).toString();

                                                        const formattedInteger = cleanInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

                                                        // 4. Reconstruct display value
                                                        let newDisplay = formattedInteger;
                                                        if (val.includes(',')) {
                                                            newDisplay += ',' + (parts[1] || '');
                                                        }

                                                        // 5. Update state
                                                        setDisplayMonto(newDisplay);

                                                        // 6. Update numeric value for logic
                                                        // ARS uses comma as decimal separator, JS uses dot.
                                                        const numericVal = parseFloat(val.replace(',', '.') || '0');
                                                        setEditMonto(numericVal);
                                                    }}
                                                    placeholder="0"
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1 font-mono text-lg"
                                                />
                                                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                                    Equivalente: {
                                                        editMoneda === 'ARS' && bnaRate?.venta
                                                            ? formatCurrency(editMonto / bnaRate.venta, 'USD')
                                                            : formatCurrency(editMonto, 'USD')
                                                    }
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Moneda
                                                </label>
                                                <select
                                                    value={editMoneda}
                                                    onChange={(e) => setEditMoneda(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px]"
                                                >
                                                    <option value="ARS">Pesos (ARS)</option>
                                                    <option value="USD">Dólares (USD)</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Método de Pago */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Método de Pago
                                                </label>
                                                <select
                                                    value={editMetodo}
                                                    onChange={(e) => setEditMetodo(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px]"
                                                >
                                                    <option value="Efectivo">Efectivo</option>
                                                    <option value="Transferencia">Transferencia</option>
                                                    <option value="MercadoPago">Mercado Pago</option>
                                                    <option value="Cripto">Cripto</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Estado
                                                </label>
                                                <select
                                                    value={editEstado}
                                                    onChange={(e) => setEditEstado(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px]"
                                                >
                                                    <option value="pagado">Pagado</option>
                                                    <option value="pendiente">Pendiente</option>
                                                    <option value="anulado">Anulado</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Concepto y Categoría */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Concepto
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editConcepto}
                                                    onChange={(e) => setEditConcepto(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="Ej: Consulta"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Categoría
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editCategoria}
                                                    onChange={(e) => setEditCategoria(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="Ej: Ortodoncia"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-red-600 dark:text-red-400 mb-2 font-bold">
                                                Motivo del cambio (Obligatorio)
                                            </label>
                                            <textarea
                                                value={editMotivo}
                                                onChange={(e) => setEditMotivo(e.target.value)}
                                                placeholder="Explique por qué se realiza este cambio..."
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]"
                                            />
                                        </div>

                                        <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20">
                                            <History size={16} className="shrink-0 mt-0.5" />
                                            <p>Este cambio será recalculado y quedará registrado <strong>permanentemente</strong> en el historial de auditoría.</p>
                                        </div>

                                        {/* Ticket Attachment Section */}
                                        <div className="p-4 border border-blue-100 dark:border-blue-900/30 rounded-xl bg-blue-50/30 dark:bg-blue-900/10 mt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <FileText size={16} className="text-blue-600" />
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    Comprobante de operación
                                                </label>
                                            </div>

                                            <ComprobanteUpload
                                                area="caja-recepcion"
                                                onUploadComplete={(res) => setEditComprobanteUrl(res.url)}
                                                className="w-full"
                                            />

                                            {editComprobanteUrl && (
                                                <div className="mt-2 flex items-center justify-between">
                                                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                        <Check size={12} /> Comprobante adjuntado
                                                    </p>
                                                    <button
                                                        onClick={() => window.open(editComprobanteUrl, '_blank')}
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        Ver actual
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                                        <button
                                            onClick={() => setEditingMov(null)}
                                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleUpdateMovimiento}
                                            disabled={savingDate}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                        >
                                            {savingDate ? 'Guardando...' : 'Guardar Cambios'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* QR Modal */}
                        {qrModal.open && (
                            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setQrModal({ ...qrModal, open: false })}>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center transform transition-all" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                                            {qrModal.title}
                                        </h3>
                                        <button
                                            onClick={() => setQrModal({ ...qrModal, open: false })}
                                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                                        >
                                            <X size={20} className="text-gray-500" />
                                        </button>
                                    </div>

                                    <div className="bg-white p-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 inline-block mb-6 shadow-sm">
                                        <QRCodeSVG
                                            value={qrModal.value}
                                            size={200}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    </div>

                                    <p className="text-sm text-gray-500 mb-6 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg break-all font-mono border border-gray-100 dark:border-gray-700">
                                        {qrModal.value}
                                    </p>

                                    <button
                                        onClick={() => copyToClipboard('qr', qrModal.value)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
                                    >
                                        {copiedKey === 'qr' ? <CheckCircle size={18} /> : <Copy size={18} />}
                                        Copiar código de pago
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Historial Ediciones Modal */}
                        <HistorialEdicionesModal
                            isOpen={!!historialMovId}
                            onClose={() => setHistorialMovId(null)}
                            registroId={historialMovId || ''}
                            tabla="caja_recepcion_movimientos"
                        />
                        {/* Modal de Confirmación de Eliminación */}
                        {deletingMovId && (
                            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-red-100 dark:border-red-900/30"
                                >
                                    <div className="p-6">
                                        <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
                                            <AlertTriangle size={32} />
                                            <h3 className="text-xl font-bold">¡Advertencia Crítica!</h3>
                                        </div>

                                        <p className="text-gray-600 dark:text-gray-300 mb-4">
                                            Está a punto de eliminar un registro financiero. Esta acción es{" "}
                                            <strong>IRREVERSIBLE</strong> y quedará registrada en el
                                            historial de auditoría.
                                        </p>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                                                    Motivo de la eliminación (Obligatorio)
                                                </label>
                                                <textarea
                                                    value={deletionReason}
                                                    onChange={(e) => setDeletionReason(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-red-500 outline-none"
                                                    rows={2}
                                                    placeholder="Ej: Error de carga, registro duplicado..."
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                                                    Para confirmar, escriba{" "}
                                                    <span className="font-mono font-bold select-all">
                                                        ELIMINAR
                                                    </span>{" "}
                                                    abajo:
                                                </label>
                                                <input
                                                    type="text"
                                                    value={deletionConfirmation}
                                                    onChange={(e) => setDeletionConfirmation(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-red-500 font-mono outline-none"
                                                    placeholder="ELIMINAR"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-3 mt-8">
                                            <button
                                                onClick={() => setDeletingMovId(null)}
                                                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (
                                                        deletionConfirmation !== "ELIMINAR" ||
                                                        !deletionReason.trim()
                                                    )
                                                        return;

                                                    const { success, error } = await deleteMovimiento(
                                                        deletingMovId!,
                                                        deletionReason,
                                                    );
                                                    if (success) {
                                                        setDeletingMovId(null);
                                                        loadData();
                                                    } else {
                                                        alert("Error al eliminar: " + error);
                                                    }
                                                }}
                                                disabled={
                                                    deletionConfirmation !== "ELIMINAR" ||
                                                    !deletionReason.trim()
                                                }
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                <Trash2 size={16} />
                                                Confirmar Eliminación
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </div>
                </>)}
            </div>
        </RoleGuard>
    );
}

export default CajaRecepcionContent;
