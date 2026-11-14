-- SUPERSEDED review-only candidate. Do not remove its block or deploy it.
-- Use 20261113_admin_places_read_v1_incremental_blocked.sql for the corrected
-- proposal; this legacy draft references the obsolete locais.cidade_estado.
-- CONTRATO DE LEITURA CANDIDATO. Nao executado; sem escrita em dados de negocio.
-- Depende da fundacao de capacidades RA-11 APROVADA/instalada separadamente.
-- Nao executa a proposta RA-11 nem cria/promove administradores automaticamente.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $approval$
BEGIN
  RAISE EXCEPTION 'BLOQUEADA: aprovar catalogo, capacidades, owner e contrato de leitura antes de instalar.';
END;
$approval$;

DO $preflight$
BEGIN
  IF to_regclass('roleapp_security.admin_access') IS NULL OR
     to_regclass('roleapp_security.admin_capability_grants') IS NULL THEN
    RAISE EXCEPTION 'Fundacao de capacidades administrativas ainda nao confirmada';
  END IF;
  IF to_regprocedure('public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato ja existe: revisar corpo/owner/ACL; nao substituir automaticamente';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.roleapp_admin_places_read_v1(
  p_search text DEFAULT '', p_visible boolean DEFAULT NULL,
  p_after text DEFAULT NULL, p_limit integer DEFAULT 20, p_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE result jsonb; actor uuid := auth.uid();
BEGIN
  -- Papel atual + acesso ativo + capacidade atual; nao confia no JWT/payload.
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles u
    JOIN roleapp_security.admin_access a ON a.user_id=u.user_id
    JOIN roleapp_security.admin_capability_grants g ON g.user_id=a.user_id
    WHERE u.user_id=actor AND u.role='admin' AND a.active IS TRUE
      AND g.capability='locais.ler'
  ) THEN RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501'; END IF;

  IF p_search IS NULL OR char_length(p_search)>120 OR p_limit IS NULL OR
     p_limit NOT BETWEEN 1 AND 100 OR char_length(p_after)>200 OR
     (p_id IS NOT NULL AND (btrim(p_id)='' OR char_length(p_id)>200)) THEN
    RAISE EXCEPTION 'Parametros invalidos' USING ERRCODE='22023';
  END IF;

  -- Cursor e ordenacao lexicografica por PK convertida em texto, inclusive IDs
  -- numericos. Sem OFFSET, SQL dinamico, SELECT * ou campos privados na listagem.
  WITH candidates AS (
    SELECT l.id_local::text AS id, l.nome, l.visivel,
      CASE WHEN p_id IS NOT NULL THEN jsonb_build_object(
        'endereco',l.endereco,'cidade_estado',l.cidade_estado,
        'responsavel',CASE WHEN u.id_usuario IS NULL THEN NULL ELSE
          jsonb_build_object('id_usuario',u.id_usuario::text,'nome',u.nome) END
      ) ELSE '{}'::jsonb END AS details
    FROM public.locais l
    LEFT JOIN public.usuarios u ON p_id IS NOT NULL AND u.id_usuario=l.id_proprietario
    WHERE (p_id IS NULL OR l.id_local::text=p_id)
      AND (p_visible IS NULL OR l.visivel=p_visible)
      AND (p_after IS NULL OR l.id_local::text COLLATE "C" > p_after COLLATE "C")
      AND (btrim(p_search)='' OR l.id_local::text=btrim(p_search)
        OR strpos(lower(coalesce(l.nome,'')),lower(btrim(p_search)))>0)
    ORDER BY l.id_local::text COLLATE "C" LIMIT p_limit+1
  ), page AS (
    SELECT * FROM candidates ORDER BY id COLLATE "C" LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id_local',id,
      'nome',coalesce(nome,''),'visivel',visivel) || details ORDER BY id COLLATE "C") FROM page),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM candidates)>p_limit
      THEN (SELECT id FROM page ORDER BY id COLLATE "C" DESC LIMIT 1) ELSE NULL END
  ) INTO result;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.roleapp_admin_places_read_v1(text,boolean,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roleapp_admin_places_read_v1(text,boolean,text,integer,text) TO authenticated;
-- Owner: aplicar exclusivamente com owner confiavel, nao herdavel por clientes,
-- autorizado a ler tabelas privadas. Nao conceder SELECT adicional a clientes.
-- Validar ACL de user_roles/capacidades contra escrita direta e RPCs alternativas.
-- Nome/ID do responsavel so no detalhe e sob a MESMA capacidade locais.ler.
-- Sem email, telefone, auth.users ou auditoria de mutacao (esta RPC so le).
COMMIT;
