-- PROPOSTA BLOQUEADA 07_usuarios_leitura: Restringir leitura de perfil sem alterar Auth ou gravacoes existentes.
-- Preserva UPDATE existente de nome/foto e provisioning por Auth, que exigem auditoria separada. Responsavel de local e autor de avaliacao nao justificam expor perfil completo. Revisar SELECT * externo/RETURNING antes de mudar grants.
-- NAO EXECUTAR. Nao e migracao liberada, nem substitui os corpos reais das RPCs.
-- Gerar artefato final por revisao; nao remover travas ou executar trechos.
-- Nao cria tabelas/helpers, nao substitui RPCs e nao altera linhas de negocio.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

DO $blocked$
BEGIN
  RAISE EXCEPTION 'HARDENING 07_usuarios_leitura BLOQUEADO: falta revisao/aprovacao explicita do contrato ativo';
END;
$blocked$;

DO $preflight$
DECLARE
  approved_expected_fingerprint text := NULL;
  dependency_map_approved boolean := false;
  rpc_bodies_approved boolean := false;
  unsafe_alternative_routes_closed boolean := false;
  public_projection_approved boolean := false;
  helper_contracts_approved boolean := false;
  audit_contract_approved boolean := false;
  compatibility_clone_passed boolean := false;
  reversal_plan_approved boolean := false;
  reviewed_legacy_classification text := NULL;
  target text; client text; helper text; actual_fingerprint text;
BEGIN
  IF approved_expected_fingerprint IS NULL OR
    NOT dependency_map_approved OR NOT rpc_bodies_approved OR NOT unsafe_alternative_routes_closed OR
    NOT public_projection_approved OR NOT helper_contracts_approved OR
    NOT audit_contract_approved OR NOT compatibility_clone_passed OR NOT reversal_plan_approved THEN
    RAISE EXCEPTION 'Manifesto e evidencias ausentes: nao aplicar 07_usuarios_leitura';
  END IF;
  -- A fonte de papel do app nao pode ser gravavel diretamente pelo cliente.
  -- Nao revoga aqui: divergencia exige correcao separada e provisioning preservado.
  IF to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'Fonte user_roles ainda nao confirmada';
  END IF;
  FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(client,'public.user_roles','INSERT') OR
       has_table_privilege(client,'public.user_roles','UPDATE') OR
       has_table_privilege(client,'public.user_roles','DELETE') OR
       has_table_privilege(client,'public.user_roles','TRUNCATE') OR
       has_any_column_privilege(client,'public.user_roles','INSERT') OR
       has_any_column_privilege(client,'public.user_roles','UPDATE') THEN
      RAISE EXCEPTION 'Fonte administrativa com escrita cliente: revisar user_roles antes do corte';
    END IF;
  END LOOP;

  FOREACH target IN ARRAY ARRAY['public.usuarios']::text[] LOOP
    IF to_regclass(target) IS NULL THEN RAISE EXCEPTION 'Alvo nao confirmado: %',target; END IF;
    EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE NOWAIT',to_regclass(target));
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client) OR EXISTS (
        SELECT 1 FROM pg_roles r JOIN pg_class c ON c.oid=to_regclass(target)
        WHERE r.rolname=client AND (r.rolsuper OR r.rolbypassrls OR pg_has_role(r.oid,c.relowner,'MEMBER'))
      ) THEN RAISE EXCEPTION 'Papel cliente ausente ou bypass/propriedade herdada: %',client; END IF;
    END LOOP;
  END LOOP;
  FOREACH helper IN ARRAY ARRAY[]::text[] LOOP
    IF to_regprocedure(helper) IS NULL THEN
      RAISE EXCEPTION 'Helper apenas proposto, nao instalado/revisado: %',helper;
    END IF;
  END LOOP;
  -- Mesma consulta de fingerprint do diagnostico; comparar catalogo APOS etapas anteriores.
  WITH relations AS (
  SELECT c.*, n.nspname AS schema_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','f','v','m','S') AND
    (n.nspname IN ('public','roleapp_security') OR (n.nspname='auth' AND c.relname='users'))
), routines AS (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind IN ('f','p') AND (n.nspname IN ('public','roleapp_security') OR
    p.oid IN (SELECT t.tgfoid FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations)))
), manifest AS (
  SELECT jsonb_build_object(
    'server_version',current_setting('server_version'),
    'relations',(SELECT jsonb_agg(jsonb_build_object(
      'name',c.oid::regclass::text,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'options',c.reloptions,
      'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,
        format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
        pg_get_expr(d.adbin,d.adrelid),a.attacl::text) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conrelid::regclass::text,k.conname,k.contype,
        pg_get_constraintdef(k.oid,true),k.convalidated) ORDER BY k.conrelid::regclass::text,k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid OR k.confrelid=c.oid),
      'policies',(SELECT jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,
        ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x)::text END
          FROM unnest(p.polroles) x),
        pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid),
      'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,
        pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid),
      'rules',(SELECT jsonb_agg(pg_get_ruledef(r.oid,true) ORDER BY r.rulename)
        FROM pg_rewrite r WHERE r.ev_class=c.oid),
      'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid))
        FROM pg_index i WHERE i.indrelid=c.oid)
    ) ORDER BY c.oid::regclass::text) FROM relations c),
    'types',(SELECT jsonb_agg(jsonb_build_array(n.nspname,t.typname,t.typtype,
      format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,
      (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),
      (SELECT jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.contypid=t.oid))
      ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname IN ('public','roleapp_security') AND t.typtype IN ('d','e')),
    'routines',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,
      pg_get_userbyid(p.proowner),p.prosecdef,p.proacl::text,p.proconfig,
      md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text) FROM routines p),
    'schemas',(SELECT jsonb_agg(jsonb_build_array(n.nspname,pg_get_userbyid(n.nspowner),n.nspacl::text)
      ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname IN ('public','auth','roleapp_security')),
    'roles',(SELECT jsonb_agg(jsonb_build_array(r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolbypassrls)
      ORDER BY r.rolname) FROM pg_roles r),
    'memberships',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
      pg_get_userbyid(m.member),m.admin_option,to_jsonb(m)->'inherit_option',to_jsonb(m)->'set_option')
      ORDER BY pg_get_userbyid(m.roleid),pg_get_userbyid(m.member)) FROM pg_auth_members m),
    'default_privileges',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),
      n.nspname,d.defaclobjtype,d.defaclacl::text) ORDER BY pg_get_userbyid(d.defaclrole),
      coalesce(n.nspname,''),d.defaclobjtype) FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
    'api_settings',(SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN s.setrole=0 THEN 'ALL' ELSE pg_get_userbyid(s.setrole)::text END,
      CASE WHEN s.setdatabase=0 THEN 'ALL' ELSE d.datname END, setting)
      ORDER BY s.setrole,s.setdatabase,setting)
      FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) setting
      WHERE (s.setdatabase=0 OR d.datname=current_database())
        AND split_part(setting,'=',1) IN ('search_path','row_security',
          'pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_pre_request','pgrst.db_anon_role'))
  ) AS value
)
  SELECT md5(value::text) INTO actual_fingerprint FROM manifest;
  IF actual_fingerprint IS DISTINCT FROM approved_expected_fingerprint THEN
    RAISE EXCEPTION 'Drift de catalogo: interromper, inventariar novamente e revisar';
  END IF;
