#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { buildCommandHelp } from '../lib/admin-agent/core';
import { runAdminAgentCommand, type SupabaseLike } from '../lib/admin-agent/service';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

function createServiceClient(): SupabaseLike {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }) as unknown as SupabaseLike;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        console.log(buildCommandHelp());
        return;
    }

    const operatorEmail = process.env.AM_AGENT_OPERATOR_EMAIL;
    if (!operatorEmail) {
        throw new Error('Missing AM_AGENT_OPERATOR_EMAIL');
    }

    const result = await runAdminAgentCommand({
        supabase: createServiceClient(),
        operatorEmail,
    }, args);

    if (typeof result === 'string') {
        console.log(result);
        return;
    }

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(`[am-admin-agent] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
