-- DIAGNOSTICO COMPLETO PARA REVISAO. Nao executado pelo Codex.
-- Somente leitura de catalogos/metadados e contagens; nao chama funcoes de negocio.
-- Assinaturas/catalogos revisados estaticamente contra PostgreSQL 15, base das propostas.
-- Versao real, schema e privilegios do executor ainda precisam de confirmacao.
-- O manifesto deve ser recolhido no ponto exato anterior a proposta complementar.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 01. Contexto da sessao e versao do servidor.
SELECT
  current_user AS inspection_role,
  current_setting('transaction_read_only') AS read_only,
  current_setting('transaction_isolation') AS isolation_level,
  current_setting('server_version_num') AS server_version_num;

-- 02. Manifesto de revisao: expressoes identicas as da proposta bloqueada.
-- BEGIN REVIEW MANIFEST (mesma expressao na proposta; nunca preencher com hashes ficticios)
WITH targets(name) AS (VALUES ('public.fotos_locais'),('storage.objects'),('public.locais'))
SELECT jsonb_build_object(
  'relations',(SELECT jsonb_agg(jsonb_build_object(
    'name',t.name,'owner',c.relowner,'kind',c.relkind::text,'rls',c.relrowsecurity,
    'force',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text,
    'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity::text,a.attgenerated::text,
      pg_get_expr(d.adbin,d.adrelid),a.attacl::text) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conrelid::regclass::text,k.conname,pg_get_constraintdef(k.oid),k.convalidated)
      ORDER BY k.conrelid,k.conname,k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid OR k.confrelid=c.oid),
    'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)
      FROM pg_index i WHERE i.indrelid=c.oid),
    'inheritance',(SELECT jsonb_agg(jsonb_build_array(i.inhrelid,i.inhparent) ORDER BY i.inhrelid,i.inhparent)
      FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid),
    'policy_hash',(SELECT md5(coalesce(string_agg(p.polname || '|' || p.polcmd::text || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' ||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' ORDER BY p.polname),''))
      FROM pg_policy p WHERE p.polrelid=c.oid),
    'trigger_hash',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(g.oid) || '|' || g.tgenabled::text || '|' ||
      md5(pg_get_functiondef(g.tgfoid)),E'\n' ORDER BY g.tgname),''))
      FROM pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal)
  ) ORDER BY t.name) FROM targets t LEFT JOIN pg_class c ON c.oid=to_regclass(t.name)),
  'helpers',(SELECT jsonb_agg(jsonb_build_array(q.signature,p.proowner,p.prosecdef,p.proconfig,
    p.proacl::text,md5(pg_get_functiondef(p.oid))) ORDER BY q.signature)
    FROM (VALUES ('roleapp_security.partner_owns(text)'),('roleapp_security.local_public(text)'),
      ('roleapp_security.is_admin()'),('roleapp_security.approved_local_owner(text,uuid)')) q(signature)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(q.signature)),
  'client_roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r
    WHERE r.rolname IN ('anon','authenticated')),
  'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m),
  'photo_sequence',(SELECT jsonb_build_array(s.oid,s.relowner,s.relacl::text,
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid)
      FROM pg_depend d WHERE (d.refclassid='pg_class'::regclass AND d.refobjid=s.oid)
        OR (d.classid='pg_class'::regclass AND d.objid=s.oid)))
    FROM pg_class s WHERE s.oid=to_regclass(pg_get_serial_sequence('public.fotos_locais','id_foto'))),
  'bucket',(SELECT jsonb_build_object('id',b.id,'public',b.public,
    'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types)
    FROM storage.buckets b WHERE b.id='imagens-locais')
) AS review_manifest
-- END REVIEW MANIFEST
;

-- 03. Policies completas: comando, permissividade, papeis, USING e WITH CHECK.
SELECT
  policy.polrelid::regclass AS relation,
  policy.polname,
  policy.polcmd::text AS command,
  policy.polpermissive,
  ARRAY(
    SELECT CASE
      WHEN policy_role.role_oid = 0::oid THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
    END
    FROM pg_catalog.unnest(policy.polroles) WITH ORDINALITY AS policy_role(role_oid, role_position)
    ORDER BY policy_role.role_position
  ) AS roles,
  pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
  pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) AS with_check_expression
