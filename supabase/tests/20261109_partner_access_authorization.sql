-- TESTES PREPARADOS, NÃO EXECUTADOS. Apenas clone/local descartável autorizado.
-- Há escrita de fixtures dentro de transação com ROLLBACK; não usar em produção.
-- Exige migrações revisadas/aplicadas no clone e configuração explícita da sessão
-- roleapp.test_environment = isolated (configuração NÃO é feita por este arquivo).
BEGIN ISOLATION LEVEL READ COMMITTED;
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_setting('roleapp.test_environment',true) IS DISTINCT FROM 'isolated' THEN
    RAISE EXCEPTION 'Somente ambiente isolado explicitamente autorizado.';
  END IF;
END;
$guard$;

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', label; END IF;
END;
$fn$;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN RETURN;
  END;
  RAISE EXCEPTION 'Esperado SQLSTATE 42501: %', statement;
END;
$fn$;
CREATE FUNCTION pg_temp.expect_state(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE actual text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
    IF actual = expected THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Esperado SQLSTATE %: %', expected, statement;
END;
$fn$;
CREATE FUNCTION pg_temp.expect_no_write(statement text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE affected bigint;
BEGIN
  BEGIN
    EXECUTE statement;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 0 THEN RETURN; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RETURN;
  END;
  RAISE EXCEPTION 'Escrita indevida: %', statement;
END;
$fn$;

-- Parâmetros SOMENTE do clone, a preencher com valores que passaram nos CHECKs reais:
-- roleapp.test_local_price / roleapp.test_campaign_days / roleapp.test_campaign_value.
DO $fixtures$
DECLARE loc public.locais%ROWTYPE; req public.solicitacoes_parceria%ROWTYPE; n integer;
  fixture_review uuid;
  fixture_price numeric:=current_setting('roleapp.test_local_price')::numeric;
BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f0911000-0000-4000-8000-%') THEN
    RAISE EXCEPTION 'IDs de teste ja existentes: nao sobrescrever.'; END IF;
  PERFORM set_config('roleapp.fixture.legacy_requests',coalesce((SELECT jsonb_agg(jsonb_build_array(id_solicitacao,status)
    ORDER BY id_solicitacao)::text FROM public.solicitacoes_parceria),'[]'),true);
  PERFORM set_config('roleapp.fixture.legacy_places',coalesce((SELECT jsonb_agg(jsonb_build_array(id_local,id_proprietario,visivel)
    ORDER BY id_local)::text FROM public.locais),'[]'),true);
  PERFORM set_config('roleapp.fixture.legacy_campaigns',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id_campanha)::text
    FROM public.campanhas_impulsionamento c),'[]'),true);
  FOR n IN 1..5 LOOP
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      (('f0911000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'isolated-'||n||'@example.invalid','{}'::jsonb);
    INSERT INTO public.user_roles(user_id,role) VALUES
      (('f0911000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=4 THEN 'admin' WHEN n IN (2,3) THEN 'parceiro' ELSE 'usuario' END)
      ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  END LOOP;
  -- Somente fixtures novas; autenticação real permanece sob o trigger original.
  PERFORM 1 FROM public.usuarios WHERE id_usuario='f0911000-0000-4000-8000-000000000001';
  IF NOT FOUND THEN RAISE EXCEPTION 'Trigger original nao criou perfil; investigar sem recria-lo.'; END IF;
  PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
  FOR n IN 1..3 LOOP
    INSERT INTO public.locais(nome,cidade_uf,endereco,preco,preco_entrada,faixa_preco,id_proprietario,visivel)
      VALUES('Fixture local '||n,'DF','Rua Fixture',fixture_price,0,'$',
        ('f0911000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,n<>1) RETURNING * INTO loc;
    PERFORM set_config('roleapp.fixture.local_'||n,loc.id_local::text,true);
    INSERT INTO public.eventos_locais(id_local,titulo,dias,hora,detalhes,ativo)
      VALUES(loc.id_local,'Evento fixture','Seg','18:00','Fixture',true);
  END LOOP;
  INSERT INTO roleapp_security.feature_flags(name,enabled,approved_by,reason)
    VALUES('metrics_daily_dedup',true,'isolated_fixture','Teste da proposta, sem habilitacao remota')
    ON CONFLICT(name) DO UPDATE SET enabled=true;
  INSERT INTO roleapp_security.campaign_offers(tipo,duracao_dias,valor_total,active,approved_by,reason)
    VALUES('destaque',current_setting('roleapp.test_campaign_days')::integer,
      current_setting('roleapp.test_campaign_value')::numeric,true,'isolated_fixture','Valores confirmados para clone')
    ON CONFLICT(tipo,duracao_dias) DO UPDATE SET valor_total=EXCLUDED.valor_total,active=true;
  PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000001',true);
  FOR n IN 1..2 LOOP
    INSERT INTO public.solicitacoes_parceria(id_usuario,nome,email,estabelecimento,cidade_estado,status)
      VALUES(auth.uid(),'Fixture','test@example.invalid','Fixture local 1','DF','pendente') RETURNING * INTO req;
    PERFORM set_config('roleapp.fixture.request_'||n,req.id_solicitacao::text,true);
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
  INSERT INTO public.solicitacoes_parceria(id_usuario,nome,email,estabelecimento,cidade_estado,status)
    VALUES(auth.uid(),'Fixture Admin','admin@example.invalid','Fixture NOVA','DF','pendente') RETURNING * INTO req;
  PERFORM set_config('roleapp.fixture.request_new',req.id_solicitacao::text,true);
  -- Autorização positiva via fluxo real, somente para fixtures novas 2 e 3.
  FOR n IN 2..3 LOOP
    PERFORM set_config('request.jwt.claim.sub',('f0911000-0000-4000-8000-'||lpad(n::text,12,'0')),true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
    INSERT INTO public.solicitacoes_parceria(id_usuario,nome,email,estabelecimento,cidade_estado,status)
      VALUES(auth.uid(),'Fixture','fixture@example.invalid','Fixture local '||n,'DF','pendente') RETURNING * INTO req;
    PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
    PERFORM set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000004","role":"authenticated"}',true);
    fixture_review:=(public.revisar_parceria_segura(req.id_solicitacao::text)->>'revisao_id')::uuid;
    PERFORM public.decidir_parceria_segura(fixture_review,'aprovado','vincular_existente','Fixture aprovada individualmente',
      current_setting('roleapp.fixture.local_'||n),true,true,NULL);
  END LOOP;
  -- Mesmo dono de local aprovado, mas outro estabelecimento permanece pendente.
  INSERT INTO public.locais(nome,cidade_uf,endereco,preco,preco_entrada,faixa_preco,id_proprietario,visivel)
    VALUES('Fixture outro local pendente','DF','Rua Fixture',fixture_price,0,'$',
      'f0911000-0000-4000-8000-000000000002',false) RETURNING * INTO loc;
  PERFORM set_config('roleapp.fixture.local_unapproved',loc.id_local::text,true);
  PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  INSERT INTO public.solicitacoes_parceria(id_usuario,nome,email,estabelecimento,cidade_estado,status)
    VALUES(auth.uid(),'Fixture','fixture@example.invalid',loc.nome,'DF','pendente') RETURNING * INTO req;
  PERFORM set_config('roleapp.fixture.request_unapproved',req.id_solicitacao::text,true);
  -- Variante pública: o USING(true) antigo não pode liberar escrita só pela propriedade.
  PERFORM set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000004","role":"authenticated"}',true);
  INSERT INTO public.locais(nome,cidade_uf,endereco,preco,preco_entrada,faixa_preco,id_proprietario,visivel)
    VALUES('Fixture publico sem aprovacao','DF','Rua Fixture',fixture_price,0,'$',
      'f0911000-0000-4000-8000-000000000002',true) RETURNING * INTO loc;
  PERFORM set_config('roleapp.fixture.local_unapproved_public',loc.id_local::text,true);
END;
$fixtures$;
-- Simulação isolada: supressão de auditoria deve reverter TODA a decisão.
CREATE FUNCTION pg_temp.suppress_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('roleapp.fixture.fail_audit',true)='yes' AND NEW.action IN ('aprovado','campanha_ativada') THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER roleapp_fixture_audit_failure BEFORE INSERT ON public.roleapp_admin_audit
  FOR EACH ROW EXECUTE FUNCTION pg_temp.suppress_fixture_audit();
DO $temp_access$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon,authenticated',
    (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()));
END;
$temp_access$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),pg_temp.expect_denied(text),
  pg_temp.expect_state(text,text),pg_temp.expect_no_write(text) TO anon,authenticated;

-- Exige também a proposta complementar Cardápio/avatars aplicada no clone autorizado.
-- Não gravar fixtures diretamente em storage.objects: validar Storage pela API.
DO $menu_fixtures$
DECLARE v_local text; v_category text; v_item text;
BEGIN
  FOREACH v_local IN ARRAY ARRAY[current_setting('roleapp.fixture.local_unapproved'),
    current_setting('roleapp.fixture.local_unapproved_public')] LOOP
    INSERT INTO public.categorias_cardapio(id_local,nome,ativo)
      SELECT id_local,'Fixture cardapio',true FROM public.locais WHERE id_local::text=v_local
      RETURNING id_categoria::text INTO v_category;
    INSERT INTO public.itens_cardapio(id_local,id_categoria,nome,preco,disponivel)
      SELECT l.id_local,c.id_categoria,'Fixture item',current_setting('roleapp.test_local_price')::numeric,true
      FROM public.locais l JOIN public.categorias_cardapio c ON c.id_categoria::text=v_category
      WHERE l.id_local::text=v_local RETURNING id_item::text INTO v_item;
    PERFORM set_config(CASE WHEN v_local=current_setting('roleapp.fixture.local_unapproved')
      THEN 'roleapp.fixture.item_private' ELSE 'roleapp.fixture.item_public_pending' END,v_item,true);
  END LOOP;
END;
$menu_fixtures$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.expect_denied('SELECT * FROM public.usuarios');
SELECT pg_temp.expect_denied('INSERT INTO public.solicitacoes_parceria DEFAULT VALUES');
SELECT pg_temp.expect_denied('SELECT public.listar_solicitacoes_admin()');
SELECT pg_temp.expect_denied('INSERT INTO public.metricas_locais DEFAULT VALUES');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.itens_cardapio WHERE id_item::text=current_setting('roleapp.fixture.item_private')),
  'item de local invisivel nao e publico');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.itens_cardapio WHERE id_item::text=current_setting('roleapp.fixture.item_public_pending')),
  'leitura publica do local visivel preservada sem conceder gestao');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.locais_com_avaliacoes
  WHERE id_local::text=current_setting('roleapp.fixture.local_1')),'view publica nao revela invisivel');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000005","role":"authenticated"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.solicitacoes_parceria),'comum nao ve pedidos de terceiros');
