-- PROPOSTA BLOQUEADA. NÃO EXECUTAR. Ver docs/correcao-diagnostico-real-20261109.md.
-- Depende da fundação user_roles revisada/aplicada em etapa autorizada.
-- Tipos, constraints, triggers, helpers e grants herdados ainda exigem inventário.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Revisão obrigatória: migração de segurança ainda não autorizada.';
END;
$guard$;

-- A trava acima permanece mesmo com estes preflights. Não usar IF NOT EXISTS para
-- esconder colisões dos novos objetos. Asserções não substituem revisão dos relatórios.
DO $preflight$
DECLARE client_role text; target text; actual_hash text;
  -- Preencher SOMENTE após receber/revisar os relatórios exatos; nenhuma inferência.
  reviewed_policy_hashes jsonb := NULL;
  reviewed_trigger_hashes jsonb := NULL;
  reviewed_public_view_definition text := NULL;
  public_view_filter_reviewed boolean := false;
  internal_schema_not_exposed_reviewed boolean := false;
  alternate_write_paths_reviewed boolean := false;
  campaign_dates_and_triggers_reviewed boolean := false;
  legacy_reviews_access_reviewed boolean := false;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Revisar dono executor das funções SECURITY DEFINER (esperado postgres).';
  END IF;
  IF to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'Fundação user_roles ausente.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('decidir_parceria_segura','revisar_parceria_segura',
      'listar_solicitacoes_admin','solicitar_campanha_segura','listar_ofertas_campanha',
      'listar_destaques_publicos','registrar_interacao_segura','ativar_campanha_segura')) THEN
    RAISE EXCEPTION 'RPC proposta já existente: revisar assinaturas e caminhos alternativos antes do corte.';
  END IF;
  IF reviewed_policy_hashes IS NULL OR reviewed_trigger_hashes IS NULL OR reviewed_public_view_definition IS NULL OR
    NOT public_view_filter_reviewed OR NOT internal_schema_not_exposed_reviewed OR NOT alternate_write_paths_reviewed OR
    NOT campaign_dates_and_triggers_reviewed OR NOT legacy_reviews_access_reviewed THEN
    RAISE EXCEPTION 'Manifesto de políticas/triggers e definição segura da view ainda não revisados.';
  END IF;
  -- Rascunho não consome vigência. Não relaxar NOT NULL/CHECKs de datas às cegas.
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.campanhas_impulsionamento'::regclass
    AND attname IN ('data_inicio','data_fim') AND NOT attisdropped AND NOT attnotnull)<>2 THEN
    RAISE EXCEPTION 'Datas de rascunho exigem revisão separada de nullability/CHECKs/triggers.';
  END IF;
  IF to_regclass('public.locais_com_avaliacoes') IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')) <> 'v' OR
      pg_get_viewdef(to_regclass('public.locais_com_avaliacoes'),true) IS DISTINCT FROM reviewed_public_view_definition OR
      NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')
        AND 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'View legada requer correção separada/revisada antes deste corte. Não será alterada aqui.';
    END IF;
  END IF;
  FOREACH target IN ARRAY ARRAY['solicitacoes_parceria','eventos_locais','campanhas_impulsionamento',
    'metricas_locais','locais','horarios_funcionamento','usuarios','categorias_cardapio',
    'itens_cardapio','local_categorias','categorias','favoritos','avaliacoes_locais'] LOOP
    SELECT md5(coalesce(string_agg(p.polname || '|' || p.polcmd::text || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' ||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' ORDER BY p.polname),''))
      INTO actual_hash FROM pg_policy p WHERE p.polrelid=to_regclass('public.' || target);
    IF reviewed_policy_hashes->>target IS DISTINCT FROM actual_hash THEN
      RAISE EXCEPTION 'Políticas não revisadas ou alteradas em %.',target;
    END IF;
    SELECT md5(coalesce(string_agg(pg_get_triggerdef(g.oid,true) || '|' || g.tgenabled::text || '|' ||
      md5(pg_get_functiondef(g.tgfoid)),E'\n' ORDER BY g.tgname),'')) INTO actual_hash
      FROM pg_trigger g WHERE g.tgrelid=to_regclass('public.' || target) AND NOT g.tgisinternal;
    IF reviewed_trigger_hashes->>target IS DISTINCT FROM actual_hash THEN
      RAISE EXCEPTION 'Triggers não revisados ou alterados em %.',target;
    END IF;
  END LOOP;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role AND (rolsuper OR rolbypassrls)) OR
       has_table_privilege(client_role,'public.user_roles','DELETE,TRUNCATE') OR
       has_any_column_privilege(client_role,'public.user_roles','INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Papel % pode contornar autorização ou alterar user_roles.', client_role;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE
    attrelid IN ('public.solicitacoes_parceria'::regclass,'public.campanhas_impulsionamento'::regclass)
    AND attname = 'status' AND atttypid NOT IN ('text'::regtype,'varchar'::regtype)
    AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Adaptar casts de status ao tipo real antes da aplicação.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.metricas_locais'::regclass
    AND attname = 'data' AND atttypid = 'date'::regtype AND NOT attisdropped) OR
    NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.campanhas_impulsionamento'::regclass
      AND attname = 'interesses' AND atttypid = 'text[]'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Adaptar tipos data/interesses ao esquema real.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid IN ('public.usuarios'::regclass, 'public.locais'::regclass,
                         'public.solicitacoes_parceria'::regclass)
      AND a.attname IN ('id_usuario', 'id_proprietario') AND a.atttypid <> 'uuid'::regtype
      AND NOT a.attisdropped
  ) THEN RAISE EXCEPTION 'Revisar tipos dos vínculos com Auth.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.metricas_locais'::regclass
      AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indnkeyatts = 2
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= i.indnkeyatts) = ARRAY['data', 'id_local']::text[]
  ) THEN RAISE EXCEPTION 'Métricas exigem unicidade não parcial em id_local,data.'; END IF;
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO actual_hash
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' OR (n.nspname='public' AND c.relname IN ('categorias_cardapio','itens_cardapio'));
  PERFORM set_config('roleapp.review.preserved_policies',actual_hash,true);
END;
$preflight$;

CREATE SCHEMA roleapp_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA roleapp_security FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA roleapp_security TO anon, authenticated;

-- Predicados mínimos. Nunca usam metadados, e-mail, parâmetros de ator ou papel JWT.
CREATE FUNCTION roleapp_security.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'admin');
$fn$;

