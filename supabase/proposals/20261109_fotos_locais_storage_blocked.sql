-- PROPOSTA COMPLEMENTAR; NAO E MIGRACAO LIBERADA. Nao executar.
-- Depois de 00100/00150/00175/00200 e da proposta revisada de Cardapio/avatars.
-- Sem backfill, bucket novo, alteracao de bucket, aprovacao ou atribuicao de dono.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Fotos/Storage BLOQUEADOS: revisao e autorizacao explicitas ainda necessarias.';
END;
$guard$;

-- Somente alcancaveis em uma futura versao explicitamente autorizada para clone.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

DO $proposal$
DECLARE
  reviewed_manifest jsonb := NULL;
  reviewed_public_url_prefix text := NULL;
  reviewed_path_pattern text := NULL;
  reviewed_path_url_and_public_asset_contract boolean := false;
  reviewed_columns_defaults_sequences_and_consumers boolean := false;
  reviewed_helpers_dependencies_and_alternative_routes boolean := false;
  reviewed_projection_and_returning_contract boolean := false;
  reviewed_storage_trigger_and_bucket_immutability boolean := false;
  actual_manifest jsonb; preserved_hash text; after_hash text;
  actor text; actor_oid oid; privilege text; column_ref record; seq regclass; sequence_owner oid;
  seq_default oid; seq_column smallint; allowed boolean;
  read_rule text; own_rule text; url_rule text; path_rule text; image_read text; image_write text;