SELECT pg_temp.expect_denied('SELECT public.listar_solicitacoes_admin()');
SELECT pg_temp.expect_denied('UPDATE public.metricas_locais SET cliques=500');
SELECT pg_temp.expect_no_write(format('UPDATE public.locais SET nome=%L WHERE id_local::text=%L',
  'Invasao comum',current_setting('roleapp.fixture.local_2')));
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.solicitacoes_parceria WHERE
  id_solicitacao::text IN (current_setting('roleapp.fixture.request_1'),current_setting('roleapp.fixture.request_2'))),
  'usuario pendente consulta apenas seus pedidos');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.locais_com_avaliacoes
  WHERE id_local::text=current_setting('roleapp.fixture.local_1')),'view publica nao revela invisivel ao dono pendente');
SELECT pg_temp.expect_no_write(format('UPDATE public.locais SET nome=%L WHERE id_local::text=%L',
  'Invasao',current_setting('roleapp.fixture.local_1')));
SELECT pg_temp.expect_no_write(format('DELETE FROM public.horarios_funcionamento WHERE id_local::text=%L',
  current_setting('roleapp.fixture.local_2')));
SELECT pg_temp.expect_denied('SELECT public.listar_solicitacoes_admin()');
SELECT pg_temp.expect_denied($q$UPDATE public.solicitacoes_parceria SET status='aprovado'$q$);
SELECT pg_temp.expect_denied($q$UPDATE public.user_roles SET role='admin'$q$);
SELECT pg_temp.expect_denied('INSERT INTO public.campanhas_impulsionamento DEFAULT VALUES');
SELECT pg_temp.expect_denied('UPDATE public.metricas_locais SET views=999');
SELECT pg_temp.assert_true((public.registrar_interacao_segura(current_setting('roleapp.fixture.local_2'),'view')->>'registrada')::boolean,
  'evento unitario permitido no local publico');