CREATE FUNCTION roleapp_security.local_public(p_local text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.locais WHERE id_local::text = p_local AND visivel IS TRUE);
$fn$;

REVOKE ALL ON FUNCTION roleapp_security.is_admin(),
  roleapp_security.local_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION roleapp_security.is_admin(),
  roleapp_security.local_public(text) TO anon, authenticated;

CREATE TABLE roleapp_security.metric_receipts (
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id text NOT NULL, event text NOT NULL CHECK (event IN ('view','clique','visita')),
  day date NOT NULL, PRIMARY KEY (actor, local_id, event, day)
);
ALTER TABLE roleapp_security.metric_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE roleapp_security.metric_receipts FROM PUBLIC, anon, authenticated;

-- IDs de alvo são snapshots textuais: preservam tipos/IDs legados e histórico mesmo
-- após exclusão de contas; sem FK destrutiva. RPC verifica e bloqueia alvos reais.
CREATE TABLE public.roleapp_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at timestamptz NOT NULL DEFAULT now(),
  actor uuid, origin text NOT NULL DEFAULT 'app', action text NOT NULL, request_id text, local_id text,
  subject uuid, reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT roleapp_audit_origin CHECK ((origin='app' AND actor IS NOT NULL) OR
    (origin='maintenance' AND actor IS NULL AND action='bootstrap_admin'))
);
CREATE UNIQUE INDEX roleapp_one_decision_per_request
  ON public.roleapp_admin_audit(request_id) WHERE action IN ('aprovado','rejeitado');
CREATE UNIQUE INDEX roleapp_one_campaign_activation
  ON public.roleapp_admin_audit((details->>'id_campanha')) WHERE action='campanha_ativada';
ALTER TABLE public.roleapp_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roleapp_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.roleapp_admin_audit TO authenticated;
CREATE POLICY roleapp_audit_admin_read ON public.roleapp_admin_audit FOR SELECT TO authenticated
  USING ((SELECT roleapp_security.is_admin()));

