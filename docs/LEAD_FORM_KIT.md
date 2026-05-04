# Lead Form Kit — Página Web AM Estética Dental

> Kit completo para integrar un formulario de leads en el sitio web público que envíe los datos al Supabase de AM Clínica.
>
> **Backend listo:** tabla `marketing_leads` ya existe, RLS configurada con policy específica para `anon` que solo permite INSERT (no lectura, no modificación, no borrado).

---

## 1. Variables de entorno

Agregar al `.env.local` del proyecto del sitio web:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ybozzesadqcorvfqpsyo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3p6ZXNhZHFjb3J2ZnFwc3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1NDQ4OTAsImV4cCI6MjA4MjEyMDg5MH0.QfChgi5stid2NPoGZJmyC9YXLofc6GjH9Z13X8kYn_E
```

> ⚠️ **Importante:** la `anon key` es pública (va al cliente). La `service_role` key NO se comparte y NO se usa en el sitio público.

---

## 2. Instalar dependencia

```bash
npm install @supabase/supabase-js
```

---

## 3. Cliente Supabase

`lib/supabase-client.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false }, // no necesitamos sesiones en el sitio público
  }
);
```

---

## 4. Schema de la tabla `marketing_leads`

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `full_name` | text | **Sí** | 2-200 caracteres |
| `email` | text | uno entre email/whatsapp | ≤200 chars, único en la tabla |
| `whatsapp` | text | uno entre email/whatsapp | ≤50 chars |
| `neighborhood` | text | No | barrio/ciudad |
| `interest_tags` | text[] | No | array de tratamientos (ver lista abajo) |
| `notes` | text | No | mensaje libre, ≤2000 chars |
| `metadata` | jsonb | No | extra info (utm_source, página origen, etc.) |
| `origin` | text | **Sí** | identificador de origen — usar `'web_form_amesteticadental'` |

---

## 5. Tratamientos (interest_tags) — valores sugeridos

Usar slugs en minúscula, sin espacios:

```ts
export const TRATAMIENTOS = [
  { value: 'ortodoncia',          label: 'Ortodoncia (brackets)' },
  { value: 'ortodoncia_invisible',label: 'Ortodoncia invisible' },
  { value: 'implantes',           label: 'Implantes dentales' },
  { value: 'carillas',            label: 'Carillas estéticas' },
  { value: 'blanqueamiento',      label: 'Blanqueamiento' },
  { value: 'limpieza',            label: 'Limpieza / Profilaxis' },
  { value: 'protesis',            label: 'Prótesis' },
  { value: 'endodoncia',          label: 'Endodoncia (tratamiento de conducto)' },
  { value: 'periodoncia',         label: 'Periodoncia (encías)' },
  { value: 'estetica_general',    label: 'Estética dental general' },
  { value: 'urgencia',            label: 'Urgencia / Dolor' },
  { value: 'otro',                label: 'Otro / No estoy seguro' },
] as const;

export type TratamientoSlug = typeof TRATAMIENTOS[number]['value'];
```

---

## 6. Función de envío

`lib/leads.ts`:

```ts
import { supabase } from './supabase-client';

export interface LeadInput {
  fullName: string;
  email?: string;
  whatsapp?: string;
  neighborhood?: string;
  interestTags?: string[];   // slugs de TRATAMIENTOS
  message?: string;
  metadata?: Record<string, unknown>; // utm, página origen, etc.
}

export interface LeadResult {
  success: boolean;
  alreadyExists?: boolean;   // si el email ya estaba registrado
  error?: string;
}

