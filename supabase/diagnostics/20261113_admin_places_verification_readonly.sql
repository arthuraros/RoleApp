-- VERIFICACAO ADMINISTRATIVA / FOCO LOCAIS. SOMENTE CATALOGO; NAO CHAMA RPC.
-- Executar o arquivo inteiro no SQL Editor como responsavel autorizado.
-- Um unico resultado JSON; exportar integralmente sem truncar os arrays.
-- Nao acessa linhas de usuarios/locais/campanhas; nao inclui corpos de funcoes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH RECURSIVE expected_relations(name) AS (VALUES
  ('public.user_roles'),('public.usuarios'),('public.solicitacoes_parceria'),
  ('public.locais'),('public.campanhas_impulsionamento'),('public.campanhas'),
  ('public.metricas_locais'),('public.roleapp_admin_audit'),
  ('roleapp_security.admin_access'),('roleapp_security.admin_capability_grants'),
  ('roleapp_security.local_admin_state'),('roleapp_security.campaign_admin_reviews'),
  ('roleapp_security.partnership_reviews'),('roleapp_security.request_local_links'),
  ('roleapp_security.campaign_offers')),
clients AS (
  SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolbypassrls
  FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator','supabase_auth_admin')
), relations AS (
  SELECT c.*,n.nspname AS schema_name FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','f','v','m') AND
    (n.nspname IN ('public','roleapp_security') OR
     (n.nspname='auth' AND c.relname='users'))
), relation_info AS (
  SELECT oid::regclass::text AS relation,relkind,pg_get_userbyid(relowner) AS owner,
    relrowsecurity AS rls_enabled,relforcerowsecurity AS force_rls,reloptions,relacl AS raw_acl
  FROM relations
), columns_info AS (
  SELECT c.oid::regclass::text AS relation,a.attnum,a.attname AS column_name,
    format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression,
    a.attacl AS column_acl
  FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
), type_tree(oid) AS (
  SELECT DISTINCT a.atttypid FROM pg_attribute a
  WHERE a.attrelid IN (SELECT oid FROM relations) AND a.attnum>0 AND NOT a.attisdropped
  UNION
  SELECT t.typbasetype FROM pg_type t JOIN type_tree tt ON tt.oid=t.oid WHERE t.typbasetype<>0
), domains_info AS (
  SELECT n.nspname AS schema_name,t.typname,format_type(t.typbasetype,t.typtypmod) AS base_type,
    t.typnotnull,pg_get_expr(t.typdefaultbin,0) AS default_expression,
    (SELECT jsonb_agg(jsonb_build_object('name',k.conname,
      'definition',pg_get_constraintdef(k.oid,true),'validated',k.convalidated) ORDER BY k.conname)
      FROM pg_constraint k WHERE k.contypid=t.oid) AS constraints
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE t.typtype='d' AND t.oid IN (SELECT oid FROM type_tree)
), constraints_info AS (
  SELECT k.conrelid::regclass::text AS source,
    CASE WHEN k.confrelid<>0 THEN k.confrelid::regclass::text END AS target,
    k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,
    pg_get_constraintdef(k.oid,true) AS definition
  FROM pg_constraint k
  WHERE k.conrelid IN (SELECT oid FROM relations) OR k.confrelid IN (SELECT oid FROM relations)
), enum_info AS (
  SELECT n.nspname AS schema_name,t.typname,e.enumsortorder,e.enumlabel
  FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE t.oid IN (SELECT oid FROM type_tree)
), indexes_info AS (
  SELECT i.indrelid::regclass::text AS relation,i.indisunique,i.indisvalid,i.indisready,
    pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM relations)
), table_access AS (
  SELECT c.oid::regclass::text AS relation,r.rolname,
    has_schema_privilege(r.oid,c.relnamespace,'USAGE') AS schema_usage,
    pg_has_role(r.oid,c.relowner,'USAGE') AS inherits_owner,
    pg_has_role(r.oid,c.relowner,'MEMBER') AS owner_membership,
    has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
    has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
    has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
    has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,
    has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate,
    has_table_privilege(r.oid,c.oid,'REFERENCES') AS can_reference,
    has_table_privilege(r.oid,c.oid,'TRIGGER') AS can_trigger
  FROM relations c CROSS JOIN clients r WHERE r.rolname IN ('anon','authenticated')
), column_access AS (
  SELECT c.oid::regclass::text AS relation,a.attname AS column_name,r.rolname,
    has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS can_select,
    has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS can_insert,
    has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update
  FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN clients r
  WHERE a.attnum>0 AND NOT a.attisdropped AND r.rolname IN ('anon','authenticated')
), policies_info AS (
  SELECT p.polrelid::regclass::text AS relation,p.polname,p.polcmd,p.polpermissive,
    ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id)::text END
      FROM unnest(p.polroles) role_id) AS roles,
    pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck,p.polrelid) AS with_check_expression
  FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM relations)
), expected_rpcs(name) AS (VALUES
  ('listar_solicitacoes_admin'),('encaminhar_solicitacao_decisao'),
  ('decidir_solicitacao_comercial'),('obter_detalhe_decisao_admin'),
  ('revisar_parceria_segura'),('decidir_parceria_segura'),('atualizar_localizacao_parceiro'),
  ('solicitar_campanha_segura'),('ativar_campanha_segura'),('listar_destaques_publicos'),
  ('listar_ofertas_campanha'),('obter_minhas_permissoes_admin'),
  ('listar_locais_admin'),('obter_local_admin'),('editar_local_admin'),
  ('definir_visibilidade_local_admin'),('arquivar_local_admin'),
  ('listar_campanhas_admin'),('decidir_campanha_admin'),('pausar_campanha_admin'),
  ('retomar_campanha_admin'),('encerrar_campanha_admin'),
  ('listar_administradores'),('conceder_acesso_admin'),('revogar_acesso_admin')),
