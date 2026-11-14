-- RA-11: inventario de contratos; NAO altera dados/politicas e NAO chama RPCs.
-- Executar somente por responsavel autorizado. Corpos devem ser revisados em canal
-- restrito; este relatorio traz hash, sem copiar codigo potencialmente sensivel.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH expected(name) AS (VALUES
  ('listar_solicitacoes_admin'), ('encaminhar_solicitacao_decisao'),
  ('decidir_solicitacao_comercial'), ('obter_detalhe_decisao_admin'),
  ('revisar_parceria_segura'), ('decidir_parceria_segura'),
  ('solicitar_campanha_segura'), ('ativar_campanha_segura'),
  ('listar_destaques_publicos'), ('listar_ofertas_campanha'),
  ('registrar_interacao_segura'))
SELECT e.name AS expected_rpc, n.nspname AS schema_name,
       p.oid::regprocedure::text AS signature,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig, p.proacl,
       md5(pg_get_functiondef(p.oid)) AS definition_hash,
       (SELECT jsonb_agg(jsonb_build_object('role', r.rolname,
         'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')) ORDER BY r.rolname)
        FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')) AS effective_execute
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
ORDER BY e.name, signature;

-- Estruturas propostas nao sao tratadas como instaladas: NULL significa ausente.
WITH expected(name) AS (VALUES
  ('public.user_roles'), ('public.solicitacoes_parceria'), ('public.locais'),
  -- O app usa campanhas_impulsionamento. campanhas e apenas nome alternativo a verificar.
  ('public.campanhas_impulsionamento'), ('public.campanhas'),
  ('public.metricas_locais'), ('public.roleapp_admin_audit'),
  ('roleapp_security.partnership_reviews'), ('roleapp_security.request_local_links'),
  ('roleapp_security.campaign_offers'), ('roleapp_security.admin_access'),
  ('roleapp_security.admin_capability_grants'), ('roleapp_security.local_admin_state'),
  ('roleapp_security.campaign_admin_reviews'))
SELECT e.name, c.oid::regclass::text AS installed_relation, c.relkind,
       pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relforcerowsecurity,
       c.relacl, c.reloptions
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass(e.name)
ORDER BY e.name;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN
  ('user_roles','solicitacoes_parceria','locais','campanhas_impulsionamento','campanhas','roleapp_admin_audit'))
   OR schemaname='roleapp_security'
ORDER BY schemaname, tablename, policyname;

SELECT k.conrelid::regclass::text AS source, k.confrelid::regclass::text AS target,
       k.conname, pg_get_constraintdef(k.oid) AS definition, k.convalidated
FROM pg_constraint k
WHERE k.contype='f' AND
  (k.confrelid IN (to_regclass('public.locais'),to_regclass('auth.users')) OR
   k.conrelid IN (to_regclass('public.campanhas_impulsionamento'),
     to_regclass('public.campanhas'),to_regclass('public.user_roles')))
ORDER BY source, k.conname;

SELECT t.tgrelid::regclass::text AS relation, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) AS definition,
       t.tgfoid::regprocedure::text AS function_signature
FROM pg_trigger t
WHERE NOT t.tgisinternal AND t.tgrelid IN
  (to_regclass('public.locais'),to_regclass('public.campanhas_impulsionamento'),
   to_regclass('public.campanhas'),to_regclass('public.user_roles'))
ORDER BY relation, t.tgname;

ROLLBACK;