SELECT pg_temp.assert_true(NOT (public.registrar_interacao_segura(current_setting('roleapp.fixture.local_2'),'view')->>'registrada')::boolean,
  'evento repetido deduplicado');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT pg_temp.assert_true(roleapp_security.partner_owns(current_setting('roleapp.fixture.local_2')),
  'vinculo individual aprovado permite gestao');
SELECT pg_temp.expect_denied(format('INSERT INTO public.categorias_cardapio(id_local,nome,ativo) VALUES(%L,%L,true)',
  current_setting('roleapp.fixture.local_unapproved_public'),'Categoria sem aprovacao'));
SELECT pg_temp.expect_denied(format('INSERT INTO public.itens_cardapio(id_local,nome,preco,disponivel) VALUES(%L,%L,%L,true)',
  current_setting('roleapp.fixture.local_unapproved_public'),'Item sem aprovacao',current_setting('roleapp.test_local_price')));
SELECT pg_temp.expect_no_write(format('UPDATE public.categorias_cardapio SET nome=%L WHERE id_local::text=%L',
  'Invasao em categoria',current_setting('roleapp.fixture.local_unapproved_public')));
SELECT pg_temp.expect_no_write(format('DELETE FROM public.categorias_cardapio WHERE id_local::text=%L',
  current_setting('roleapp.fixture.local_unapproved_public')));
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.itens_cardapio WHERE id_item::text=current_setting('roleapp.fixture.item_private')),
  'proprietario global sem vinculo individual nao le cardapio invisivel');
