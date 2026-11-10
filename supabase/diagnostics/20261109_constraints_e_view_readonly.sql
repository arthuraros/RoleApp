-- Coleta complementar solicitada. SOMENTE LEITURA. Não executada pelo Codex.
-- Retorna constraints/colunas e definição da VIEW, nunca corpos de funções.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH targets AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('campanhas_impulsionamento','locais',
    'solicitacoes_parceria','eventos_locais','metricas_locais','horarios_funcionamento','usuarios',
    'categorias_cardapio','itens_cardapio','local_categorias','categorias','favoritos','avaliacoes_locais')
), checks AS (
  SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.convalidated,
    pg_get_constraintdef(c.oid,true) AS definition,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) k
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k) AS columns
  FROM pg_constraint c WHERE c.conrelid IN (SELECT oid FROM targets)
), columns_info AS (
  SELECT t.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type_name,
    a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
), snapshots AS (
  SELECT t.relname,
    md5(coalesce((SELECT string_agg(p.polname || '|' || p.polcmd::text || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' ||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' ORDER BY p.polname)
      FROM pg_policy p WHERE p.polrelid=t.oid),'')) AS policy_hash,
    md5(coalesce((SELECT string_agg(pg_get_triggerdef(g.oid,true) || '|' || g.tgenabled::text || '|' ||
      md5(pg_get_functiondef(g.tgfoid)),E'\n' ORDER BY g.tgname)
      FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),'')) AS custom_trigger_hash
  FROM targets t
), view_info AS (
  SELECT c.relkind,c.reloptions,pg_get_userbyid(c.relowner) AS owner,c.relacl,
    CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,true) END AS definition,
    ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='locais_com_avaliacoes'
)
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),
  'constraints',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,conname) FROM checks x),'[]'::jsonb),
  'columns',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY relname,attname) FROM columns_info x),'[]'::jsonb),
  'snapshots',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM snapshots x),'[]'::jsonb),
  'locais_com_avaliacoes',coalesce((SELECT to_jsonb(x) FROM view_info x),'null'::jsonb)
) AS validation_result;
ROLLBACK;
