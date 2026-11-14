-- CANDIDATE: requires foundation v2 and places edit v2 (shared audit policy).
-- Not installed. Source remains blocked; approve a reviewed deployment artifact.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $approval$ BEGIN
 RAISE EXCEPTION 'BLOCKED: access management v2 requires deployment approval';
END $approval$;
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR
   to_regprocedure('roleapp_security.admin_has_capability(text)') IS NULL OR
   to_regclass('roleapp_security.admin_place_receipts') IS NULL OR
   to_regclass('roleapp_security.admin_access_receipts') IS NOT NULL THEN
  RAISE EXCEPTION 'Foundation/edit prerequisites or object collision';
 END IF;
END $preflight$;
GRANT roleapp_admin_executor TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public,roleapp_security TO roleapp_admin_executor;
CREATE TABLE roleapp_security.admin_access_receipts (
 actor uuid NOT NULL, idempotency_key uuid NOT NULL, payload jsonb NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,idempotency_key)
);
ALTER TABLE roleapp_security.admin_access_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_access_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON roleapp_security.admin_access_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(actor,idempotency_key,payload,response),INSERT(actor,idempotency_key,payload,response)
 ON roleapp_security.admin_access_receipts TO roleapp_admin_executor;
CREATE POLICY admin_executor_access_receipt_read ON roleapp_security.admin_access_receipts
 FOR SELECT TO roleapp_admin_executor USING(actor=roleapp_security.admin_actor_id());
CREATE POLICY admin_executor_access_receipt_insert ON roleapp_security.admin_access_receipts
 FOR INSERT TO roleapp_admin_executor WITH CHECK(actor=roleapp_security.admin_actor_id());
GRANT INSERT(user_id,active,principal,changed_by,reason),
 UPDATE(active,changed_by,reason) ON roleapp_security.admin_access TO roleapp_admin_executor;