SELECT pg_temp.expect_no_write(format('UPDATE public.itens_cardapio SET nome=%L WHERE id_item::text=%L',
  'Invasao em local proprio pendente',current_setting('roleapp.fixture.item_public_pending')));
SELECT pg_temp.expect_no_write(format('DELETE FROM public.itens_cardapio WHERE id_item::text=%L',
  current_setting('roleapp.fixture.item_public_pending')));
DO $menu_owner_crud$
DECLARE v_category text; v_item text; affected integer;
BEGIN
  INSERT INTO public.categorias_cardapio(id_local,nome,ativo)
    SELECT id_local,'Fixture categoria propria',true FROM public.locais WHERE id_local::text=current_setting('roleapp.fixture.local_2')
    RETURNING id_categoria::text INTO v_category;
  INSERT INTO public.itens_cardapio(id_local,id_categoria,nome,preco,disponivel)
    SELECT l.id_local,c.id_categoria,'Fixture item proprio',current_setting('roleapp.test_local_price')::numeric,true
    FROM public.locais l JOIN public.categorias_cardapio c ON c.id_categoria::text=v_category
    WHERE l.id_local::text=current_setting('roleapp.fixture.local_2') RETURNING id_item::text INTO v_item;
  UPDATE public.itens_cardapio SET nome='Fixture editado' WHERE id_item::text=v_item;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.assert_true(affected=1,'UPDATE proprio e RETURNING/SELECT preservados');
  DELETE FROM public.itens_cardapio WHERE id_item::text=v_item;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.assert_true(affected=1,'DELETE proprio permitido');
  DELETE FROM public.categorias_cardapio WHERE id_categoria::text=v_category;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.assert_true(affected=1,'DELETE categoria propria permitido');
END;
$menu_owner_crud$;
SELECT pg_temp.assert_true(NOT roleapp_security.partner_owns(current_setting('roleapp.fixture.local_unapproved')),
  'papel parceiro e mesmo proprietario nao aprovam outro local');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.locais
  WHERE id_local::text=current_setting('roleapp.fixture.local_unapproved')),'local invisivel pendente nao e liberado pelo papel global');
SELECT pg_temp.expect_no_write(format('UPDATE public.locais SET nome=%L WHERE id_local::text=%L',
  'Tentativa em outro local proprio',current_setting('roleapp.fixture.local_unapproved')));
