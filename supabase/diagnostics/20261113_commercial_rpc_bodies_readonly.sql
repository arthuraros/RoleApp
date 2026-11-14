-- REVISAR EM CANAL RESTRITO. SOMENTE DEFINICOES; NAO EXECUTA AS RPCs.
-- Um corpo legado pode conter segredo literal: nao publicar sem revisao/redacao.
-- Executar somente apos inventario; auxiliares chamados tambem precisam revisao.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT p.oid::regprocedure::text AS signature,
       pg_get_function_identity_arguments(p.oid) AS arguments_without_defaults,
       pg_get_function_result(p.oid) AS result,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       md5(pg_get_functiondef(p.oid)) AS definition_hash,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN
  ('encaminhar_solicitacao_decisao','decidir_solicitacao_comercial','obter_detalhe_decisao_admin')
ORDER BY signature;

ROLLBACK;
