-- DIAGNÓSTICO PARA REVISÃO ANTES DE EXECUÇÃO. Não executado pelo Codex.
-- Somente catálogo: não chama as funções de negócio nem consulta linhas das tabelas.
-- Por solicitação explícita, retorna as definições completas SOMENTE das três funções abaixo.
-- Preserva nomes/assinaturas de todos os overloads encontrados, sem truncar os corpos.
-- Os privilégios efetivos não substituem a avaliação de RLS por linha/JWT.
-- Ausências são sinalizadas; visibilidade do catálogo depende do papel de inspeção.
-- Revisado estaticamente, sem validação pelo parser/servidor PostgreSQL.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH requested_functions(function_name) AS (
  VALUES ('buscar_locais'::text),('buscar_locais_por_orcamento'::text),('calcular_ces'::text)
), requested_tables(schema_name,table_name) AS (
  VALUES ('public'::text,'categorias_cardapio'::text),
    ('public'::text,'itens_cardapio'::text),('storage'::text,'objects'::text)
), requested_roles(role_name) AS (
  VALUES ('anon'::text),('authenticated'::text)
), clients AS (
  SELECT r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolbypassrls
  FROM pg_catalog.pg_roles r JOIN requested_roles q ON q.role_name=r.rolname
), routines AS (
  SELECT p.*,n.nspname AS schema_name,l.lanname AS language_name
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  JOIN requested_functions q ON q.function_name=p.proname
  WHERE n.nspname='public' AND p.prokind IN ('f','w')
), tables_scope AS (
  SELECT c.*,n.nspname AS schema_name
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN requested_tables q ON q.schema_name=n.nspname AND q.table_name=c.relname
), columns_scope AS (
  SELECT t.oid AS table_oid,t.schema_name,t.relname AS table_name,t.relowner,
    a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid,true) AS default_expression
  FROM tables_scope t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
), table_privilege_names AS (
  -- Extrair o conjunto de privilégios conhecido por ESTA versão do servidor.
  -- Inclui, por exemplo, privilégios adicionais de versões novas sem presumir sua existência.
  SELECT DISTINCT a.privilege_type
  FROM tables_scope t
  CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r',t.relowner)) a
), column_privilege_names(privilege_type) AS (
  VALUES ('SELECT'::text),('INSERT'::text),('UPDATE'::text),('REFERENCES'::text)
), routine_details AS (
  SELECT p.schema_name,p.proname AS function_name,p.oid AS function_oid,
    pg_catalog.format('%I.%I(%s)',p.schema_name,p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)) AS qualified_signature,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_arguments(p.oid) AS full_arguments_with_defaults,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    p.prokind::text AS kind,p.language_name,pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,p.provolatile::text AS volatility,
    p.proisstrict AS strict,p.proleakproof AS leakproof,p.proretset AS returns_set,
    p.proconfig AS configuration,p.proacl AS raw_acl,
    pg_catalog.pg_get_functiondef(p.oid) AS complete_definition,
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.grantee,a.grantor,a.privilege_type)
      -- NULL usa ACL padrão; ACL explicitamente vazia não concede privilégios.
      FROM pg_catalog.aclexplode(CASE WHEN pg_catalog.cardinality(p.proacl)=0 THEN NULL
        ELSE COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner)) END) a) AS grants,
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',r.rolname,
      'schema_usage',pg_catalog.has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'execute',pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'execute_grant_option',pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE WITH GRANT OPTION'),
      'inherits_owner_now',pg_catalog.pg_has_role(r.oid,p.proowner,'USAGE'),
      'owner_membership',pg_catalog.pg_has_role(r.oid,p.proowner,'MEMBER')) ORDER BY r.rolname)
      FROM clients r) AS effective_client_access
  FROM routines p
), table_details AS (
  SELECT t.schema_name,t.relname AS table_name,t.oid AS table_oid,
    pg_catalog.pg_get_userbyid(t.relowner) AS owner,
    t.relkind::text AS relation_kind,t.relpersistence::text AS persistence,
    t.relrowsecurity AS rls_enabled,t.relforcerowsecurity AS force_rls,
    t.relispartition AS is_partition,t.relhasrules AS has_rules,t.relhastriggers AS has_triggers,
    t.reloptions AS relation_options,t.relacl AS raw_acl,
    (SELECT pg_catalog.jsonb_agg(i.inhparent::pg_catalog.regclass::text ORDER BY i.inhparent)
      FROM pg_catalog.pg_inherits i WHERE i.inhrelid=t.oid) AS parent_relations,
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.grantee,a.grantor,a.privilege_type)
      FROM pg_catalog.aclexplode(CASE WHEN pg_catalog.cardinality(t.relacl)=0 THEN NULL
        ELSE COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner)) END) a) AS table_grants,
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',r.rolname,
      'schema_usage',pg_catalog.has_schema_privilege(r.oid,t.relnamespace,'USAGE'),
      'schema_create',pg_catalog.has_schema_privilege(r.oid,t.relnamespace,'CREATE'),
      'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,'inherits',r.rolinherit,
      'inherits_owner_now',pg_catalog.pg_has_role(r.oid,t.relowner,'USAGE'),
      'owner_membership',pg_catalog.pg_has_role(r.oid,t.relowner,'MEMBER')) ORDER BY r.rolname)
      FROM clients r) AS client_role_context
  FROM tables_scope t
), policy_details AS (
  SELECT t.schema_name,t.relname AS table_name,p.polname AS policy_name,
    p.polcmd::text AS command_code,
    CASE p.polcmd::text WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL'
      ELSE p.polcmd::text END AS command,
    p.polpermissive AS is_permissive,
    CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissiveness,
    p.polroles AS role_oids,
    ARRAY(SELECT CASE WHEN x.role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.role_oid)::text END
      FROM pg_catalog.unnest(p.polroles) WITH ORDINALITY x(role_oid,ord)
      ORDER BY x.ord) AS roles,
    pg_catalog.pg_get_expr(p.polqual,p.polrelid,true) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,true) AS with_check_expression
  FROM tables_scope t JOIN pg_catalog.pg_policy p ON p.polrelid=t.oid
), effective_table_privileges AS (
  SELECT t.schema_name,t.relname AS table_name,r.rolname AS role_name,p.privilege_type,
    pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege_type) AS allowed,
    pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege_type || ' WITH GRANT OPTION') AS grantable
  FROM tables_scope t CROSS JOIN clients r CROSS JOIN table_privilege_names p
), column_details AS (
  SELECT c.schema_name,c.table_name,c.attnum AS ordinal_position,c.attname AS column_name,
    pg_catalog.format_type(c.atttypid,c.atttypmod) AS data_type,c.attnotnull AS not_null,
    c.attidentity::text AS identity_kind,c.attgenerated::text AS generated_kind,c.default_expression,
    c.attacl AS explicit_column_acl,
    -- Sem ACL explícita de coluna: [] no JSON, nunca um aclitem[] vazio no aclexplode.
    CASE WHEN pg_catalog.cardinality(c.attacl)=0 THEN '[]'::pg_catalog.jsonb
    ELSE COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.grantee,a.grantor,a.privilege_type)
      FROM pg_catalog.aclexplode(c.attacl) a),
      '[]'::pg_catalog.jsonb) END AS explicit_column_grants
  FROM columns_scope c
), effective_column_privileges AS (
  SELECT c.schema_name,c.table_name,c.attnum AS ordinal_position,c.attname AS column_name,
    r.rolname AS role_name,p.privilege_type,
    pg_catalog.has_column_privilege(r.oid,c.table_oid,c.attnum,p.privilege_type) AS allowed,
    pg_catalog.has_column_privilege(r.oid,c.table_oid,c.attnum,
      p.privilege_type || ' WITH GRANT OPTION') AS grantable
  FROM columns_scope c CROSS JOIN clients r CROSS JOIN column_privilege_names p
)
SELECT pg_catalog.jsonb_build_object(
  'inspection',pg_catalog.jsonb_build_object(
    'current_user',current_user,'session_user',session_user,
    'read_only',pg_catalog.current_setting('transaction_read_only'),
    'isolation',pg_catalog.current_setting('transaction_isolation'),
    'server_version_num',pg_catalog.current_setting('server_version_num')),
  'requested_functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema','public','function',q.function_name,
    'overloads_found',(SELECT count(*) FROM routines p WHERE p.proname=q.function_name)) ORDER BY q.function_name)
    FROM requested_functions q),
  'requested_tables',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema',q.schema_name,'table',q.table_name,
    'found',EXISTS(SELECT 1 FROM tables_scope t WHERE t.schema_name=q.schema_name AND t.relname=q.table_name))
    ORDER BY q.schema_name,q.table_name) FROM requested_tables q),
  'requested_roles',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',q.role_name,
    'found',EXISTS(SELECT 1 FROM clients r WHERE r.rolname=q.role_name)) ORDER BY q.role_name)
    FROM requested_roles q),
  'functions',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY qualified_signature)
    FROM routine_details x),'[]'::pg_catalog.jsonb),
  'tables',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY schema_name,table_name)
    FROM table_details x),'[]'::pg_catalog.jsonb),
  'policies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY schema_name,table_name,policy_name)
    FROM policy_details x),'[]'::pg_catalog.jsonb),
  'effective_table_privileges',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY schema_name,table_name,role_name,privilege_type) FROM effective_table_privileges x),'[]'::pg_catalog.jsonb),
  'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY schema_name,table_name,ordinal_position)
    FROM column_details x),'[]'::pg_catalog.jsonb),
  'effective_column_privileges',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY schema_name,table_name,ordinal_position,role_name,privilege_type)
    FROM effective_column_privileges x),'[]'::pg_catalog.jsonb)
) AS validation_result;

ROLLBACK;