SELECT pg_temp.expect_denied(format('INSERT INTO public.eventos_locais(id_local,titulo,dias,hora,detalhes,ativo)
  VALUES(%L,%L,%L,%L,%L,true)',current_setting('roleapp.fixture.local_unapproved'),'Evento indevido','Seg','18:00','Teste'));
SELECT pg_temp.expect_denied(format('INSERT INTO public.horarios_funcionamento(id_local,dia_semana,abre,fecha,fechado)
  VALUES(%L,1,%L,%L,false)',current_setting('roleapp.fixture.local_unapproved'),'08:00','18:00'));
SELECT pg_temp.expect_denied(format('SELECT public.solicitar_campanha_segura(%L,%L,%L,%L,ARRAY[]::text[],%L,5,%s)',
  current_setting('roleapp.fixture.local_unapproved'),'destaque','Oferta','Mensagem','Todos',current_setting('roleapp.test_campaign_days')));
UPDATE public.eventos_locais SET titulo='Edicao propria' WHERE id_local::text=current_setting('roleapp.fixture.local_2');
SELECT pg_temp.assert_true((SELECT titulo='Edicao propria' FROM public.eventos_locais
  WHERE id_local::text=current_setting('roleapp.fixture.local_2')),'parceiro aprovado edita evento proprio');
SELECT pg_temp.expect_no_write(format('UPDATE public.eventos_locais SET titulo=%L WHERE id_local::text=%L',
  'Invasao',current_setting('roleapp.fixture.local_3')));
SELECT pg_temp.expect_no_write(format('UPDATE public.locais SET id_proprietario=auth.uid() WHERE id_local::text=%L',
  current_setting('roleapp.fixture.local_3')));
SELECT pg_temp.expect_denied(format('SELECT public.solicitar_campanha_segura(%L,%L,%L,%L,ARRAY[]::text[],%L,5,%s)',
  current_setting('roleapp.fixture.local_3'),'destaque','Oferta','Mensagem','Todos',current_setting('roleapp.test_campaign_days')));
SELECT pg_temp.assert_true(public.solicitar_campanha_segura(current_setting('roleapp.fixture.local_2'),
  'destaque','Oferta','Mensagem',ARRAY[]::text[],'Todos',5,current_setting('roleapp.test_campaign_days')::integer)->>'status'='rascunho',
  'oferta revisada gera somente rascunho');
SELECT pg_temp.assert_true((SELECT count(*)>0 AND bool_and(data_inicio IS NULL AND data_fim IS NULL)
  FROM public.campanhas_impulsionamento WHERE id_local::text=current_setting('roleapp.fixture.local_2') AND status='rascunho'),
  'rascunho nao inicia vigencia nem recebe datas de trigger');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.listar_destaques_publicos()) c
  WHERE c->>'id_local'=current_setting('roleapp.fixture.local_2')),'rascunho nao aparece como destaque');
SELECT pg_temp.expect_denied($q$UPDATE public.campanhas_impulsionamento SET status='ativa'$q$);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SELECT set_config('roleapp.fixture.review_link',public.revisar_parceria_segura(current_setting('roleapp.fixture.request_1'))->>'revisao_id',true);
UPDATE public.itens_cardapio SET descricao='Fixture manutencao admin'
  WHERE id_item::text=current_setting('roleapp.fixture.item_public_pending');
SELECT pg_temp.assert_true((SELECT descricao='Fixture manutencao admin' FROM public.itens_cardapio
  WHERE id_item::text=current_setting('roleapp.fixture.item_public_pending')),'admin legitimo mantem gestao de cardapio');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.locais_com_avaliacoes
  WHERE id_local::text=current_setting('roleapp.fixture.local_1')),'view publica filtra invisivel inclusive para admin');
SELECT set_config('roleapp.fixture.review_stale',public.revisar_parceria_segura(current_setting('roleapp.fixture.request_2'))->>'revisao_id',true);
SELECT pg_temp.expect_state(format('SELECT public.decidir_parceria_segura(%L::uuid,%L,%L,%L,NULL,true,true,%L::jsonb)',
  current_setting('roleapp.fixture.review_link'),'aprovado','criar_novo','Tentativa com candidato',
  jsonb_build_object('endereco','Rua Fixture','preco',current_setting('roleapp.test_local_price')::numeric,'preco_entrada',0)::text),'22023');
SELECT pg_temp.assert_true(public.decidir_parceria_segura(current_setting('roleapp.fixture.review_link')::uuid,
  'aprovado','vincular_existente','Identidade e vinculo verificados',current_setting('roleapp.fixture.local_1'),true,true,NULL)->>'status'='aprovado',
  'vinculo explicito aprovado sem outro local');
