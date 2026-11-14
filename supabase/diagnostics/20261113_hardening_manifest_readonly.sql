-- MANIFESTO DE CATALOGO. SOMENTE LEITURA; NAO CHAMA RPC OU CONSULTA LINHAS DE NEGOCIO.
-- Nao executar nesta etapa. Coleta futura apenas pelo responsavel autorizado.
-- Hash detecta drift, NAO certifica seguranca. Requer revisao do catalogo completo.
-- Compartilhar apenas o digest apos revisao; defaults/config podem conter literais sensiveis.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '30s';

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
SELECT md5(value::text) AS catalog_fingerprint FROM manifest;

ROLLBACK;