GRANT INSERT(user_id,capability),DELETE ON roleapp_security.admin_capability_grants TO roleapp_admin_executor;
GRANT INSERT(user_id,role),UPDATE(role) ON public.user_roles TO roleapp_admin_executor;
GRANT SELECT(id_usuario,nome) ON public.usuarios TO roleapp_admin_executor;
GRANT SELECT(id_proprietario) ON public.locais TO roleapp_admin_executor;
CREATE POLICY admin_executor_access_insert ON roleapp_security.admin_access
 FOR INSERT TO roleapp_admin_executor WITH CHECK(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_access_update ON roleapp_security.admin_access
 FOR UPDATE TO roleapp_admin_executor USING(roleapp_security.admin_has_capability('administradores.gerenciar'))
 WITH CHECK(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_capability_insert ON roleapp_security.admin_capability_grants
 FOR INSERT TO roleapp_admin_executor WITH CHECK(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_capability_delete ON roleapp_security.admin_capability_grants
 FOR DELETE TO roleapp_admin_executor USING(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_role_insert ON public.user_roles
 FOR INSERT TO roleapp_admin_executor WITH CHECK(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_role_update ON public.user_roles
 FOR UPDATE TO roleapp_admin_executor USING(roleapp_security.admin_has_capability('administradores.gerenciar'))
 WITH CHECK(roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_access_names ON public.usuarios FOR SELECT TO roleapp_admin_executor
 USING(roleapp_security.admin_has_capability('administradores.ler') OR roleapp_security.admin_has_capability('administradores.gerenciar'));
CREATE POLICY admin_executor_access_owners ON public.locais FOR SELECT TO roleapp_admin_executor
 USING(roleapp_security.admin_has_capability('administradores.gerenciar'));

CREATE FUNCTION public.roleapp_admin_access_read_v2(p_search text DEFAULT '',p_cursor text DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT roleapp_security.admin_has_capability('administradores.ler') THEN
  RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_search IS NULL OR length(p_search)>120 OR p_limit IS DISTINCT FROM 20 OR
   (p_cursor IS NOT NULL AND p_cursor !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Filtro invalido' USING ERRCODE='22023'; END IF;
 WITH candidates AS (
  SELECT a.user_id,a.active,a.principal,a.version,u.nome,
   ARRAY(SELECT g.capability FROM roleapp_security.admin_capability_grants g WHERE g.user_id=a.user_id ORDER BY g.capability) AS capabilities
  FROM roleapp_security.admin_access a LEFT JOIN public.usuarios u ON u.id_usuario=a.user_id
  WHERE (p_cursor IS NULL OR a.user_id>p_cursor::uuid)
   AND (strpos(lower(a.user_id::text),lower(btrim(p_search)))>0 OR strpos(lower(coalesce(u.nome,'')),lower(btrim(p_search)))>0)
  ORDER BY a.user_id LIMIT 21
 ), page AS (SELECT * FROM candidates ORDER BY user_id LIMIT 20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'user_id',user_id,'active',active,'principal',principal,'version',version::text,'nome',nome,'capabilities',capabilities) ORDER BY user_id) FROM page),'[]'::jsonb),
  'next_cursor',CASE WHEN (SELECT count(*) FROM candidates)>20 THEN (SELECT user_id::text FROM page ORDER BY user_id DESC LIMIT 1) END) INTO result;
 RETURN result;
END $fn$;
CREATE FUNCTION public.roleapp_admin_access_detail_v2(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT roleapp_security.admin_has_capability('administradores.ler') THEN
  RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuario invalido' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('user_id',a.user_id,'active',a.active,'principal',a.principal,
  'version',a.version::text,'nome',u.nome,'capabilities',ARRAY(SELECT g.capability
    FROM roleapp_security.admin_capability_grants g WHERE g.user_id=a.user_id ORDER BY g.capability)) INTO result
 FROM roleapp_security.admin_access a LEFT JOIN public.usuarios u ON u.id_usuario=a.user_id WHERE a.user_id=p_user_id;
 RETURN result;
END $fn$;
CREATE FUNCTION public.roleapp_admin_access_mutate_v2(p_action text,p_user_id uuid,p_expected_version bigint,
 p_capabilities text[],p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor_id uuid:=roleapp_security.admin_actor_id(); before_row record; old_role text;
 request_payload jsonb; previous record; result jsonb; audit_id bigint; new_version bigint;
 target_exists boolean; cap text; prior_caps text[]; final_caps text[]; effective_active boolean;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'READ COMMITTED required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(7331,20261114);
 IF actor_id IS NULL OR NOT roleapp_security.admin_has_capability('administradores.gerenciar') OR p_user_id=actor_id THEN
  RAISE EXCEPTION 'Acesso negado ou autoalteracao' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('grant','suspend','revoke') OR p_user_id IS NULL OR p_idempotency_key IS NULL OR
  length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 OR p_capabilities IS NULL OR
  (p_action<>'grant' AND cardinality(p_capabilities)<>0) OR
  (p_expected_version IS NOT NULL AND p_expected_version<=0) THEN
  RAISE EXCEPTION 'Entrada invalida' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_capabilities) c WHERE c IS NULL) OR
  cardinality(p_capabilities)<>(SELECT count(DISTINCT c) FROM unnest(p_capabilities) c) THEN
  RAISE EXCEPTION 'Capacidades invalidas' USING ERRCODE='22023'; END IF;
 FOREACH cap IN ARRAY p_capabilities LOOP
  IF NOT roleapp_security.admin_has_capability(cap) THEN RAISE EXCEPTION 'Capacidade superior' USING ERRCODE='42501'; END IF;
 END LOOP;
 request_payload:=jsonb_build_object('action',p_action,'user_id',p_user_id,'version',p_expected_version,
  'capabilities',ARRAY(SELECT c FROM unnest(p_capabilities) c ORDER BY c),'reason',btrim(p_reason));
 SELECT payload,response INTO previous FROM roleapp_security.admin_access_receipts
  WHERE actor=actor_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='22023'; END IF;
  RETURN previous.response;
 END IF;
 PERFORM 1 FROM public.usuarios WHERE id_usuario=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuario inexistente' USING ERRCODE='P0002'; END IF;
 SELECT role INTO old_role FROM public.user_roles WHERE user_id=p_user_id FOR UPDATE;
 -- Single-role legacy model: do not replace partner role or rights of owners.
 IF old_role IS NOT NULL AND old_role NOT IN ('usuario','admin') OR
  EXISTS(SELECT 1 FROM public.locais WHERE id_proprietario=p_user_id) THEN
  RAISE EXCEPTION 'Preservar papel e recursos do parceiro' USING ERRCODE='42501'; END IF;
 SELECT active,principal,version INTO before_row FROM roleapp_security.admin_access WHERE user_id=p_user_id FOR UPDATE;
 target_exists:=FOUND;
 IF (NOT target_exists AND (p_action<>'grant' OR p_expected_version IS NOT NULL)) OR
  (target_exists AND (p_expected_version IS NULL OR before_row.version<>p_expected_version)) THEN
  RAISE EXCEPTION 'Versao divergente' USING ERRCODE='40001'; END IF;
 IF target_exists AND before_row.principal AND NOT EXISTS(SELECT 1 FROM roleapp_security.admin_access WHERE user_id=actor_id AND principal AND active) THEN
  RAISE EXCEPTION 'Principal requerido' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(capability ORDER BY capability),ARRAY[]::text[]) INTO prior_caps
  FROM roleapp_security.admin_capability_grants WHERE user_id=p_user_id;
 FOREACH cap IN ARRAY prior_caps LOOP
  IF NOT roleapp_security.admin_has_capability(cap) THEN RAISE EXCEPTION 'Alvo possui capacidade superior' USING ERRCODE='42501'; END IF;
 END LOOP;
 -- Leave unchanged capabilities in place: never transiently remove the last manager.
 final_caps:=CASE p_action WHEN 'grant' THEN p_capabilities WHEN 'suspend' THEN prior_caps ELSE ARRAY[]::text[] END;
 effective_active:=p_action='grant';
 IF target_exists THEN
  UPDATE roleapp_security.admin_access SET active=effective_active,changed_by=actor_id,reason=btrim(p_reason)
   WHERE user_id=p_user_id RETURNING version INTO new_version;
 ELSE
  INSERT INTO roleapp_security.admin_access(user_id,active,principal,changed_by,reason)
   VALUES(p_user_id,true,false,actor_id,btrim(p_reason)) RETURNING version INTO new_version;
 END IF;
 IF new_version IS NULL OR new_version<>(CASE WHEN target_exists THEN before_row.version+1 ELSE 1 END) OR
  NOT EXISTS(SELECT 1 FROM roleapp_security.admin_access WHERE user_id=p_user_id AND active=effective_active AND version=new_version) THEN
  RAISE EXCEPTION 'Acesso nao confirmado'; END IF;
 DELETE FROM roleapp_security.admin_capability_grants WHERE user_id=p_user_id AND NOT(capability=ANY(final_caps));
 INSERT INTO roleapp_security.admin_capability_grants(user_id,capability)
  SELECT p_user_id,c FROM unnest(final_caps) c WHERE NOT EXISTS(
   SELECT 1 FROM roleapp_security.admin_capability_grants g WHERE g.user_id=p_user_id AND g.capability=c);
 IF old_role IS NULL THEN
  INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'admin');
 ELSE
  UPDATE public.user_roles SET role=CASE WHEN effective_active THEN 'admin' ELSE 'usuario' END WHERE user_id=p_user_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role=CASE WHEN effective_active THEN 'admin' ELSE 'usuario' END) OR
  (SELECT array_agg(capability ORDER BY capability) FROM roleapp_security.admin_capability_grants WHERE user_id=p_user_id)
   IS DISTINCT FROM (SELECT array_agg(c ORDER BY c) FROM unnest(final_caps) c) THEN
  RAISE EXCEPTION 'Estado final divergente'; END IF;
 INSERT INTO public.roleapp_admin_audit(actor,origin,action,subject,reason,details)
  VALUES(actor_id,'app','admin_access_'||p_action,p_user_id,btrim(p_reason),jsonb_build_object(
   'idempotency_key',p_idempotency_key,'before_role',old_role,'before_capabilities',prior_caps,
   'after_capabilities',final_caps,'active',effective_active,'version',new_version)) RETURNING id INTO audit_id;
 IF audit_id IS NULL THEN RAISE EXCEPTION 'Auditoria nao confirmada'; END IF;
 result:=jsonb_build_object('user_id',p_user_id,'version',new_version::text,'audit_id',audit_id::text);
 INSERT INTO roleapp_security.admin_access_receipts(actor,idempotency_key,payload,response)
  VALUES(actor_id,p_idempotency_key,request_payload,result);
 IF NOT FOUND THEN RAISE EXCEPTION 'Recibo nao confirmado'; END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.roleapp_admin_access_read_v2(text,text,integer),
 public.roleapp_admin_access_detail_v2(uuid),public.roleapp_admin_access_mutate_v2(text,uuid,bigint,text[],text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_access_read_v2(text,text,integer),
 public.roleapp_admin_access_detail_v2(uuid),public.roleapp_admin_access_mutate_v2(text,uuid,bigint,text[],text,uuid) TO authenticated;
ALTER FUNCTION public.roleapp_admin_access_read_v2(text,text,integer) OWNER TO roleapp_admin_executor;
ALTER FUNCTION public.roleapp_admin_access_detail_v2(uuid) OWNER TO roleapp_admin_executor;
ALTER FUNCTION public.roleapp_admin_access_mutate_v2(text,uuid,bigint,text[],text,uuid) OWNER TO roleapp_admin_executor;
REVOKE CREATE ON SCHEMA public,roleapp_security FROM roleapp_admin_executor;
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
COMMIT;
