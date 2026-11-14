-- NON-DESTRUCTIVE ROLLBACK CANDIDATE. Separate explicit approval required.
-- Stop the new endpoints without deleting resources, capabilities or audit.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $approval$ BEGIN
 RAISE EXCEPTION 'BLOCKED: approve emergency endpoint revocation separately';
END $approval$;
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR NOT EXISTS (
  SELECT 1 FROM pg_auth_members WHERE roleid='roleapp_admin_executor'::regrole
   AND member='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option
 ) THEN RAISE EXCEPTION 'Expected trusted role administrator required'; END IF;
END $preflight$;
GRANT roleapp_admin_executor TO postgres WITH SET TRUE;
SET LOCAL ROLE roleapp_admin_executor;
DO $revoke$
DECLARE signature text; target regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)',
  'public.roleapp_admin_place_mutate_v2(text,bigint,bigint,jsonb,text,uuid)',
  'public.roleapp_admin_place_edit_detail_v2(bigint)',
  'public.roleapp_admin_access_read_v2(text,text,integer)',
  'public.roleapp_admin_access_detail_v2(uuid)',
  'public.roleapp_admin_access_mutate_v2(text,uuid,bigint,text[],text,uuid)',
  'public.roleapp_admin_campaigns_read_v2(text,text,bigint,uuid,text,integer)',
  'public.roleapp_admin_campaign_detail_v2(bigint)',
  'public.roleapp_admin_campaign_mutate_v2(text,text,uuid,bigint,bigint,bigint,uuid,jsonb)'
 ] LOOP
  target:=to_regprocedure(signature);
  IF target IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=target AND proowner=current_user::regrole) THEN
    RAISE EXCEPTION 'Unexpected endpoint owner: %',signature;
   END IF;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',target);
  END IF;
 END LOOP;
END $revoke$;
RESET ROLE;
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
COMMIT;
-- Keep the app unavailable. Investigate before a separately reviewed re-grant.
-- Keep version columns/receipts/audit/principal protection intact, including
-- partner version maintenance. Do not drop shared objects, grants or policies.
