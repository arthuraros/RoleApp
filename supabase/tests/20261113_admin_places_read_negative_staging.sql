-- Read-only catalog assertions for an approved staging installation.
-- This does not provision users, change privileges, or invoke the RPC.
-- Run only after both proposals have been separately approved and installed.
BEGIN TRANSACTION READ ONLY;

DO $negative_catalog_tests$
DECLARE
  reader_oid oid := 'roleapp_places_reader'::regrole;
  rpc_oid oid := to_regprocedure(
    'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)'
  )::oid;
BEGIN
  IF rpc_oid IS NULL THEN
    RAISE EXCEPTION 'Expected administrative places RPC is not installed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE oid = reader_oid
      AND rolcanlogin IS FALSE
      AND rolinherit IS FALSE
      AND rolsuper IS FALSE
      AND rolcreatedb IS FALSE
      AND rolcreaterole IS FALSE
      AND rolreplication IS FALSE
      AND rolbypassrls IS TRUE
  ) THEN
    RAISE EXCEPTION 'Reader role attributes are unsafe.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = reader_oid OR member = reader_oid
  ) OR
     (SELECT count(*) FROM pg_proc WHERE proowner = reader_oid) <> 1 OR
     EXISTS (SELECT 1 FROM pg_class WHERE relowner = reader_oid) OR
     EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = reader_oid) THEN
    RAISE EXCEPTION 'Reader role is not exclusive to the one RPC.';
  END IF;

  IF (SELECT proowner FROM pg_proc WHERE oid = rpc_oid) <> reader_oid OR
     (SELECT prosecdef FROM pg_proc WHERE oid = rpc_oid) IS NOT TRUE OR
     NOT EXISTS (
       SELECT 1
       FROM pg_proc p
       WHERE p.oid = rpc_oid
         AND p.proconfig @> ARRAY['search_path=pg_catalog']
     ) THEN
    RAISE EXCEPTION 'RPC owner or SECURITY DEFINER settings are unsafe.';
  END IF;

  IF has_function_privilege('anon', rpc_oid, 'EXECUTE') OR
     has_function_privilege('service_role', rpc_oid, 'EXECUTE') OR
     NOT has_function_privilege('authenticated', rpc_oid, 'EXECUTE') OR
     EXISTS (
       SELECT 1
       FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) acl
       WHERE p.oid = rpc_oid
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'RPC EXECUTE privileges are broader than approved.';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE') OR
     has_schema_privilege('authenticated', 'public', 'CREATE') OR
     has_schema_privilege('service_role', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'A client role can create overloads in public.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS privilege(privilege_name)
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
      AND r.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_table_privilege(r.oid, c.oid, privilege.privilege_name)
  ) THEN
    RAISE EXCEPTION 'A client role can directly access an admin table.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS privilege(privilege_name)
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND n.nspname NOT IN (
        'pg_catalog', 'information_schema', 'pg_toast'
      )
      AND NOT (
        (n.nspname = 'roleapp_security'
         AND c.relname IN ('admin_access', 'admin_capability_grants'))
        OR (n.nspname = 'public'
            AND c.relname IN ('user_roles', 'locais', 'usuarios'))
      )
      AND has_table_privilege(
        reader_oid, c.oid, privilege.privilege_name
      )
  ) THEN
    RAISE EXCEPTION 'Reader role has privileges on an unrelated relation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
      AND (c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE)
  ) OR EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
  ) THEN
    RAISE EXCEPTION 'Admin tables must have forced RLS and no client policies.';
  END IF;

  IF EXISTS (
    SELECT 1
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
    WHERE NOT has_column_privilege(
      reader_oid, required.table_name, required.column_name, 'SELECT'
    ) OR has_column_privilege(
      reader_oid, required.table_name, required.column_name, 'INSERT'
    ) OR has_column_privilege(
      reader_oid, required.table_name, required.column_name, 'UPDATE'
    ) OR has_column_privilege(
      reader_oid, required.table_name, required.column_name, 'REFERENCES'
    )
  ) THEN
    RAISE EXCEPTION 'Reader column privileges differ from the approved allowlist.';
  END IF;
END;
$negative_catalog_tests$;

ROLLBACK;

-- These catalog assertions do not prove behavior for JWT identities.
-- Separately test against staging via the authenticated Supabase API:
--   * anon: execute denied;
--   * ordinary user and partner: RPC returns 42501;
--   * admin without active access, without locais.ler, or suspended/revoked:
--     RPC returns 42501 on each new request;
--   * only a deliberately provisioned admin with active access and locais.ler
--     succeeds.
-- Use an impossible p_id for negative calls and do not simulate auth.uid() by
-- setting request.jwt.claim.sub in SQL Editor. Compare existing RLS policies
-- and grants on user_roles, locais, and usuarios with the pre-install results.
