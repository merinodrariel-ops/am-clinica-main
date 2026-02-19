import { getAllWorkers, getWorkerLogs } from '@/app/actions/worker-portal';
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Calculator, FileText, Download } from 'lucide-react';

export default async function AdminLiquidationPage() {
    const workers = await getAllWorkers();

    // In a real implementation, we would use state to manage selected worker/dates
    // essentialy a client component wrapper. For this server component, we just show the structure.

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Staff Liquidation</h1>
                    <p className="text-gray-500 mt-1">Calculate and generate payroll reports for staff.</p>
                </div>
                <Button className="bg-slate-900 text-white gap-2">
                    <FileText size={18} />
                    View History
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Calculator Panel */}
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-6">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Calculator size={20} className="text-blue-500" />
                        Calculator
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Select Worker</label>
                            <select className="w-full p-2.5 rounded-lg border bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
                                <option value="">Choose a worker...</option>
                                {workers.map(w => (
                                    <option key={w.id} value={w.id}>{w.full_name} ({w.role})</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Start Date</label>
                                <Input type="date" className="bg-gray-50 dark:bg-gray-900" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">End Date</label>
                                <Input type="date" className="bg-gray-50 dark:bg-gray-900" />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                Calculate Payout
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Report Preview */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                        <FileText size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Report Generated</h3>
                    <p className="text-gray-500 max-w-sm mt-2">
                        Select a worker and date range to calculate their earnings based on hours, commissions, and fixed rates.
                    </p>
                </div>
            </div>
        </div>
    );
}
