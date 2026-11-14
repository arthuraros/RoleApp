-- REVIEW-ONLY PROPOSAL. This file is intentionally blocked and must not be run.
-- Depends on 20261113_admin_access_foundation_v1_blocked.sql after approval.
-- Does not change policies or grants for anon/authenticated/service_role on
-- user_roles, locais, or usuarios; only the dedicated reader gets new grants.
-- The dedicated NOLOGIN/BYPASSRLS owner receives only the column SELECT grants
-- used by this function; no owner role membership is granted to any client.
-- No direct table access or write RPC is introduced.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $approval$
BEGIN
  RAISE EXCEPTION
    'BLOCKED: review and explicitly approve the admin places read contract before installation.';
END;
$approval$;

DO $preflight$
DECLARE
  reader_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND rolsuper IS TRUE
  ) THEN
    RAISE EXCEPTION 'Trusted superuser migration role required.';
  END IF;

  IF to_regclass('roleapp_security.admin_access') IS NULL OR
     to_regclass('roleapp_security.admin_capability_grants') IS NULL OR
     to_regclass('public.user_roles') IS NULL OR
     to_regclass('public.locais') IS NULL OR
     to_regclass('public.usuarios') IS NULL OR
     to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'An RPC dependency is missing.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public', 'user_roles'),
      ('public', 'locais'),
      ('public', 'usuarios')
    ) AS expected(schema_name, relation_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_namespace n
      JOIN pg_class c ON c.relnamespace = n.oid
      WHERE n.nspname = expected.schema_name
        AND c.relname = expected.relation_name
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity IS TRUE
    )
  ) THEN
    RAISE EXCEPTION
      'Expected existing RLS-enabled user_roles/locais/usuarios tables were not confirmed.';
  END IF;

  IF to_regprocedure(
    'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'Exact RPC signature already exists; inspect its body, owner and ACL before proceeding.';
  END IF;

  SELECT oid INTO reader_oid
  FROM pg_roles
  WHERE rolname = 'roleapp_places_reader'
    AND rolcanlogin IS FALSE
    AND rolinherit IS FALSE
    AND rolsuper IS FALSE
    AND rolcreatedb IS FALSE
    AND rolcreaterole IS FALSE
    AND rolreplication IS FALSE
    AND rolbypassrls IS TRUE;
  IF reader_oid IS NULL THEN
    RAISE EXCEPTION 'Dedicated NOLOGIN/BYPASSRLS reader role is missing or misconfigured.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = reader_oid OR member = reader_oid
  ) THEN
    RAISE EXCEPTION 'Reader role has a membership path; it must remain exclusive.';
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
      AND has_table_privilege(reader_oid, c.oid, privilege.privilege_name)
  ) THEN
    RAISE EXCEPTION
      'Reader role has ambient table privileges; inspect PUBLIC grants before continuing.';
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
  ) OR EXISTS (
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
    RAISE EXCEPTION 'Admin tables are not private and forced-RLS as required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    WHERE has_schema_privilege(reader_oid, n.oid, 'USAGE')
      AND n.nspname NOT IN (
        'pg_catalog', 'information_schema', 'public', 'auth', 'roleapp_security'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_namespace n
    WHERE has_schema_privilege(reader_oid, n.oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION
      'Reader role has unexpected schema access or CREATE privilege.';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE') OR
     has_schema_privilege('authenticated', 'public', 'CREATE') OR
     has_schema_privilege('service_role', 'public', 'CREATE') THEN
    RAISE EXCEPTION
    'Client roles can CREATE in public; resolve this independently before adding a public RPC.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proowner = reader_oid) OR
     EXISTS (SELECT 1 FROM pg_class WHERE relowner = reader_oid) OR
     EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = reader_oid) THEN
    RAISE EXCEPTION 'Reader role already owns another object.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('roleapp_security', 'admin_access', 'user_id'),
      ('roleapp_security', 'admin_access', 'active'),
      ('roleapp_security', 'admin_capability_grants', 'user_id'),
      ('roleapp_security', 'admin_capability_grants', 'capability'),
      ('public', 'user_roles', 'user_id'),
      ('public', 'user_roles', 'role'),
      ('public', 'locais', 'id_local'),
      ('public', 'locais', 'nome'),
      ('public', 'locais', 'visivel'),
      ('public', 'locais', 'endereco'),
      ('public', 'locais', 'cidade_uf'),
      ('public', 'locais', 'id_proprietario'),
      ('public', 'usuarios', 'id_usuario'),
      ('public', 'usuarios', 'nome')
    ) AS required(schema_name, relation_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_namespace n
      JOIN pg_class c ON c.relnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = required.schema_name
        AND c.relname = required.relation_name
        AND a.attname = required.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'An expected RPC relation or column is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.user_roles'::regclass
      AND attname = 'user_id'
      AND atttypid = 'pg_catalog.uuid'::regtype
      AND attnum > 0 AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.locais'::regclass
      AND attname = 'visivel'
      AND atttypid = 'pg_catalog.bool'::regtype
      AND attnum > 0 AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute local_owner
    JOIN pg_attribute user_id
      ON user_id.attrelid = 'public.usuarios'::regclass
     AND user_id.attname = 'id_usuario'
     AND user_id.attnum > 0 AND NOT user_id.attisdropped
    WHERE local_owner.attrelid = 'public.locais'::regclass
      AND local_owner.attname = 'id_proprietario'
      AND local_owner.atttypid = user_id.atttypid
      AND local_owner.attnum > 0 AND NOT local_owner.attisdropped
  ) THEN
    RAISE EXCEPTION 'RPC dependency column types do not match the reviewed contract.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.locais', 'id_local'),
      ('public.usuarios', 'id_usuario')
    ) AS required(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_attribute key_column
      JOIN pg_index i ON i.indrelid = key_column.attrelid
      CROSS JOIN LATERAL unnest(i.indkey)
        WITH ORDINALITY AS key_part(attnum, ordinal)
      WHERE key_column.attrelid = to_regclass(required.table_name)
        AND key_column.attname = required.column_name
        AND key_column.attnum > 0 AND NOT key_column.attisdropped
        AND i.indisunique AND i.indisvalid
        AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnkeyatts = 1
        AND key_part.ordinal = 1
        AND key_part.attnum = key_column.attnum
    )
  ) THEN
    RAISE EXCEPTION
      'locais.id_local and usuarios.id_usuario must have valid single-column unique indexes.';
  END IF;
