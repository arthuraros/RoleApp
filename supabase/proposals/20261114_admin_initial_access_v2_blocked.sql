-- REVIEW CANDIDATE. Extends operations/primeiro_admin_guarded.sql.
-- Separate privileged maintenance, never an application endpoint. Not executed.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $approval$ BEGIN
  RAISE EXCEPTION 'BLOCKED: approve the exact target UUID, ticket and initial capabilities separately';
END $approval$;
DO $bootstrap$
DECLARE
  target_user uuid := NULL; -- Explicit verified Auth UUID in an approved copy.
  operator_ticket text := NULL; -- Approved operator/change ticket, 10..2000 chars.
  previous_role text;
  audit_id bigint;
  caps text[] := ARRAY['locais.ler','locais.criar','locais.editar',
    'locais.visibilidade','locais.moderar','administradores.ler','administradores.gerenciar'];
BEGIN
  IF current_user<>'postgres' OR session_user<>current_user OR target_user IS NULL OR
     operator_ticket IS NULL OR char_length(btrim(operator_ticket)) NOT BETWEEN 10 AND 2000 OR
     current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Trusted maintenance, explicit target/ticket and READ COMMITTED required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.user_roles'::regclass,
    'roleapp_security.admin_access'::regclass,'roleapp_security.admin_capability_grants'::regclass,
    'public.roleapp_admin_audit'::regclass) AND relowner<>'postgres'::regrole) THEN
    RAISE EXCEPTION 'Expected installer ownership is missing';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7331,20261114);
  LOCK TABLE roleapp_security.admin_access,roleapp_security.admin_capability_grants,
    public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM roleapp_security.admin_access WHERE principal AND active) THEN
    RAISE EXCEPTION 'A principal already exists; use separately reviewed access management';
  END IF;
  PERFORM 1 FROM auth.users WHERE id=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified Auth account is missing'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=target_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified profile is missing'; END IF;
  SELECT role INTO previous_role FROM public.user_roles WHERE user_id=target_user FOR UPDATE;
  IF previous_role IS NULL OR previous_role NOT IN ('usuario','admin') OR
     EXISTS (SELECT 1 FROM public.locais WHERE id_proprietario=target_user) THEN
    RAISE EXCEPTION 'Do not replace a partner/owner role; review dual-role compatibility first';
  END IF;
  IF EXISTS (SELECT 1 FROM roleapp_security.admin_access WHERE user_id=target_user) THEN
    RAISE EXCEPTION 'Target already has an access record; no implicit replacement';
  END IF;
  UPDATE public.user_roles SET role='admin' WHERE user_id=target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role update was suppressed'; END IF;
  INSERT INTO roleapp_security.admin_access(user_id,active,principal,changed_by,reason)
    VALUES(target_user,true,true,NULL,btrim(operator_ticket));
  INSERT INTO roleapp_security.admin_capability_grants(user_id,capability)
    SELECT target_user,capability FROM unnest(caps) AS selected(capability);
  INSERT INTO public.roleapp_admin_audit(actor,origin,action,subject,reason,details)
    VALUES(NULL,'maintenance','bootstrap_admin',target_user,btrim(operator_ticket),
      jsonb_build_object('db_current_user',current_user,'db_session_user',session_user,
        'previous_role',previous_role,'principal',true,'capabilities',to_jsonb(caps)))
    RETURNING id INTO audit_id;
  IF audit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roleapp_admin_audit WHERE id=audit_id AND origin='maintenance'
      AND action='bootstrap_admin' AND actor IS NULL AND subject=target_user
      AND details->'capabilities'=to_jsonb(caps)
  ) OR NOT EXISTS (
    SELECT 1 FROM roleapp_security.admin_access a JOIN public.user_roles r ON r.user_id=a.user_id
    WHERE a.user_id=target_user AND a.active AND a.principal AND r.role='admin'
  ) OR (SELECT count(*) FROM roleapp_security.admin_capability_grants
        WHERE user_id=target_user AND capability=ANY(caps))<>cardinality(caps) THEN
    RAISE EXCEPTION 'Bootstrap/audit postcondition failed; the complete transaction must roll back';
  END IF;
END $bootstrap$;
COMMIT;
-- Capabilities provision access only after their respective RPCs are installed.
-- This does not activate any client service or provision a partner/local/campaign.
