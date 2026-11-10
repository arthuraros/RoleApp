-- Coleta específica pendente. Não executada pelo Codex. Não chama RPCs de negócio.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH targets AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname='public' AND c.relname IN
    ('locais_com_avaliacoes','locais','avaliacoes','avaliacoes_locais','campanhas_impulsionamento',
     'categorias_cardapio','itens_cardapio')) OR (n.nspname='storage' AND c.relkind IN ('r','p'))
), columns_info AS (
  SELECT t.relname,a.attname,a.atttypid,a.atttypmod,a.attcollation,
    format_type(a.atttypid,a.atttypmod) AS type_name,a.attnotnull,a.attnum,
    pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
), dependencies AS (
  SELECT DISTINCT r.ev_class::regclass::text AS dependent_relation,
    n.nspname AS source_schema,c.relname AS source_relation,c.relkind AS source_kind
  FROM pg_rewrite r JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid
    AND d.refclassid='pg_class'::regclass JOIN pg_class c ON c.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (r.ev_class IN (SELECT oid FROM targets) OR d.refobjid IN (SELECT oid FROM targets))
    AND d.refobjid<>r.ev_class
), catalog_dependencies AS (
  SELECT d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,
    pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object
  FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN (SELECT oid FROM targets)
), policies AS (
  SELECT p.polrelid::regclass::text AS relation,p.polname,p.polcmd,p.polpermissive,p.polroles,
    pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
  FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM targets)
), triggers AS (
  SELECT g.tgrelid::regclass::text AS relation,g.tgname,g.tgenabled,pg_get_triggerdef(g.oid,true) AS definition,
    g.tgfoid::regprocedure::text AS function_name,p.prosecdef,p.proconfig,
    md5(pg_get_functiondef(p.oid)) AS function_body_digest
  FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid
  WHERE NOT g.tgisinternal AND g.tgrelid IN (SELECT oid FROM targets)
), constraints_info AS (
  SELECT c.conrelid::regclass::text AS relation,c.conname,c.contype,c.convalidated,
    pg_get_constraintdef(c.oid,true) AS definition
  FROM pg_constraint c WHERE c.conrelid IN (SELECT oid FROM targets)
    OR c.confrelid IN (SELECT oid FROM targets)
), access_info AS (
  SELECT t.relname,r.rolname,
    has_table_privilege(r.oid,t.oid,'SELECT') AS select_table,
    has_table_privilege(r.oid,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_write_or_admin,
    ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0
      AND NOT a.attisdropped AND has_column_privilege(r.oid,t.oid,a.attnum,'SELECT') ORDER BY a.attnum) AS readable_columns
  FROM targets t CROSS JOIN pg_roles r WHERE r.rolname IN ('anon','authenticated')
)
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),
  'inspection_role',current_user,'server_version_num',current_setting('server_version_num'),
  'relations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'kind',relkind,
    'schema',nspname,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'options',reloptions,
    'acl',relacl,'definition',CASE WHEN relkind='v' THEN pg_get_viewdef(oid,true) END)) FROM targets),'[]'::jsonb),
  'columns',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY relname,attnum) FROM columns_info x),'[]'::jsonb),
  'dependencies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM dependencies x),'[]'::jsonb),
  'catalog_dependencies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM catalog_dependencies x),'[]'::jsonb),
  'policies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM policies x),'[]'::jsonb),
  'constraints',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM constraints_info x),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM triggers x),'[]'::jsonb),
  'effective_access',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM access_info x),'[]'::jsonb)
) AS validation_result;
ROLLBACK;
