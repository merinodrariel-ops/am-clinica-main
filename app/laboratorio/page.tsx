import { redirect } from 'next/navigation';

export default function LaboratorioPage() {
    redirect('/workflows?section=laboratorio');
}
