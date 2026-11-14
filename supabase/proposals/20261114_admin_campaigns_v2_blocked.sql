-- Incremental candidate derived from partner_access_hardening and 04_campanhas.
-- Includes an explicit RLS/ACL cut: requires compatibility review before approval.
-- No plan/quota/payment rule is invented. Compare real commercial function bodies
-- before approving this candidate; approved_local_owner and offers remain authoritative.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $approval$ BEGIN
 RAISE EXCEPTION 'BLOCKED: campaigns v2 requires commercial review and deployment approval';
END $approval$;
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR
  to_regclass('roleapp_security.admin_place_receipts') IS NULL OR
  to_regclass('roleapp_security.admin_campaign_receipts') IS NOT NULL OR
  NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='roleapp_security.approved_local_owner(text,uuid)'::regprocedure
   AND md5(pg_get_functiondef(oid))='aad1f923b329d9ace18480294dedd42a') OR
  NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.solicitar_campanha_segura(text,text,text,text,text[],text,integer,integer)'::regprocedure
   AND md5(pg_get_functiondef(oid))='4b0e353fe000c0bcdfc36ad68b22d50c') THEN
  RAISE EXCEPTION 'Foundation/edit/commercial dependency differs from supplied catalog'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.campanhas_impulsionamento'::regclass AND NOT tgisinternal) OR
  EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.campanhas_impulsionamento'::regclass) THEN
  RAISE EXCEPTION 'Unexpected existing campaign trigger/policy; reconcile incrementally'; END IF;
END $preflight$;
GRANT roleapp_admin_executor TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public,roleapp_security TO roleapp_admin_executor;
LOCK TABLE public.campanhas_impulsionamento IN ACCESS EXCLUSIVE MODE;
-- Legacy role-only activation must not bypass the new per-capability RPC.
REVOKE EXECUTE ON FUNCTION public.ativar_campanha_segura(text,text) FROM PUBLIC,anon,authenticated;
-- Preserve partner SELECT; mutation is already performed through existing RPCs.
-- Do not grant anon direct campaign data; public discovery uses its existing RPC.
ALTER TABLE public.campanhas_impulsionamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campanhas_impulsionamento FROM PUBLIC,anon,authenticated;
DO $column_acl$ DECLARE col record; BEGIN
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.campanhas_impulsionamento'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE ALL (%I) ON public.campanhas_impulsionamento FROM PUBLIC,anon,authenticated',col.attname);
 END LOOP;
END $column_acl$;
GRANT SELECT ON public.campanhas_impulsionamento TO authenticated;
CREATE POLICY campaign_partner_read_v2 ON public.campanhas_impulsionamento FOR SELECT TO authenticated
 USING(id_usuario=(SELECT auth.uid()) AND roleapp_security.partner_owns(id_local::text));
ALTER TABLE public.campanhas_impulsionamento ADD COLUMN admin_version bigint NOT NULL DEFAULT 1 CHECK(admin_version>0);
CREATE FUNCTION roleapp_security.admin_campaign_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN NEW.admin_version:=1;
 ELSE NEW.admin_version:=OLD.admin_version+1; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION roleapp_security.admin_campaign_version_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_campaign_version_guard BEFORE INSERT OR UPDATE ON public.campanhas_impulsionamento
 FOR EACH ROW EXECUTE FUNCTION roleapp_security.admin_campaign_version_guard();
ALTER FUNCTION roleapp_security.admin_campaign_version_guard() OWNER TO roleapp_admin_executor;
CREATE TABLE roleapp_security.admin_campaign_receipts (
 actor uuid NOT NULL,idempotency_key uuid NOT NULL,payload jsonb NOT NULL,response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,idempotency_key)
);
CREATE TABLE roleapp_security.admin_campaign_approvals (
 id_campanha bigint PRIMARY KEY REFERENCES public.campanhas_impulsionamento ON DELETE CASCADE,
 approved_version bigint NOT NULL,actor uuid NOT NULL,audit_id bigint NOT NULL REFERENCES public.roleapp_admin_audit
);
ALTER TABLE roleapp_security.admin_campaign_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_campaign_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_campaign_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_campaign_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON roleapp_security.admin_campaign_receipts,roleapp_security.admin_campaign_approvals FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(actor,idempotency_key,payload,response),INSERT(actor,idempotency_key,payload,response)
 ON roleapp_security.admin_campaign_receipts TO roleapp_admin_executor;
