-- BLOCO 2/4: privilégios efetivos, heranças e políticas. SOMENTE LEITURA.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH RECURSIVE clients AS (
  SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres')
), relation_tree(oid) AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','f') AND (n.nspname IN ('public','roleapp_security')
    OR (n.nspname='auth' AND c.relname='users'))
  UNION
  SELECT i.inhrelid FROM relation_tree r JOIN pg_inherits i ON i.inhparent=r.oid
), tables_scope AS (
  SELECT c.*, n.nspname AS schema_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid IN (SELECT oid FROM relation_tree)
), roles_info AS (
  SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
  FROM pg_roles
), memberships AS (
  SELECT parent.rolname AS parent_role, member.rolname AS member_role, m.admin_option,
    to_jsonb(m)->'inherit_option' AS inherit_option,
    to_jsonb(m)->'set_option' AS set_option
  FROM pg_auth_members m JOIN pg_roles parent ON parent.oid = m.roleid
  JOIN pg_roles member ON member.oid = m.member
), effective_tables AS (
  SELECT r.rolname,t.schema_name,t.relname AS table_name,pg_get_userbyid(t.relowner) AS owner,
    t.relrowsecurity AS rls_enabled,t.relforcerowsecurity AS force_rls,
    pg_has_role(r.oid,t.relowner,'USAGE') AS inherits_owner_now,
    pg_has_role(r.oid,t.relowner,'MEMBER') AS owner_membership_review_set_role,
    has_schema_privilege(r.oid,t.relnamespace,'USAGE') AS schema_usage,
    has_table_privilege(r.oid,t.oid,'SELECT') AS table_select,
    has_table_privilege(r.oid,t.oid,'INSERT') AS table_insert,
    has_table_privilege(r.oid,t.oid,'UPDATE') AS table_update,
    has_table_privilege(r.oid,t.oid,'DELETE') AS table_delete,
    has_table_privilege(r.oid,t.oid,'TRUNCATE') AS table_truncate,
    has_table_privilege(r.oid,t.oid,'REFERENCES') AS table_references,
    has_table_privilege(r.oid,t.oid,'TRIGGER') AS table_trigger,
    has_any_column_privilege(r.oid,t.oid,'INSERT') AS any_column_insert,
    has_any_column_privilege(r.oid,t.oid,'UPDATE') AS any_column_update
  FROM tables_scope t CROSS JOIN clients r
), column_access AS (
  SELECT r.rolname,t.schema_name,t.relname AS table_name,a.attname AS column_name,
    has_column_privilege(r.oid,t.oid,a.attnum,'SELECT') AS can_select,
    has_column_privilege(r.oid,t.oid,a.attnum,'INSERT') AS can_insert,
    has_column_privilege(r.oid,t.oid,a.attnum,'UPDATE') AS can_update,
    a.attacl AS explicit_column_acl
  FROM tables_scope t JOIN pg_attribute a ON a.attrelid = t.oid
  CROSS JOIN clients r WHERE r.rolname IN ('anon','authenticated') AND a.attnum > 0 AND NOT a.attisdropped
    AND t.relname IN ('user_roles','solicitacoes_parceria','locais','eventos_locais',
      'campanhas_impulsionamento','metricas_locais','roleapp_admin_audit','metric_receipts')
), table_acl AS (
  SELECT t.schema_name,t.relname AS table_name,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
    pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
  FROM tables_scope t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
), schemas_info AS (
  SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,n.nspacl AS raw_acl,r.rolname,
    has_schema_privilege(r.oid,n.oid,'USAGE') AS can_use,
    has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create
  FROM pg_namespace n CROSS JOIN clients r WHERE n.nspname IN ('public','auth','roleapp_security')
), database_access AS (
  SELECT r.rolname,has_database_privilege(r.oid,current_database(),'CONNECT') AS can_connect,
    has_database_privilege(r.oid,current_database(),'CREATE') AS can_create_schema,
    has_database_privilege(r.oid,current_database(),'TEMPORARY') AS can_create_temp
  FROM clients r
), sequences_info AS (
  SELECT n.nspname AS schema_name,c.relname AS sequence_name,pg_get_userbyid(c.relowner) AS owner,
    c.relacl AS raw_acl,r.rolname,
    has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
    has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
    has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update_setval
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN clients r
  WHERE c.relkind = 'S' AND n.nspname IN ('public','roleapp_security')
), defaults_info AS (
  SELECT pg_get_userbyid(d.defaclrole) AS creator_role,n.nspname AS schema_name,
    d.defaclobjtype AS object_type,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee,
    a.privilege_type,a.is_grantable
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
), policies_info AS (
  SELECT t.schema_name,t.relname AS table_name,t.relrowsecurity AS rls_enabled,
    p.polname,p.polpermissive,
    CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
    ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x)::text END
      FROM unnest(p.polroles) x) AS roles,
    pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck,p.polrelid) AS with_check_expression
  FROM tables_scope t JOIN pg_policy p ON p.polrelid=t.oid
)
SELECT jsonb_build_object(
  'bloco',2,'inspection_role',current_user,'read_only',current_setting('transaction_read_only'),
  'roles',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY rolname) FROM roles_info x),'[]'::jsonb),
  'memberships',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM memberships x),'[]'::jsonb),
  'effective_tables',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,rolname) FROM effective_tables x),'[]'::jsonb),
  'column_access',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,column_name,rolname) FROM column_access x),'[]'::jsonb),
  'table_acl',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM table_acl x),'[]'::jsonb),
  'schema_access',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM schemas_info x),'[]'::jsonb),
  'database_access',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM database_access x),'[]'::jsonb),
  'sequence_access',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sequences_info x),'[]'::jsonb),
  'default_privileges',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM defaults_info x),'[]'::jsonb),
  'policies',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY schema_name,table_name,polname) FROM policies_info x),'[]'::jsonb)
) AS validation_result;
ROLLBACK;