SELECT pg_temp.assert_true(public.decidir_parceria_segura(current_setting('roleapp.fixture.review_link')::uuid,
  'aprovado','vincular_existente','Identidade e vinculo verificados',current_setting('roleapp.fixture.local_1'),true,true,NULL)->>'status'='aprovado',
  'retry identico retorna resultado anterior');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.roleapp_admin_audit
  WHERE request_id=current_setting('roleapp.fixture.request_1') AND action='aprovado'),'uma auditoria de decisao');
SELECT pg_temp.expect_state(format('SELECT public.decidir_parceria_segura(%L::uuid,%L,%L,%L,%L,true,true,NULL)',
  current_setting('roleapp.fixture.review_stale'),'aprovado','vincular_existente','Revisao antiga',current_setting('roleapp.fixture.local_1')),'22023');
SELECT set_config('roleapp.fixture.review_duplicate',public.revisar_parceria_segura(current_setting('roleapp.fixture.request_2'))->>'revisao_id',true);
SELECT pg_temp.expect_state(format('SELECT public.decidir_parceria_segura(%L::uuid,%L,%L,%L,%L,true,true,NULL)',
  current_setting('roleapp.fixture.review_duplicate'),'aprovado','vincular_existente','Mesmo negocio',current_setting('roleapp.fixture.local_1')),'22023');
SELECT pg_temp.assert_true(public.decidir_parceria_segura(current_setting('roleapp.fixture.review_duplicate')::uuid,
  'em_analise','bloquear','Duplicidade requer decisao manual',NULL,false,false,NULL)->>'status'='em_analise','ambiguidade bloqueada');
SELECT set_config('roleapp.fixture.review_new',public.revisar_parceria_segura(current_setting('roleapp.fixture.request_new'))->>'revisao_id',true);
SELECT set_config('roleapp.fixture.fail_audit','yes',true);
SELECT pg_temp.expect_state(format('SELECT public.decidir_parceria_segura(%L::uuid,%L,%L,%L,NULL,true,true,%L::jsonb)',
  current_setting('roleapp.fixture.review_new'),'aprovado','criar_novo','Falha simulada de auditoria',
  jsonb_build_object('endereco','Rua Nova','preco',current_setting('roleapp.test_local_price')::numeric,'preco_entrada',0)::text),'P0001');
SELECT set_config('roleapp.fixture.fail_audit','no',true);
SELECT pg_temp.assert_true((SELECT status='pendente' FROM public.solicitacoes_parceria
  WHERE id_solicitacao::text=current_setting('roleapp.fixture.request_new')),'falha de auditoria reverte status');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.locais WHERE nome='Fixture NOVA'),
  'falha de auditoria reverte criacao');
SELECT pg_temp.assert_true(public.decidir_parceria_segura(current_setting('roleapp.fixture.review_new')::uuid,
  'aprovado','criar_novo','Identidade verificada, sem candidato',NULL,true,true,
  jsonb_build_object('endereco','Rua Nova','preco',current_setting('roleapp.test_local_price')::numeric,'preco_entrada',0))->>'status'='aprovado',
  'criacao explicita sem candidato');
SELECT pg_temp.expect_denied('INSERT INTO public.locais DEFAULT VALUES');
SELECT pg_temp.expect_denied('DELETE FROM public.roleapp_admin_audit');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT role='admin' FROM public.user_roles WHERE user_id='f0911000-0000-4000-8000-000000000004'),
  'admin solicitante preservado');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.locais WHERE id_proprietario='f0911000-0000-4000-8000-000000000001'),
  'pedidos repetidos nao duplicam estabelecimento legado');
SELECT pg_temp.assert_true(coalesce((SELECT jsonb_agg(jsonb_build_array(id_local,id_proprietario,visivel) ORDER BY id_local)
  FROM public.locais WHERE id_proprietario IS NULL OR id_proprietario::text NOT LIKE 'f0911000-0000-4000-8000-%'),'[]'::jsonb)
  IS NOT DISTINCT FROM current_setting('roleapp.fixture.legacy_places')::jsonb,'locais legados preservados, inclusive sem dono');