rpc_existence AS (
  SELECT e.name,coalesce(jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid)
    FILTER (WHERE p.oid IS NOT NULL),'[]'::jsonb) AS public_signatures
  FROM expected_rpcs e
  LEFT JOIN pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
  GROUP BY e.name
), routines AS (
  SELECT p.*,n.nspname AS schema_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind IN ('f','p') AND
    (n.nspname IN ('public','roleapp_security') OR
     p.oid IN (SELECT t.tgfoid FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations)) OR
     p.oid IN (SELECT d.refobjid FROM pg_depend d JOIN pg_policy pol ON pol.oid=d.objid
       WHERE d.classid='pg_policy'::regclass AND d.refclassid='pg_proc'::regclass
         AND pol.polrelid IN (SELECT oid FROM relations)))
), routine_info AS (
  SELECT p.oid::regprocedure::text AS signature,p.schema_name,p.prokind,
    pg_get_function_identity_arguments(p.oid) AS arguments_without_defaults,
    p.pronargdefaults AS default_argument_count,pg_get_function_result(p.oid) AS result,
    p.proretset AS returns_set,pg_get_userbyid(p.proowner) AS owner,
    owner_role.rolsuper AS owner_superuser,owner_role.rolbypassrls AS owner_bypassrls,
    p.prosecdef AS security_definer,l.lanname AS language,
    ARRAY(SELECT setting FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting
      WHERE split_part(setting,'=',1) IN ('search_path','row_security')) AS security_settings,
    md5(pg_get_functiondef(p.oid)) AS definition_hash,
    (SELECT jsonb_agg(jsonb_build_object('grantee',
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee)::text END,
      'privilege',x.privilege_type,'grantable',x.is_grantable))
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) AS grants,
    (SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'schema_usage',has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'execute',has_function_privilege(r.oid,p.oid,'EXECUTE')) ORDER BY r.rolname)
      FROM clients r WHERE r.rolname IN ('anon','authenticated')) AS effective_access,
    p.prosrc ~* '(^|[^a-z_])execute([^a-z_]|$)' AS dynamic_sql_hint
  FROM routines p JOIN pg_language l ON l.oid=p.prolang JOIN pg_roles owner_role ON owner_role.oid=p.proowner
), triggers_info AS (
  SELECT t.tgrelid::regclass::text AS relation,t.tgname,t.tgenabled,t.tgisinternal,
    t.tgfoid::regprocedure::text AS function_signature,pg_get_triggerdef(t.oid,true) AS definition
  FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations)
), views_info AS (
  SELECT c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,
    c.relkind,c.reloptions,c.relacl,pg_get_viewdef(c.oid,true) AS definition
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('v','m') AND (n.nspname IN ('public','roleapp_security') OR
    EXISTS (SELECT 1 FROM pg_rewrite rw JOIN pg_depend d ON d.objid=rw.oid
      WHERE rw.ev_class=c.oid AND d.classid='pg_rewrite'::regclass
        AND d.refclassid='pg_class'::regclass AND d.refobjid IN (SELECT oid FROM relations)))
), schema_access AS (
  SELECT n.nspname,r.rolname,
    has_schema_privilege(r.oid,n.oid,'USAGE') AS can_use,
    has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create
  FROM pg_namespace n CROSS JOIN clients r
  WHERE n.nspname IN ('public','roleapp_security','auth')
), memberships AS (
  SELECT parent.rolname AS parent_role,member.rolname AS member_role,m.admin_option,
    to_jsonb(m)->'inherit_option' AS inherit_option,to_jsonb(m)->'set_option' AS set_option
  FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
  JOIN pg_roles member ON member.oid=m.member
), defaults_info AS (
  SELECT pg_get_userbyid(d.defaclrole) AS creator,n.nspname AS schema_name,
    d.defaclobjtype,d.defaclacl FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname IN ('public','roleapp_security') OR d.defaclnamespace=0
), sequence_access AS (
  SELECT c.oid::regclass::text AS sequence_name,r.rolname,
    has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
    has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
    has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_setval
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN clients r
  WHERE c.relkind='S' AND n.nspname IN ('public','roleapp_security') AND r.rolname IN ('anon','authenticated')
)
SELECT jsonb_build_object(
  'inspection',jsonb_build_object('at',current_timestamp,'role',current_user,
    'server_version',current_setting('server_version'),'read_only',current_setting('transaction_read_only'),
    'session_api_schemas',current_setting('pgrst.db_schemas',true)),
  'expected_relations',(SELECT jsonb_agg(jsonb_build_object('name',name,
    'installed',to_regclass(name)::text) ORDER BY name) FROM expected_relations),
  'relations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation) FROM relation_info x),
  'columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,attnum) FROM columns_info x),
  'constraints',(SELECT jsonb_agg(to_jsonb(x) ORDER BY source,conname) FROM constraints_info x),
  'enums',(SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,typname,enumsortorder) FROM enum_info x),
  'domains',(SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,typname) FROM domains_info x),
  'indexes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,definition) FROM indexes_info x),
  'table_access',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,rolname) FROM table_access x),
  'column_access',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,column_name,rolname) FROM column_access x),
  'policies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,polname) FROM policies_info x),
  'expected_rpcs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM rpc_existence x),
  'routines',(SELECT jsonb_agg(to_jsonb(x) ORDER BY signature) FROM routine_info x),
  'triggers',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation,tgname) FROM triggers_info x),
  'views',(SELECT jsonb_agg(to_jsonb(x) ORDER BY relation) FROM views_info x),
  'client_roles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY rolname) FROM clients x),
  'schema_access',(SELECT jsonb_agg(to_jsonb(x) ORDER BY nspname,rolname) FROM schema_access x),
  'memberships',(SELECT jsonb_agg(to_jsonb(x) ORDER BY parent_role,member_role) FROM memberships x),
  'default_privileges',(SELECT jsonb_agg(to_jsonb(x) ORDER BY creator,schema_name,defaclobjtype) FROM defaults_info x),
  'sequence_access',(SELECT jsonb_agg(to_jsonb(x) ORDER BY sequence_name,rolname) FROM sequence_access x)
) AS admin_verification_result;

ROLLBACK;
