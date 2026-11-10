-- PROPOSTA COMPLEMENTAR BLOQUEADA, NÃO É MIGRAÇÃO AUTORIZADA.
-- Depende de 00200 e NÃO substitui as quatro migrações nem suas travas.
-- imagens-locais: SEM DDL nesta proposta; falta vínculo comprovado entre caminho e local.
-- Ver docs/cardapio-storage-autorizacao-20261109.md. Nenhum dado é regravado.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Cardapio/avatars bloqueados: revisar manifestos, contratos e testar em clone autorizado.';
END;
$guard$;

DO $preflight$
DECLARE target text; actor text; actual_hash text;
  reviewed_policy_hashes jsonb := NULL;
  reviewed_helper_hashes jsonb := NULL;
  reviewed_avatar_path_and_legacy_contract boolean := false;
  reviewed_cardapio_admin_contract boolean := false;
  reviewed_storage_upsert_contract boolean := false;
BEGIN
  IF current_user<>'postgres' OR reviewed_policy_hashes IS NULL OR reviewed_helper_hashes IS NULL OR
    NOT reviewed_avatar_path_and_legacy_contract OR NOT reviewed_cardapio_admin_contract OR
    NOT reviewed_storage_upsert_contract THEN
    RAISE EXCEPTION 'Executor/manifestos/contratos ainda nao revisados.'; END IF;
  FOREACH target IN ARRAY ARRAY['roleapp_security.partner_owns(text)','roleapp_security.is_admin()',
    'roleapp_security.local_public(text)','roleapp_security.approved_local_owner(text,uuid)'] LOOP
    IF to_regprocedure(target) IS NULL OR reviewed_helper_hashes->>target IS DISTINCT FROM
      md5(pg_get_functiondef(to_regprocedure(target))) THEN
      RAISE EXCEPTION 'Helper de autorizacao nao corresponde a versao individual revisada: %.',target; END IF;
  END LOOP;
  FOREACH target IN ARRAY ARRAY['public.categorias_cardapio','public.itens_cardapio','storage.objects'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass(target) AND relkind IN ('r','p') AND relrowsecurity) THEN
      RAISE EXCEPTION 'Tabela/RLS esperada ausente em %.',target; END IF;
    SELECT md5(coalesce(string_agg(p.polname || '|' || p.polcmd::text || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' ||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' ORDER BY p.polname),''))
      INTO actual_hash FROM pg_policy p WHERE p.polrelid=to_regclass(target);
    IF reviewed_policy_hashes->>target IS DISTINCT FROM actual_hash THEN
      RAISE EXCEPTION 'Politicas/contratos divergiram em %.',target; END IF;
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=actor AND (rolsuper OR rolbypassrls)) OR
        EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass(target) AND pg_has_role(actor,relowner,'MEMBER')) THEN
        RAISE EXCEPTION 'Cliente pode contornar RLS em %.',target; END IF;
    END LOOP;
  END LOOP;
END;
$preflight$;

-- Mantém permissivas/contratos anteriores; guardas RESTRICTIVE impedem bypass por OR.
-- Permissão administrativa positiva é explícita e exige is_admin() do banco.
DO $cardapio$
DECLARE target text; read_rule text; write_rule text; check_rule text;
BEGIN
  FOREACH target IN ARRAY ARRAY['categorias_cardapio','itens_cardapio'] LOOP
    read_rule:='roleapp_security.local_public(id_local::text) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
    write_rule:='(roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin())';
    check_rule:=write_rule;
    IF target='itens_cardapio' THEN
      -- Categoria opcional, mas deve pertencer ao mesmo local; mantém FK/contrato do serviço.
      check_rule:=check_rule || ' AND (id_categoria IS NULL OR EXISTS(SELECT 1 FROM public.categorias_cardapio c
        WHERE c.id_categoria=itens_cardapio.id_categoria AND c.id_local=itens_cardapio.id_local))';
    END IF;
    EXECUTE format('CREATE POLICY roleapp_menu_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (%s)',target,read_rule);
    EXECUTE format('CREATE POLICY roleapp_menu_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (%s)',target,check_rule);
    EXECUTE format('CREATE POLICY roleapp_menu_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (%s) WITH CHECK (%s)',target,write_rule,check_rule);
    EXECUTE format('CREATE POLICY roleapp_menu_delete_guard ON public.%I AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (%s)',target,write_rule);
    EXECUTE format('CREATE POLICY roleapp_menu_admin ON public.%I FOR ALL TO authenticated USING (roleapp_security.is_admin()) WITH CHECK (roleapp_security.is_admin())',target);
    EXECUTE format('CREATE POLICY roleapp_menu_owner_read ON public.%I FOR SELECT TO authenticated USING (roleapp_security.partner_owns(id_local::text))',target);
  END LOOP;
END;
$cardapio$;

-- Evidência: src/services/userService.js usa `${userId}/avatar.${fileExt}`, upsert:true.
-- Sem allowlist inventada de extensões; validar prefixo, basename e dois segmentos.
-- Não altera bucket.public, não move arquivos e não reescreve políticas de outros buckets.
DO $avatars$
DECLARE owned_path text := '(auth.uid() IS NOT NULL AND split_part(name,''/'',1)=auth.uid()::text
  AND array_length(string_to_array(name,''/''),1)=2
  AND split_part(name,''/'',2) LIKE ''avatar.%'' AND split_part(name,''/'',2)<>''avatar.'')';
  scoped_guard text;
BEGIN
  scoped_guard:='(bucket_id<>''avatars'' OR ' || owned_path || ')';
  EXECUTE format('CREATE POLICY roleapp_avatar_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (%s)',scoped_guard);
  EXECUTE format('CREATE POLICY roleapp_avatar_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (%s) WITH CHECK (%s)',scoped_guard,scoped_guard);
  EXECUTE format('CREATE POLICY roleapp_avatar_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (%s)',scoped_guard);
  -- Upsert requer SELECT da linha própria. Não acrescenta leitura de arquivos alheios.
  EXECUTE format('CREATE POLICY roleapp_avatar_own_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id=''avatars'' AND %s)',owned_path);
END;
$avatars$;

-- Sem concessão nova de INSERT/UPDATE/DELETE a papéis de cliente.
-- Os grants existentes, policies restritivas antigas, API Storage e RETURNING precisam
-- passar na matriz do clone. Qualquer incompatibilidade mantém a liberação bloqueada.
COMMIT;