FROM pg_catalog.pg_policy AS policy
WHERE policy.polrelid IN (
  'public.fotos_locais'::regclass,
  'public.locais'::regclass,
  'storage.objects'::regclass
)
ORDER BY policy.polrelid::regclass::text, policy.polname;

-- 04. Grants diretos de tabela/coluna, incluindo PUBLIC e grant options.
-- ACL NULL de tabela usa o default; ACL explicitamente vazia nao concede acesso.
-- ACL NULL/vazia de coluna nao usa o default de tabela nem array ACL vazio.
WITH acl_tables AS (
  SELECT relation.oid, relation.relowner, relation.relacl
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid IN ('public.fotos_locais'::regclass, 'storage.objects'::regclass)
)
SELECT
  target.oid::regclass AS relation,
  NULL::name AS column_name,
  acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
FROM acl_tables AS target
CROSS JOIN LATERAL pg_catalog.aclexplode(
  CASE
    WHEN pg_catalog.cardinality(target.relacl) = 0 THEN NULL
    ELSE COALESCE(target.relacl, pg_catalog.acldefault('r', target.relowner))
  END
) AS acl
UNION ALL
SELECT
  target.oid::regclass AS relation,
  attribute.attname AS column_name,
  acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
FROM acl_tables AS target
JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = target.oid
CROSS JOIN LATERAL pg_catalog.aclexplode(
  CASE WHEN pg_catalog.cardinality(attribute.attacl) = 0 THEN NULL ELSE attribute.attacl END
) AS acl
WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
ORDER BY relation, column_name, grantee, grantor, privilege_type;

-- 05. Privilegios efetivos de tabela/schema, incluindo heranca e grant options.
-- A lista de privilegios vem do servidor: inclui MAINTAIN somente se suportado.
WITH privilege_tables AS (
  SELECT relation.oid, relation.relowner, relation.relnamespace
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid IN ('public.fotos_locais'::regclass, 'storage.objects'::regclass)
), table_roles AS (
  SELECT role_entry.oid, role_entry.rolname
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname IN ('anon', 'authenticated')
)
SELECT
  target.oid::regclass AS relation,
  table_role.rolname,
  privilege.privilege_type,
  pg_catalog.has_table_privilege(table_role.oid, target.oid, privilege.privilege_type) AS allowed,
  pg_catalog.has_table_privilege(table_role.oid, target.oid, privilege.privilege_type || ' WITH GRANT OPTION') AS grantable,
  pg_catalog.pg_has_role(table_role.oid, target.relowner, 'MEMBER') AS owner_membership,
  pg_catalog.has_schema_privilege(table_role.oid, target.relnamespace, 'CREATE') AS schema_create
FROM privilege_tables AS target
CROSS JOIN table_roles AS table_role
CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r', target.relowner)) AS privilege
ORDER BY relation, table_role.rolname, privilege.privilege_type;

-- 06. Privilegios efetivos por coluna: OID do papel, OID da tabela, attnum smallint.
WITH column_roles AS (
  SELECT role_entry.oid, role_entry.rolname
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname IN ('anon', 'authenticated')
), column_privileges(privilege) AS (
  VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('REFERENCES'::text)
)
SELECT
  target.oid::regclass AS relation,
  attribute.attname,
  column_role.rolname,
  requested.privilege,
  pg_catalog.has_column_privilege(column_role.oid, target.oid, attribute.attnum, requested.privilege) AS allowed,
  pg_catalog.has_column_privilege(column_role.oid, target.oid, attribute.attnum, requested.privilege || ' WITH GRANT OPTION') AS grantable
FROM pg_catalog.pg_class AS target
JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = target.oid
CROSS JOIN column_roles AS column_role
CROSS JOIN column_privileges AS requested
WHERE target.oid IN ('public.fotos_locais'::regclass, 'storage.objects'::regclass)
  AND attribute.attnum > 0 AND NOT attribute.attisdropped
ORDER BY relation, attribute.attnum, column_role.rolname, requested.privilege;