GRANT SELECT,INSERT,UPDATE ON roleapp_security.admin_campaign_approvals TO roleapp_admin_executor;
CREATE POLICY campaign_receipt_read_v2 ON roleapp_security.admin_campaign_receipts FOR SELECT TO roleapp_admin_executor
 USING(actor=roleapp_security.admin_actor_id());
CREATE POLICY campaign_receipt_insert_v2 ON roleapp_security.admin_campaign_receipts FOR INSERT TO roleapp_admin_executor
 WITH CHECK(actor=roleapp_security.admin_actor_id());
CREATE POLICY campaign_approval_v2 ON roleapp_security.admin_campaign_approvals TO roleapp_admin_executor USING(true) WITH CHECK(true);
GRANT SELECT(id_campanha,id_local,id_usuario,tipo,titulo,mensagem,interesses,faixa_etaria,raio_km,
 duracao_dias,valor_total,status,alcance,data_inicio,data_fim,created_at,admin_version)
 ON public.campanhas_impulsionamento TO roleapp_admin_executor;
GRANT INSERT(id_local,id_usuario,tipo,titulo,mensagem,interesses,faixa_etaria,raio_km,duracao_dias,valor_total,status,data_inicio,data_fim),
 UPDATE(tipo,titulo,mensagem,interesses,faixa_etaria,raio_km,duracao_dias,valor_total,status,data_inicio,data_fim)
 ON public.campanhas_impulsionamento TO roleapp_admin_executor;
GRANT SELECT(tipo,duracao_dias,valor_total,active) ON roleapp_security.campaign_offers TO roleapp_admin_executor;
GRANT UPDATE(active) ON roleapp_security.campaign_offers TO roleapp_admin_executor;
CREATE POLICY campaign_offers_admin_v2 ON roleapp_security.campaign_offers FOR SELECT TO roleapp_admin_executor USING(true);
-- Needed only for FOR SHARE; this policy rejects all offer updates.
CREATE POLICY campaign_offers_lock_v2 ON roleapp_security.campaign_offers FOR UPDATE TO roleapp_admin_executor USING(active) WITH CHECK(false);
GRANT EXECUTE ON FUNCTION roleapp_security.approved_local_owner(text,uuid) TO roleapp_admin_executor;
-- Row locks require an UPDATE policy in PostgreSQL. This permits locking by the
-- fixed RPC executor, while WITH CHECK false grants no new write path itself.
CREATE POLICY campaign_admin_local_lock_v2 ON public.locais FOR UPDATE TO roleapp_admin_executor
 USING(roleapp_security.admin_has_capability('campanhas.criar') OR roleapp_security.admin_has_capability('campanhas.editar') OR
  roleapp_security.admin_has_capability('campanhas.aprovar') OR roleapp_security.admin_has_capability('campanhas.ativar') OR
  roleapp_security.admin_has_capability('campanhas.pausar') OR roleapp_security.admin_has_capability('campanhas.encerrar')) WITH CHECK(false);
CREATE POLICY campaign_admin_read_v2 ON public.campanhas_impulsionamento FOR SELECT TO roleapp_admin_executor USING(true);
CREATE POLICY campaign_admin_insert_v2 ON public.campanhas_impulsionamento FOR INSERT TO roleapp_admin_executor
 WITH CHECK(roleapp_security.admin_has_capability('campanhas.criar'));