END;
$preflight$;

-- The owner gets only schema usage and privileges required by the fixed query.
GRANT USAGE ON SCHEMA public, auth, roleapp_security TO roleapp_places_reader;
REVOKE CREATE ON SCHEMA public, auth, roleapp_security FROM roleapp_places_reader;
GRANT EXECUTE ON FUNCTION auth.uid() TO roleapp_places_reader;

GRANT SELECT (user_id, active)
  ON roleapp_security.admin_access TO roleapp_places_reader;
GRANT SELECT (user_id, capability)
  ON roleapp_security.admin_capability_grants TO roleapp_places_reader;
GRANT SELECT (user_id, role)
  ON public.user_roles TO roleapp_places_reader;
GRANT SELECT (id_local, nome, visivel, endereco, cidade_uf, id_proprietario)
  ON public.locais TO roleapp_places_reader;
GRANT SELECT (id_usuario, nome)
  ON public.usuarios TO roleapp_places_reader;

DO $schema_postflight$
DECLARE
  reader_oid oid := 'roleapp_places_reader'::regrole;
BEGIN
  IF NOT has_schema_privilege(reader_oid, 'public', 'USAGE') OR
     NOT has_schema_privilege(reader_oid, 'auth', 'USAGE') OR
     NOT has_schema_privilege(reader_oid, 'roleapp_security', 'USAGE') OR
     EXISTS (
       SELECT 1
       FROM pg_namespace n
       WHERE has_schema_privilege(reader_oid, n.oid, 'USAGE')
         AND n.nspname NOT IN (
           'pg_catalog', 'information_schema', 'public', 'auth', 'roleapp_security'
         )
     ) OR EXISTS (
       SELECT 1
       FROM pg_namespace n
       WHERE has_schema_privilege(reader_oid, n.oid, 'CREATE')
     ) THEN
    RAISE EXCEPTION
      'Reader role has unexpected schema access or lacks required USAGE.';
  END IF;
