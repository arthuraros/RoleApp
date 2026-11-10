-- BLOCO 3/4: funções/triggers/views/caminhos alternativos. SOMENTE LEITURA.
-- NÃO retorna pg_get_functiondef, prosrc, prosqlbody ou valores de defaults de RPC.
-- Flags textuais são triagem, não prova de segurança ou mapa completo de dependências.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH targets AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' OR (n.nspname='auth' AND c.relname='users') OR n.nspname='roleapp_security'
), clients AS (
  SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin')
), relevant_routines AS (
  SELECT p.*,n.nspname AS schema_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind IN ('f','p') AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'
    AND (n.nspname IN ('public','roleapp_security') OR EXISTS (
      SELECT 1 FROM clients r WHERE has_schema_privilege(r.oid,n.oid,'USAGE')
        AND has_function_privilege(r.oid,p.oid,'EXECUTE')
    ) OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid=p.oid AND t.tgrelid IN (SELECT oid FROM targets))
      OR EXISTS (SELECT 1 FROM pg_depend dep JOIN pg_policy pol ON pol.oid=dep.objid
        WHERE dep.classid='pg_policy'::regclass AND dep.refclassid='pg_proc'::regclass
          AND dep.refobjid=p.oid AND pol.polrelid IN (SELECT oid FROM targets))
      OR EXISTS (SELECT 1 FROM pg_event_trigger e WHERE e.evtfoid=p.oid))
), routine_info AS (
  SELECT p.oid,p.schema_name,p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS result_type,p.prokind,p.pronargs,p.pronargdefaults,
    l.lanname AS language,pg_get_userbyid(p.proowner) AS owner,
    owner_role.rolsuper AS owner_superuser,owner_role.rolbypassrls AS owner_bypassrls,
    p.prosecdef AS security_definer,p.provolatile,p.proleakproof,
    ARRAY(SELECT setting FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting
      WHERE split_part(setting,'=',1) IN ('search_path','row_security')) AS security_settings,
    ARRAY(SELECT split_part(setting,'=',1) FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting) AS config_keys_only,
    p.proacl AS raw_acl,
    (SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'schema_usage',has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'execute',has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'member_of_owner',pg_has_role(r.oid,p.proowner,'MEMBER'))) FROM clients r) AS effective_access,
    (SELECT jsonb_agg(jsonb_build_object(
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable))
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) AS grants,
    ARRAY(SELECT name FROM unnest(ARRAY['user_roles','solicitacoes_parceria','locais','eventos_locais',
      'campanhas_impulsionamento','metricas_locais','roleapp_admin_audit','metric_receipts',
      'incrementar_metrica','decidir_parceria_segura','solicitar_campanha_segura',
      'listar_destaques_publicos','registrar_interacao_segura']) name
      WHERE position(name IN lower(p.prosrc))>0) AS source_mentions_triage_only,
    p.prosrc ~* '(^|[^a-z_])execute([^a-z_]|$)' AS dynamic_sql_hint,
    position('set_config' IN lower(p.prosrc))>0 AS sets_configuration_hint,
    position('http' IN lower(p.prosrc))>0 OR position('dblink' IN lower(p.prosrc))>0 AS external_access_hint
  FROM relevant_routines p JOIN pg_language l ON l.oid=p.prolang
  JOIN pg_roles owner_role ON owner_role.oid=p.proowner
), triggers_info AS (
  SELECT t.tgrelid::regclass::text AS table_name,t.tgname,t.tgisinternal,t.tgenabled,
    t.tgfoid::regprocedure::text AS routine,
    p.prosecdef AS function_security_definer,pg_get_userbyid(p.proowner) AS function_owner,
    pg_get_triggerdef(t.oid,true) AS definition
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN (SELECT oid FROM targets)
), event_triggers AS (
  SELECT evtname,evtevent,evtenabled,evttags,pg_get_userbyid(evtowner) AS owner,
    evtfoid::regprocedure::text AS routine FROM pg_event_trigger
), views_rules AS (
  SELECT n.nspname AS schema_name,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
    c.reloptions,c.relacl AS raw_acl,r.rulename,r.ev_type,r.is_instead,
    ARRAY(SELECT DISTINCT dep.refobjid::regclass::text FROM pg_depend dep
      WHERE dep.classid='pg_rewrite'::regclass AND dep.objid=r.oid
        AND dep.refclassid='pg_class'::regclass AND dep.refobjid IN (SELECT oid FROM targets)) AS referenced_relations,
    ARRAY(SELECT DISTINCT dep.refobjid::regprocedure::text FROM pg_depend dep
      WHERE dep.classid='pg_rewrite'::regclass AND dep.objid=r.oid
        AND dep.refclassid='pg_proc'::regclass) AS referenced_routines,
    (SELECT jsonb_agg(jsonb_build_object('role',cl.rolname,
      'schema_usage',has_schema_privilege(cl.oid,c.relnamespace,'USAGE'),
      'select',has_table_privilege(cl.oid,c.oid,'SELECT'),
      'insert',has_table_privilege(cl.oid,c.oid,'INSERT'),
      'update',has_table_privilege(cl.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(cl.oid,c.oid,'DELETE'))) FROM clients cl) AS access
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_rewrite r ON r.ev_class=c.oid
  WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%' AND
    (n.nspname='public' OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_rewrite'::regclass
      AND d.objid=r.oid AND d.refclassid='pg_class'::regclass AND d.refobjid IN (SELECT oid FROM targets)))
), routine_dependencies AS (
  SELECT dep.objid::regprocedure::text AS caller,
    CASE WHEN dep.refclassid='pg_proc'::regclass THEN dep.refobjid::regprocedure::text END AS referenced_routine,
    CASE WHEN dep.refclassid='pg_class'::regclass THEN dep.refobjid::regclass::text END AS referenced_relation,
    dep.deptype
  FROM pg_depend dep WHERE dep.classid='pg_proc'::regclass
    AND dep.objid IN (SELECT oid FROM relevant_routines)
    AND dep.refclassid IN ('pg_proc'::regclass,'pg_class'::regclass)
), role_settings AS (
  SELECT CASE WHEN s.setrole=0 THEN 'ALL' ELSE pg_get_userbyid(s.setrole)::text END AS role_name,
    CASE WHEN s.setdatabase=0 THEN 'ALL' ELSE d.datname END AS database_name,setting
  FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
  CROSS JOIN LATERAL unnest(s.setconfig) setting
  WHERE (s.setdatabase=0 OR d.datname=current_database())
    AND split_part(setting,'=',1) IN ('search_path','row_security','pgrst.db_schemas',
      'pgrst.db_extra_search_path','pgrst.db_pre_request','pgrst.db_anon_role')
), name_collisions AS (
  SELECT 'schema' AS object_type,n.nspname AS object_name FROM pg_namespace n WHERE n.nspname='roleapp_security'
  UNION ALL
  SELECT 'relation',n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' AND c.relname IN ('user_roles','roleapp_admin_audit','roleapp_one_decision_per_request'))
       OR n.nspname='roleapp_security'
  UNION ALL
  SELECT 'routine',p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='roleapp_security' OR (n.nspname='public' AND p.proname IN
      ('decidir_parceria_segura','solicitar_campanha_segura','listar_destaques_publicos','registrar_interacao_segura'))
  UNION ALL
  SELECT 'policy',p.polrelid::regclass::text || ':' || p.polname FROM pg_policy p WHERE left(p.polname,8)='roleapp_'
  UNION ALL
  SELECT 'trigger',t.tgrelid::regclass::text || ':' || t.tgname FROM pg_trigger t WHERE left(t.tgname,8)='roleapp_'
)
SELECT jsonb_build_object(
  'bloco',3,'inspection_role',current_user,'read_only',current_setting('transaction_read_only'),
  'routines',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,proname,identity_arguments) FROM routine_info x),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,tgname) FROM triggers_info x),'[]'::jsonb),
  'event_triggers',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM event_triggers x),'[]'::jsonb),
  'views_rules',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM views_rules x),'[]'::jsonb),
  'routine_dependencies_catalog_only',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM routine_dependencies x),'[]'::jsonb),
  'role_database_settings',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM role_settings x),'[]'::jsonb),
  'runtime_exposed_schemas_hint',current_setting('pgrst.db_schemas',true),
  'runtime_extra_search_path_hint',current_setting('pgrst.db_extra_search_path',true),
  'existing_names',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM name_collisions x),'[]'::jsonb)
) AS validation_result;
ROLLBACK;
