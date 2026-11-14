-- MATRIZ FUTURA, NAO EXECUTADA. Clone autorizado com as propostas ja revisadas/aplicadas.
-- Nao insere diretamente em storage.objects: bytes/upsert/move/download exigem teste HTTP.
-- Fixtures NOVAS previamente criadas no clone, atraves do fluxo de aprovacao com auditoria.
-- Nunca preencher com IDs de locais/usuarios legados. Este arquivo sempre termina em ROLLBACK.
BEGIN;
DO $guard$
DECLARE
  reviewed_fixture jsonb := NULL;
  reviewed_public_url_prefix text := NULL;
  key text; photo text;
BEGIN
  IF current_user<>'postgres' OR current_setting('roleapp.test_environment',true) IS DISTINCT FROM 'isolated'
    OR reviewed_fixture IS NULL OR reviewed_public_url_prefix IS NULL THEN
    RAISE EXCEPTION 'Teste bloqueado: clone autorizado e manifesto de fixtures novas obrigatorios.';
  END IF;
  -- Manifesto: partner/common/admin (UUIDs Auth); a/b/c/d (IDs locais reais do clone).
  -- A: visivel, aprovado individualmente para partner.
  -- B: invisivel, mesmo proprietario de A, SEM aprovacao individual (pedido pendente).
  -- C: visivel, proprietario diferente. D: invisivel, sem proprietario.
  FOREACH key IN ARRAY ARRAY['partner','common','admin','a','b','c','d'] LOOP
    IF nullif(reviewed_fixture->>key,'') IS NULL THEN RAISE EXCEPTION 'Fixture ausente: %.',key; END IF;
    PERFORM set_config('roleapp.photos.'||key,reviewed_fixture->>key,true);
  END LOOP;
  IF (SELECT count(DISTINCT e.value) FROM jsonb_each_text(reviewed_fixture) e WHERE e.key IN ('a','b','c','d'))<>4 OR
    (SELECT count(DISTINCT e.value) FROM jsonb_each_text(reviewed_fixture) e WHERE e.key IN ('partner','common','admin'))<>3 THEN
    RAISE EXCEPTION 'Fixtures devem ser distintas.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.locais WHERE id_local::text=reviewed_fixture->>'a'
    AND visivel IS TRUE AND id_proprietario::text=reviewed_fixture->>'partner') OR
    NOT EXISTS(SELECT 1 FROM public.locais WHERE id_local::text=reviewed_fixture->>'b'
    AND visivel IS FALSE AND id_proprietario::text=reviewed_fixture->>'partner') OR
    NOT EXISTS(SELECT 1 FROM public.locais WHERE id_local::text=reviewed_fixture->>'c'
    AND visivel IS TRUE AND id_proprietario IS NOT NULL AND id_proprietario::text<>reviewed_fixture->>'partner') OR
    NOT EXISTS(SELECT 1 FROM public.locais WHERE id_local::text=reviewed_fixture->>'d'
    AND visivel IS FALSE AND id_proprietario IS NULL) THEN
    RAISE EXCEPTION 'Locais fixture nao satisfazem os cenarios exigidos.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id::text=reviewed_fixture->>'partner' AND role='parceiro') OR
    NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id::text=reviewed_fixture->>'common' AND role='usuario') OR
    NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id::text=reviewed_fixture->>'admin' AND role='admin') THEN
    RAISE EXCEPTION 'Papeis das fixtures nao conferem.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.fotos_locais) THEN RAISE EXCEPTION 'Clone desta matriz deve iniciar sem fotos.'; END IF;
  PERFORM set_config('roleapp.photos.prefix',reviewed_public_url_prefix,true);
  PERFORM set_config('roleapp.photos.legacy',md5((SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id_local),'[]')::text
    FROM public.locais l)),true);
  FOREACH key IN ARRAY ARRAY['a','b','c','d'] LOOP
    INSERT INTO public.fotos_locais(id_local,url_foto)
      SELECT id_local,reviewed_public_url_prefix||id_local::text||'/review-seed.jpg'
      FROM public.locais WHERE id_local::text=reviewed_fixture->>key RETURNING id_foto::text INTO photo;
    PERFORM set_config('roleapp.photos.photo_'||key,photo,true);
  END LOOP;
END;
$guard$;