CREATE POLICY campaign_admin_update_v2 ON public.campanhas_impulsionamento FOR UPDATE TO roleapp_admin_executor
 USING(roleapp_security.admin_has_capability('campanhas.editar') OR roleapp_security.admin_has_capability('campanhas.aprovar') OR
  roleapp_security.admin_has_capability('campanhas.ativar') OR roleapp_security.admin_has_capability('campanhas.pausar') OR roleapp_security.admin_has_capability('campanhas.encerrar'))
 WITH CHECK(roleapp_security.admin_has_capability('campanhas.editar') OR roleapp_security.admin_has_capability('campanhas.aprovar') OR
  roleapp_security.admin_has_capability('campanhas.ativar') OR roleapp_security.admin_has_capability('campanhas.pausar') OR roleapp_security.admin_has_capability('campanhas.encerrar'));
DO $sequence$ DECLARE seq regclass:=pg_get_serial_sequence('public.campanhas_impulsionamento','id_campanha')::regclass; BEGIN
 IF seq IS NULL THEN RAISE EXCEPTION 'Campaign identity missing'; END IF;
 EXECUTE format('GRANT USAGE ON SEQUENCE %s TO roleapp_admin_executor',seq);
END $sequence$;

CREATE FUNCTION public.roleapp_admin_campaign_detail_v2(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT roleapp_security.admin_has_capability('campanhas.ler') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_id<=0 THEN RAISE EXCEPTION 'ID invalido' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('id_campanha',c.id_campanha::text,'id_local',c.id_local::text,'version',c.admin_version::text,
  'id_usuario',c.id_usuario,'tipo',c.tipo,'titulo',c.titulo,'mensagem',c.mensagem,'interesses',c.interesses,
  'faixa_etaria',c.faixa_etaria,'raio_km',c.raio_km,'duracao_dias',c.duracao_dias,'valor_total',c.valor_total,
  'status',c.status,'data_inicio',c.data_inicio,'data_fim',c.data_fim,
  'approved',EXISTS(SELECT 1 FROM roleapp_security.admin_campaign_approvals a WHERE a.id_campanha=c.id_campanha AND a.approved_version=c.admin_version))
 INTO result FROM public.campanhas_impulsionamento c WHERE c.id_campanha=p_id;
 RETURN result;
END $fn$;
CREATE FUNCTION public.roleapp_admin_campaigns_read_v2(p_search text DEFAULT '',p_status text DEFAULT NULL,
 p_local_id bigint DEFAULT NULL,p_owner_id uuid DEFAULT NULL,p_cursor text DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT roleapp_security.admin_has_capability('campanhas.ler') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_search IS NULL OR length(p_search)>120 OR p_limit IS DISTINCT FROM 20 OR
  (p_cursor IS NOT NULL AND (p_cursor !~ '^[1-9][0-9]{0,18}$' OR p_cursor::numeric>9223372036854775807)) OR
  (p_status IS NOT NULL AND p_status NOT IN ('rascunho','ativa','pausada','finalizada')) OR p_local_id<=0 THEN
  RAISE EXCEPTION 'Filtro invalido' USING ERRCODE='22023'; END IF;
 WITH candidates AS (
  SELECT c.id_campanha FROM public.campanhas_impulsionamento c JOIN public.locais l ON l.id_local=c.id_local
  WHERE (p_cursor IS NULL OR c.id_campanha>p_cursor::bigint) AND (p_status IS NULL OR c.status=p_status)
   AND (p_local_id IS NULL OR c.id_local=p_local_id) AND (p_owner_id IS NULL OR c.id_usuario=p_owner_id)
   AND (strpos(lower(coalesce(c.titulo,'')),lower(btrim(p_search)))>0 OR strpos(c.id_campanha::text,btrim(p_search))>0
    OR strpos(lower(l.nome),lower(btrim(p_search)))>0)
  ORDER BY c.id_campanha LIMIT 21
 ), page AS (SELECT id_campanha FROM candidates ORDER BY id_campanha LIMIT 20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.roleapp_admin_campaign_detail_v2(id_campanha) ORDER BY id_campanha) FROM page),'[]'::jsonb),
  'next_cursor',CASE WHEN (SELECT count(*) FROM candidates)>20 THEN (SELECT max(id_campanha)::text FROM page) END) INTO result;
 RETURN result;
