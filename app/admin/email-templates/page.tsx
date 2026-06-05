import { redirect } from 'next/navigation';

export default function EmailTemplatesRedirectPage() {
    redirect('/admin/emails?tab=templates');
}
