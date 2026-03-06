import { getClinicalWorkflows, getActiveTreatments } from '@/app/actions/clinical-workflows';
import { KanbanBoard } from '@/components/workflows/KanbanBoard';
import { NewTreatmentModal } from '@/components/workflows/NewTreatmentModal';
import { WorkflowSettingsModal } from '@/components/workflows/WorkflowSettingsModal';
import { WorkflowNotificationsModal } from '@/components/workflows/WorkflowNotificationsModal';
import WorkflowSidebar from '@/components/workflows/WorkflowSidebar';
import LaboratorioPanel from '@/components/laboratorio/LaboratorioPanel';
import type { ClinicalWorkflow, PatientTreatment } from '@/components/workflows/types';
import Link from 'next/link';

function getWorkflowDisplayName(name: string) {
    if (name === 'Ortodoncia Invisible') return 'Diseno de Alineadores Invisibles';
    return name;
}

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; section?: string | string[] }> }) {
    const params = await searchParams;
    const workflows = await getClinicalWorkflows();

    const treatmentWorkflows = workflows.filter((w: ClinicalWorkflow) => w.type === 'treatment');
    const recurrentWorkflows = workflows.filter((w: ClinicalWorkflow) => w.type === 'recurrent');

    const sectionParam = Array.isArray(params.section) ? params.section[0] : params.section;
    const activeSection = sectionParam === 'laboratorio' ? 'laboratorio' : 'kanban';

    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeWorkflowId = tabParam || (treatmentWorkflows.length > 0 ? treatmentWorkflows[0].id : null);

    // Fetch treatments for the selected workflow if exists
    let activeTreatments: PatientTreatment[] = [];
    let activeWorkflow: ClinicalWorkflow | null = null;

    if (activeSection === 'kanban' && activeWorkflowId) {
        activeWorkflow = workflows.find((w: ClinicalWorkflow) => w.id === activeWorkflowId) || null;
        if (activeWorkflow) {
            activeTreatments = (await getActiveTreatments(activeWorkflowId)) || [];
        }
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workflows Clínicos</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {activeSection === 'laboratorio'
                            ? 'Tablero de laboratorio integrado a workflows'
                            : 'Gestion de tratamientos y mantenimientos'}
                        {activeWorkflow ? ` · Activo: ${getWorkflowDisplayName(activeWorkflow.name)}` : ''}
                    </p>
                </div>

                {activeSection === 'kanban' && activeWorkflow && (
                    <div className="flex items-center gap-2">
                        <WorkflowNotificationsModal
                            workflowId={activeWorkflow.id}
                            workflowName={getWorkflowDisplayName(activeWorkflow.name)}
                        />
                        <WorkflowSettingsModal workflow={activeWorkflow} />
                        <NewTreatmentModal
                            workflowId={activeWorkflow.id}
                            workflowName={getWorkflowDisplayName(activeWorkflow.name)}
                            workflowType={activeWorkflow.type}
                            workflowFrequencyMonths={activeWorkflow.frequency_months || null}
                            initialStageId={activeWorkflow.stages[0]?.id || null}
                            workflowStages={activeWorkflow.stages}
                        />
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-2">
                <Link
                    href={activeWorkflowId ? `/workflows?section=kanban&tab=${activeWorkflowId}` : '/workflows?section=kanban'}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activeSection === 'kanban'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
                    }`}
                >
                    Kanban Clinico
                </Link>
                <Link
                    href="/workflows?section=laboratorio"
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activeSection === 'laboratorio'
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
                    }`}
                >
                    Laboratorio
                </Link>
            </div>

            {/* Workflow Tabs (Sidebar-like or Top-bar) */}
            <div className="flex flex-1 overflow-hidden">
                {activeSection === 'kanban' ? (
                    <>
                        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
                            <WorkflowSidebar
                                treatmentWorkflows={treatmentWorkflows}
                                recurrentWorkflows={recurrentWorkflows}
                                activeWorkflowId={activeWorkflowId}
                            />
                        </div>

                        <div className="flex-1 bg-gray-100/50 dark:bg-gray-900/50 relative overflow-hidden flex flex-col">
                            {activeWorkflow ? (
                                <div className="flex-1 overflow-x-auto p-6">
                                    <KanbanBoard
                                        key={activeWorkflow.id}
                                        workflow={activeWorkflow}
                                        initialTreatments={activeTreatments || []}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-500">
                                    Selecciona un workflow para comenzar
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 bg-gray-100/50 dark:bg-gray-900/50 relative overflow-hidden flex flex-col">
                        <LaboratorioPanel embedded />
                    </div>
                )}
            </div>
        </div>
    );
}