-- Controles internos não são expostos como endpoints. A substituição coordenada de
-- políticas ocorre ao final, somente com snapshots previamente revisados.
CREATE TABLE roleapp_security.partnership_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid NOT NULL,
  request_id text NOT NULL, snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  consumed_at timestamptz, decision_input jsonb, outcome jsonb
);
CREATE TABLE roleapp_security.request_local_links (
  request_id text PRIMARY KEY, local_id text NOT NULL UNIQUE, business_key text NOT NULL UNIQUE,
  subject uuid NOT NULL, active boolean NOT NULL DEFAULT true,
  review_id uuid NOT NULL UNIQUE REFERENCES roleapp_security.partnership_reviews(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roleapp_security.campaign_offers (
  tipo text NOT NULL CHECK (tipo IN ('destaque','visibilidade')),
  duracao_dias integer NOT NULL CHECK (duracao_dias IN (3,7,14)),
  valor_total numeric NOT NULL CHECK (valor_total>0), active boolean NOT NULL DEFAULT false,
  approved_by text NOT NULL, reason text NOT NULL,
  PRIMARY KEY(tipo,duracao_dias)
);
CREATE TABLE roleapp_security.feature_flags (
  name text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
  approved_by text NOT NULL, reason text NOT NULL
);
-- Sem seed comercial, habilitação de métrica, backfill de proprietário ou admin.
ALTER TABLE roleapp_security.partnership_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.request_local_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.campaign_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA roleapp_security FROM PUBLIC,anon,authenticated;

-- Após as tabelas: o corpo SQL é resolvido no CREATE, sem referência futura.
-- Sem backfill: propriedade legada + papel global não constituem autorização.
CREATE FUNCTION roleapp_security.approved_local_owner(p_local text,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT EXISTS(SELECT 1 FROM public.locais l
    JOIN public.user_roles r ON r.user_id=l.id_proprietario AND r.role='parceiro'
    JOIN roleapp_security.request_local_links k ON k.local_id=l.id_local::text
      AND k.subject=l.id_proprietario AND k.active IS TRUE
    JOIN public.solicitacoes_parceria s ON s.id_solicitacao::text=k.request_id
      AND s.id_usuario=k.subject AND s.status='aprovado'
    JOIN public.roleapp_admin_audit a ON a.request_id=k.request_id AND a.local_id=k.local_id
      AND a.subject=k.subject AND a.action='aprovado' AND a.details->>'revisao'=k.review_id::text
    WHERE l.id_local::text=p_local AND l.id_proprietario=p_actor);
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.approved_local_owner(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION roleapp_security.partner_owns(p_local text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT roleapp_security.approved_local_owner(p_local,(SELECT auth.uid()));
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.partner_owns(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION roleapp_security.partner_owns(text) TO anon,authenticated;

CREATE FUNCTION roleapp_security.norm(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
  SELECT lower(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.norm(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION roleapp_security.partnership_state(p_request text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  WITH req AS (SELECT * FROM public.solicitacoes_parceria WHERE id_solicitacao::text=p_request)
  SELECT jsonb_build_object('solicitacao',jsonb_build_object('id_solicitacao',r.id_solicitacao,
      'id_usuario',r.id_usuario,'estabelecimento',r.estabelecimento,'cidade_estado',r.cidade_estado,'status',r.status),
    'candidatos',coalesce((SELECT jsonb_agg(jsonb_build_object('id_local',l.id_local,
      'nome',l.nome,'cidade_uf',l.cidade_uf,'id_proprietario',l.id_proprietario,'visivel',l.visivel)
      ORDER BY l.id_local::text) FROM public.locais l WHERE l.id_proprietario=r.id_usuario OR
        (roleapp_security.norm(l.nome)=roleapp_security.norm(r.estabelecimento) AND
         (roleapp_security.norm(l.cidade_uf)=roleapp_security.norm(r.cidade_estado) OR
          roleapp_security.norm(l.cidade_uf)='' OR roleapp_security.norm(r.cidade_estado)=''))),'[]'::jsonb),
    'solicitacoes_relacionadas',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id_solicitacao',s.id_solicitacao,'status',s.status) ORDER BY s.id_solicitacao::text)
      FROM public.solicitacoes_parceria s WHERE s.id_solicitacao<>r.id_solicitacao
        AND s.id_usuario=r.id_usuario AND roleapp_security.norm(s.estabelecimento)=roleapp_security.norm(r.estabelecimento)
        AND roleapp_security.norm(s.cidade_estado)=roleapp_security.norm(r.cidade_estado)),'[]'::jsonb)) FROM req r;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.partnership_state(text) FROM PUBLIC,anon,authenticated;

-- Uma ordem global simples para decisões e mudanças que afetam candidatos/identidade.
-- Não usa GUC do cliente como autorização. Reavaliar escalabilidade depois do clone.
CREATE FUNCTION roleapp_security.serialize_partnership_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(7331,20261109);
  RETURN NULL; -- trigger de statement: retorno ignorado
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.serialize_partnership_changes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_serialize_local BEFORE INSERT OR UPDATE OR DELETE ON public.locais
  FOR EACH STATEMENT EXECUTE FUNCTION roleapp_security.serialize_partnership_changes();
CREATE TRIGGER roleapp_serialize_request BEFORE INSERT OR UPDATE OR DELETE ON public.solicitacoes_parceria
  FOR EACH STATEMENT EXECUTE FUNCTION roleapp_security.serialize_partnership_changes();

CREATE FUNCTION roleapp_security.protect_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT roleapp_security.is_admin() THEN
      RAISE EXCEPTION 'Novo local exige decisao administrativa.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id_local IS DISTINCT FROM OLD.id_local THEN
      RAISE EXCEPTION 'Identificador imutavel.' USING ERRCODE='42501';
    END IF;
    IF NEW.id_proprietario IS DISTINCT FROM OLD.id_proprietario THEN
      IF NOT roleapp_security.is_admin() THEN
        RAISE EXCEPTION 'Proprietario imutavel para parceiro.' USING ERRCODE='42501';
      END IF;
      INSERT INTO public.roleapp_admin_audit(actor,action,local_id,subject,reason,details)
        VALUES(auth.uid(),'proprietario_alterado',NEW.id_local::text,NEW.id_proprietario,
          'Vinculo administrativo explicito',jsonb_build_object('anterior',OLD.id_proprietario,'novo',NEW.id_proprietario));
      UPDATE roleapp_security.request_local_links SET active=false WHERE local_id=NEW.id_local::text;
    ELSIF NOT roleapp_security.is_admin() AND NOT roleapp_security.partner_owns(NEW.id_local::text) THEN
      RAISE EXCEPTION 'Parceria aprovada e propriedade requeridas.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_owner AFTER INSERT OR UPDATE ON public.locais
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_owner();

CREATE FUNCTION roleapp_security.protect_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.id_usuario IS DISTINCT FROM auth.uid() OR NEW.status IS DISTINCT FROM 'pendente' OR
      length(btrim(coalesce(NEW.estabelecimento,''))) NOT BETWEEN 1 AND 200 OR
      length(btrim(coalesce(NEW.cidade_estado,''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Solicitacao propria e pendente requerida.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id_solicitacao IS DISTINCT FROM OLD.id_solicitacao OR NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR
      NEW.estabelecimento IS DISTINCT FROM OLD.estabelecimento OR NEW.cidade_estado IS DISTINCT FROM OLD.cidade_estado THEN
      RAISE EXCEPTION 'Identidade da solicitacao imutavel.' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND
      (NOT roleapp_security.is_admin() OR OLD.status NOT IN ('pendente','em_analise') OR
       NEW.status NOT IN ('em_analise','aprovado','rejeitado')) THEN
      RAISE EXCEPTION 'Transicao nao autorizada.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_request AFTER INSERT OR UPDATE ON public.solicitacoes_parceria
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_request();

CREATE FUNCTION public.listar_solicitacoes_admin() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NOT roleapp_security.is_admin() THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id_solicitacao',id_solicitacao,'nome',nome,
    'email',email,'estabelecimento',estabelecimento,'cidade_estado',cidade_estado,'status',status)
    ORDER BY created_at,id_solicitacao),'[]'::jsonb) FROM public.solicitacoes_parceria);
END;
$fn$;

CREATE FUNCTION public.revisar_parceria_segura(p_id_solicitacao text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE state jsonb; review_id uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Revisao requer READ COMMITTED para snapshot apos lock.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  state:=roleapp_security.partnership_state(p_id_solicitacao);
  IF state IS NULL OR state#>>'{solicitacao,status}' NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitacao indisponivel para revisao.' USING ERRCODE='22023';
  END IF;
  INSERT INTO roleapp_security.partnership_reviews(actor,request_id,snapshot)
    VALUES(auth.uid(),p_id_solicitacao,state) RETURNING id INTO STRICT review_id;
  RETURN jsonb_build_object('revisao_id',review_id,'estado',state);
END;
$fn$;

CREATE FUNCTION public.decidir_parceria_segura(p_revisao uuid,p_decisao text,p_acao text,
  p_motivo text,p_id_local_existente text,p_identidade_validada boolean,
  p_duplicidade_revisada boolean,p_novo_local jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE review roleapp_security.partnership_reviews%ROWTYPE;
  req public.solicitacoes_parceria%ROWTYPE; loc public.locais%ROWTYPE; supplied public.locais%ROWTYPE;
  state jsonb; input jsonb; result jsonb; old_role text; final_role text; v_business_key text; linked_before jsonb;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Decisao requer READ COMMITTED para snapshot apos lock.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  IF p_decisao IS NULL OR p_decisao NOT IN ('aprovado','rejeitado','em_analise') OR
    p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 1 AND 2000 OR p_acao IS NULL THEN
    RAISE EXCEPTION 'Decisao invalida.' USING ERRCODE='22023'; END IF;
  input:=jsonb_build_object('decisao',p_decisao,'acao',p_acao,'motivo',btrim(p_motivo),
    'local',p_id_local_existente,'identidade',p_identidade_validada,
    'duplicidade',p_duplicidade_revisada,'novo',p_novo_local);
  SELECT * INTO STRICT review FROM roleapp_security.partnership_reviews WHERE id=p_revisao AND actor=auth.uid() FOR UPDATE;
  IF review.consumed_at IS NOT NULL THEN
    IF review.decision_input IS DISTINCT FROM input THEN
      RAISE EXCEPTION 'Revisao consumida por outra decisao.' USING ERRCODE='22023'; END IF;
    RETURN review.outcome;
  END IF;
  IF review.expires_at<now() THEN RAISE EXCEPTION 'Revisao expirada.' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT req FROM public.solicitacoes_parceria WHERE id_solicitacao::text=review.request_id FOR UPDATE;
  state:=roleapp_security.partnership_state(review.request_id);
  IF state IS DISTINCT FROM review.snapshot OR req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Dados mudaram. Reabra a revisao.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM auth.users WHERE id=req.id_usuario FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitante sem Auth.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=req.id_usuario FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil complementar ausente.' USING ERRCODE='22023'; END IF;
  IF p_decisao='aprovado' THEN
    IF p_identidade_validada IS DISTINCT FROM true OR p_duplicidade_revisada IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Validacao explicita requerida.' USING ERRCODE='22023'; END IF;
    v_business_key:=jsonb_build_array(req.id_usuario,roleapp_security.norm(req.estabelecimento),
      roleapp_security.norm(req.cidade_estado))::text;
    IF EXISTS(SELECT 1 FROM roleapp_security.request_local_links
      WHERE request_id=review.request_id OR request_local_links.business_key=v_business_key) THEN
      RAISE EXCEPTION 'Origem comercial ja aprovada. Revisao manual requerida.' USING ERRCODE='22023'; END IF;
    SELECT role INTO old_role FROM public.user_roles WHERE user_id=req.id_usuario FOR UPDATE;
    INSERT INTO public.user_roles(user_id,role) VALUES(req.id_usuario,'parceiro')
      ON CONFLICT(user_id) DO UPDATE SET role=CASE WHEN public.user_roles.role='admin' THEN 'admin' ELSE 'parceiro' END;
    IF p_acao='criar_novo' AND p_id_local_existente IS NULL AND p_novo_local IS NOT NULL THEN
      IF jsonb_array_length(state->'candidatos')>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(state->'solicitacoes_relacionadas') s
        WHERE s->>'status' IN ('pendente','em_analise','aprovado')) THEN
        RAISE EXCEPTION 'Vinculo possivel: criacao bloqueada.' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_novo_local) k WHERE k NOT IN ('endereco','preco','preco_entrada')) THEN
        RAISE EXCEPTION 'Campos do novo local invalidos.' USING ERRCODE='22023'; END IF;
      SELECT * INTO supplied FROM jsonb_populate_record(NULL::public.locais,p_novo_local);
      IF length(btrim(coalesce(supplied.endereco,'')))=0 OR supplied.preco IS NULL OR supplied.preco<=0 OR
        supplied.preco_entrada IS NULL OR supplied.preco_entrada<0 THEN
        RAISE EXCEPTION 'Dados confirmados de endereco e preco requeridos.' USING ERRCODE='22023'; END IF;
      INSERT INTO public.locais(nome,cidade_uf,endereco,preco,preco_entrada,faixa_preco,id_proprietario,visivel)
        VALUES(req.estabelecimento,req.cidade_estado,supplied.endereco,supplied.preco,supplied.preco_entrada,'$',req.id_usuario,false)
        RETURNING * INTO STRICT loc;
    ELSIF p_acao='vincular_existente' AND p_id_local_existente IS NOT NULL AND p_novo_local IS NULL THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'candidatos') l WHERE l->>'id_local'=p_id_local_existente) THEN
        RAISE EXCEPTION 'Local fora da revisao.' USING ERRCODE='22023'; END IF;
      SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text=p_id_local_existente FOR UPDATE;
      IF loc.id_proprietario IS NOT NULL AND loc.id_proprietario<>req.id_usuario THEN
        RAISE EXCEPTION 'Local pertence a terceiro.' USING ERRCODE='42501'; END IF;
      linked_before:=to_jsonb(loc);
      UPDATE public.locais SET id_proprietario=req.id_usuario WHERE id_local=loc.id_local RETURNING * INTO STRICT loc;
    ELSE RAISE EXCEPTION 'Escolha criar/vincular explicitamente.' USING ERRCODE='22023'; END IF;
    SELECT role INTO STRICT final_role FROM public.user_roles WHERE user_id=req.id_usuario;
    IF final_role IS DISTINCT FROM CASE WHEN old_role='admin' THEN 'admin' ELSE 'parceiro' END THEN
      RAISE EXCEPTION 'Papel final incoerente.'; END IF;
    PERFORM 1 FROM public.locais WHERE id_local=loc.id_local AND id_proprietario=req.id_usuario
      AND (p_acao<>'criar_novo' OR visivel IS FALSE);
    IF NOT FOUND THEN RAISE EXCEPTION 'Vinculo final incoerente.'; END IF;
    INSERT INTO roleapp_security.request_local_links(request_id,local_id,business_key,review_id,subject)
      VALUES(review.request_id,loc.id_local::text,v_business_key,p_revisao,req.id_usuario);
  ELSIF p_id_local_existente IS NOT NULL OR p_novo_local IS NOT NULL OR
    p_acao IS DISTINCT FROM CASE WHEN p_decisao='em_analise' THEN 'bloquear' ELSE 'nenhuma' END THEN
    RAISE EXCEPTION 'Decisao sem aprovacao nao vincula local.' USING ERRCODE='22023';
  END IF;
  UPDATE public.solicitacoes_parceria SET status=p_decisao WHERE id_solicitacao=req.id_solicitacao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atualizacao suprimida.'; END IF;
  PERFORM 1 FROM public.solicitacoes_parceria WHERE id_solicitacao=req.id_solicitacao
    AND status=p_decisao AND id_usuario=req.id_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estado final incoerente.'; END IF;
  INSERT INTO public.roleapp_admin_audit(actor,action,request_id,local_id,subject,reason,details)
    VALUES(auth.uid(),p_decisao,review.request_id,loc.id_local::text,req.id_usuario,btrim(p_motivo),
      jsonb_build_object('revisao',p_revisao,'acao',p_acao,'status_anterior',req.status,
        'papel_anterior',old_role,'identidade_validada',p_identidade_validada,'duplicidade_revisada',p_duplicidade_revisada));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida.'; END IF;
  PERFORM 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid() AND action=p_decisao
    AND request_id=review.request_id AND details->>'revisao'=p_revisao::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria final incoerente.'; END IF;
  result:=jsonb_build_object('id_solicitacao',req.id_solicitacao,'status',p_decisao,'id_local',loc.id_local);
  UPDATE roleapp_security.partnership_reviews SET consumed_at=now(),decision_input=input,outcome=result WHERE id=p_revisao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de idempotencia suprimido.'; END IF;
  PERFORM 1 FROM roleapp_security.partnership_reviews WHERE id=p_revisao AND consumed_at IS NOT NULL
    AND decision_input=input AND outcome=result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado de idempotencia incoerente.'; END IF;
  PERFORM 1 FROM public.solicitacoes_parceria WHERE id_solicitacao=req.id_solicitacao
    AND id_usuario=req.id_usuario AND status=p_decisao;
  IF NOT FOUND OR NOT roleapp_security.is_admin() THEN RAISE EXCEPTION 'Estado administrativo final incoerente.'; END IF;
  IF p_decisao='aprovado' THEN
    SELECT * INTO STRICT loc FROM public.locais WHERE id_local=loc.id_local;
    SELECT role INTO STRICT final_role FROM public.user_roles WHERE user_id=req.id_usuario;
    IF loc.id_proprietario IS DISTINCT FROM req.id_usuario OR
      final_role IS DISTINCT FROM CASE WHEN old_role='admin' THEN 'admin' ELSE 'parceiro' END THEN
      RAISE EXCEPTION 'Vinculo ou papel final alterado por trigger.'; END IF;
    IF p_acao='criar_novo' AND (loc.visivel IS DISTINCT FROM false OR loc.nome IS DISTINCT FROM req.estabelecimento
      OR loc.cidade_uf IS DISTINCT FROM req.cidade_estado OR loc.preco IS DISTINCT FROM supplied.preco
      OR loc.preco_entrada IS DISTINCT FROM supplied.preco_entrada) THEN
      RAISE EXCEPTION 'Dados confirmados do novo local divergiram.'; END IF;
    IF linked_before IS NOT NULL AND
      (to_jsonb(loc)-'id_proprietario'-'updated_at') IS DISTINCT FROM (linked_before-'id_proprietario'-'updated_at') THEN
      RAISE EXCEPTION 'Vinculo alterou dados legados alem do proprietario.'; END IF;
    PERFORM 1 FROM roleapp_security.request_local_links WHERE request_id=review.request_id
      AND local_id=loc.id_local::text AND business_key=v_business_key AND review_id=p_revisao
      AND subject=req.id_usuario AND active IS TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapa de origem final incoerente.'; END IF;
  END IF;
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.solicitar_campanha_segura(p_id_local text, p_tipo text,
  p_titulo text, p_mensagem text, p_interesses text[], p_faixa_etaria text,
  p_raio_km integer, p_duracao_dias integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE loc public.locais%ROWTYPE; campaign public.campanhas_impulsionamento%ROWTYPE;
  offer roleapp_security.campaign_offers%ROWTYPE;
BEGIN
  -- Só parceiro aprovado e proprietário; admin não se passa por proprietário.
  PERFORM 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'parceiro' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceria aprovada requerida.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text = p_id_local FOR SHARE;
  IF NOT roleapp_security.partner_owns(loc.id_local::text) THEN
    RAISE EXCEPTION 'Autorizacao individual do local requerida.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('destaque','visibilidade') OR
    p_duracao_dias IS NULL OR p_duracao_dias NOT IN (3,7,14) OR
    p_raio_km IS DISTINCT FROM 5 OR p_faixa_etaria IS NULL OR
    p_faixa_etaria NOT IN ('Todos','18–24','25–34','35+') OR
    coalesce(cardinality(p_interesses),0) > 20 OR
    length(coalesce(p_titulo,'')) > 200 OR length(coalesce(p_mensagem,'')) > 2000 OR
    (p_tipo = 'destaque' AND length(btrim(coalesce(p_titulo,''))) = 0) THEN
    RAISE EXCEPTION 'Campanha inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT offer FROM roleapp_security.campaign_offers
    WHERE tipo=p_tipo AND duracao_dias=p_duracao_dias AND active IS TRUE FOR SHARE;
  INSERT INTO public.campanhas_impulsionamento(id_local,id_usuario,tipo,titulo,mensagem,interesses,
    faixa_etaria,raio_km,duracao_dias,valor_total,status,alcance,data_inicio,data_fim)
  VALUES (loc.id_local,auth.uid(),p_tipo,CASE WHEN p_tipo='destaque' THEN p_titulo END,
    CASE WHEN p_tipo='destaque' THEN p_mensagem END,coalesce(p_interesses,ARRAY[]::text[]),
    p_faixa_etaria,5,p_duracao_dias,offer.valor_total,'rascunho',0,
    NULL,NULL) RETURNING * INTO STRICT campaign;
  -- Valor é orçamento do servidor, não pagamento. Nenhuma ativação é feita aqui.
  PERFORM 1 FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha
    AND status='rascunho' AND id_local=loc.id_local AND id_usuario=auth.uid()
    AND valor_total=offer.valor_total AND duracao_dias=offer.duracao_dias
    AND data_inicio IS NULL AND data_fim IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha final incoerente.'; END IF;
  SELECT * INTO STRICT campaign FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha;
  RETURN jsonb_build_object('id_campanha',campaign.id_campanha,'id_local',campaign.id_local,
    'tipo',campaign.tipo,'titulo',campaign.titulo,'mensagem',campaign.mensagem,
    'status',campaign.status,'duracao_dias',campaign.duracao_dias,'valor_total',campaign.valor_total,
    'data_inicio',campaign.data_inicio,'data_fim',campaign.data_fim);
END;
$fn$;

-- Sem endpoint para escolher status/datas arbitrários. Somente ativação administrativa.
CREATE FUNCTION public.ativar_campanha_segura(p_id_campanha text,p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE campaign public.campanhas_impulsionamento%ROWTYPE; started timestamptz; ends timestamptz; result jsonb;
BEGIN
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Justificativa requerida.' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT campaign FROM public.campanhas_impulsionamento WHERE id_campanha::text=p_id_campanha FOR UPDATE;
  -- Retry somente da própria ativação já auditada, nunca adoção de campanha legada ativa.
  IF campaign.status='ativa' AND EXISTS(SELECT 1 FROM public.roleapp_admin_audit
    WHERE actor=auth.uid() AND action='campanha_ativada' AND reason=btrim(p_motivo)
      AND details->>'id_campanha'=p_id_campanha
      AND (details->>'inicio')::timestamptz=campaign.data_inicio
      AND (details->>'fim')::timestamptz=campaign.data_fim) THEN
    RETURN jsonb_build_object('id_campanha',campaign.id_campanha,'status',campaign.status,
      'data_inicio',campaign.data_inicio,'data_fim',campaign.data_fim);
  END IF;
  IF campaign.status<>'rascunho' OR campaign.data_inicio IS NOT NULL OR campaign.data_fim IS NOT NULL OR
    campaign.duracao_dias NOT IN (3,7,14) THEN
    RAISE EXCEPTION 'Transicao invalida.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=campaign.id_usuario AND role='parceiro' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro aprovado requerido.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.locais WHERE id_local=campaign.id_local AND id_proprietario=campaign.id_usuario
    AND visivel IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Propriedade e visibilidade requeridas.' USING ERRCODE='42501'; END IF;
  IF NOT roleapp_security.approved_local_owner(campaign.id_local::text,campaign.id_usuario) THEN
    RAISE EXCEPTION 'Local ainda nao autorizado individualmente.' USING ERRCODE='42501'; END IF;
  started:=clock_timestamp(); ends:=started+interval '24 hours'*campaign.duracao_dias;
  INSERT INTO public.roleapp_admin_audit(actor,action,local_id,subject,reason,details)
    VALUES(auth.uid(),'campanha_ativada',campaign.id_local::text,campaign.id_usuario,btrim(p_motivo),
      jsonb_build_object('id_campanha',p_id_campanha,'inicio',started,'fim',ends,'duracao_dias',campaign.duracao_dias));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida.'; END IF;
  UPDATE public.campanhas_impulsionamento SET status='ativa',data_inicio=started,data_fim=ends
    WHERE id_campanha=campaign.id_campanha;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ativacao suprimida.'; END IF;
  PERFORM 1 FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha AND status='ativa'
    AND data_inicio=started AND data_fim=ends AND duracao_dias=campaign.duracao_dias
    AND id_usuario=campaign.id_usuario AND id_local=campaign.id_local AND valor_total=campaign.valor_total;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid()
    AND action='campanha_ativada' AND details->>'id_campanha'=p_id_campanha
    AND (details->>'inicio')::timestamptz=started AND (details->>'fim')::timestamptz=ends) THEN
    RAISE EXCEPTION 'Estado final de ativacao/auditoria incoerente.'; END IF;
  result:=jsonb_build_object('id_campanha',campaign.id_campanha,'status','ativa','data_inicio',started,'data_fim',ends);
  RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ativar_campanha_segura(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_campanha_segura(text,text) TO authenticated;

CREATE FUNCTION roleapp_security.protect_campaign_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'rascunho' OR NEW.data_inicio IS NOT NULL OR NEW.data_fim IS NOT NULL THEN
      RAISE EXCEPTION 'Nova campanha deve ser rascunho sem vigencia.' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.id_campanha IS DISTINCT FROM OLD.id_campanha OR NEW.id_local IS DISTINCT FROM OLD.id_local OR
      NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR NEW.duracao_dias IS DISTINCT FROM OLD.duracao_dias OR
      NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.tipo IS DISTINCT FROM OLD.tipo THEN
      RAISE EXCEPTION 'Identidade e condicoes comerciais imutaveis.' USING ERRCODE='42501'; END IF;
    IF ROW(NEW.status,NEW.data_inicio,NEW.data_fim) IS DISTINCT FROM ROW(OLD.status,OLD.data_inicio,OLD.data_fim) THEN
      IF NOT roleapp_security.is_admin() OR OLD.status IS DISTINCT FROM 'rascunho' OR NEW.status IS DISTINCT FROM 'ativa' OR
        NEW.data_inicio IS NULL OR NEW.data_fim IS NULL OR
        NEW.data_fim IS DISTINCT FROM NEW.data_inicio+interval '24 hours'*NEW.duracao_dias OR
        NOT EXISTS(SELECT 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid() AND action='campanha_ativada'
          AND details->>'id_campanha'=NEW.id_campanha::text
          AND (details->>'inicio')::timestamptz=NEW.data_inicio AND (details->>'fim')::timestamptz=NEW.data_fim) THEN
        RAISE EXCEPTION 'Transicao ou vigencia nao autorizada.' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_campaign_lifecycle() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_campaign_lifecycle AFTER INSERT OR UPDATE ON public.campanhas_impulsionamento
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_campaign_lifecycle();

CREATE FUNCTION public.listar_ofertas_campanha() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('parceiro','admin')) THEN
    RAISE EXCEPTION 'Perfil autorizado requerido.' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'duracao_dias',duracao_dias,
    'valor_total',valor_total) ORDER BY tipo,duracao_dias),'[]'::jsonb)
    FROM roleapp_security.campaign_offers WHERE active IS TRUE);
END;
$fn$;

CREATE FUNCTION public.listar_destaques_publicos() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id_campanha',c.id_campanha,'id_local',c.id_local,'tipo',c.tipo,
    'titulo',c.titulo,'mensagem',c.mensagem,'status',c.status,
    'data_fim',c.data_fim,'created_at',c.created_at,
    'locais',jsonb_build_object('id_local',l.id_local,'nome',l.nome,'descricao',l.descricao,
      'endereco',l.endereco,'preco',l.preco,'preco_entrada',l.preco_entrada,
      'faixa_preco',l.faixa_preco,'visivel',l.visivel)
  ) ORDER BY c.created_at DESC),'[]'::jsonb)
  FROM public.campanhas_impulsionamento c JOIN public.locais l ON l.id_local = c.id_local
  WHERE c.id_usuario = l.id_proprietario AND c.tipo = 'destaque' AND c.status = 'ativa'
    AND roleapp_security.approved_local_owner(l.id_local::text,c.id_usuario)
    AND l.visivel IS TRUE AND c.data_inicio <= now() AND c.data_fim > now();
