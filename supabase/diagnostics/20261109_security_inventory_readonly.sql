-- INVENTÁRIO SOMENTE DE LEITURA. Preparado para revisão; NÃO executado pelo Codex.
-- Não é migração. Executar futuramente apenas com autorização, em conexão dedicada,
-- com papel de inspeção autorizado. Resultados dependem da visibilidade desse papel.
-- Metadados e definições de views podem conter segredos legados: revisar antes de compartilhar.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 01. Contexto da coleta, versão e papéis disponíveis (sem credenciais).
SELECT current_database() AS database_name, current_user AS inspection_role,
       session_user AS connection_role, current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       current_timestamp AS collected_at;

SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
FROM pg_catalog.pg_roles
ORDER BY rolname;

SELECT parent.rolname AS granted_role, member.rolname AS member_role, m.admin_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
JOIN pg_catalog.pg_roles member ON member.oid = m.member
ORDER BY 1, 2;

-- 02. Todas as tabelas public, e tabelas Auth/Storage envolvidas; não presumir 15 nomes.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       c.relacl AS raw_acl
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND (n.nspname = 'public' OR
       (n.nspname = 'auth' AND c.relname = 'users') OR n.nspname = 'storage')
ORDER BY 1, 2;

SELECT count(*) AS public_table_count,
       count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled_count,
       count(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_disabled_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

-- 03. Colunas, tipos, nullability, defaults, identidade e geração.
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attnum AS ordinal_position,
       a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression,
       a.attacl AS raw_column_acl
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p')
  AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY 1, 2, 3;

-- 04. Constraints completas; inclui FKs de outros schemas apontando para public.
SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name,
       con.contype, con.convalidated, con.condeferrable, con.condeferred,
       rn.nspname AS referenced_schema, rc.relname AS referenced_table,
       pg_catalog.pg_get_constraintdef(con.oid, false) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public' OR rn.nspname = 'public'
   OR (n.nspname = 'auth' AND c.relname = 'users')
ORDER BY 1, 2, 3;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       ic.relname AS index_name, i.indisunique, i.indisvalid,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
WHERE n.nspname = 'public'
ORDER BY 1, 2, 3;

-- 05. Políticas completas, incluindo restritivas/permissivas, papéis e ambas as expressões.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, p.polname AS policy_name,
       p.polpermissive AS permissive,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
       ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(role_oid)::text END
             FROM unnest(p.polroles) AS role_oid) AS roles,
       pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS using_expression,
       pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'storage')
ORDER BY 1, 2, 4;

-- 06. Grants de tabelas/views/sequências. acldefault cobre ACL nula, inclusive dono.
SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
       pg_catalog.pg_get_userbyid(acl.grantor) AS grantor,
       acl.privilege_type, acl.is_grantable
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
  pg_catalog.acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
                       c.relowner))) acl
WHERE n.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY 1, 2, 4, 6;

SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
       acl.privilege_type, acl.is_grantable
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1, 2, 3, 4, 5;

SELECT n.nspname AS schema_name, pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
       acl.privilege_type, acl.is_grantable
FROM pg_catalog.pg_namespace n
CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,
  pg_catalog.acldefault('n'::"char", n.nspowner))) acl
WHERE n.nspname IN ('public', 'auth', 'storage', 'private')
ORDER BY 1, 3, 4;

SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator_role,
       n.nspname AS schema_name, d.defaclobjtype AS object_type, d.defaclacl AS default_acl
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1, 2, 3;

-- Grants efetivos incorporam herança/PUBLIC; NÃO significam que RLS autorize uma linha.
SELECT r.rolname, n.nspname AS schema_name, c.relname AS table_name,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate
FROM pg_catalog.pg_roles r
CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY 1, 2, 3;

-- 07. Funções/procedimentos em schemas não sistêmicos, inclusive helpers privados.
-- Inclui SECURITY DEFINER, dono, configuração (search_path) e privilégios, sem corpos.
WITH relevant_routines AS (
  SELECT p.* FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p') AND n.nspname <> 'information_schema'
    AND n.nspname NOT LIKE 'pg_%'
)
SELECT n.nspname AS schema_name, p.proname AS routine_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       p.prokind, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.provolatile, p.proconfig,
       p.proacl AS raw_acl,
       ARRAY(SELECT r.rolname FROM pg_catalog.pg_roles r
         WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
           AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')) AS effective_execute_roles,
       (SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable))
        FROM pg_catalog.aclexplode(COALESCE(p.proacl,
          pg_catalog.acldefault('f'::"char", p.proowner))) a) AS grants
FROM relevant_routines p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
ORDER BY 1, 2, 3;

-- 08. Triggers, incluindo internos (FKs), com estado e definição.
SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname,
       t.tgisinternal, t.tgenabled,
       pn.nspname AS function_schema, p.proname AS function_name,
       pg_catalog.pg_get_triggerdef(t.oid, false) AS definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname = 'users')
ORDER BY 1, 2, 3;

SELECT e.evtname, e.evtevent, e.evtenabled, e.evttags,
       pg_catalog.pg_get_userbyid(e.evtowner) AS owner,
       e.evtfoid::regprocedure AS function_name
FROM pg_catalog.pg_event_trigger e
ORDER BY 1;

-- 09. Views/regras podem abrir caminhos que contornam políticas de tabela.
SELECT n.nspname AS schema_name, c.relname AS view_name, c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner, c.reloptions,
       pg_catalog.pg_get_viewdef(c.oid, false) AS definition
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY 1, 2;

SELECT n.nspname AS schema_name, c.relname AS object_name, r.rulename,
       pg_catalog.pg_get_ruledef(r.oid, false) AS definition
FROM pg_catalog.pg_rewrite r
JOIN pg_catalog.pg_class c ON c.oid = r.ev_class
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2, 3;

-- 10. Diagnóstico mínimo de dados; sem e-mails, preferências ou credenciais.
-- Casts text evitam pressupor tipos, mas NÃO comprovam compatibilidade de FK.
SELECT count(*) AS usuarios_sem_auth
FROM public.usuarios u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = u.id_usuario::text);

SELECT count(*) AS locais_sem_proprietario
FROM public.locais WHERE id_proprietario IS NULL;

SELECT id_local, nome, visivel, 'regularizacao_administrativa_pendente' AS diagnostic_flag
FROM public.locais
WHERE id_proprietario IS NULL
ORDER BY id_local;

SELECT count(*) AS locais_com_proprietario_sem_auth
FROM public.locais l
WHERE l.id_proprietario IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM auth.users a WHERE a.id::text = l.id_proprietario::text
);

SELECT count(*) FILTER (WHERE s.id_usuario IS NULL) AS solicitacoes_sem_usuario,
       count(*) FILTER (WHERE s.id_usuario IS NOT NULL) AS solicitacoes_com_usuario_inexistente
FROM public.solicitacoes_parceria s
WHERE s.id_usuario IS NULL OR NOT EXISTS (
  SELECT 1 FROM auth.users a WHERE a.id::text = s.id_usuario::text
);

SELECT status, count(*) AS total FROM public.solicitacoes_parceria GROUP BY status ORDER BY status;
SELECT id_usuario, count(*) AS total_pendentes
FROM public.solicitacoes_parceria
WHERE status = 'pendente' AND id_usuario IS NOT NULL
GROUP BY id_usuario HAVING count(*) > 1;

SELECT id_usuario, count(*) AS total
FROM public.usuarios GROUP BY id_usuario HAVING count(*) > 1;

SELECT to_regclass('public.user_roles') AS existing_role_table,
       to_regclass('public.auditoria_administrativa') AS existing_audit_table;

ROLLBACK;
