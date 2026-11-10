-- PROPOSTA BLOQUEADA. NÃO EXECUTAR. Ver docs/compatibilidade-view-campanhas-20261109.md.
-- Preserva a fonte avaliacoes existente; NÃO troca por avaliacoes_locais.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'View bloqueada: depende de aprovar origem, RLS, grants e dependencias reais.';
END;
$guard$;

DO $preflight$
DECLARE
  reviewed_original_definition text := NULL;
  reviewed_column_contract jsonb := NULL;
  reviewed_dependencies jsonb := NULL;
  base_acl_rls_and_privacy_reviewed boolean := false;
  actual_contract jsonb; actual_dependencies jsonb;
BEGIN
  IF current_setting('server_version_num')::integer<150000 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'Requer PostgreSQL 15+ e executor/dono revisados.'; END IF;
  IF reviewed_original_definition IS NULL OR reviewed_column_contract IS NULL OR reviewed_dependencies IS NULL OR
    NOT base_acl_rls_and_privacy_reviewed THEN
    RAISE EXCEPTION 'Manifesto de origem/colunas/dependencias e revisao de acesso pendentes.'; END IF;
  IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')) IS DISTINCT FROM 'v' OR
    pg_get_viewdef('public.locais_com_avaliacoes'::regclass,true) IS DISTINCT FROM reviewed_original_definition THEN
    RAISE EXCEPTION 'Definicao divergiu da revisao.'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN (to_regclass('public.locais'),to_regclass('public.avaliacoes'))
    AND (c.relkind NOT IN ('r','p') OR NOT c.relrowsecurity)) OR to_regclass('public.avaliacoes') IS NULL THEN
    RAISE EXCEPTION 'Revisar fonte avaliacoes e RLS das duas tabelas base.'; END IF;
  SELECT jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attcollation) ORDER BY attnum)
    INTO actual_contract FROM pg_attribute WHERE attrelid='public.locais_com_avaliacoes'::regclass
      AND attnum>0 AND NOT attisdropped;
  SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind) ORDER BY n.nspname,c.relname)
    INTO actual_dependencies FROM (SELECT DISTINCT d.refobjid FROM pg_rewrite r JOIN pg_depend d
      ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid AND d.refclassid='pg_class'::regclass
      WHERE r.ev_class='public.locais_com_avaliacoes'::regclass AND d.refobjid<>r.ev_class) x
    JOIN pg_class c ON c.oid=x.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace;
  IF actual_contract IS DISTINCT FROM reviewed_column_contract OR actual_dependencies IS DISTINCT FROM reviewed_dependencies OR
    actual_dependencies IS DISTINCT FROM jsonb_build_array(
      jsonb_build_array('public','avaliacoes','r'),jsonb_build_array('public','locais','r')) THEN
    RAISE EXCEPTION 'Colunas/dependencias reais exigem conciliacao; nao substituir fontes automaticamente.'; END IF;
  -- Guardar contrato/OID no contexto desta transação, sem modificar dados de negócio.
  PERFORM set_config('roleapp.review.view_oid','public.locais_com_avaliacoes'::regclass::oid::text,true);
  PERFORM set_config('roleapp.review.view_contract',actual_contract::text,true);
END;
$preflight$;

-- Fechar SELECT amplo nas fontes sem tocar nas políticas de escrita existentes.
-- A restrição de locais vale durante o corte; 00200 a substitui pela leitura
-- visível/proprietário aprovado/admin. Implantar em janela sem uso intermediário.
CREATE POLICY roleapp_view_visible_places ON public.locais AS RESTRICTIVE FOR SELECT
  TO anon,authenticated USING (visivel IS TRUE);
CREATE POLICY roleapp_view_visible_reviews ON public.avaliacoes AS RESTRICTIVE FOR SELECT
  TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.locais l WHERE l.id_local=avaliacoes.id_local AND l.visivel IS TRUE));
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT (id_local,nome,descricao,endereco,preco,latitude,longitude,visivel)
  ON TABLE public.locais TO anon,authenticated;
-- Avaliações legadas: somente os três campos usados pela agregação.
REVOKE SELECT ON TABLE public.avaliacoes FROM PUBLIC,anon,authenticated;
DO $review_column_acl$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
    WHERE attrelid='public.avaliacoes'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s) ON TABLE public.avaliacoes FROM PUBLIC,anon,authenticated',cols);
END;
$review_column_acl$;
GRANT SELECT (id_local,nota,id_avaliacao) ON TABLE public.avaliacoes TO anon,authenticated;

CREATE OR REPLACE VIEW public.locais_com_avaliacoes
WITH (security_invoker=true, security_barrier=true) AS
SELECT l.id_local,l.nome,l.descricao,l.endereco,l.preco,l.latitude,l.longitude,
  COALESCE(round(avg(a.nota),1),0::numeric) AS media_avaliacao,
  count(a.id_avaliacao) AS quantidade_avaliacoes
FROM public.locais l
LEFT JOIN public.avaliacoes a ON a.id_local=l.id_local
WHERE l.visivel IS TRUE
GROUP BY l.id_local,l.nome,l.descricao,l.endereco,l.preco,l.latitude,l.longitude;

REVOKE ALL ON TABLE public.locais_com_avaliacoes FROM PUBLIC,anon,authenticated;
DO $column_acl$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
    WHERE attrelid='public.locais_com_avaliacoes'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.locais_com_avaliacoes FROM PUBLIC,anon,authenticated',cols);
END;
$column_acl$;
GRANT SELECT ON TABLE public.locais_com_avaliacoes TO anon,authenticated;

DO $postflight$
DECLARE actual_contract jsonb; actor text;
BEGIN
  SELECT jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attcollation) ORDER BY attnum)
    INTO actual_contract FROM pg_attribute WHERE attrelid='public.locais_com_avaliacoes'::regclass
      AND attnum>0 AND NOT attisdropped;
  IF actual_contract IS DISTINCT FROM current_setting('roleapp.review.view_contract')::jsonb OR
    'public.locais_com_avaliacoes'::regclass::oid::text<>current_setting('roleapp.review.view_oid') THEN
    RAISE EXCEPTION 'Contrato/OID da view alterados.'; END IF;
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF NOT has_table_privilege(actor,'public.locais_com_avaliacoes','SELECT') OR
      has_table_privilege(actor,'public.locais_com_avaliacoes','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_any_column_privilege(actor,'public.locais_com_avaliacoes','INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'ACL efetiva/herdada da view ainda inadequada.'; END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.avaliacoes'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND
      has_column_privilege(actor,a.attrelid,a.attnum,'SELECT') IS DISTINCT FROM
        (a.attname IN ('id_local','nota','id_avaliacao'))) THEN
      RAISE EXCEPTION 'SELECT efetivo/herdado da origem avaliacoes inadequado.'; END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.locais'::regclass
      AND a.attname IN ('id_local','nome','descricao','endereco','preco','latitude','longitude','visivel')
      AND NOT has_column_privilege(actor,a.attrelid,a.attnum,'SELECT')) THEN
      RAISE EXCEPTION 'SELECT insuficiente na origem locais.'; END IF;
  END LOOP;
END;
$postflight$;
COMMIT;
