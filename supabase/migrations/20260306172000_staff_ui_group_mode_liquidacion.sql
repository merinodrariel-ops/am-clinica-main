-- Allow new staff grouping mode used by UI
ALTER TABLE public.staff_ui_preferences
    DROP CONSTRAINT IF EXISTS staff_ui_preferences_group_mode_check;

ALTER TABLE public.staff_ui_preferences
    ADD CONSTRAINT staff_ui_preferences_group_mode_check
    CHECK (group_mode IN ('role', 'company', 'access', 'compliance', 'liquidacion'));