SELECT pg_temp.assert_true(coalesce((SELECT jsonb_agg(jsonb_build_array(id_solicitacao,status) ORDER BY id_solicitacao)
  FROM public.solicitacoes_parceria WHERE id_usuario IS NULL OR id_usuario::text NOT LIKE 'f0911000-0000-4000-8000-%'),'[]'::jsonb)
  IS NOT DISTINCT FROM current_setting('roleapp.fixture.legacy_requests')::jsonb,'pedidos legados nao alterados');
SELECT pg_temp.assert_true(coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id_campanha)
  FROM public.campanhas_impulsionamento c WHERE id_usuario IS NULL OR id_usuario::text NOT LIKE 'f0911000-0000-4000-8000-%'),'[]'::jsonb)
  IS NOT DISTINCT FROM current_setting('roleapp.fixture.legacy_campaigns')::jsonb,'campanhas legadas e estados preservados');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN (VALUES('anon'),('authenticated')) r(name) WHERE n.nspname IN ('public','roleapp_security')
    AND c.relkind IN ('r','p') AND (has_table_privilege(r.name,c.oid,'TRUNCATE,REFERENCES,TRIGGER') OR
      has_any_column_privilege(r.name,c.oid,'REFERENCES'))),'clientes sem privilegios administrativos de tabela');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN (VALUES('anon'),('authenticated')) r(name) WHERE n.nspname IN ('public','roleapp_security')
    AND c.relkind='S' AND has_sequence_privilege(r.name,c.oid,'UPDATE')),'clientes nao podem usar setval');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='incrementar_metrica' AND
    (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),
  'todos os overloads antigos fechados');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN (VALUES('anon'),('authenticated')) r(name)
  CROSS JOIN LATERAL aclexplode(acldefault('r',c.relowner)) a
  WHERE n.nspname='public' AND c.relname IN ('categorias_cardapio','itens_cardapio')
    AND a.privilege_type='MAINTAIN' AND has_table_privilege(r.name,c.oid,a.privilege_type)),
  'clientes sem MAINTAIN nas versoes que oferecem esse privilegio');
-- Matriz de campanhas: SOMENTE fixtures transacionais, sem tocar no legado.
DO $offers_matrix$
DECLARE days integer;
BEGIN
  FOREACH days IN ARRAY ARRAY[3,7,14] LOOP
    INSERT INTO roleapp_security.campaign_offers(tipo,duracao_dias,valor_total,active,approved_by,reason)
      VALUES('destaque',days,current_setting('roleapp.test_campaign_value')::numeric,true,'isolated_fixture','Matriz de teste')
      ON CONFLICT(tipo,duracao_dias) DO UPDATE SET active=true,valor_total=EXCLUDED.valor_total;
  END LOOP;
END;
$offers_matrix$;
-- Fontes independentes: a view deve usar a nota 5 legada, não a nota 0 do app.
INSERT INTO public.avaliacoes(id_local,id_usuario,nota,comentario)
  SELECT id_local,'f0911000-0000-4000-8000-000000000001'::uuid,5,'Fixture legado'
  FROM public.locais WHERE id_local::text=current_setting('roleapp.fixture.local_2');
INSERT INTO public.avaliacoes_locais(id_local,id_usuario,nota,comentario)
  SELECT id_local,'f0911000-0000-4000-8000-000000000001'::uuid,0,''
  FROM public.locais WHERE id_local::text=current_setting('roleapp.fixture.local_2');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.assert_true((SELECT media_avaliacao=5 AND quantidade_avaliacoes=1 FROM public.locais_com_avaliacoes
  WHERE id_local::text=current_setting('roleapp.fixture.local_2')),'view usa somente avaliacoes, com SELECT/RLS efetivos');
SELECT pg_temp.expect_denied('SELECT comentario FROM public.avaliacoes');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $draft_matrix$
DECLARE days integer; result jsonb;
BEGIN
  FOREACH days IN ARRAY ARRAY[3,7,14] LOOP
    result:=public.solicitar_campanha_segura(current_setting('roleapp.fixture.local_2'),
      'destaque','Fixture matriz','Teste',ARRAY[]::text[],'Todos',5,days);
    PERFORM set_config('roleapp.fixture.campaign_'||days,result->>'id_campanha',true);
    PERFORM pg_temp.assert_true(result->>'status'='rascunho' AND result->>'data_inicio' IS NULL AND
      result->>'data_fim' IS NULL,'rascunho sem vigencia em todas as duracoes');
    PERFORM pg_temp.expect_denied(format('SELECT public.ativar_campanha_segura(%L,%L)',result->>'id_campanha','Parceiro nao ativa'));
  END LOOP;
