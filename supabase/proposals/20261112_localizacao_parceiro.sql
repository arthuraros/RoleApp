-- PROPOSTA / REGISTRO SQL. Este arquivo nao foi aplicado automaticamente.
-- Reproduz o contrato informado como testado no Supabase (local ID 8).
-- A definicao remota nao foi consultada nem comparada byte a byte.
-- Antes de aplicar: inspecionar pg_proc/pg_get_functiondef para sobrecargas
-- existentes de atualizar_localizacao_parceiro e confirmar os tipos do schema.
-- Contrato do cliente: id numerico seguro; resposta JSON com id e coordenadas.
-- Sem dependencia direta de roleapp_security.partner_owns nesta funcao.
-- Politicas e triggers existentes permanecem em vigor e devem ser inspecionados.
-- Revisar o owner postgres e testar com JWTs reais de dois parceiros antes de deploy.
BEGIN;

CREATE OR REPLACE FUNCTION public.atualizar_localizacao_parceiro(
  p_id_local bigint, p_latitude double precision, p_longitude double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  resultado jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
      WHERE r.user_id=auth.uid() AND r.role='parceiro'
  ) THEN
    RAISE EXCEPTION 'Estabelecimento indisponivel para esta conta.' USING ERRCODE='42501';
  END IF;
  -- Limites fechados rejeitam NaN e +/-Infinity no PostgreSQL:
  -- NaN e maior que todos os valores nao-NaN, portanto falha no limite superior.
  -- Nulos sao rejeitados explicitamente; nao usamos isfinite(double precision).
  -- Referencia: https://www.postgresql.org/docs/current/datatype-numeric.html
  IF p_id_local IS NULL OR p_id_local <= 0 OR
     p_latitude IS NULL OR NOT (p_latitude BETWEEN -90 AND 90) OR
     p_longitude IS NULL OR NOT (p_longitude BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Localizacao invalida.' USING ERRCODE='22023';
  END IF;

  -- Condicao de propriedade tambem no UPDATE; sem receber usuario do cliente.
  UPDATE public.locais l
    SET latitude=p_latitude, longitude=p_longitude
    WHERE l.id_local=p_id_local AND l.id_proprietario=auth.uid()
    RETURNING jsonb_build_object('id_local',l.id_local,
      'latitude',l.latitude,'longitude',l.longitude) INTO resultado;
  IF resultado IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento indisponivel para esta conta.' USING ERRCODE='42501';
  END IF;
  RETURN resultado;
END;
$fn$;
ALTER FUNCTION public.atualizar_localizacao_parceiro(bigint,double precision,double precision) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.atualizar_localizacao_parceiro(bigint,double precision,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_localizacao_parceiro(bigint,double precision,double precision) TO authenticated;
-- Nao concede UPDATE direto, nao modifica RLS, triggers ou campos administrativos.
COMMIT;

-- VERIFICACOES PENDENTES NO AMBIENTE (nao executadas por este arquivo):
-- 1. Anonimo/sem JWT, usuario sem papel parceiro, parceiro de outro local e ID
--    inexistente: rejeitar sem alterar registros. Admin sem papel parceiro tambem.
-- 2. Proprietario com papel parceiro: aceitar (0,0), extremos (-90,-180)/(90,180)
--    e coordenadas usuais; conferir JSON retornado e leitura posterior no Mapa.
-- 3. Para cada coordenada: NULL, 'NaN'::double precision,
--    'Infinity'::double precision, '-Infinity'::double precision e valores fora
--    dos intervalos devem falhar com 22023, mantendo as coordenadas anteriores.
--    Rejeitar tambem p_id_local NULL, zero e negativo.
-- 4. Conferir assinatura, nomes dos parametros, retorno jsonb, owner, search_path,
--    sobrecargas e ACLs remotas (inclusive grants antigos a outros papeis).
--    CREATE OR REPLACE preserva grants existentes; revisar acessos adicionais
--    antes de aplicar. Confirmar que clientes nao podem atribuir user_roles.