$fn$;

CREATE FUNCTION public.registrar_interacao_segura(p_id_local text, p_evento text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE loc public.locais%ROWTYPE; actor_id uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date; inserted integer;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Login requerido.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM roleapp_security.feature_flags WHERE name='metrics_daily_dedup'
    AND enabled IS TRUE) THEN
    RAISE EXCEPTION 'Regra de deduplicacao aguarda decisao documentada.' USING ERRCODE='42501'; END IF;
  IF p_evento IS NULL OR p_evento NOT IN ('view','clique','visita') THEN
    RAISE EXCEPTION 'Interação inválida.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text = p_id_local AND visivel IS TRUE FOR SHARE;
  INSERT INTO roleapp_security.metric_receipts(actor,local_id,event,day)
    VALUES (actor_id,p_id_local,p_evento,today) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN jsonb_build_object('registrada',false); END IF;
  INSERT INTO public.metricas_locais(id_local,data,views,cliques,visitas)
    VALUES (loc.id_local,today,(p_evento='view')::integer,(p_evento='clique')::integer,(p_evento='visita')::integer)
    ON CONFLICT (id_local,data) DO UPDATE SET
      views = coalesce(public.metricas_locais.views,0) + EXCLUDED.views,
      cliques = coalesce(public.metricas_locais.cliques,0) + EXCLUDED.cliques,
      visitas = coalesce(public.metricas_locais.visitas,0) + EXCLUDED.visitas;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 OR NOT EXISTS (SELECT 1 FROM public.metricas_locais
    WHERE id_local=loc.id_local AND data=today AND views>=0 AND cliques>=0 AND visitas>=0) THEN
    RAISE EXCEPTION 'Contabilizacao final incoerente.';
  END IF;
  RETURN jsonb_build_object('registrada',true);
