-- Triagem dos bloqueadores: somente catálogo, sem executar rotinas nem retornar corpos.
-- Não executado pelo Codex. Flags textuais NÃO comprovam filtro/segurança.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH candidates AS (
  SELECT p.*,n.nspname AS schema_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND (
    p.proname IN ('buscar_locais','buscar_locais_por_orcamento','listar_destaques_publicos') OR
    (n.nspname='public' AND (position('locais' IN lower(p.prosrc))>0 OR EXISTS(
      SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid
        AND d.refclassid='pg_class'::regclass AND d.refobjid=to_regclass('public.locais')))))
), routines AS (
  SELECT p.oid::regprocedure::text AS signature,p.schema_name,p.proname,
    pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
    pg_get_function_result(p.oid) AS result_type,
    md5(pg_get_functiondef(p.oid)) AS definition_digest,
    ARRAY(SELECT c FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) c
      WHERE split_part(c,'=',1) IN ('search_path','row_security')) AS security_settings,
    position('visivel' IN lower(p.prosrc))>0 AS mentions_visibility_not_proof,
    p.prosrc ~* '(^|[^a-z_])execute([^a-z_]|$)' AS dynamic_sql_hint,
    (SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'schema_usage',has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'execute',has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'owner_membership',pg_has_role(r.oid,p.proowner,'MEMBER')))
      FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')) AS effective_access
  FROM candidates p
), dependencies AS (
  SELECT d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,
    pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object
  FROM pg_depend d WHERE
    (d.refclassid='pg_proc'::regclass AND d.refobjid IN (SELECT oid FROM candidates)) OR
    (d.classid='pg_proc'::regclass AND d.objid IN (SELECT oid FROM candidates)) OR
    (d.refclassid='pg_class'::regclass AND d.refobjid IN
      (to_regclass('public.locais'),to_regclass('public.locais_com_avaliacoes')))
), views_info AS (
  SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.reloptions,
    pg_get_viewdef(c.oid,true) AS definition,c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND (c.oid=to_regclass('public.locais_com_avaliacoes') OR EXISTS(
    SELECT 1 FROM pg_rewrite w JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=w.oid
      AND d.refclassid='pg_class'::regclass WHERE w.ev_class=c.oid AND d.refobjid=to_regclass('public.locais')))
)
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),'inspection_role',current_user,
  'routines',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY signature) FROM routines x),'[]'::jsonb),
  'dependencies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM dependencies x),'[]'::jsonb),
  'views',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM views_info x),'[]'::jsonb),
  'limitations','Sem corpos de rotinas; triagem não prova segurança, consumidores externos ou SQL dinâmico. Não chama buscar_locais nem outras RPCs.'
) AS validation_result;
ROLLBACK;
