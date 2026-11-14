-- Read-only catalog checks for the reviewed admin places foundation/RPC.
-- No business rows are selected. The relation/column and policy checks can be
-- used before or after installation; ACL/RPC checks require their objects.

SELECT
  expected.schema_name,
  expected.relation_name,
  n.oid IS NOT NULL AS schema_exists,
  c.oid IS NOT NULL AND c.relkind IN ('r', 'p') AS table_exists,
  c.relkind AS relation_kind,
  CASE WHEN c.oid IS NOT NULL THEN pg_get_userbyid(c.relowner) END AS owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  ARRAY(
    SELECT a.attname
    FROM pg_attribute a
    WHERE a.attrelid = c.oid
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  ) AS columns,
  ARRAY(
    SELECT p.polname
    FROM pg_policy p
    WHERE p.polrelid = c.oid
    ORDER BY p.polname
  ) AS policies
FROM (VALUES
  ('roleapp_security', 'admin_access'),
  ('roleapp_security', 'admin_capability_grants'),
  ('public', 'user_roles'),
  ('public', 'locais'),
  ('public', 'usuarios')
) AS expected(schema_name, relation_name)
LEFT JOIN pg_namespace n ON n.nspname = expected.schema_name
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = expected.relation_name
ORDER BY expected.relation_name;

SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE n.nspname = 'roleapp_security'
  AND c.relname IN ('admin_access', 'admin_capability_grants')
ORDER BY c.relname, grantee, acl.privilege_type;

SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  p.polname AS policy_name,
  p.polpermissive AS permissive,
  p.polcmd AS command,
  ARRAY(
    SELECT CASE WHEN role_entry.role_oid = 0 THEN 'PUBLIC'
                ELSE pg_get_userbyid(role_entry.role_oid) END
    FROM unnest(p.polroles) AS role_entry(role_oid)
  ) AS roles,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'roleapp_security'
       AND c.relname IN ('admin_access', 'admin_capability_grants'))
   OR (n.nspname = 'public'
       AND c.relname IN ('user_roles', 'locais', 'usuarios'))
ORDER BY n.nspname, c.relname, p.polname;

SELECT
  r.rolname,
  r.rolcanlogin,
  r.rolinherit,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolreplication,
  r.rolbypassrls,
  EXISTS (
    SELECT 1 FROM pg_auth_members m
    WHERE m.roleid = r.oid OR m.member = r.oid
  ) AS has_role_membership,
  (SELECT count(*) FROM pg_proc p WHERE p.proowner = r.oid) AS owned_functions,
  (SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid) AS owned_relations
FROM pg_roles r
WHERE r.rolname = 'roleapp_places_reader';

SELECT
  p.oid::regprocedure AS signature,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE')
    AS service_role_can_execute,
  EXISTS (
    SELECT 1
    FROM aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) AS public_execute,
  to_regprocedure('auth.uid()') IS NOT NULL AS auth_uid_exists,
  ARRAY(
    SELECT DISTINCT format('%I.%I', dep_ns.nspname, dep_rel.relname)
    FROM pg_depend d
    JOIN pg_class dep_rel ON dep_rel.oid = d.refobjid
    JOIN pg_namespace dep_ns ON dep_ns.oid = dep_rel.relnamespace
    WHERE d.classid = 'pg_catalog.pg_proc'::regclass
      AND d.objid = p.oid
      AND d.refclassid = 'pg_catalog.pg_class'::regclass
  ) AS catalog_relation_dependencies
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)'
);

SELECT
  roles.role_name,
  tables.table_name,
  has_table_privilege(roles.role_name, tables.table_name, 'SELECT') AS can_select,
  has_table_privilege(roles.role_name, tables.table_name, 'INSERT') AS can_insert,
  has_table_privilege(roles.role_name, tables.table_name, 'UPDATE') AS can_update,
  has_table_privilege(roles.role_name, tables.table_name, 'DELETE') AS can_delete,
  has_table_privilege(roles.role_name, tables.table_name, 'TRUNCATE') AS can_truncate,
  has_table_privilege(roles.role_name, tables.table_name, 'REFERENCES') AS can_reference,
  has_table_privilege(roles.role_name, tables.table_name, 'TRIGGER') AS can_trigger
FROM (VALUES ('anon'), ('authenticated'), ('service_role'))
  AS roles(role_name)
CROSS JOIN (VALUES
  ('roleapp_security.admin_access'),
  ('roleapp_security.admin_capability_grants')
) AS tables(table_name)
ORDER BY roles.role_name, tables.table_name;

SELECT
  'roleapp_places_reader' AS role_name,
  required.table_name,
  required.column_name,
  has_column_privilege(
    'roleapp_places_reader', required.table_name, required.column_name, 'SELECT'
  ) AS can_select,
  has_column_privilege(
    'roleapp_places_reader', required.table_name, required.column_name, 'INSERT'
  ) AS can_insert,
  has_column_privilege(
    'roleapp_places_reader', required.table_name, required.column_name, 'UPDATE'
  ) AS can_update,
  has_column_privilege(
    'roleapp_places_reader', required.table_name, required.column_name, 'REFERENCES'
  ) AS can_reference
FROM (VALUES
  ('roleapp_security.admin_access', 'user_id'),
  ('roleapp_security.admin_access', 'active'),
  ('roleapp_security.admin_capability_grants', 'user_id'),
  ('roleapp_security.admin_capability_grants', 'capability'),
  ('public.user_roles', 'user_id'),
  ('public.user_roles', 'role'),
  ('public.locais', 'id_local'),
  ('public.locais', 'nome'),
  ('public.locais', 'visivel'),
  ('public.locais', 'endereco'),
  ('public.locais', 'cidade_uf'),
  ('public.locais', 'id_proprietario'),
  ('public.usuarios', 'id_usuario'),
  ('public.usuarios', 'nome')
) AS required(table_name, column_name)
ORDER BY required.table_name, required.column_name;

-- Review this ACL separately as a before/after comparison. The proposal grants
-- no privileges to anon/authenticated/service_role on existing business tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee) END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) AS acl
WHERE (n.nspname = 'public'
       AND c.relname IN ('user_roles', 'locais', 'usuarios'))
ORDER BY n.nspname, c.relname, grantee, acl.privilege_type;

-- Behavioral negative tests must use real staging identities/JWTs through the
-- Supabase API. Expected denial (42501) for anon, ordinary user, partner,
-- admin without active admin_access, admin without locais.ler, and revoked
-- or suspended admin. Use an impossible p_id in every request so an
-- incorrectly-authorized test call cannot return a real place. Also attempt
-- direct REST reads/writes of both private tables and expect denial. A valid
-- admin with active access and locais.ler is the positive control. Do not
-- simulate auth.uid() by setting request.jwt.claim.sub in SQL Editor; that
-- is not an end-to-end authentication test.
