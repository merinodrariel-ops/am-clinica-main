import EmailsAdminClient from '@/components/admin/emails/EmailsAdminClient';
import {
    getEmailProviderStatusAction,
    listEmailMessagesAction,
    listScheduledEmailMessagesAction,
} from '@/app/actions/email-messages';

export const metadata = {
    title: 'Emails | AM Clinica',
};

export default async function EmailsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const params = await searchParams;
    const initialTab = params.tab === 'templates'
        ? 'templates'
        : params.tab === 'scheduled'
            ? 'scheduled'
            : params.tab === 'providers'
                ? 'providers'
                : 'outbox';

    const [rows, scheduledRows, providerStatus] = await Promise.all([
        listEmailMessagesAction({}),
        listScheduledEmailMessagesAction(),
        getEmailProviderStatusAction(),
    ]);

    return (
        <EmailsAdminClient
            initialRows={rows}
            initialScheduledRows={scheduledRows}
            initialProviderStatus={providerStatus}
            initialTab={initialTab}
        />
    );
}