CREATE FUNCTION pg_temp.photo_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',label; END IF; END;
$fn$;
CREATE FUNCTION pg_temp.photo_denied(statement text,allow_not_null boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE affected bigint;
BEGIN
  BEGIN EXECUTE statement; GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected=0 THEN RETURN; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RETURN;
    WHEN not_null_violation THEN IF allow_not_null THEN RETURN; ELSE RAISE; END IF;
  END;
  RAISE EXCEPTION 'Operacao indevida: %',statement;
END;
$fn$;
DO $temp$
BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon,authenticated',
  (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END;
$temp$;
GRANT EXECUTE ON FUNCTION pg_temp.photo_assert(boolean,text),pg_temp.photo_denied(text,boolean) TO anon,authenticated;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT pg_temp.photo_assert((SELECT count(*)=2 FROM public.fotos_locais),'anon le apenas A/C visiveis');
SELECT pg_temp.photo_denied('INSERT INTO public.fotos_locais(id_local,url_foto) SELECT id_local,''invalid'' FROM public.locais LIMIT 1');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/anon.jpg''');
SELECT pg_temp.photo_denied('DELETE FROM public.fotos_locais');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.photos.common'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
SELECT pg_temp.photo_assert((SELECT count(*)=2 FROM public.fotos_locais),'usuario comum le somente visiveis');
SELECT pg_temp.photo_denied('INSERT INTO public.fotos_locais(id_local,url_foto) SELECT id_local,current_setting(''roleapp.photos.prefix'')||id_local::text||''/common.jpg'' FROM public.locais WHERE id_local::text=current_setting(''roleapp.photos.a'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/common.jpg''');
SELECT pg_temp.photo_denied('DELETE FROM public.fotos_locais');

SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.photos.partner'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
SELECT pg_temp.photo_assert(roleapp_security.partner_owns(current_setting('roleapp.photos.a')),'A aprovado com auditoria');
SELECT pg_temp.photo_assert(NOT roleapp_security.partner_owns(current_setting('roleapp.photos.b')),'B do mesmo dono nao aprovado');
SELECT pg_temp.photo_assert((SELECT count(*)=2 FROM public.fotos_locais),'propriedade de B nao libera leitura invisivel');
INSERT INTO public.fotos_locais(id_local,url_foto)
  SELECT id_local,current_setting('roleapp.photos.prefix')||id_local::text||'/partner.jpg'
  FROM public.locais WHERE id_local::text=current_setting('roleapp.photos.a') RETURNING id_foto,id_local,url_foto;
WITH changed AS (UPDATE public.fotos_locais SET url_foto=current_setting('roleapp.photos.prefix')||id_local::text||'/updated.webp'
  WHERE id_foto::text=current_setting('roleapp.photos.photo_a') RETURNING id_foto)
SELECT pg_temp.photo_assert((SELECT count(*)=1 FROM changed),'parceiro atualiza A');
-- INSERT negativo sem depender da visibilidade de B na tabela locais.
SELECT pg_temp.photo_denied(format('INSERT INTO public.fotos_locais(id_local,url_foto) VALUES(%L,%L)',
  current_setting('roleapp.photos.b'),current_setting('roleapp.photos.prefix')||current_setting('roleapp.photos.b')||'/denied.jpg'));
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/forbidden.jpg'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_c'')');
SELECT pg_temp.photo_denied('DELETE FROM public.fotos_locais WHERE id_foto::text=current_setting(''roleapp.photos.photo_c'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET id_local=id_local WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
-- URL aponta outro local; encoding, caminho extra, host externo e query nao fazem parte da proposta.
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||current_setting(''roleapp.photos.b'')||''/foreign.jpg'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=''https://example.invalid/foreign.jpg'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/bad%2Fname.jpg'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/bad.jpg?token=x'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=NULL WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')',true);
WITH removed AS (DELETE FROM public.fotos_locais WHERE url_foto=current_setting('roleapp.photos.prefix')||current_setting('roleapp.photos.a')||'/partner.jpg' RETURNING id_foto)
SELECT pg_temp.photo_assert((SELECT count(*)=1 FROM removed),'parceiro exclui foto propria autorizada');
RESET ROLE;

-- Revogacao de vinculo da fixture, sem mudar pedido/dono/papel: perde escrita imediatamente.
UPDATE roleapp_security.request_local_links SET active=false WHERE local_id=current_setting('roleapp.photos.a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.photo_assert(NOT roleapp_security.partner_owns(current_setting('roleapp.photos.a')),'vinculo inativo nega gestao');
SELECT pg_temp.photo_denied('UPDATE public.fotos_locais SET url_foto=current_setting(''roleapp.photos.prefix'')||id_local::text||''/revoked.jpg'' WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
SELECT pg_temp.photo_denied('DELETE FROM public.fotos_locais WHERE id_foto::text=current_setting(''roleapp.photos.photo_a'')');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('roleapp.photos.admin'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
SELECT pg_temp.photo_assert(roleapp_security.is_admin(),'admin autorizado no banco');
SELECT pg_temp.photo_assert((SELECT count(*)=4 FROM public.fotos_locais),'admin le inclusive sem dono');
WITH created AS (INSERT INTO public.fotos_locais(id_local,url_foto)
  SELECT id_local,current_setting('roleapp.photos.prefix')||id_local::text||'/admin-new.jpeg'
  FROM public.locais WHERE id_local::text=current_setting('roleapp.photos.d') RETURNING id_foto)
SELECT pg_temp.photo_assert((SELECT count(*)=1 FROM created),'admin cria metadado sem atribuir dono');
WITH changed AS (UPDATE public.fotos_locais SET url_foto=current_setting('roleapp.photos.prefix')||id_local::text||'/admin.png'
  WHERE id_foto::text=current_setting('roleapp.photos.photo_d') RETURNING id_foto)
SELECT pg_temp.photo_assert((SELECT count(*)=1 FROM changed),'admin corrige foto de local sem dono sem atribuir dono');
WITH removed AS (DELETE FROM public.fotos_locais WHERE id_foto::text=current_setting('roleapp.photos.photo_d') RETURNING id_foto)
SELECT pg_temp.photo_assert((SELECT count(*)=1 FROM removed),'admin exclui metadado sem dono');
RESET ROLE;

DO $postflight$
DECLARE actor text; p text;
BEGIN
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOR p IN SELECT a.privilege_type FROM pg_class c,
      LATERAL aclexplode(acldefault('r',c.relowner)) a
      WHERE c.oid='public.fotos_locais'::regclass AND a.privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE') LOOP
      IF has_table_privilege(actor,'public.fotos_locais',p) THEN RAISE EXCEPTION 'Privilegio perigoso efetivo: % %',actor,p; END IF;
    END LOOP;
  END LOOP;
  IF current_setting('roleapp.photos.legacy') IS DISTINCT FROM md5((SELECT
    coalesce(jsonb_agg(to_jsonb(l) ORDER BY id_local),'[]')::text FROM public.locais l)) THEN
    RAISE EXCEPTION 'Locais/URLs/donos/visibilidade existentes foram alterados.';
  END IF;
END;
$postflight$;
ROLLBACK;
