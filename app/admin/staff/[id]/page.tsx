import { getWorkerById, getWorkerAchievements, getWorkerLiquidations, getWorkerXP, getAllGoals, getGoalProgress } from '@/app/actions/worker-portal';
import { notFound } from 'next/navigation';
import StaffDetailView from '@/components/admin/StaffDetailView';

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const worker = await getWorkerById(id);
    if (!worker) notFound();

    let achievements: any[] = [];
    let liquidations: any[] = [];
    let totalXP = 0;
    let goals: any[] = [];
    let progressList: any[] = [];

    try {
        [achievements, liquidations, totalXP, goals, progressList] = await Promise.all([
            getWorkerAchievements(worker.id),
            getWorkerLiquidations(worker.id),
            getWorkerXP(worker.id),
            getAllGoals(worker.area),
            getGoalProgress(worker.id),
        ]);
    } catch (error) {
        console.error(`Error loading details for worker ${id}:`, error);
        // We continue with empty states to allow the page to render basic info
    }

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
