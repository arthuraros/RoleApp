-- REVIEW BEFORE USE. Catalog metadata and routine source only; never invokes routines.
-- Routine bodies may contain sensitive literals. Review and share only in a restricted channel.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH expected(schema_name, routine_name) AS (
  VALUES
    ('public', 'revisar_parceria_segura'),
    ('public', 'solicitar_campanha_segura'),
    ('public', 'listar_ofertas_campanha'),
    ('public', 'ativar_campanha_segura'),
    ('roleapp_security', 'admin_has_capability'),
    ('roleapp_security', 'admin_actor_id')
),
client_roles AS (
  SELECT oid, rolname
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'routines', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', e.schema_name,
        'name', e.routine_name,
        'overloads', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'signature', p.oid::regprocedure::text,
              'kind', p.prokind,
              'identity_arguments', pg_get_function_identity_arguments(p.oid),
              'result', pg_get_function_result(p.oid),
              'owner', pg_get_userbyid(p.proowner),
              'owner_superuser', owner_role.rolsuper,
              'owner_bypassrls', owner_role.rolbypassrls,
              'security_definer', p.prosecdef,
              'security_settings', coalesce(p.proconfig, ARRAY[]::text[]),
              'definition_hash', md5(pg_get_functiondef(p.oid)),
              'grants', (
                SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                  ELSE pg_get_userbyid(a.grantee)::text END,
                  'privilege', a.privilege_type,
                  'grantable', a.is_grantable
                )), '[]'::jsonb)
                FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              ),
              'effective_access', (
                SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'role', r.rolname,
                  'schema_usage', has_schema_privilege(r.oid, p.pronamespace, 'USAGE'),
                  'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')
                ) ORDER BY r.rolname), '[]'::jsonb)
                FROM client_roles r
              ),
              'definition', pg_get_functiondef(p.oid)
            ) ORDER BY p.oid::regprocedure::text
          )
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_roles owner_role ON owner_role.oid = p.proowner
          WHERE n.nspname = e.schema_name
            AND p.proname = e.routine_name
            AND p.prokind IN ('f', 'p')
        ), '[]'::jsonb)
      ) ORDER BY e.schema_name, e.routine_name
    )
    FROM expected e
  ), '[]'::jsonb)
) AS admin_pending_dependency_catalog;

ROLLBACK;