-- 07. Sequencia eventual: ACL direta no manifesto e privilegios efetivos abaixo.
-- Sem sequencia associada, esta consulta retorna zero linhas, sem chamar nextval/setval.
WITH photo_sequence AS (
  SELECT sequence_entry.oid, sequence_entry.relowner
  FROM pg_catalog.pg_class AS sequence_entry
  WHERE sequence_entry.relkind = 'S'
    AND sequence_entry.oid = pg_catalog.to_regclass(
      pg_catalog.pg_get_serial_sequence('public.fotos_locais', 'id_foto')
    )
), sequence_roles AS (
  SELECT role_entry.oid, role_entry.rolname
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname IN ('anon', 'authenticated')
), sequence_privileges(privilege) AS (
  VALUES ('SELECT'::text), ('USAGE'::text), ('UPDATE'::text)
)
SELECT
  target.oid::regclass AS sequence,
  sequence_role.rolname AS role_name,
  requested.privilege,
  pg_catalog.has_sequence_privilege(sequence_role.oid, target.oid, requested.privilege) AS allowed,
  pg_catalog.has_sequence_privilege(sequence_role.oid, target.oid, requested.privilege || ' WITH GRANT OPTION') AS grantable,
  pg_catalog.pg_has_role(sequence_role.oid, target.relowner, 'MEMBER') AS owner_membership
FROM photo_sequence AS target
CROSS JOIN sequence_roles AS sequence_role
CROSS JOIN sequence_privileges AS requested
ORDER BY sequence_role.rolname, requested.privilege;

-- 08. Associacoes de papeis e heranca atual; nao revoga memberships.
-- SET ROLE depende da versao/opcoes; revisar tambem pg_auth_members no manifesto.
SELECT
  client.rolname AS client,
  member_role.rolname AS member_of,
  pg_catalog.pg_has_role(client.oid, member_role.oid, 'USAGE') AS inherited_now,
  member_role.rolsuper,
  member_role.rolbypassrls
FROM pg_catalog.pg_roles AS client
CROSS JOIN pg_catalog.pg_roles AS member_role
WHERE client.rolname IN ('anon', 'authenticated')
  AND client.oid <> member_role.oid
  AND pg_catalog.pg_has_role(client.oid, member_role.oid, 'MEMBER')
ORDER BY client.rolname, member_role.rolname;

-- 09. Dependencias de entrada/saida: defaults, FKs, views/regras e sequencias.
-- SQL dinamico, URLs e consumidores externos nao sao provados pelo catalogo.
SELECT
  dependency.deptype::text,
  pg_catalog.pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid) AS dependent,
  pg_catalog.pg_describe_object(dependency.refclassid, dependency.refobjid, dependency.refobjsubid) AS referenced
FROM pg_catalog.pg_depend AS dependency
WHERE (
  dependency.refclassid = 'pg_class'::regclass
  AND dependency.refobjid IN ('public.fotos_locais'::regclass, 'public.locais'::regclass)
) OR (
  dependency.classid = 'pg_class'::regclass
  AND dependency.objid IN ('public.fotos_locais'::regclass, 'public.locais'::regclass)
)
ORDER BY dependent, referenced;

-- 10. Busca textual de rotas alternativas: metadados/hash, sem executar funcoes.
-- Heuristica nao exaustiva; nao retorna o corpo integral das funcoes.
SELECT
  namespace.nspname,
  routine.proname,
  pg_catalog.pg_get_function_identity_arguments(routine.oid) AS signature,
  routine.prosecdef,
  routine.proconfig,
  routine.proacl,
  pg_catalog.pg_get_userbyid(routine.proowner) AS owner,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(routine.oid)) AS definition_hash,
  'heuristica textual; nao garante ausencia de outras rotas' AS limitation
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
WHERE namespace.nspname IN ('public', 'roleapp_security')
  AND routine.prokind = 'f'
  AND (
    routine.prosrc ILIKE '%fotos_locais%'
    OR routine.prosrc ILIKE '%url_foto%'
    OR routine.prosrc ILIKE '%imagens-locais%'
  )
ORDER BY namespace.nspname, routine.proname, signature;

-- 11. Contagens sem expor URLs/nomes de objetos/dados de usuarios.
-- A visibilidade das contagens depende dos privilegios/RLS do executor da coleta.
SELECT
  (SELECT count(*) FROM public.fotos_locais) AS photos,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'imagens-locais') AS objects,
  (SELECT count(*) FROM public.locais
    WHERE NULLIF(BTRIM(imagem_url), '') IS NOT NULL) AS places_with_image_url;

ROLLBACK;