END $fn$;

CREATE FUNCTION public.roleapp_admin_campaign_mutate_v2(p_action text,p_reason text,p_idempotency_key uuid,
 p_id bigint,p_expected_version bigint,p_local_id bigint,p_owner_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor_id uuid:=roleapp_security.admin_actor_id(); required_cap text; before_row public.campanhas_impulsionamento%ROWTYPE;
 final_row public.campanhas_impulsionamento%ROWTYPE; loc_id bigint; owner_id uuid; request_payload jsonb; previous record;
 content jsonb; field record; offered_price numeric; audit_id bigint; result jsonb; started timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'READ COMMITTED required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(7331,20261114);
 required_cap:=CASE p_action WHEN 'create' THEN 'campanhas.criar' WHEN 'update' THEN 'campanhas.editar'
  WHEN 'approve' THEN 'campanhas.aprovar' WHEN 'activate' THEN 'campanhas.ativar' WHEN 'pause' THEN 'campanhas.pausar' WHEN 'end' THEN 'campanhas.encerrar' END;
 IF actor_id IS NULL OR required_cap IS NULL OR NOT roleapp_security.admin_has_capability(required_cap) THEN
  RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 OR
  p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR
  (p_action='create' AND (p_id IS NOT NULL OR p_expected_version IS NOT NULL OR p_local_id IS NULL OR p_local_id<=0 OR p_owner_id IS NULL)) OR
  (p_action<>'create' AND (p_id IS NULL OR p_id<=0 OR p_expected_version IS NULL OR p_expected_version<=0 OR p_local_id IS NOT NULL OR p_owner_id IS NOT NULL)) OR
  (p_action NOT IN ('create','update') AND p_patch<>'{}'::jsonb) THEN RAISE EXCEPTION 'Entrada invalida' USING ERRCODE='22023'; END IF;
 request_payload:=jsonb_build_object('action',p_action,'id',p_id,'version',p_expected_version,'local',p_local_id,'owner',p_owner_id,'patch',p_patch,'reason',btrim(p_reason));
 SELECT payload,response INTO previous FROM roleapp_security.admin_campaign_receipts WHERE actor=actor_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Chave reutilizada' USING ERRCODE='22023'; END IF;
  RETURN previous.response;
 END IF;
 IF p_action<>'create' THEN
  SELECT * INTO before_row FROM public.campanhas_impulsionamento WHERE id_campanha=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha inexistente' USING ERRCODE='P0002'; END IF;
  IF before_row.admin_version<>p_expected_version THEN RAISE EXCEPTION 'Versao divergente' USING ERRCODE='40001'; END IF;
  loc_id:=before_row.id_local; owner_id:=before_row.id_usuario;
 ELSE loc_id:=p_local_id; owner_id:=p_owner_id; END IF;
 -- Same real-owner/approved-partnership check as the existing partner RPC.
 PERFORM 1 FROM public.locais WHERE id_local=loc_id AND id_proprietario=owner_id FOR SHARE;
 IF NOT FOUND OR NOT roleapp_security.approved_local_owner(loc_id::text,owner_id) THEN
  RAISE EXCEPTION 'Propriedade/aprovacao requeridas' USING ERRCODE='42501'; END IF;
 IF p_action IN ('create','update') THEN
  IF p_patch='{}'::jsonb OR (p_action='update' AND before_row.status<>'rascunho') THEN
   RAISE EXCEPTION 'Somente rascunhos editaveis' USING ERRCODE='22023'; END IF;
  FOR field IN SELECT key,value FROM jsonb_each(p_patch) LOOP
   IF field.key NOT IN ('tipo','titulo','mensagem','interesses','faixa_etaria','raio_km','duracao_dias') OR
    (field.key IN ('tipo','titulo','mensagem','faixa_etaria') AND jsonb_typeof(field.value)<>'string') OR
    (field.key IN ('raio_km','duracao_dias') AND jsonb_typeof(field.value)<>'number') OR
    (field.key='interesses' AND jsonb_typeof(field.value)<>'array') THEN
    RAISE EXCEPTION 'Campo proibido ou tipo invalido' USING ERRCODE='22023'; END IF;
  END LOOP;
  content:=CASE WHEN p_action='create' THEN jsonb_build_object('faixa_etaria','Todos','raio_km',5,'interesses','[]'::jsonb,'titulo','','mensagem','')
   ELSE to_jsonb(before_row) END ||p_patch;
  IF content->>'tipo' IS NULL OR content->>'tipo' NOT IN ('destaque','visibilidade') OR
   content->>'duracao_dias' IS NULL OR content->>'duracao_dias' NOT IN ('3','7','14') OR content->>'raio_km'<>'5' OR
   content->>'faixa_etaria' NOT IN ('Todos','18–24','25–34','35+') OR
   length(content->>'titulo')>200 OR length(content->>'mensagem')>2000 OR
   (content->>'tipo'='destaque' AND length(btrim(coalesce(content->>'titulo','')))=0) OR
   jsonb_array_length(content->'interesses')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(content->'interesses') v WHERE jsonb_typeof(v)<>'string') THEN
   RAISE EXCEPTION 'Conteudo invalido' USING ERRCODE='22023'; END IF;
  SELECT valor_total INTO STRICT offered_price FROM roleapp_security.campaign_offers
   WHERE tipo=content->>'tipo' AND duracao_dias=(content->>'duracao_dias')::integer AND active FOR SHARE;
  IF p_action='create' THEN
   INSERT INTO public.campanhas_impulsionamento(id_local,id_usuario,tipo,titulo,mensagem,interesses,faixa_etaria,raio_km,duracao_dias,valor_total,status,data_inicio,data_fim)
   VALUES(loc_id,owner_id,content->>'tipo',btrim(content->>'titulo'),btrim(content->>'mensagem'),
    ARRAY(SELECT jsonb_array_elements_text(content->'interesses')),content->>'faixa_etaria',5,(content->>'duracao_dias')::integer,offered_price,'rascunho',NULL,NULL) RETURNING * INTO final_row;
  ELSE
   UPDATE public.campanhas_impulsionamento SET tipo=content->>'tipo',titulo=btrim(content->>'titulo'),mensagem=btrim(content->>'mensagem'),
    interesses=ARRAY(SELECT jsonb_array_elements_text(content->'interesses')),faixa_etaria=content->>'faixa_etaria',raio_km=5,
    duracao_dias=(content->>'duracao_dias')::integer,valor_total=offered_price WHERE id_campanha=p_id RETURNING * INTO final_row;
  END IF;
 ELSE
  IF (p_action='approve' AND before_row.status<>'rascunho') OR
   (p_action='activate' AND before_row.status NOT IN ('rascunho','pausada')) OR
   (p_action='pause' AND before_row.status<>'ativa') OR
   (p_action='end' AND before_row.status NOT IN ('ativa','pausada')) THEN
   RAISE EXCEPTION 'Transicao invalida' USING ERRCODE='22023'; END IF;
  IF p_action='activate' THEN
   PERFORM 1 FROM public.locais WHERE id_local=loc_id AND visivel;
   IF NOT FOUND THEN RAISE EXCEPTION 'Local invisivel' USING ERRCODE='42501'; END IF;
   IF before_row.status='rascunho' AND NOT EXISTS(SELECT 1 FROM roleapp_security.admin_campaign_approvals
    WHERE id_campanha=p_id AND approved_version=before_row.admin_version) THEN RAISE EXCEPTION 'Aprovacao requerida' USING ERRCODE='42501'; END IF;
   IF before_row.status='pausada' AND (before_row.data_inicio IS NULL OR before_row.data_fim IS NULL OR before_row.data_fim<=clock_timestamp()) THEN
    RAISE EXCEPTION 'Vigencia encerrada' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_action='pause' AND (before_row.data_fim IS NULL OR before_row.data_fim<=clock_timestamp()) THEN
   RAISE EXCEPTION 'Vigencia encerrada' USING ERRCODE='22023'; END IF;
  started:=clock_timestamp();
  UPDATE public.campanhas_impulsionamento SET status=CASE p_action WHEN 'activate' THEN 'ativa' WHEN 'pause' THEN 'pausada' WHEN 'end' THEN 'finalizada' ELSE status END,
   data_inicio=CASE WHEN p_action='activate' AND before_row.status='rascunho' THEN started ELSE data_inicio END,
   data_fim=CASE WHEN p_action='activate' AND before_row.status='rascunho' THEN started+interval '24 hours'*duracao_dias ELSE data_fim END
   WHERE id_campanha=p_id RETURNING * INTO final_row;
 END IF;
 IF final_row.id_campanha IS NULL OR final_row.id_usuario<>owner_id OR final_row.id_local<>loc_id OR
  final_row.admin_version<>(CASE WHEN p_action='create' THEN 1 ELSE before_row.admin_version+1 END) THEN RAISE EXCEPTION 'Estado final divergente'; END IF;
 INSERT INTO public.roleapp_admin_audit(actor,origin,action,local_id,subject,reason,details) VALUES(
  actor_id,'app','campaign_admin_'||p_action,loc_id::text,owner_id,btrim(p_reason),jsonb_build_object(
   'idempotency_key',p_idempotency_key,'before',to_jsonb(before_row),'after',to_jsonb(final_row))) RETURNING id INTO audit_id;
 IF audit_id IS NULL THEN RAISE EXCEPTION 'Auditoria nao confirmada'; END IF;
 IF p_action='approve' THEN
  INSERT INTO roleapp_security.admin_campaign_approvals(id_campanha,approved_version,actor,audit_id)
   VALUES(final_row.id_campanha,final_row.admin_version,actor_id,audit_id)
   ON CONFLICT(id_campanha) DO UPDATE SET approved_version=excluded.approved_version,actor=excluded.actor,audit_id=excluded.audit_id;
 END IF;
 result:=jsonb_build_object('id_campanha',final_row.id_campanha::text,'version',final_row.admin_version::text,'audit_id',audit_id::text);
 INSERT INTO roleapp_security.admin_campaign_receipts(actor,idempotency_key,payload,response) VALUES(actor_id,p_idempotency_key,request_payload,result);
 IF NOT FOUND THEN RAISE EXCEPTION 'Recibo nao confirmado'; END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.roleapp_admin_campaign_detail_v2(bigint),public.roleapp_admin_campaigns_read_v2(text,text,bigint,uuid,text,integer),
 public.roleapp_admin_campaign_mutate_v2(text,text,uuid,bigint,bigint,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_campaign_detail_v2(bigint),public.roleapp_admin_campaigns_read_v2(text,text,bigint,uuid,text,integer),
 public.roleapp_admin_campaign_mutate_v2(text,text,uuid,bigint,bigint,bigint,uuid,jsonb) TO authenticated;
ALTER FUNCTION public.roleapp_admin_campaign_detail_v2(bigint) OWNER TO roleapp_admin_executor;
ALTER FUNCTION public.roleapp_admin_campaigns_read_v2(text,text,bigint,uuid,text,integer) OWNER TO roleapp_admin_executor;
ALTER FUNCTION public.roleapp_admin_campaign_mutate_v2(text,text,uuid,bigint,bigint,bigint,uuid,jsonb) OWNER TO roleapp_admin_executor;
REVOKE CREATE ON SCHEMA public,roleapp_security FROM roleapp_admin_executor;
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
COMMIT;