END;
$fn$;

-- Fechar EXECUTE padrão de PUBLIC antes de conceder operações específicas.
REVOKE ALL ON FUNCTION public.decidir_parceria_segura(uuid,text,text,text,text,boolean,boolean,jsonb),
  public.solicitar_campanha_segura(text,text,text,text,text[],text,integer,integer),
  public.listar_destaques_publicos(), public.registrar_interacao_segura(text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_admin(),public.revisar_parceria_segura(text),
  public.listar_ofertas_campanha() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listar_solicitacoes_admin(),public.revisar_parceria_segura(text),
  public.listar_ofertas_campanha() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decidir_parceria_segura(uuid,text,text,text,text,boolean,boolean,jsonb),
  public.solicitar_campanha_segura(text,text,text,text,text[],text,integer,integer),
  public.registrar_interacao_segura(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_destaques_publicos() TO anon, authenticated;

CREATE FUNCTION roleapp_security.protect_review_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NEW.id_local IS DISTINCT FROM OLD.id_local OR NEW.id_usuario IS DISTINCT FROM OLD.id_usuario THEN
    RAISE EXCEPTION 'Identidade da avaliacao imutavel.' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_review_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_review_identity AFTER UPDATE ON public.avaliacoes_locais
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_review_identity();

-- Substituição coordenada: somente as tabelas explicitamente listadas e cujos
-- snapshots foram revisados no preflight. Não deixa permissivas antigas em OR.
DO $access_v2$
DECLARE target text; cols text; policy record; sequence_ref record; old_rpc record;
  read_rule text; write_rule text; delete_rule text; insert_cols text; update_cols text; public_read boolean;
BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
  FOR sequence_ref IN SELECT c.oid::regclass AS name,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='S' AND n.nspname IN ('public','roleapp_security') LOOP
    IF sequence_ref.nspname='roleapp_security' OR
      sequence_ref.name=pg_get_serial_sequence('public.roleapp_admin_audit','id')::regclass THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
    ELSE
      -- Não apagar USAGE/SELECT de inserts legados fora do escopo (ex.: avaliacoes).
      -- UPDATE permite setval; privilégios herdados continuam verificados no postflight.
      EXECUTE format('REVOKE UPDATE ON SEQUENCE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
    END IF;
  END LOOP;
  -- Controles administrativos nunca pertencem aos clientes, mesmo nas demais tabelas.
  FOR sequence_ref IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname='public' LOOP
    EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
    IF sequence_ref.name IN ('public.categorias_cardapio'::regclass,'public.itens_cardapio'::regclass) AND EXISTS(
      SELECT 1 FROM aclexplode(acldefault('r',(SELECT relowner FROM pg_class WHERE oid=sequence_ref.name))) a
      WHERE a.privilege_type='MAINTAIN') THEN
      -- SQL dinâmico: não presume que versões antigas conheçam o privilégio.
      EXECUTE format('REVOKE MAINTAIN ON TABLE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
    END IF;
    SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=sequence_ref.name AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE REFERENCES (%s) ON TABLE %s FROM PUBLIC,anon,authenticated',cols,sequence_ref.name);
  END LOOP;
  -- Cardápio: políticas existentes preservadas; não participam de DROP/CREATE POLICY.
  FOREACH target IN ARRAY ARRAY['solicitacoes_parceria','eventos_locais','campanhas_impulsionamento',
    'metricas_locais','locais','horarios_funcionamento','usuarios',
    'local_categorias','categorias','favoritos','avaliacoes_locais'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',target);
    SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=to_regclass('public.' || target) AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',cols,target);
    FOR policy IN SELECT polname FROM pg_policy WHERE polrelid=to_regclass('public.' || target) LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',policy.polname,target);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    public_read:=true; insert_cols:=NULL; update_cols:=NULL; write_rule:='false'; delete_rule:='false';
    read_rule:='roleapp_security.local_public(id_local::text) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
    CASE target
    WHEN 'locais' THEN
      read_rule:='visivel IS TRUE OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
      update_cols:='nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel';
      write_rule:='id_proprietario=auth.uid() AND roleapp_security.partner_owns(id_local::text)';
    WHEN 'solicitacoes_parceria' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid() OR roleapp_security.is_admin()';
      insert_cols:='id_usuario,nome,email,estabelecimento,cidade_estado,status';
      write_rule:='id_usuario=auth.uid() AND status=''pendente''';
    WHEN 'eventos_locais' THEN
      read_rule:='(ativo IS TRUE AND roleapp_security.local_public(id_local::text)) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
      insert_cols:='id_local,titulo,dias,hora,detalhes,ativo'; update_cols:='titulo,dias,hora,detalhes,ativo';
      write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'horarios_funcionamento' THEN
      insert_cols:='id_local,dia_semana,abre,fecha,fechado'; update_cols:='dia_semana,abre,fecha,fechado';
      write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'usuarios' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid() OR roleapp_security.is_admin()';
      update_cols:='nome,foto_url,preferencias'; write_rule:='id_usuario=auth.uid()';
    WHEN 'campanhas_impulsionamento' THEN
      public_read:=false; read_rule:='(id_usuario=auth.uid() AND roleapp_security.partner_owns(id_local::text)) OR roleapp_security.is_admin()';
    WHEN 'metricas_locais' THEN
      public_read:=false; read_rule:='roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
    WHEN 'local_categorias' THEN
      insert_cols:='id_local,id_categoria'; write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'categorias' THEN read_rule:='true';
    WHEN 'favoritos' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid()';
      insert_cols:='id_usuario,id_local'; write_rule:='id_usuario=auth.uid() AND roleapp_security.local_public(id_local::text)';
      delete_rule:='id_usuario=auth.uid()';
    WHEN 'avaliacoes_locais' THEN
      read_rule:='(' || read_rule || ') OR id_usuario=auth.uid()';
      insert_cols:='id_local,id_usuario,nota,comentario,updated_at'; update_cols:=insert_cols;
      write_rule:='id_usuario=auth.uid() AND roleapp_security.local_public(id_local::text)';
      delete_rule:='id_usuario=auth.uid()';
    END CASE;
    EXECUTE format('GRANT SELECT ON public.%I TO %s',target,CASE WHEN public_read THEN 'anon,authenticated' ELSE 'authenticated' END);
    EXECUTE format('CREATE POLICY roleapp_read ON public.%I FOR SELECT TO anon,authenticated USING (%s)',target,read_rule);
    IF insert_cols IS NOT NULL THEN
      EXECUTE format('GRANT INSERT (%s) ON public.%I TO authenticated',insert_cols,target);
      EXECUTE format('CREATE POLICY roleapp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',target,write_rule);
    END IF;
    IF update_cols IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated',update_cols,target);
      EXECUTE format('CREATE POLICY roleapp_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',target,write_rule,write_rule);
    END IF;
    IF delete_rule<>'false' THEN
      EXECUTE format('GRANT DELETE ON public.%I TO authenticated',target);
      EXECUTE format('CREATE POLICY roleapp_delete ON public.%I FOR DELETE TO authenticated USING (%s)',target,delete_rule);
    END IF;
  END LOOP;
  -- Defaults podem referenciar sequência sem OWNED BY: seguir dependência, não só pg_get_serial_sequence.
  FOR sequence_ref IN
    SELECT DISTINCT s.oid::regclass AS name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    JOIN pg_depend dep ON (dep.classid='pg_attrdef'::regclass AND dep.objid=d.oid AND dep.refclassid='pg_class'::regclass) OR
      (dep.classid='pg_class'::regclass AND dep.refobjid=t.oid AND dep.refobjsubid=a.attnum AND dep.deptype IN ('a','i'))
    JOIN pg_class s ON s.oid=CASE WHEN dep.classid='pg_attrdef'::regclass THEN dep.refobjid ELSE dep.objid END AND s.relkind='S'
    WHERE n.nspname='public' AND t.relname IN ('solicitacoes_parceria','eventos_locais','horarios_funcionamento',
      'categorias_cardapio','itens_cardapio','local_categorias','favoritos','avaliacoes_locais') LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',sequence_ref.name);
  END LOOP;
  FOR old_rpc IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='incrementar_metrica' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',old_rpc.name);
    IF has_function_privilege('anon',old_rpc.name::text,'EXECUTE') OR has_function_privilege('authenticated',old_rpc.name::text,'EXECUTE') THEN
      RAISE EXCEPTION 'RPC antiga ainda executavel por heranca.'; END IF;
  END LOOP;
END;
$access_v2$;

-- TRUNCATE e propriedade ignoram RLS: recusar aplicação com caminhos herdados.
DO $postflight$
DECLARE client_role text; target regclass; item record; allowed boolean; preserved_hash text;
BEGIN
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO preserved_hash
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' OR (n.nspname='public' AND c.relname IN ('categorias_cardapio','itens_cardapio'));
  IF preserved_hash IS DISTINCT FROM current_setting('roleapp.review.preserved_policies') THEN
    RAISE EXCEPTION 'Politicas de Storage/Cardapio divergiram; reverter corte.'; END IF;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_schema_privilege(client_role,'roleapp_security','CREATE') THEN
      RAISE EXCEPTION 'Papel % pode criar objetos no schema interno.',client_role;
    END IF;
    FOR target IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','roleapp_security') AND c.relkind IN ('r','p') LOOP
      IF target IN ('public.categorias_cardapio'::regclass,'public.itens_cardapio'::regclass) AND EXISTS(
        SELECT 1 FROM aclexplode(acldefault('r',(SELECT relowner FROM pg_class WHERE oid=target))) a
        WHERE a.privilege_type='MAINTAIN') THEN
        IF has_table_privilege(client_role,target,'MAINTAIN') THEN
          RAISE EXCEPTION 'MAINTAIN efetivo/herdado ainda permitido em %.',target; END IF;
      END IF;
      IF has_table_privilege(client_role,target,'TRUNCATE,REFERENCES,TRIGGER') OR
        has_any_column_privilege(client_role,target,'REFERENCES') OR EXISTS (
        SELECT 1 FROM pg_class c WHERE c.oid = target AND pg_has_role(client_role,c.relowner,'MEMBER')) THEN
        RAISE EXCEPTION 'Papel % pode truncar ou assumir dono de %.',client_role,target;
      END IF;
    END LOOP;
    IF has_schema_privilege(client_role,'public','CREATE') THEN
      RAISE EXCEPTION 'CREATE herdado no schema publico.'; END IF;
    FOR item IN SELECT c.oid,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='S' AND n.nspname IN ('public','roleapp_security') LOOP
      IF has_sequence_privilege(client_role,item.oid,'UPDATE') OR pg_has_role(client_role,item.relowner,'MEMBER') THEN
        RAISE EXCEPTION 'Manipulacao de sequencia ainda permitida.'; END IF;
    END LOOP;
    FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='roleapp_security' LOOP
      allowed:=item.proname IN ('is_admin','partner_owns','local_public');
      IF has_function_privilege(client_role,item.oid,'EXECUTE') IS DISTINCT FROM allowed THEN
        RAISE EXCEPTION 'EXECUTE divergente no helper %.',item.proname; END IF;
    END LOOP;
    FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('decidir_parceria_segura','revisar_parceria_segura',
        'listar_solicitacoes_admin','solicitar_campanha_segura','listar_ofertas_campanha',
        'listar_destaques_publicos','registrar_interacao_segura','ativar_campanha_segura') LOOP
      allowed:=client_role='authenticated' OR item.proname='listar_destaques_publicos';
      IF has_function_privilege(client_role,item.oid,'EXECUTE') IS DISTINCT FROM allowed THEN
        RAISE EXCEPTION 'EXECUTE divergente na RPC %.',item.proname; END IF;
    END LOOP;
  END LOOP;
END;
$postflight$;
COMMIT;
