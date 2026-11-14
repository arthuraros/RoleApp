-- REVIEW CANDIDATE: first isolated write slice, not the complete Locais module.
-- Reuses LOCAL_EDIT_FIELDS/RA-11 audited mutation/version requirements.
-- Depends on foundation v2 and read v2. No creation, ownership transfer or
-- administrative blocking is silently mapped onto the partner's visivel flag.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $approval$ BEGIN
  RAISE EXCEPTION 'BLOCKED: approve the exact edit/partner-visibility slice and staging tests';
END $approval$;
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR
    to_regprocedure('roleapp_security.admin_has_capability(text)') IS NULL OR
    to_regprocedure('public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)') IS NULL THEN
   RAISE EXCEPTION 'Trusted installer, foundation v2 and read v2 required';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.locais'::regclass
   AND attname='admin_version' AND NOT attisdropped) OR
   to_regclass('roleapp_security.admin_place_receipts') IS NOT NULL OR
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='roleapp_admin_place_mutate_v2') THEN
   RAISE EXCEPTION 'Version/receipt/RPC collision: do not replace existing objects';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.locais'::regclass AND NOT tgisinternal) THEN
   RAISE EXCEPTION 'Locais now has custom triggers: review their bodies before this slice';
 END IF;
END $preflight$;
GRANT roleapp_admin_executor TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public,roleapp_security TO roleapp_admin_executor;

ALTER TABLE public.locais ADD COLUMN admin_version bigint NOT NULL DEFAULT 1 CHECK(admin_version>0);
-- Version is maintained for partner writes too, without requiring the partner
-- app to submit a new field. Do not use an invented updated_at as concurrency.
CREATE FUNCTION roleapp_security.admin_place_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $function$
BEGIN
 IF TG_OP='INSERT' THEN NEW.admin_version:=1;
 ELSE
  IF current_user IN ('anon','authenticated') AND
    (NEW.id_local IS DISTINCT FROM OLD.id_local OR
     NEW.id_proprietario IS DISTINCT FROM OLD.id_proprietario OR
     NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
   RAISE EXCEPTION 'Local identity/ownership cannot be changed by a client' USING ERRCODE='42501';
  END IF;
  NEW.admin_version:=OLD.admin_version+1;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION roleapp_security.admin_place_version_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_place_version_guard BEFORE INSERT OR UPDATE ON public.locais
 FOR EACH ROW EXECUTE FUNCTION roleapp_security.admin_place_version_guard();
ALTER FUNCTION roleapp_security.admin_place_version_guard() OWNER TO roleapp_admin_executor;

CREATE TABLE roleapp_security.admin_place_receipts (
 actor uuid NOT NULL, idempotency_key uuid NOT NULL,
 payload jsonb NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,idempotency_key)
);
ALTER TABLE roleapp_security.admin_place_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_place_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON roleapp_security.admin_place_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(actor,idempotency_key,payload,response),INSERT(actor,idempotency_key,payload,response)
 ON roleapp_security.admin_place_receipts TO roleapp_admin_executor;
CREATE POLICY admin_executor_receipts_read ON roleapp_security.admin_place_receipts
 FOR SELECT TO roleapp_admin_executor USING(actor=roleapp_security.admin_actor_id());
CREATE POLICY admin_executor_receipts_insert ON roleapp_security.admin_place_receipts
 FOR INSERT TO roleapp_admin_executor WITH CHECK(actor=roleapp_security.admin_actor_id());
GRANT SELECT(admin_version,descricao,telefone,faixa_preco,bairro) ON public.locais TO roleapp_admin_executor;
GRANT UPDATE(nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel)
 ON public.locais TO roleapp_admin_executor;
CREATE POLICY admin_executor_places_update ON public.locais FOR UPDATE TO roleapp_admin_executor
 USING(roleapp_security.admin_has_capability('locais.editar') OR
       roleapp_security.admin_has_capability('locais.visibilidade'))
 WITH CHECK(roleapp_security.admin_has_capability('locais.editar') OR
            roleapp_security.admin_has_capability('locais.visibilidade'));
GRANT INSERT(actor,origin,action,request_id,local_id,subject,reason,details),SELECT(id)
 ON public.roleapp_admin_audit TO roleapp_admin_executor;
CREATE POLICY admin_executor_audit_insert ON public.roleapp_admin_audit
 FOR INSERT TO roleapp_admin_executor WITH CHECK(actor=roleapp_security.admin_actor_id() AND origin='app');
CREATE POLICY admin_executor_audit_receipt ON public.roleapp_admin_audit
 FOR SELECT TO roleapp_admin_executor USING(actor=roleapp_security.admin_actor_id());
