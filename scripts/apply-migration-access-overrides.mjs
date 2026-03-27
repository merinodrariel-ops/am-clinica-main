import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://ybozzesadqcorvfqpsyo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4'
);

const { error } = await supabase.rpc('query', { sql: `
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_overrides JSONB DEFAULT NULL;
` }).catch(() => ({ error: 'rpc not available' }));

// Fallback: try direct query via REST
const res = await fetch('https://ybozzesadqcorvfqpsyo.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjU0NDg5MCwiZXhwIjoyMDgyMTIwODkwfQ.8XihVtil2IGTq8DQMX2sHPn_blXdKJIeZadjPzrgkH4',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_overrides JSONB DEFAULT NULL;' })
});
console.log(res.status, await res.text());
