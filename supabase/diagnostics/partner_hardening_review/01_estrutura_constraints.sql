-- BLOCO 1/4: estrutura/constraints. SOMENTE LEITURA; não executado pelo Codex.
-- Uma linha JSON de resultado. Não invoca RPCs nem retorna corpos de funções.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH RECURSIVE
expected(table_name, required_columns) AS (VALUES
  ('auth.users', ARRAY['id']::text[]),
  ('public.usuarios', ARRAY['id_usuario','foto_url']),
  ('public.user_roles', ARRAY['user_id','role','created_at']),
  ('public.solicitacoes_parceria', ARRAY['id_solicitacao','id_usuario','nome','email','estabelecimento','cidade_estado','status','created_at']),
  ('public.locais', ARRAY['id_local','id_proprietario','nome','cidade_uf','endereco','preco','preco_entrada','faixa_preco','visivel','descricao','created_at']),
  ('public.eventos_locais', ARRAY['id_evento','id_local','titulo','dias','hora','detalhes','ativo','created_at']),
  ('public.campanhas_impulsionamento', ARRAY['id_campanha','id_local','id_usuario','tipo','titulo','mensagem','interesses','faixa_etaria','raio_km','duracao_dias','valor_total','status','alcance','data_inicio','data_fim','created_at']),
  ('public.metricas_locais', ARRAY['id_local','data','views','cliques','visitas']),
  ('public.roleapp_admin_audit', ARRAY['id','happened_at','actor','action','request_id','local_id','subject','reason','details']),
  ('roleapp_security.metric_receipts', ARRAY['actor','local_id','event','day'])
), targets AS (
  SELECT *, to_regclass(table_name) AS relid FROM expected
), relation_tree(oid) AS (
  SELECT relid::oid FROM targets WHERE relid IS NOT NULL
  UNION
  SELECT i.inhrelid FROM relation_tree r JOIN pg_inherits i ON i.inhparent=r.oid
), inheritance_info AS (
  SELECT i.inhparent::regclass::text AS parent_table,i.inhrelid::regclass::text AS child_table,
    c.relispartition,c.relkind,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
  WHERE i.inhparent IN (SELECT oid FROM relation_tree) OR i.inhrelid IN (SELECT oid FROM relation_tree)
), objects AS (
  SELECT e.table_name, e.relid IS NOT NULL AS exists_now, c.relkind,
    pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relforcerowsecurity,
    ARRAY(SELECT col FROM unnest(e.required_columns) col
      WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = e.relid
        AND a.attname = col AND a.attnum > 0 AND NOT a.attisdropped)) AS missing_columns
  FROM targets e LEFT JOIN pg_class c ON c.oid = e.relid
), columns_info AS (
  SELECT e.table_name, a.attnum, a.attname AS column_name, a.atttypid AS type_oid,
    format_type(a.atttypid,a.atttypmod) AS type_name,
    a.attnotnull, a.attidentity, a.attgenerated,
    pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM targets e JOIN pg_attribute a ON a.attrelid = e.relid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
), type_graph(oid) AS (
  SELECT type_oid FROM columns_info
  UNION
  SELECT x.next_oid FROM type_graph g JOIN pg_type t ON t.oid = g.oid
    CROSS JOIN LATERAL (VALUES (t.typbasetype),(t.typelem)) x(next_oid)
  WHERE x.next_oid <> 0
), types_info AS (
  SELECT n.nspname AS schema_name, t.typname, t.typtype,
    format_type(t.typbasetype,t.typtypmod) AS domain_base_type, t.typnotnull,
    ARRAY(SELECT enumlabel FROM pg_enum WHERE enumtypid = t.oid ORDER BY enumsortorder) AS enum_values,
    ARRAY(SELECT pg_get_constraintdef(c.oid,true) FROM pg_constraint c
      WHERE c.contypid = t.oid ORDER BY c.conname) AS domain_constraints
  FROM type_graph g JOIN pg_type t ON t.oid = g.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype IN ('d','e')
), constraints_info AS (
  SELECT co.conrelid::regclass::text AS source_table, co.conname, co.contype,
    co.convalidated, co.condeferrable, co.condeferred,
    NULLIF(co.confrelid,0)::regclass::text AS referenced_table,
    pg_get_constraintdef(co.oid,true) AS definition
  FROM pg_constraint co
  WHERE co.conrelid IN (SELECT relid FROM targets) OR co.confrelid IN (SELECT relid FROM targets)
), indexes_info AS (
  SELECT i.indrelid::regclass::text AS table_name, ic.relname AS index_name,
    i.indisunique, i.indisvalid, i.indisready, i.indimmediate, i.indnkeyatts,
    pg_get_expr(i.indpred,i.indrelid) AS predicate,
    pg_get_indexdef(i.indexrelid) AS definition,
    (i.indrelid = to_regclass('public.metricas_locais') AND i.indisunique
      AND i.indisvalid AND i.indimmediate AND i.indnkeyatts = 2
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= i.indnkeyatts) = ARRAY['data','id_local']::text[]) AS metrics_upsert_candidate
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE i.indrelid IN (SELECT relid FROM targets)
), sequences_info AS (
  SELECT DISTINCT e.table_name, a.attname AS column_name,
    sn.nspname || '.' || s.relname AS sequence_name,
    pg_get_userbyid(s.relowner) AS owner,
    pg_get_serial_sequence(e.table_name,a.attname) AS detected_by_migration,
    pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM targets e JOIN pg_attribute a ON a.attrelid = e.relid AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  JOIN pg_depend dep ON
    (dep.classid = 'pg_attrdef'::regclass AND dep.objid = d.oid
      AND dep.refclassid = 'pg_class'::regclass) OR
    (dep.classid = 'pg_class'::regclass AND dep.refclassid = 'pg_class'::regclass
      AND dep.refobjid = e.relid AND dep.refobjsubid = a.attnum AND dep.deptype IN ('a','i'))
  JOIN pg_class s ON s.oid = CASE WHEN dep.classid = 'pg_attrdef'::regclass THEN dep.refobjid ELSE dep.objid END
    AND s.relkind = 'S'
  JOIN pg_namespace sn ON sn.oid = s.relnamespace
)
SELECT jsonb_build_object(
  'bloco',1,'server_version',current_setting('server_version'),
  'session_timezone',current_setting('TimeZone'),'inspection_role',current_user,
  'read_only',current_setting('transaction_read_only'),
  'objects',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name) FROM objects x),'[]'::jsonb),
  'columns',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,attnum) FROM columns_info x),'[]'::jsonb),
  'domains_enums',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM types_info x),'[]'::jsonb),
  'constraints',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY source_table,conname) FROM constraints_info x),'[]'::jsonb),
  'indexes',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,index_name) FROM indexes_info x),'[]'::jsonb),
  'inheritance_partitions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM inheritance_info x),'[]'::jsonb),
  'sequences',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,column_name,sequence_name) FROM sequences_info x),'[]'::jsonb)
) AS validation_result;
ROLLBACK;
