-- Migration: 20260306010000_fix_log_audit_event_id.sql
-- Description: Fix dynamic reference to ID in log_audit_event for tables like pacientes

CREATE OR REPLACE FUNCTION public.log_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _user_id UUID;
  _categoria TEXT;
  _email TEXT;
  _record_id TEXT;
  _old_values JSONB;
  _new_values JSONB;
  _key TEXT;
  _ignore_fields TEXT[] := ARRAY['updated_at', 'created_at', 'last_modified'];
BEGIN
  _user_id := auth.uid();
  
  BEGIN
    SELECT categoria, email INTO _categoria, _email FROM public.profiles WHERE id = _user_id;
  EXCEPTION WHEN OTHERS THEN
    _categoria := 'system';
    _email := 'system';
  END;

  IF (TG_OP = 'DELETE') THEN
    _record_id := COALESCE((to_jsonb(OLD)->>'id_paciente'), (to_jsonb(OLD)->>'id'), 'unknown');
    INSERT INTO public.audit_logs (user_id, user_email, categoria, action, table_name, record_id, old_data, metadata)
    VALUES (_user_id, _email, _categoria, 'DELETE', TG_TABLE_NAME, _record_id, to_jsonb(OLD), jsonb_build_object('level', 'critical', 'permanent', true));
    RETURN OLD;
  ELSIF (TG_OP = 'INSERT') THEN
    _record_id := COALESCE((to_jsonb(NEW)->>'id_paciente'), (to_jsonb(NEW)->>'id'), 'unknown');
    INSERT INTO public.audit_logs (user_id, user_email, categoria, action, table_name, record_id, metadata)
    VALUES (_user_id, _email, _categoria, 'INSERT', TG_TABLE_NAME, _record_id, jsonb_build_object('level', 'info'));
    RETURN NEW;
  ELSE
    _old_values := '{}'::jsonb;
    _new_values := '{}'::jsonb;
    FOR _key IN SELECT jsonb_object_keys(to_jsonb(NEW)) LOOP
      IF _key = ANY(_ignore_fields) THEN CONTINUE; END IF;
      IF (to_jsonb(OLD) -> _key) IS DISTINCT FROM (to_jsonb(NEW) -> _key) THEN
        _old_values := _old_values || jsonb_build_object(_key, to_jsonb(OLD) -> _key);
        _new_values := _new_values || jsonb_build_object(_key, to_jsonb(NEW) -> _key);
      END IF;
    END LOOP;
    IF _old_values = '{}'::jsonb THEN RETURN NEW; END IF;
    _record_id := COALESCE((to_jsonb(NEW)->>'id_paciente'), (to_jsonb(NEW)->>'id'), 'unknown');
    INSERT INTO public.audit_logs (user_id, user_email, categoria, action, table_name, record_id, old_data, new_data, metadata)
    VALUES (_user_id, _email, _categoria, 'UPDATE', TG_TABLE_NAME, _record_id, _old_values, _new_values, jsonb_build_object('level', 'standard', 'changed_fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(_new_values) AS k)));
    RETURN NEW;
  END IF;
END;
$function$;
