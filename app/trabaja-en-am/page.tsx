import JobApplicationForm from '@/components/job-applications/JobApplicationForm';

export const metadata = {
    title: 'Trabajá con nosotros | Team AM',
    description: 'Postulate para sumarte a AM Estética Dental.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function sourceFromSearchParams(params: Record<string, string | string[] | undefined> = {}) {
    const rawValue = params.source || params.origen || params.pais;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return value === 'uy' || value === 'uruguay' || value === 'web_uy' ? 'web_uy' : 'web_public';
}

export default async function TrabajaEnAmPage({ searchParams }: { searchParams?: SearchParams }) {
    const params = searchParams ? await searchParams : {};
    return <JobApplicationForm initialSource={sourceFromSearchParams(params)} />;
}