END;
$preflight$;

-- DDL CANDIDATO. Policies novas limitam permissivas antigas sem DROP generico.
REVOKE SELECT ON TABLE public.usuarios FROM PUBLIC,anon,authenticated;
DO $columns$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols
    FROM pg_attribute WHERE attrelid='public.usuarios'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s) ON TABLE public.usuarios FROM PUBLIC,anon,authenticated',cols);
END;
$columns$;
GRANT SELECT (id_usuario,nome,foto_url) ON TABLE public.usuarios TO authenticated;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY ra_h20261113_users_self_read ON public.usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING (id_usuario=auth.uid());
CREATE POLICY ra_h20261113_users_self_read_guard ON public.usuarios AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (id_usuario=auth.uid());
-- Leituras administrativas de responsavel: RPC revisada com projecao minima.
-- Nenhuma alteracao de login, cadastro, trigger Auth, UPDATE ou Storage aqui.

DO $postflight$
DECLARE target text; client text; privilege text; col record;
BEGIN
  FOREACH target IN ARRAY ARRAY['public.usuarios']::text[] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(target)) THEN
      RAISE EXCEPTION 'RLS nao habilitada: %',target;
    END IF;
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH privilege IN ARRAY ARRAY[]::text[] LOOP
        IF has_table_privilege(client,target,privilege) THEN
          RAISE EXCEPTION 'Grant efetivo proibido remanescente: %, %, %',target,client,privilege;
        END IF;
      END LOOP;
      FOREACH privilege IN ARRAY ARRAY[]::text[] LOOP
        IF has_any_column_privilege(client,target,privilege) THEN
          RAISE EXCEPTION 'Grant de coluna proibido remanescente: %, %, %',target,client,privilege;
        END IF;
      END LOOP;

      IF has_table_privilege(client,target,'SELECT') THEN
        RAISE EXCEPTION 'SELECT amplo de perfil remanescente: %, %',target,client;
      END IF;
      FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass(target)
        AND attnum>0 AND NOT attisdropped LOOP
        IF has_column_privilege(client,target,col.attname,'SELECT') IS DISTINCT FROM
          (client='authenticated' AND col.attname=ANY(ARRAY['id_usuario','nome','foto_url'])) THEN
          RAISE EXCEPTION 'Projecao de perfil inesperada: %, %',client,col.attname;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$postflight$;

-- Postflight de catalogo nao testa RLS por identidade, concorrencia ou RPC.
-- Testes no clone e smoke tests compativeis sao obrigatorios antes de qualquer corte.
-- Uma futura versao liberada usara COMMIT somente apos revisao; esta sempre reverte.
ROLLBACK;
