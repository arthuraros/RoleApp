-- REVIEW CANDIDATE. Reuses the complete v1 query/authorization/JSON contract.
-- Owner/RLS installation adapted to the supplied PG17.6 catalog and foundation v2.
-- No client service is enabled. Not executed; keep this proposal blocked.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $approval$ BEGIN
 RAISE EXCEPTION 'BLOCKED: read RPC v2 requires explicit installation approval';
END $approval$;
DO $preflight$ BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR NOT EXISTS (
   SELECT 1 FROM pg_roles WHERE rolname='roleapp_admin_executor'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
 ) OR to_regclass('roleapp_security.admin_access') IS NULL THEN
  RAISE EXCEPTION 'Reviewed foundation v2 and trusted installer required';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='roleapp_admin_places_read_v1') THEN
  RAISE EXCEPTION 'Read RPC name/overload collision';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.locais'::regclass,
   'public.usuarios'::regclass,'public.user_roles'::regclass)
   AND (NOT relrowsecurity OR relowner<>'postgres'::regrole)) THEN
  RAISE EXCEPTION 'Expected RLS/ownership not confirmed';
 END IF;
 IF EXISTS (SELECT 1 FROM (VALUES
   ('public.locais','id_local','int8'),('public.locais','id_proprietario','uuid'),
   ('public.locais','visivel','bool'),('public.usuarios','id_usuario','uuid'),
   ('public.locais','cidade_uf','text')) x(rel,col,typ)
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
    WHERE a.attrelid=to_regclass(x.rel) AND a.attname=x.col AND a.attnum>0
      AND NOT a.attisdropped AND t.typname=x.typ AND t.typnamespace='pg_catalog'::regnamespace)) THEN
  RAISE EXCEPTION 'Read dependency types differ from the supplied catalog';
 END IF;
END $preflight$;
GRANT roleapp_admin_executor TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO roleapp_admin_executor;
GRANT SELECT(id_local,nome,visivel,endereco,cidade_uf,id_proprietario)
 ON public.locais TO roleapp_admin_executor;
GRANT SELECT(id_usuario,nome) ON public.usuarios TO roleapp_admin_executor;
CREATE POLICY admin_executor_places_read ON public.locais
 FOR SELECT TO roleapp_admin_executor USING (true);
CREATE POLICY admin_executor_users_read ON public.usuarios
 FOR SELECT TO roleapp_admin_executor USING (true);
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
  actor_id uuid := roleapp_security.admin_actor_id();
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
          -- JSON compatibility alias only; the physical column is cidade_uf.
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
REVOKE ALL ON FUNCTION public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)
 TO authenticated;
ALTER FUNCTION public.roleapp_admin_places_read_v1(text,boolean,text,integer,text) OWNER TO roleapp_admin_executor;
REVOKE CREATE ON SCHEMA public FROM roleapp_admin_executor;
GRANT roleapp_admin_executor TO postgres WITH SET FALSE;
DO $postflight$
DECLARE rpc oid := 'public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)'::regprocedure;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.oid=rpc AND (a.grantee NOT IN (p.proowner,'authenticated'::regrole::oid)
   OR (a.grantee<>p.proowner AND a.is_grantable))) OR
  has_function_privilege('anon',rpc,'EXECUTE') OR
  has_function_privilege('service_role',rpc,'EXECUTE') OR
  NOT has_function_privilege('authenticated',rpc,'EXECUTE') THEN
  RAISE EXCEPTION 'Unexpected RPC execution ACL/default privileges';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE
  (m.roleid='roleapp_admin_executor'::regrole OR m.member='roleapp_admin_executor'::regrole)
  AND NOT (m.roleid='roleapp_admin_executor'::regrole AND m.member='postgres'::regrole
   AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) OR
  EXISTS (SELECT 1 FROM pg_namespace WHERE has_schema_privilege('roleapp_admin_executor',oid,'CREATE')) OR
  EXISTS (SELECT 1 FROM pg_class WHERE relowner='roleapp_admin_executor'::regrole) THEN
  RAISE EXCEPTION 'Executor owner/membership/schema boundary failed';
 END IF;
END $postflight$;
COMMIT;
-- Test real JWTs, column projection, negative identities, filters, pagination and
-- next-request revocation in staging before approving contractApproved=true.
-- This read RPC does not provide creation/editing/moderation or public filtering.
