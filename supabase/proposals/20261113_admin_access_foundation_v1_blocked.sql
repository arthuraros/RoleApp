-- REVIEW-ONLY PROPOSAL. This file is intentionally blocked and must not be run.
-- No users, roles, capabilities, or administrator access are provisioned here.
-- Intended order: review/approve this foundation before the separate read RPC.
-- Rollback: first remove the RPC in a separately approved rollback; verify both
-- tables are empty; revoke the reader's exact column grants, schema USAGE and
-- auth.uid() EXECUTE; drop admin_capability_grants then admin_access without
-- CASCADE; drop roleapp_places_reader only after verifying it owns nothing.
-- Never use DROP OWNED or change existing policies/grants as rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $approval$
BEGIN
  RAISE EXCEPTION
    'BLOCKED: review and explicitly approve the admin access foundation before installation.';
END;
$approval$;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND rolsuper IS TRUE
  ) THEN
    RAISE EXCEPTION 'Trusted superuser migration role required.';
  END IF;

  IF to_regnamespace('roleapp_security') IS NULL OR
     to_regclass('auth.users') IS NULL OR
     to_regclass('public.user_roles') IS NULL OR
     to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase authorization objects are missing.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role'))
      AS client_role(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = client_role.role_name
    )
  ) THEN
    RAISE EXCEPTION 'Expected Supabase client roles are missing.';
  END IF;

  IF to_regclass('roleapp_security.admin_access') IS NOT NULL OR
     to_regclass('roleapp_security.admin_capability_grants') IS NOT NULL OR
     EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'roleapp_places_reader') THEN
    RAISE EXCEPTION
      'A foundation object already exists; inspect it and prepare a reviewed incremental change.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.user_roles'::regclass
      AND a.attname = 'user_id'
      AND a.atttypid = 'pg_catalog.uuid'::regtype
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.user_roles'::regclass
      AND a.attname = 'role'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'auth.users'::regclass
      AND a.attname = 'id'
      AND a.atttypid = 'pg_catalog.uuid'::regtype
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'Expected user_roles(user_id uuid, role) and auth.users(id uuid) were not confirmed.';
  END IF;
END;
$preflight$;

CREATE ROLE roleapp_places_reader
  WITH NOLOGIN NOINHERIT BYPASSRLS
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE TABLE roleapp_security.admin_access (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users (id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false
);

CREATE TABLE roleapp_security.admin_capability_grants (
  user_id uuid NOT NULL
    REFERENCES roleapp_security.admin_access (user_id) ON DELETE CASCADE,
  capability text NOT NULL
    CHECK (capability = 'locais.ler'),
  PRIMARY KEY (user_id, capability)
);

ALTER TABLE roleapp_security.admin_access
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_access
  FORCE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_capability_grants
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_capability_grants
  FORCE ROW LEVEL SECURITY;

-- Deliberately create no client-facing policies or write RPCs for these tables.
REVOKE ALL PRIVILEGES ON TABLE
  roleapp_security.admin_access,
  roleapp_security.admin_capability_grants
FROM PUBLIC, anon, authenticated, service_role;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'roleapp_places_reader'
      AND rolcanlogin IS FALSE
      AND rolinherit IS FALSE
      AND rolsuper IS FALSE
      AND rolcreatedb IS FALSE
      AND rolcreaterole IS FALSE
      AND rolreplication IS FALSE
      AND rolbypassrls IS TRUE
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid IN (m.roleid, m.member)
    WHERE r.rolname = 'roleapp_places_reader'
  ) THEN
    RAISE EXCEPTION 'Dedicated reader role attributes or membership are unsafe.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS p(privilege_name)
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
      AND r.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_table_privilege(r.oid, c.oid, p.privilege_name)
  ) THEN
    RAISE EXCEPTION 'A client role still has effective privileges on an admin table.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) AS acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
      AND acl.is_grantable
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
  ) THEN
    RAISE EXCEPTION 'A client or PUBLIC has grant option on an admin table.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'roleapp_security'
      AND c.relname IN ('admin_access', 'admin_capability_grants')
  ) THEN
    RAISE EXCEPTION 'Unexpected policy found on an admin table.';
  END IF;

  IF EXISTS (SELECT 1 FROM roleapp_security.admin_access) OR
     EXISTS (SELECT 1 FROM roleapp_security.admin_capability_grants) THEN
    RAISE EXCEPTION 'Foundation must not provision users or capabilities.';
  END IF;
END;
$postflight$;

COMMIT;