END;
$draft_matrix$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.expect_denied(format('SELECT public.ativar_campanha_segura(%L,%L)',
  current_setting('roleapp.fixture.campaign_3'),'Anon nao ativa'));
RESET ROLE;
-- Exercitar CHECK de datas na fixture antes da ativação, sem tocar no legado.
SELECT pg_temp.expect_state(format('UPDATE public.campanhas_impulsionamento SET data_inicio=now() WHERE id_campanha::text=%L',
  current_setting('roleapp.fixture.campaign_3')),'23514');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SELECT set_config('roleapp.fixture.fail_audit','yes',true);
SELECT pg_temp.expect_state(format('SELECT public.ativar_campanha_segura(%L,%L)',
  current_setting('roleapp.fixture.campaign_3'),'Falha de auditoria simulada'),'P0001');
SELECT set_config('roleapp.fixture.fail_audit','no',true);
SELECT pg_temp.assert_true((SELECT status='rascunho' AND data_inicio IS NULL AND data_fim IS NULL
  FROM public.campanhas_impulsionamento WHERE id_campanha::text=current_setting('roleapp.fixture.campaign_3')),
  'falha de auditoria reverte ativacao e datas');
DO $activation_matrix$
DECLARE days integer; result jsonb; repeated jsonb; campaign_key text;
BEGIN
  FOREACH days IN ARRAY ARRAY[3,7,14] LOOP
    campaign_key:=current_setting('roleapp.fixture.campaign_'||days);
    result:=public.ativar_campanha_segura(campaign_key,'Condicoes verificadas na fixture');
    PERFORM pg_temp.assert_true(result->>'status'='ativa' AND
      (result->>'data_fim')::timestamptz-(result->>'data_inicio')::timestamptz=interval '24 hours'*days,
      'vigencia conforme duracao escolhida, sem usar default de sete dias');
    repeated:=public.ativar_campanha_segura(campaign_key,'Condicoes verificadas na fixture');
    PERFORM pg_temp.assert_true(result=repeated,'retry nao reinicia vigencia');
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.roleapp_admin_audit
      WHERE action='campanha_ativada' AND details->>'id_campanha'=campaign_key),'uma auditoria por ativacao');
    PERFORM pg_temp.expect_state(format('SELECT public.ativar_campanha_segura(%L,%L)',campaign_key,'Outra decisao'),'22023');
    PERFORM pg_temp.expect_denied(format('UPDATE public.campanhas_impulsionamento SET status=%L WHERE id_campanha::text=%L','pausada',campaign_key));
  END LOOP;
END;
$activation_matrix$;
RESET ROLE;
-- Mesmo um caminho privilegiado deve respeitar o trigger de transição.
SELECT pg_temp.expect_state(format('UPDATE public.campanhas_impulsionamento SET status=%L WHERE id_campanha::text=%L',
  'pausada',current_setting('roleapp.fixture.campaign_3')),'42501');
SELECT pg_temp.expect_state(format('UPDATE public.campanhas_impulsionamento SET status=%L WHERE id_campanha::text=%L',
  'rascunho',current_setting('roleapp.fixture.campaign_7')),'23514');
SELECT pg_temp.expect_state(format('UPDATE public.campanhas_impulsionamento SET data_fim=NULL WHERE id_campanha::text=%L',
  current_setting('roleapp.fixture.campaign_14')),'23514');
SELECT pg_temp.assert_true(coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id_campanha)
  FROM public.campanhas_impulsionamento c WHERE id_usuario IS NULL OR id_usuario::text NOT LIKE 'f0911000-0000-4000-8000-%'),'[]'::jsonb)
  IS NOT DISTINCT FROM current_setting('roleapp.fixture.legacy_campaigns')::jsonb,'matriz nao altera campanhas antigas');

-- Revogacao durante sessao: flags antigas do app nao concedem escrita.
UPDATE public.user_roles SET role='usuario' WHERE user_id='f0911000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0911000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"f0911000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT pg_temp.expect_no_write(format('UPDATE public.eventos_locais SET titulo=%L WHERE id_local::text=%L',
  'Revogado',current_setting('roleapp.fixture.local_2')));
RESET ROLE;
ROLLBACK;