export async function submitLead(input: LeadInput): Promise<LeadResult> {
  // Validación cliente
  const fullName = input.fullName?.trim();
  if (!fullName || fullName.length < 2) {
    return { success: false, error: 'Por favor ingresá tu nombre completo' };
  }
  if (fullName.length > 200) {
    return { success: false, error: 'Nombre demasiado largo' };
  }
  const email = input.email?.trim().toLowerCase() || null;
  const whatsapp = input.whatsapp?.trim() || null;
  if (!email && !whatsapp) {
    return { success: false, error: 'Necesitamos email o WhatsApp para contactarte' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Email inválido' };
  }
  const message = input.message?.trim() || null;
  if (message && message.length > 2000) {
    return { success: false, error: 'Mensaje demasiado largo' };
  }

  const { error } = await supabase.from('marketing_leads').insert({
    full_name: fullName,
    email,
    whatsapp,
    neighborhood: input.neighborhood?.trim() || null,
    interest_tags: input.interestTags ?? [],
    notes: message,
    metadata: input.metadata ?? {},
    origin: 'web_form_amesteticadental',
  });

  if (error) {
    // 23505 = unique_violation (email ya registrado)
    if (error.code === '23505') {
      return { success: true, alreadyExists: true };
    }
    console.error('submitLead error:', error);
    return { success: false, error: 'No pudimos enviar el formulario. Intentá de nuevo.' };
  }

  return { success: true };
}
```

---

## 7. Componente de form (referencia, sin estilos)

Estructura base. **Adaptar al design system del sitio** (Tailwind, fuentes, colores propios).

```tsx
'use client';
import { useState } from 'react';
import { submitLead } from '@/lib/leads';
import { TRATAMIENTOS } from '@/lib/tratamientos';

export function LeadForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await submitLead({
      fullName,
      email,
      whatsapp,
      interestTags: tags,
      message,
      metadata: {
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        referrer: typeof document !== 'undefined' ? document.referrer : null,
        // Si usás UTMs, leerlos de los searchParams y mandarlos acá
      },
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? 'Error desconocido');
      return;
    }

    setDone(true);
  }

  function toggleTag(slug: string) {
    setTags(prev => prev.includes(slug) ? prev.filter(t => t !== slug) : [...prev, slug]);
  }

  if (done) {
    return (
      <div role="status">
        <h3>¡Gracias!</h3>
        <p>Recibimos tu mensaje. Te vamos a contactar pronto.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label>
        Nombre completo *
        <input
          type="text"
          required
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          maxLength={200}
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          maxLength={200}
          placeholder="tu@email.com"
        />
      </label>

      <label>
        WhatsApp
        <input
          type="tel"
          value={whatsapp}
          onChange={e => setWhatsapp(e.target.value)}
          maxLength={50}
          placeholder="+54 9 11 ..."
        />
      </label>

      <fieldset>
        <legend>¿Qué tratamiento te interesa? (podés elegir varios)</legend>
        {TRATAMIENTOS.map(t => (
          <label key={t.value}>
            <input
              type="checkbox"
              checked={tags.includes(t.value)}
              onChange={() => toggleTag(t.value)}
            />
            {t.label}
          </label>
        ))}
      </fieldset>

      <label>
        Mensaje (opcional)
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Contanos qué necesitás..."
        />
      </label>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Enviando...' : 'Enviar consulta'}
      </button>

      <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>
        Al enviar aceptás que te contactemos por email o WhatsApp.
      </p>
    </form>
  );
}
```

---

## 8. Validaciones que hace el servidor (RLS policy)

La policy en Supabase **rechaza el INSERT** si:

- `full_name` es null o tiene menos de 2 o más de 200 chars
- No se manda al menos uno entre `email` y `whatsapp`
- `email` > 200 chars
- `whatsapp` > 50 chars
- `notes` > 2000 chars
- `origin` es null

Por eso **siempre** mandar `origin: 'web_form_amesteticadental'`.

---

## 9. Tracking de UTMs / origen (opcional pero recomendado)

Antes de enviar, leer parámetros UTM y mandarlos en `metadata`:

```ts
function getUTMs(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const utms: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const val = params.get(key);
    if (val) utms[key] = val;
  }
  return utms;
}

// Al hacer submit:
metadata: {
  ...getUTMs(),
  page: window.location.pathname,
  referrer: document.referrer,
},
```

Esto permite que el equipo de marketing analice de dónde vienen los leads (Google Ads, IG, orgánico, etc.) sin pedir nada al usuario.

---

## 10. Anti-spam (recomendado)

La policy ya bloquea inserts inválidos, pero para evitar bots conviene agregar **uno** de estos:

**Opción A — Honeypot (más simple):**

```tsx
<input
  type="text"
  name="website"
  tabIndex={-1}
  autoComplete="off"
  style={{ position: 'absolute', left: '-9999px' }}
  onChange={e => setHoneypot(e.target.value)}
/>

// Antes de submit:
if (honeypot) return; // bot detectado, ignorar silenciosamente
```

**Opción B — Cloudflare Turnstile** (mejor pero requiere cuenta CF):
- Gratuito
- Sin captchas visibles para el usuario en la mayoría de los casos
- Verificar el token en una API route antes de hacer el insert

---

## 11. Lo que NO hace este kit

- ❌ No envía email de confirmación al lead → hacerlo desde el dashboard de la clínica o Resend
- ❌ No notifica por WhatsApp/email a la clínica → se puede agregar con un Database Webhook en Supabase que dispare a `/api/notify-lead`
- ❌ No tiene autocompletado de barrios → si lo querés, podés cargar un array de barrios

---

## 12. Verificar que funciona

Después de instalar todo, hacer un envío de prueba y verificar en este proyecto (`am-clinica-main`):

1. Entrar a Supabase Dashboard → Table Editor → `marketing_leads`
2. Buscar el registro recién creado
3. Verificar que `origin = 'web_form_amesteticadental'`

O desde acá con SQL:

```sql
SELECT id, full_name, email, whatsapp, interest_tags, origin, created_at
FROM marketing_leads
WHERE origin = 'web_form_amesteticadental'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 13. Funnel completo (referencia)

```
Visitante web
    ↓ completa form
marketing_leads (origin: web_form_amesteticadental)
    ↓ recepción/marketing los contacta
    ↓ agendan + pagan primera consulta
pacientes (como_nos_conocio: 'web')
    ↓ asistencia + tratamientos
agenda_appointments / prestaciones / caja_recepcion_movimientos
```

El form de este kit cubre solo la primera etapa. El resto del funnel ya está implementado en `am-clinica-main`.
