-- NAO EXECUTADO. Somente clone descartavel com migracao aprovada instalada.
-- Sessao postgres: roleapp.test_environment=isolated; roleapp.test_user_a e
-- roleapp.test_user_b = UUIDs de duas contas de teste existentes DIFERENTES;
-- roleapp.test_local_id = local de teste visivel pelas duas contas.
-- Nao usar dados/contas reais. Todas as fixtures de roles sao revertidas.
BEGIN;
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_setting('roleapp.test_environment',true) IS DISTINCT FROM 'isolated'
    OR current_setting('roleapp.test_user_a',true) IS NULL
    OR current_setting('roleapp.test_user_b',true) IS NULL
    OR current_setting('roleapp.test_user_a')=current_setting('roleapp.test_user_b')
    OR current_setting('roleapp.test_local_id',true) IS NULL THEN
    RAISE EXCEPTION 'Exige clone isolado e fixtures explicitas';
  END IF;
END;
$guard$;
CREATE FUNCTION pg_temp.check_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.denied(sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql;
  EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Esperado acesso negado: %',sql;
END;
$$;
CREATE FUNCTION pg_temp.no_write(sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  BEGIN EXECUTE sql; GET DIAGNOSTICS n=ROW_COUNT;
    IF n=0 THEN RETURN; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Escrita entre usuarios: %',sql;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.test_user_a'),true);
DO $a$
DECLARE rid text;
BEGIN
  INSERT INTO public.roles(nome_role,id_usuario,status,preco_final)
    VALUES('Fixture A',auth.uid(),'planejado',0) RETURNING id_role::text INTO rid;
  PERFORM set_config('roleapp.fixture_role_a',rid,true);
  INSERT INTO public.roles_etapas(id_role,id_local,etapa,item_cardapio,quantidade_item,custo_acao)
    SELECT r.id_role,l.id_local,1,NULL,NULL,0 FROM public.roles r CROSS JOIN public.locais l
    WHERE r.id_role::text=rid AND l.id_local::text=current_setting('roleapp.test_local_id');
  PERFORM pg_temp.check_true((SELECT count(*)=1 FROM public.roles_etapas WHERE id_role::text=rid),'A cria etapa propria');
END;
$a$;

SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.test_user_b'),true);
DO $b$
DECLARE rid text; aid text:=current_setting('roleapp.fixture_role_a');
BEGIN
  INSERT INTO public.roles(nome_role,id_usuario,status,preco_final)
    VALUES('Fixture B',auth.uid(),'planejado',0) RETURNING id_role::text INTO rid;
  PERFORM set_config('roleapp.fixture_role_b',rid,true);
  PERFORM pg_temp.check_true((SELECT count(*)=0 FROM public.roles WHERE id_role::text=aid),'B nao le pai A');
  PERFORM pg_temp.check_true((SELECT count(*)=0 FROM public.roles_etapas WHERE id_role::text=aid),'B nao le etapas A');
  PERFORM pg_temp.no_write(format('UPDATE public.roles SET nome_role=''ataque'' WHERE id_role::text=%L',aid));
  PERFORM pg_temp.no_write(format('DELETE FROM public.roles_etapas WHERE id_role::text=%L',aid));
  PERFORM pg_temp.no_write(format('DELETE FROM public.roles WHERE id_role::text=%L',aid));
  PERFORM pg_temp.no_write(format('UPDATE public.roles_etapas SET etapa=99 WHERE id_role::text=%L',aid));
  PERFORM pg_temp.denied(format('INSERT INTO public.roles(nome_role,id_usuario,status,preco_final) VALUES(''forjado'',%L,''planejado'',0)',current_setting('roleapp.test_user_a')));
END;
$b$;
DO $cross_stage$
DECLARE own_id text:=current_setting('roleapp.fixture_role_b'); other_id text:=current_setting('roleapp.fixture_role_a');
BEGIN
  -- json_populate_record preserva o tipo real de id_role/id_local no clone.
  PERFORM pg_temp.denied(format($q$
    INSERT INTO public.roles_etapas(id_role,id_local,etapa,custo_acao)
    SELECT x.id_role,x.id_local,1,0 FROM json_populate_record(NULL::public.roles_etapas,
      json_build_object('id_role',%L,'id_local',%L)) x$q$,other_id,current_setting('roleapp.test_local_id')));
  INSERT INTO public.roles_etapas(id_role,id_local,etapa,custo_acao)
    SELECT x.id_role,x.id_local,1,0 FROM json_populate_record(NULL::public.roles_etapas,
      json_build_object('id_role',own_id,'id_local',current_setting('roleapp.test_local_id'))) x;
  PERFORM pg_temp.denied(format($q$UPDATE public.roles_etapas SET id_role=(SELECT x.id_role
    FROM json_populate_record(NULL::public.roles_etapas,json_build_object('id_role',%L)) x)
    WHERE id_role::text=%L$q$,other_id,own_id));
  PERFORM pg_temp.denied(format('UPDATE public.roles SET id_usuario=%L WHERE id_role::text=%L',
    current_setting('roleapp.test_user_a'),own_id));
END;
$cross_stage$;

SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.test_user_a'),true);
UPDATE public.roles SET nome_role='Fixture A editada',preco_final=10 WHERE id_role::text=current_setting('roleapp.fixture_role_a');
UPDATE public.roles_etapas SET custo_acao=10 WHERE id_role::text=current_setting('roleapp.fixture_role_a');
SELECT pg_temp.check_true((SELECT nome_role='Fixture A editada' AND preco_final=10 FROM public.roles
  WHERE id_role::text=current_setting('roleapp.fixture_role_a')),'A edita proprio pai');
SELECT pg_temp.check_true((SELECT sum(custo_acao)=10 FROM public.roles_etapas
  WHERE id_role::text=current_setting('roleapp.fixture_role_a')),'A edita propria etapa');
DELETE FROM public.roles_etapas WHERE id_role::text=current_setting('roleapp.fixture_role_a');
DELETE FROM public.roles WHERE id_role::text=current_setting('roleapp.fixture_role_a');
SELECT pg_temp.check_true((SELECT count(*)=0 FROM public.roles WHERE id_role::text=current_setting('roleapp.fixture_role_a')),'A exclui proprio role');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.denied('SELECT * FROM public.roles');
SELECT pg_temp.denied('SELECT * FROM public.roles_etapas');
RESET ROLE;
ROLLBACK;
