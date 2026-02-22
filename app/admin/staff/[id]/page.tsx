import { getWorkerById, getWorkerAchievements, getWorkerLiquidations, getWorkerXP, getAllGoals, getGoalProgress } from '@/app/actions/worker-portal';
import { notFound } from 'next/navigation';
import StaffDetailView from '@/components/admin/StaffDetailView';

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const worker = await getWorkerById(id);
    if (!worker) notFound();

    const [achievements, liquidations, totalXP, goals, progressList] = await Promise.all([
        getWorkerAchievements(worker.id),
        getWorkerLiquidations(worker.id),
        getWorkerXP(worker.id),
        getAllGoals(worker.rol),
        getGoalProgress(worker.id),
    ]);

    return (
        <StaffDetailView
            worker={worker}
            achievements={achievements}
            liquidations={liquidations}
            totalXP={totalXP}
            goals={goals}
            progressList={progressList}
        />
    );
}