DO $sequence$
DECLARE seq regclass := pg_get_serial_sequence('public.roleapp_admin_audit','id')::regclass;
BEGIN
 IF seq IS NULL THEN RAISE EXCEPTION 'Audit identity sequence missing'; END IF;
 EXECUTE format('GRANT USAGE ON SEQUENCE %s TO roleapp_admin_executor',seq);
END $sequence$;

CREATE FUNCTION public.roleapp_admin_place_mutate_v2(
 p_action text, p_id bigint, p_expected_version bigint, p_patch jsonb,
 p_reason text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
 actor_id uuid := roleapp_security.admin_actor_id(); previous_payload jsonb; previous_response jsonb;
 request_payload jsonb; old_row record; result_row record;
 audit_id bigint; result jsonb; entry record;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'READ COMMITTED required';
 END IF;
 PERFORM pg_advisory_xact_lock(7331,20261114);
 IF actor_id IS NULL OR NOT roleapp_security.admin_has_capability(
   CASE p_action WHEN 'editar' THEN 'locais.editar' WHEN 'visibilidade' THEN 'locais.visibilidade' END
 ) THEN RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_id<=0 OR p_expected_version IS NULL OR p_expected_version<1 OR
    p_idempotency_key IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 OR
    p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb THEN
  RAISE EXCEPTION 'Parametros invalidos' USING ERRCODE='22023';
 END IF;
 IF p_action='editar' THEN
  FOR entry IN SELECT key,value FROM jsonb_each(p_patch) LOOP
   IF entry.key NOT IN ('nome','descricao','telefone','faixa_preco','endereco','bairro','cidade_uf') OR
      jsonb_typeof(entry.value) NOT IN ('string','null') OR
      char_length(p_patch->>entry.key)>2000 THEN
    RAISE EXCEPTION 'Campo nao permitido' USING ERRCODE='22023';
   END IF;
  END LOOP;
  IF p_patch ? 'faixa_preco' AND p_patch->>'faixa_preco' IS NOT NULL
     AND p_patch->>'faixa_preco' NOT IN ('$', '$$', '$$$') THEN
   RAISE EXCEPTION 'Faixa de preco invalida' USING ERRCODE='22023';
  END IF;
  IF (p_patch ? 'nome' AND (p_patch->>'nome' IS NULL OR char_length(btrim(p_patch->>'nome')) NOT BETWEEN 1 AND 150)) OR
     (p_patch ? 'endereco' AND (p_patch->>'endereco' IS NULL OR char_length(btrim(p_patch->>'endereco')) NOT BETWEEN 1 AND 255)) THEN
   RAISE EXCEPTION 'Nome/endereco invalidos' USING ERRCODE='22023';
  END IF;
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_patch))<>1 OR
      NOT (p_patch ? 'visivel') OR jsonb_typeof(p_patch->'visivel')<>'boolean' THEN
   RAISE EXCEPTION 'Informe somente visivel boolean' USING ERRCODE='22023';
  END IF;
 END IF;
 request_payload := jsonb_build_object('action',p_action,'id',p_id,'version',p_expected_version,
   'patch',p_patch,'reason',btrim(p_reason));
 SELECT payload,response INTO previous_payload,previous_response
 FROM roleapp_security.admin_place_receipts WHERE actor=actor_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous_payload IS DISTINCT FROM request_payload THEN
   RAISE EXCEPTION 'Idempotency key reused with different content' USING ERRCODE='22023';
  END IF;
  RETURN previous_response;
 END IF;
 SELECT id_local,id_proprietario,nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel,admin_version
 INTO old_row FROM public.locais WHERE id_local=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Local inexistente' USING ERRCODE='P0002'; END IF;
 IF old_row.admin_version<>p_expected_version THEN
  RAISE EXCEPTION 'Local foi alterado; recarregue antes de editar' USING ERRCODE='40001';
 END IF;
 -- Revalidate after waiting for the resource lock. No owner/price/status fields.
 IF NOT roleapp_security.admin_has_capability(
   CASE p_action WHEN 'editar' THEN 'locais.editar' ELSE 'locais.visibilidade' END
 ) THEN RAISE EXCEPTION 'Acesso administrativo revogado' USING ERRCODE='42501'; END IF;
 UPDATE public.locais SET
  nome=CASE WHEN p_patch ? 'nome' THEN btrim(p_patch->>'nome') ELSE nome END,
  descricao=CASE WHEN p_patch ? 'descricao' THEN p_patch->>'descricao' ELSE descricao END,
  telefone=CASE WHEN p_patch ? 'telefone' THEN p_patch->>'telefone' ELSE telefone END,
  faixa_preco=CASE WHEN p_patch ? 'faixa_preco' THEN p_patch->>'faixa_preco' ELSE faixa_preco END,
  endereco=CASE WHEN p_patch ? 'endereco' THEN btrim(p_patch->>'endereco') ELSE endereco END,
  bairro=CASE WHEN p_patch ? 'bairro' THEN p_patch->>'bairro' ELSE bairro END,
  cidade_uf=CASE WHEN p_patch ? 'cidade_uf' THEN p_patch->>'cidade_uf' ELSE cidade_uf END,
  visivel=CASE WHEN p_action='visibilidade' THEN (p_patch->>'visivel')::boolean ELSE visivel END
 WHERE id_local=p_id AND admin_version=p_expected_version
 RETURNING id_local,id_proprietario,nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel,admin_version
 INTO result_row;
 IF NOT FOUND OR result_row.admin_version<>p_expected_version+1 OR
    result_row.id_proprietario IS DISTINCT FROM old_row.id_proprietario THEN
  RAISE EXCEPTION 'Mutacao nao confirmada';
 END IF;
 INSERT INTO public.roleapp_admin_audit(actor,origin,action,local_id,subject,reason,details)
 VALUES(actor_id,'app','local_admin_'||p_action,p_id::text,old_row.id_proprietario,btrim(p_reason),
   jsonb_build_object('idempotency_key',p_idempotency_key,
     'before',to_jsonb(old_row),'after',to_jsonb(result_row))) RETURNING id INTO audit_id;
 IF audit_id IS NULL THEN RAISE EXCEPTION 'Auditoria nao confirmada'; END IF;
 result:=jsonb_build_object('id_local',result_row.id_local::text,
   'version',result_row.admin_version::text,'audit_id',audit_id::text);
 INSERT INTO roleapp_security.admin_place_receipts(actor,idempotency_key,payload,response)
 VALUES(actor_id,p_idempotency_key,request_payload,result);
 IF NOT FOUND THEN RAISE EXCEPTION 'Idempotencia nao confirmada'; END IF;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.roleapp_admin_place_mutate_v2(text,bigint,bigint,jsonb,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_place_mutate_v2(text,bigint,bigint,jsonb,text,uuid) TO authenticated;
ALTER FUNCTION public.roleapp_admin_place_mutate_v2(text,bigint,bigint,jsonb,text,uuid) OWNER TO roleapp_admin_executor;

CREATE FUNCTION public.roleapp_admin_place_edit_detail_v2(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT roleapp_security.admin_has_capability('locais.ler') THEN
  RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501';
 END IF;
 IF p_id IS NULL OR p_id<=0 THEN RAISE EXCEPTION 'ID invalido' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('id_local',id_local::text,'version',admin_version::text,
   'id_proprietario',id_proprietario,'nome',nome,'descricao',descricao,'telefone',telefone,
   'faixa_preco',faixa_preco,'endereco',endereco,'bairro',bairro,'cidade_uf',cidade_uf,'visivel',visivel)
 INTO result FROM public.locais WHERE id_local=p_id;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.roleapp_admin_place_edit_detail_v2(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_place_edit_detail_v2(bigint) TO authenticated;
ALTER FUNCTION public.roleapp_admin_place_edit_detail_v2(bigint) OWNER TO roleapp_admin_executor;
REVOKE CREATE ON SCHEMA public,roleapp_security FROM roleapp_admin_executor;
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
DO $postflight$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid IN ('public.roleapp_admin_place_mutate_v2(text,bigint,bigint,jsonb,text,uuid)'::regprocedure,
                   'public.roleapp_admin_place_edit_detail_v2(bigint)'::regprocedure)
     AND (a.grantee NOT IN (p.proowner,'authenticated'::regrole::oid)
          OR (a.grantee<>p.proowner AND a.is_grantable))) OR
   EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid='roleapp_security.admin_place_receipts'::regclass AND a.grantee<>c.relowner) OR
   EXISTS (SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
    WHERE c.attrelid='roleapp_security.admin_place_receipts'::regclass
     AND (a.grantee<>'roleapp_admin_executor'::regrole OR a.is_grantable OR
          a.privilege_type NOT IN ('SELECT','INSERT'))) OR
   EXISTS (SELECT 1 FROM pg_namespace WHERE has_schema_privilege('roleapp_admin_executor',oid,'CREATE')) OR
   EXISTS (SELECT 1 FROM pg_auth_members m WHERE
    (m.roleid='roleapp_admin_executor'::regrole OR m.member='roleapp_admin_executor'::regrole)
    AND NOT (m.roleid='roleapp_admin_executor'::regrole AND m.member='postgres'::regrole
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) THEN
  RAISE EXCEPTION 'Mutation/default ACL/executor isolation postflight failed';
 END IF;
END $postflight$;
COMMIT;
-- This changes the partner preference only. Administrative moderation must use
-- independent state and all public readers must be reconciled before exposing it.
-- A future detail adapter must return admin_version before enabling this write.