BEGIN
  IF current_user<>'postgres' OR reviewed_manifest IS NULL OR
    nullif(btrim(reviewed_public_url_prefix),'') IS NULL OR nullif(btrim(reviewed_path_pattern),'') IS NULL OR
    NOT reviewed_path_url_and_public_asset_contract OR NOT reviewed_columns_defaults_sequences_and_consumers OR
    NOT reviewed_helpers_dependencies_and_alternative_routes OR NOT reviewed_projection_and_returning_contract OR
    NOT reviewed_storage_trigger_and_bucket_immutability THEN
    RAISE EXCEPTION 'Manifesto/prefixo/contratos nao revisados; proposta permanece bloqueada.';
  END IF;
  -- Candidato id_local/nome_arquivo, ainda NAO confirmado. Sem host/endpoint/extensoes inventados.
  -- O prefixo deve ser revisado como URL publica HTTPS com barra final, sem token/query/fragmento.
  IF reviewed_public_url_prefix !~ '^https://[^/?#[:space:]]+/[^?#[:space:]]*$' OR
    right(reviewed_public_url_prefix,1)<>'/' THEN
    RAISE EXCEPTION 'Prefixo publico invalido; confirmar URL/CDN e contrato de concatenacao.';
  END IF;
  -- Verifica a sintaxe da regex fornecida na futura revisao; nao define uma allowlist ficticia.
  PERFORM '' ~ reviewed_path_pattern;
  -- Bloqueia SELECT e escrita em TODOS os buckets durante a transacao. NOWAIT evita fila longa.
  -- DDL pode adquirir outros locks: timeouts acima e ROLLBACK imediato sao obrigatorios no clone.
  LOCK TABLE public.fotos_locais,storage.objects IN ACCESS EXCLUSIVE MODE NOWAIT;

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
) INTO actual_manifest;

  IF actual_manifest IS DISTINCT FROM reviewed_manifest THEN
    RAISE EXCEPTION 'Catalogo divergiu da coleta revisada no ponto exato da implantacao.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fotos_locais) OR
    EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='imagens-locais') THEN
    RAISE EXCEPTION 'Surgiram fotos/objetos: inventariar contratos e legado; nao limpar nem converter.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='imagens-locais' AND public IS TRUE
    AND file_size_limit>0 AND file_size_limit<=5*1024*1024
    AND allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp']::text[]
    AND allowed_mime_types <@ ARRAY['image/jpeg','image/png','image/webp']::text[]
    AND cardinality(allowed_mime_types)=3) THEN
    RAISE EXCEPTION 'Contrato do bucket nao confirmado; nao alterar bucket automaticamente.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.fotos_locais'::regclass
    AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND NOT relispartition) OR
    EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='public.fotos_locais'::regclass
      OR inhparent='public.fotos_locais'::regclass) THEN
    RAISE EXCEPTION 'Contrato de tabela/RLS/particoes divergente.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass
    AND relkind='r' AND relrowsecurity AND NOT relispartition) OR
    EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='storage.objects'::regclass
      OR inhparent='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Contrato de Storage/RLS/particoes divergente; nao alterar automaticamente.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN ('public.fotos_locais'::regclass,'storage.objects'::regclass)
    AND NOT pg_has_role(current_user,c.relowner,'USAGE')) THEN
    RAISE EXCEPTION 'Executor sem direitos de owner efetivos para policies/trigger; revisar sem ampliar grants.';
  END IF;
  IF to_regprocedure('roleapp_security.protect_image_bucket_identity()') IS NOT NULL OR
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='storage.objects'::regclass
      AND tgname='roleapp_images_bucket_identity') THEN
    RAISE EXCEPTION 'Funcao/trigger ja existe; nao sobrescrever objeto sem revisao.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public.fotos_locais'::regclass
    AND k.contype='p' AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute
      WHERE attrelid=k.conrelid AND attname='id_foto')]::smallint[]) OR
    NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public.fotos_locais'::regclass
      AND k.contype='f' AND k.confrelid='public.locais'::regclass AND k.confdeltype='c' AND k.convalidated
      AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='id_local')]::smallint[]
      AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='id_local')]::smallint[]) THEN
    RAISE EXCEPTION 'PK/FK CASCADE nao confirmadas.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.fotos_locais'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND a.attnotnull AND a.attname NOT IN ('id_local','url_foto') AND d.oid IS NULL
      AND a.attidentity='' AND a.attgenerated='') THEN
    RAISE EXCEPTION 'INSERT minimo nao satisfaz colunas obrigatorias/defaults; revisar sem inventar campos.';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    SELECT r.oid INTO actor_oid FROM pg_roles r WHERE r.rolname=actor;
    IF actor_oid IS NULL THEN RAISE EXCEPTION 'Papel cliente ausente: %.',actor; END IF;
    IF EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(actor_oid,r.oid,'MEMBER') AND (r.rolsuper OR r.rolbypassrls)) OR
      EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN ('public.fotos_locais'::regclass,'storage.objects'::regclass)
        AND pg_has_role(actor_oid,c.relowner,'MEMBER')) OR
      has_schema_privilege(actor_oid,'public','CREATE') OR has_schema_privilege(actor_oid,'roleapp_security','CREATE') OR
      has_schema_privilege(actor_oid,'storage','CREATE') THEN
      RAISE EXCEPTION 'Papel cliente pode contornar/criar caminhos de acesso: %.',actor;
    END IF;
    IF NOT has_function_privilege(actor_oid,'roleapp_security.partner_owns(text)','EXECUTE') OR
      NOT has_function_privilege(actor_oid,'roleapp_security.local_public(text)','EXECUTE') OR
      NOT has_function_privilege(actor_oid,'roleapp_security.is_admin()','EXECUTE') OR
      has_function_privilege(actor_oid,'roleapp_security.approved_local_owner(text,uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'ACL dos helpers divergiu: %.',actor;
    END IF;
    IF NOT has_schema_privilege(actor_oid,'public','USAGE') OR NOT has_schema_privilege(actor_oid,'storage','USAGE') OR
      NOT has_schema_privilege(actor_oid,'roleapp_security','USAGE') OR
      NOT has_table_privilege(actor_oid,'storage.objects','SELECT') THEN
      RAISE EXCEPTION 'Grants minimos de leitura/schema ausentes: %; revisar contratos da API.',actor;
    END IF;
    FOR privilege IN SELECT a.privilege_type FROM pg_class c,
      LATERAL aclexplode(acldefault('r',c.relowner)) a WHERE c.oid='storage.objects'::regclass
    LOOP
      IF has_table_privilege(actor_oid,'storage.objects',privilege||' WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'Cliente pode delegar privilegios de Storage: % %; revisar grants globais.',actor,privilege;
      END IF;
      IF privilege NOT IN ('SELECT','INSERT','UPDATE','DELETE') AND has_table_privilege(actor_oid,'storage.objects',privilege) THEN
        RAISE EXCEPTION 'Storage tem privilegio efetivo fora de CRUD: % %. Revisar sem revogacao global automatica.',actor,privilege;
      END IF;
      IF actor='authenticated' AND privilege IN ('INSERT','UPDATE','DELETE') AND
        NOT has_table_privilege(actor_oid,'storage.objects',privilege) THEN
        RAISE EXCEPTION 'Grant Storage necessario ausente: %; nao conceder globalmente sem revisar consumidores.',privilege;
      END IF;
    END LOOP;
    FOR column_ref IN SELECT attnum FROM pg_attribute WHERE attrelid='storage.objects'::regclass
      AND attnum>0 AND NOT attisdropped LOOP
      IF has_column_privilege(actor_oid,'storage.objects',column_ref.attnum,'REFERENCES') THEN
        RAISE EXCEPTION 'REFERENCES efetivo em coluna de Storage: %; revisar sem revogacao global.',actor;
      END IF;
      FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        IF has_column_privilege(actor_oid,'storage.objects',column_ref.attnum,privilege||' WITH GRANT OPTION') THEN
          RAISE EXCEPTION 'Cliente pode delegar privilegios de coluna de Storage: % %.',actor,privilege;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Namespaces exclusivos; nao substituir policies existentes nem tocar suas expressoes.
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('public.fotos_locais'::regclass,'storage.objects'::regclass)
    AND (polname LIKE 'roleapp_photos_%' OR polname LIKE 'roleapp_images_%')) THEN
    RAISE EXCEPTION 'Nome de policy ja existe; revisar, nao sobrescrever.';
  END IF;
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO preserved_hash
    FROM pg_policy p WHERE p.polrelid IN ('public.categorias_cardapio'::regclass,
      'public.itens_cardapio'::regclass,'storage.objects'::regclass);

  -- ALL inclui privilegios adicionais da versao (ex.: MAINTAIN). Colunas tambem sao revogadas.
  REVOKE ALL PRIVILEGES ON TABLE public.fotos_locais FROM PUBLIC,anon,authenticated;
  FOR column_ref IN SELECT attname FROM pg_attribute WHERE attrelid='public.fotos_locais'::regclass
    AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.fotos_locais FROM PUBLIC,anon,authenticated',column_ref.attname);
  END LOOP;
  GRANT SELECT(id_foto,id_local,url_foto) ON public.fotos_locais TO anon,authenticated;
  GRANT INSERT(id_local,url_foto),UPDATE(url_foto) ON public.fotos_locais TO authenticated;
  GRANT DELETE ON public.fotos_locais TO authenticated;
  -- id_local/id_foto imutaveis via API; administrador corrige URL/exclui/recria explicitamente.
  seq:=to_regclass(pg_get_serial_sequence('public.fotos_locais','id_foto'));
  IF seq IS NOT NULL THEN
    SELECT relowner INTO sequence_owner FROM pg_class WHERE oid=seq;
    SELECT a.attnum,d.oid INTO seq_column,seq_default FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.fotos_locais'::regclass AND a.attname='id_foto';
    -- Recusa sequencia compartilhada ou outros consumidores catalogados, sem revoga-los.
    IF EXISTS(SELECT 1 FROM pg_depend d WHERE
      (d.refclassid='pg_class'::regclass AND d.refobjid=seq
        AND NOT (d.classid='pg_attrdef'::regclass AND d.objid=coalesce(seq_default,0))) OR
      (d.classid='pg_class'::regclass AND d.objid=seq AND d.refclassid='pg_class'::regclass
        AND NOT (d.refobjid='public.fotos_locais'::regclass AND d.refobjsubid=seq_column))) THEN
      RAISE EXCEPTION 'Dependencia adicional na sequencia; revisar consumidores.';
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC,anon,authenticated',seq);
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',seq);
  END IF;

  read_rule:='roleapp_security.local_public(id_local::text) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
  own_rule:='(roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin())';
  -- Contrato candidato id_local/nome_arquivo; prefixo e regex permanecem NULL ate confirmacao.
  -- Nao sincroniza url_foto/imagem_url nem exige uma extensao de arquivo inventada.
  -- Literais revisados ficam nas policies; nenhuma configuracao de cliente/GUC autoriza acesso.
  url_rule:=format('(url_foto IS NOT NULL AND left(url_foto::text,length(%1$L))=%1$L
    AND substring(url_foto::text FROM length(%1$L)+1) ~ %2$L
    AND array_length(string_to_array(substring(url_foto::text FROM length(%1$L)+1),''/''),1)=2
    AND split_part(substring(url_foto::text FROM length(%1$L)+1),''/'',2) NOT IN ('''',''.'',''..'')
    AND split_part(substring(url_foto::text FROM length(%1$L)+1),''/'',1)=id_local::text)',
    reviewed_public_url_prefix,reviewed_path_pattern);
  EXECUTE format('CREATE POLICY roleapp_photos_read ON public.fotos_locais FOR SELECT TO anon,authenticated USING (%s)',read_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_read_guard ON public.fotos_locais AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (%s)',read_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_insert ON public.fotos_locais FOR INSERT TO authenticated WITH CHECK (%s AND %s)',own_rule,url_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_insert_guard ON public.fotos_locais AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (%s AND %s)',own_rule,url_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_update ON public.fotos_locais FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s AND %s)',own_rule,own_rule,url_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_update_guard ON public.fotos_locais AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (%s) WITH CHECK (%s AND %s)',own_rule,own_rule,url_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_delete ON public.fotos_locais FOR DELETE TO authenticated USING (%s)',own_rule);
  EXECUTE format('CREATE POLICY roleapp_photos_delete_guard ON public.fotos_locais AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (%s)',own_rule);

  -- RLS nao compara OLD com NEW: permissivas diferentes podem autorizar cada lado.
  -- Invariante proposta: nenhuma troca de bucket envolvendo imagens-locais OU avatars,
  -- inclusive para admin/worker. AFTER UPDATE cobre alteracoes de BEFORE triggers;
  -- nao usar UPDATE OF bucket_id, pois outro trigger pode alterar essa coluna.
  EXECUTE $bucket_function$
    CREATE FUNCTION roleapp_security.protect_image_bucket_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $bucket_body$
    BEGIN
      IF OLD.bucket_id IS DISTINCT FROM NEW.bucket_id AND
        (OLD.bucket_id IN ('imagens-locais','avatars') OR NEW.bucket_id IN ('imagens-locais','avatars')) THEN
        RAISE EXCEPTION 'Troca de bucket protegido nao autorizada; requer fluxo separado revisado.' USING ERRCODE='42501';
      END IF;
      RETURN NULL;
    END;
    $bucket_body$;
  $bucket_function$;
  REVOKE ALL ON FUNCTION roleapp_security.protect_image_bucket_identity() FROM PUBLIC,anon,authenticated;
  CREATE TRIGGER roleapp_images_bucket_identity AFTER UPDATE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_image_bucket_identity();
  ALTER TABLE storage.objects ENABLE ALWAYS TRIGGER roleapp_images_bucket_identity;

  path_rule:=format('(objects.name ~ %L AND array_length(string_to_array(objects.name,''/''),1)=2
    AND split_part(objects.name,''/'',1)<>'''' AND split_part(objects.name,''/'',2) NOT IN ('''',''.'',''..''))',
    reviewed_path_pattern);
  image_write:=format('(%s AND EXISTS(SELECT 1 FROM public.locais l WHERE l.id_local::text=split_part(objects.name,''/'',1)
    AND (roleapp_security.partner_owns(l.id_local::text) OR roleapp_security.is_admin())))',path_rule);
  image_read:=format('(roleapp_security.is_admin() OR (%s AND
    (roleapp_security.local_public(split_part(objects.name,''/'',1)) OR roleapp_security.partner_owns(split_part(objects.name,''/'',1)))))',path_rule);
  -- Guardas neutras para os outros buckets. PUBLIC URL bypassa SELECT, inclusive em local invisivel.
  EXECUTE format('CREATE POLICY roleapp_images_read ON storage.objects FOR SELECT TO anon,authenticated USING (bucket_id=''imagens-locais'' AND %s)',image_read);
  EXECUTE format('CREATE POLICY roleapp_images_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (bucket_id<>''imagens-locais'' OR %s)',image_read);
  EXECUTE format('CREATE POLICY roleapp_images_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id=''imagens-locais'' AND %s)',image_write);
  EXECUTE format('CREATE POLICY roleapp_images_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (bucket_id<>''imagens-locais'' OR %s)',image_write);
  -- OLD/NEW checados: nao mover de/para local nao autorizado neste bucket.
  -- Troca de bucket_id e recusada pelo trigger, independentemente das permissivas de outros buckets.
  -- Copy ou DELETE+INSERT sao operacoes distintas: direitos de leitura/escrita precisam de teste real.
  EXECUTE format('CREATE POLICY roleapp_images_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id=''imagens-locais'' AND %s) WITH CHECK (bucket_id=''imagens-locais'' AND %s)',image_write,image_write);
  EXECUTE format('CREATE POLICY roleapp_images_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (bucket_id<>''imagens-locais'' OR %s) WITH CHECK (bucket_id<>''imagens-locais'' OR %s)',image_write,image_write);
  EXECUTE format('CREATE POLICY roleapp_images_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id=''imagens-locais'' AND (roleapp_security.is_admin() OR %s))',image_write);
  EXECUTE format('CREATE POLICY roleapp_images_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (bucket_id<>''imagens-locais'' OR roleapp_security.is_admin() OR %s)',image_write);

  -- Nao revoga grants globais de storage.objects/sequencias alheias (avatares/outros buckets).
  -- Detecta grants efetivos/herdados que REVOKE direto nao elimina: falha, nao remove memberships.
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    SELECT r.oid INTO actor_oid FROM pg_roles r WHERE r.rolname=actor;
    IF actor_oid IS NULL THEN RAISE EXCEPTION 'Papel cliente desapareceu: %.',actor; END IF;
    FOR privilege IN SELECT a.privilege_type FROM pg_class c,
      LATERAL aclexplode(acldefault('r',c.relowner)) a WHERE c.oid='public.fotos_locais'::regclass
    LOOP
      allowed:=(actor='authenticated' AND privilege='DELETE');
      IF has_table_privilege(actor_oid,'public.fotos_locais',privilege) IS DISTINCT FROM allowed OR
        has_table_privilege(actor_oid,'public.fotos_locais',privilege||' WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'Privilegio efetivo/herdado inesperado: % %.',actor,privilege;
      END IF;
    END LOOP;
    FOR column_ref IN SELECT attnum,attname FROM pg_attribute WHERE attrelid='public.fotos_locais'::regclass
      AND attnum>0 AND NOT attisdropped LOOP
      FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        allowed:=(privilege='SELECT' AND column_ref.attname IN ('id_foto','id_local','url_foto')) OR
          (actor='authenticated' AND privilege='INSERT' AND column_ref.attname IN ('id_local','url_foto')) OR
          (actor='authenticated' AND privilege='UPDATE' AND column_ref.attname='url_foto');
        IF has_column_privilege(actor_oid,'public.fotos_locais',column_ref.attnum,privilege) IS DISTINCT FROM allowed OR
          has_column_privilege(actor_oid,'public.fotos_locais',column_ref.attnum,privilege||' WITH GRANT OPTION') THEN
          RAISE EXCEPTION 'Privilegio efetivo/herdado de coluna inesperado: % %.%.',actor,column_ref.attname,privilege;
        END IF;
      END LOOP;
    END LOOP;
    IF seq IS NOT NULL THEN
      IF pg_has_role(actor_oid,sequence_owner,'MEMBER') OR
        has_sequence_privilege(actor_oid,seq::oid,'UPDATE') OR has_sequence_privilege(actor_oid,seq::oid,'SELECT') OR
        has_sequence_privilege(actor_oid,seq::oid,'USAGE') IS DISTINCT FROM (actor='authenticated') OR
        has_sequence_privilege(actor_oid,seq::oid,'USAGE WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'Sequencia com privilegios efetivos/herdados inesperados: %.',actor;
      END IF;
    END IF;
    IF has_function_privilege(actor_oid,'roleapp_security.protect_image_bucket_identity()','EXECUTE') THEN
      RAISE EXCEPTION 'Funcao de trigger exposta ao cliente: %.',actor;
    END IF;
  END LOOP;
  -- tgtype=17: ROW(1)+UPDATE(16), sem BEFORE/INSTEAD; constraint=0: trigger nao adiavel.
  IF NOT EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid='storage.objects'::regclass
    AND g.tgname='roleapp_images_bucket_identity' AND NOT g.tgisinternal AND g.tgenabled='A'
    AND g.tgtype=17 AND g.tgconstraint=0 AND g.tgattr=''::int2vector
    AND g.tgfoid=to_regprocedure('roleapp_security.protect_image_bucket_identity()')::oid) THEN
    RAISE EXCEPTION 'Trigger imediato AFTER UPDATE de bucket nao corresponde a proposta.';
  END IF;
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO after_hash
    FROM pg_policy p WHERE p.polrelid IN ('public.categorias_cardapio'::regclass,
      'public.itens_cardapio'::regclass,'storage.objects'::regclass)
      AND NOT (p.polrelid='storage.objects'::regclass AND p.polname LIKE 'roleapp_images_%');
  IF preserved_hash IS DISTINCT FROM after_hash THEN
    RAISE EXCEPTION 'Policies anteriores de Storage/Cardapio divergiram; transacao deve abortar.';
  END IF;
END;
$proposal$;
COMMIT;
