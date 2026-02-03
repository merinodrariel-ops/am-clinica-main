
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  if (role === 'reception') {
    // Reception main view
    redirect('/caja-recepcion');
  }

  if (role === 'pricing_manager') {
    // Pricing manager main view
    redirect('/caja-recepcion/tarifario');
  }

  // Default for owner, admin, partner_viewer, developer
  redirect('/dashboard');
}
