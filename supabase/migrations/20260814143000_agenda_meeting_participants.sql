-- Meeting participants for agenda events.
-- A meeting keeps doctor_id as the primary responsible person and can include
-- additional profile participants so daily agendas can fan out correctly.

ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'reunion';

CREATE TABLE IF NOT EXISTS public.agenda_meeting_participants (
    appointment_id uuid NOT NULL REFERENCES public.agenda_appointments(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (appointment_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_agenda_meeting_participants_profile_id
    ON public.agenda_meeting_participants(profile_id);

ALTER TABLE public.agenda_meeting_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_meeting_participants_select_authenticated" ON public.agenda_meeting_participants;
CREATE POLICY "agenda_meeting_participants_select_authenticated"
    ON public.agenda_meeting_participants
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "agenda_meeting_participants_insert_staff" ON public.agenda_meeting_participants;
CREATE POLICY "agenda_meeting_participants_insert_staff"
    ON public.agenda_meeting_participants
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND categoria IN ('owner', 'admin', 'reception', 'developer')
        )
    );

DROP POLICY IF EXISTS "agenda_meeting_participants_delete_staff" ON public.agenda_meeting_participants;
CREATE POLICY "agenda_meeting_participants_delete_staff"
    ON public.agenda_meeting_participants
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND categoria IN ('owner', 'admin', 'reception', 'developer')
        )
    );