END;
$schema_postflight$;

CREATE FUNCTION public.roleapp_admin_places_read_v1(
  p_search text DEFAULT '',
  p_visible boolean DEFAULT NULL,
  p_after text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  is_authorized boolean;
  result jsonb;
BEGIN
  -- Authorization is checked before any read of administrative place data.
  IF actor_id IS NULL OR
     NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS u
       WHERE u.user_id = actor_id
         AND u.role::text = 'admin'
     ) OR
     NOT EXISTS (
       SELECT 1
       FROM roleapp_security.admin_access AS a
       WHERE a.user_id = actor_id
         AND a.active IS TRUE
     ) OR
     NOT EXISTS (
       SELECT 1
       FROM roleapp_security.admin_capability_grants AS g
       WHERE g.user_id = actor_id
         AND g.capability = 'locais.ler'
     ) THEN
    RAISE EXCEPTION 'Acesso administrativo negado'
      USING ERRCODE = '42501';
  END IF;

  IF p_search IS NULL
     OR pg_catalog.char_length(p_search) > 120
     OR p_limit IS NULL
     OR p_limit NOT BETWEEN 1 AND 100
     OR (p_after IS NOT NULL
         AND (pg_catalog.btrim(p_after) = ''
              OR pg_catalog.char_length(p_after) > 200))
     OR (p_id IS NOT NULL
         AND (pg_catalog.btrim(p_id) = ''
              OR pg_catalog.char_length(p_id) > 200))
     OR (p_id IS NOT NULL AND p_after IS NOT NULL) THEN
    RAISE EXCEPTION 'Parametros de consulta invalidos'
      USING ERRCODE = '22023';
  END IF;

  -- Repeat authorization in the data statement so a committed suspension or
  -- revocation before its snapshot prevents this query from returning rows.
  WITH authorized AS MATERIALIZED (
    SELECT actor_id AS user_id
    WHERE actor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS u
        WHERE u.user_id = actor_id
          AND u.role::text = 'admin'
      )
      AND EXISTS (
        SELECT 1
        FROM roleapp_security.admin_access AS a
        WHERE a.user_id = actor_id
          AND a.active IS TRUE
      )
      AND EXISTS (
        SELECT 1
        FROM roleapp_security.admin_capability_grants AS g
        WHERE g.user_id = actor_id
          AND g.capability = 'locais.ler'
      )
  ),
  candidates AS MATERIALIZED (
    SELECT
      l.id_local::text AS id,
      COALESCE(l.nome::text, '') AS nome,
      l.visivel,
      CASE WHEN p_id IS NOT NULL THEN
        pg_catalog.jsonb_build_object(
          'endereco', l.endereco::text,
          'cidade_estado', l.cidade_uf::text,
          'responsavel',
            CASE WHEN u.id_usuario IS NULL THEN NULL ELSE
              pg_catalog.jsonb_build_object(
                'id_usuario', u.id_usuario::text,
                'nome', u.nome::text
              )
            END
        )
      ELSE '{}'::jsonb END AS details
    FROM authorized AS a
    CROSS JOIN LATERAL (
      SELECT
        local_row.id_local,
        local_row.nome,
        local_row.visivel,
        local_row.endereco,
        local_row.cidade_uf,
        local_row.id_proprietario
      FROM public.locais AS local_row
      WHERE a.user_id IS NOT NULL
        AND (p_id IS NULL OR local_row.id_local::text = p_id)
        AND (p_visible IS NULL OR local_row.visivel = p_visible)
        AND (p_after IS NULL OR
             local_row.id_local::text COLLATE "C" > p_after COLLATE "C")
        AND (
          pg_catalog.btrim(p_search) = ''
          OR local_row.id_local::text = pg_catalog.btrim(p_search)
          OR pg_catalog.strpos(
               pg_catalog.lower(COALESCE(local_row.nome::text, '')),
               pg_catalog.lower(pg_catalog.btrim(p_search))
             ) > 0
        )
      ORDER BY local_row.id_local::text COLLATE "C"
      LIMIT p_limit + 1
    ) AS l
    LEFT JOIN public.usuarios AS u
      ON p_id IS NOT NULL
     AND u.id_usuario = l.id_proprietario
  ),
  page AS (
    SELECT * FROM candidates
    ORDER BY id COLLATE "C"
    LIMIT p_limit
  )
  SELECT
    EXISTS (SELECT 1 FROM authorized),
    CASE WHEN EXISTS (SELECT 1 FROM authorized) THEN
      pg_catalog.jsonb_build_object(
        'items',
        COALESCE(
          (
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id_local', id,
                'nome', nome,
                'visivel', visivel
              ) || details
              ORDER BY id COLLATE "C"
            )
            FROM page
          ),
          '[]'::jsonb
        ),
        'next_cursor',
        CASE WHEN (SELECT pg_catalog.count(*) FROM candidates) > p_limit
          THEN (
            SELECT id FROM page
            ORDER BY id COLLATE "C" DESC
            LIMIT 1
          )
          ELSE NULL
        END
      )
    ELSE NULL END
  INTO is_authorized, result;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Acesso administrativo negado'
      USING ERRCODE = '42501';
  END IF;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.roleapp_admin_places_read_v1(
  text, boolean, text, integer, text
) OWNER TO roleapp_places_reader;

REVOKE ALL ON FUNCTION public.roleapp_admin_places_read_v1(
  text, boolean, text, integer, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_places_read_v1(
  text, boolean, text, integer, text
) TO authenticated;

DO $postflight$
DECLARE
  rpc_oid oid := to_regprocedure(
    'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)'
  )::oid;
  reader_oid oid;
BEGIN
  SELECT oid INTO reader_oid
  FROM pg_roles
  WHERE rolname = 'roleapp_places_reader';

  IF rpc_oid IS NULL OR
     (SELECT proowner FROM pg_proc WHERE oid = rpc_oid) <> reader_oid OR
     (SELECT prosecdef FROM pg_proc WHERE oid = rpc_oid) IS NOT TRUE OR
     NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = rpc_oid
         AND p.proconfig @> ARRAY['search_path=pg_catalog']
     ) THEN
    RAISE EXCEPTION 'RPC owner or SECURITY DEFINER settings failed verification.';
  END IF;

  IF has_function_privilege('anon', rpc_oid, 'EXECUTE') OR
     has_function_privilege('service_role', rpc_oid, 'EXECUTE') OR
     NOT has_function_privilege('authenticated', rpc_oid, 'EXECUTE') OR
     EXISTS (
       SELECT 1
       FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
       WHERE p.oid = rpc_oid
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) OR EXISTS (
       SELECT 1
       FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
       WHERE p.oid = rpc_oid
         AND acl.grantee IN (
           0,
           (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
           (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
           (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
         )
         AND acl.is_grantable
     ) THEN
    RAISE EXCEPTION 'RPC EXECUTE ACL does not match the reviewed contract.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = reader_oid OR member = reader_oid
  ) OR
     (SELECT count(*) FROM pg_proc WHERE proowner = reader_oid) <> 1 OR
     EXISTS (SELECT 1 FROM pg_class WHERE relowner = reader_oid) OR
     EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = reader_oid) THEN
    RAISE EXCEPTION 'Reader role is not exclusive to this RPC.';
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
      'roleapp_places_reader', required.table_name,
      required.column_name, 'SELECT'
    ) OR has_column_privilege(
      'roleapp_places_reader', required.table_name,
      required.column_name, 'INSERT'
    ) OR has_column_privilege(
      'roleapp_places_reader', required.table_name,
      required.column_name, 'UPDATE'
    ) OR has_column_privilege(
      'roleapp_places_reader', required.table_name,
      required.column_name, 'REFERENCES'
    )
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('roleapp_security.admin_access'),
      ('roleapp_security.admin_capability_grants'),
      ('public.user_roles'),
      ('public.locais'),
      ('public.usuarios')
    ) AS required(table_name)
    CROSS JOIN (VALUES
      ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
      ('REFERENCES'), ('TRIGGER')
    ) AS privilege(privilege_name)
    WHERE has_table_privilege(
      'roleapp_places_reader', required.table_name, privilege.privilege_name
    )
  ) THEN
    RAISE EXCEPTION
      'Reader role privileges differ from column-only SELECT access.';
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
        'roleapp_places_reader', c.oid, privilege.privilege_name
      )
  ) THEN
    RAISE EXCEPTION 'Reader role has privileges on an unrelated relation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) AS acl
    WHERE acl.grantee = reader_oid
      AND (
        (n.nspname = 'roleapp_security'
         AND c.relname IN ('admin_access', 'admin_capability_grants'))
        OR (n.nspname = 'public'
            AND c.relname IN ('user_roles', 'locais', 'usuarios'))
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
    WHERE acl.grantee = reader_oid
      AND (
        acl.privilege_type <> 'SELECT'
        OR acl.is_grantable
        OR NOT EXISTS (
          SELECT 1
          FROM (VALUES
            ('roleapp_security', 'admin_access', 'user_id'),
            ('roleapp_security', 'admin_access', 'active'),
            ('roleapp_security', 'admin_capability_grants', 'user_id'),
            ('roleapp_security', 'admin_capability_grants', 'capability'),
            ('public', 'user_roles', 'user_id'),
            ('public', 'user_roles', 'role'),
            ('public', 'locais', 'id_local'),
            ('public', 'locais', 'nome'),
            ('public', 'locais', 'visivel'),
            ('public', 'locais', 'endereco'),
            ('public', 'locais', 'cidade_uf'),
            ('public', 'locais', 'id_proprietario'),
            ('public', 'usuarios', 'id_usuario'),
            ('public', 'usuarios', 'nome')
          ) AS allowed(schema_name, relation_name, column_name)
          WHERE allowed.schema_name = n.nspname
            AND allowed.relation_name = c.relname
            AND allowed.column_name = a.attname
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Reader role has an unexpected table/column grant or grant option.';
  END IF;
END;
$postflight$;

COMMIT;

-- Negative staging tests (manual, not executed here):
-- Use real test JWTs through the Supabase API, not SQL Editor role/claim spoofing.
-- Expect SQLSTATE 42501 for anon (no EXECUTE) and for authenticated identities:
-- ordinary user, partner, admin without a grant, inactive admin, missing
-- locais.ler grant, and revoked/suspended admin. Use an impossible p_id so an
-- incorrectly-authorized test call cannot return a real place. Also verify a
-- previously revoked identity is denied on its next request.
-- Positive control: only the explicitly provisioned test admin with active
-- access and locais.ler may read; do not provision any account in this file.

-- Rollback procedure after an explicitly approved deployment:
-- 1) REVOKE EXECUTE from authenticated and DROP this exact function (no CASCADE).
-- 2) Verify no other object is owned by roleapp_places_reader.
-- 3) Revoke only its listed column SELECT grants and schema USAGE/uid EXECUTE.
-- 4) Follow the foundation rollback; never modify pre-existing grants/policies.
