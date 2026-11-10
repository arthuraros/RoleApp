-- BLOCO 4/4: dados legados/candidatos a duplicação. SOMENTE LEITURA.
-- Não associa automaticamente nomes/e-mails, não concede papéis nem chama RPCs.
-- Requer as tabelas de negócio existentes. Não depende da futura user_roles.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH requests AS (
  SELECT j->>'id_solicitacao' AS request_id,j->>'id_usuario' AS user_id,
    j->>'estabelecimento' AS establishment,j->>'cidade_estado' AS city,
    j->>'status' AS status,j->>'created_at' AS created_at,
    lower(regexp_replace(btrim(coalesce(j->>'estabelecimento','')),'[[:space:]]+',' ','g')) AS name_key,
    lower(regexp_replace(btrim(coalesce(j->>'cidade_estado','')),'[[:space:]]+',' ','g')) AS city_key
  FROM public.solicitacoes_parceria r CROSS JOIN LATERAL (SELECT to_jsonb(r) AS j) x
), places AS (
  SELECT j->>'id_local' AS local_id,j->>'id_proprietario' AS owner_id,
    j->>'nome' AS name,j->>'cidade_uf' AS city,j->>'visivel' AS visible,
    j->>'created_at' AS created_at,
    lower(regexp_replace(btrim(coalesce(j->>'nome','')),'[[:space:]]+',' ','g')) AS name_key,
    lower(regexp_replace(btrim(coalesce(j->>'cidade_uf','')),'[[:space:]]+',' ','g')) AS city_key
  FROM public.locais l CROSS JOIN LATERAL (SELECT to_jsonb(l) AS j) x
), campaigns AS (
  SELECT j->>'id_campanha' AS campaign_id,j->>'id_local' AS local_id,
    j->>'id_usuario' AS user_id,j->>'status' AS status,j->>'tipo' AS type,
    j->>'duracao_dias' AS duration_days,j->>'data_inicio' AS starts_at,j->>'data_fim' AS ends_at
  FROM public.campanhas_impulsionamento c CROSS JOIN LATERAL (SELECT to_jsonb(c) AS j) x
), metrics AS (
  SELECT j->>'id_local' AS local_id,j->>'data' AS day,
    j->>'views' AS views,j->>'cliques' AS clicks,j->>'visitas' AS visits
  FROM public.metricas_locais m CROSS JOIN LATERAL (SELECT to_jsonb(m) AS j) x
), candidates AS (
  SELECT r.request_id,r.user_id,r.status,r.establishment,r.city AS request_city,
    r.created_at AS request_created_at,l.local_id,l.owner_id,l.name,l.city AS local_city,
    l.visible,l.created_at AS local_created_at,
    (r.user_id IS NOT NULL AND r.user_id=l.owner_id) AS same_owner,
    (r.name_key<>'' AND r.name_key=l.name_key) AS same_normalized_name,
    (r.city_key=l.city_key AND r.city_key<>'') AS same_normalized_city,
    l.owner_id IS NULL AS ownerless,
    'candidato_para_revisao_manual_nao_e_vinculo_confirmado' AS diagnostic
  FROM requests r JOIN places l ON
    (r.user_id IS NOT NULL AND r.user_id=l.owner_id) OR
    (r.name_key<>'' AND r.name_key=l.name_key AND
      (r.city_key=l.city_key OR r.city_key='' OR l.city_key=''))
), repeated_requests AS (
  SELECT user_id,name_key,city_key,count(*) AS total,
    array_agg(request_id ORDER BY request_id) AS request_ids,
    array_agg(DISTINCT status) AS statuses
  FROM requests GROUP BY user_id,name_key,city_key HAVING count(*)>1
), repeated_places AS (
  SELECT name_key,city_key,count(*) AS total,array_agg(local_id ORDER BY local_id) AS local_ids,
    array_agg(DISTINCT owner_id) AS owners
  FROM places WHERE name_key<>'' GROUP BY name_key,city_key HAVING count(*)>1
), duplicate_metrics AS (
  SELECT local_id,day,count(*) AS total FROM metrics GROUP BY local_id,day HAVING count(*)>1
), status_counts AS (
  SELECT 'requests' AS object,status,count(*) AS total FROM requests GROUP BY status
  UNION ALL
  SELECT 'campaigns',status,count(*) FROM campaigns GROUP BY status
), integrity AS (
  SELECT
    (SELECT count(*) FROM public.usuarios u WHERE NOT EXISTS
      (SELECT 1 FROM auth.users a WHERE a.id::text=u.id_usuario::text)) AS usuarios_without_auth,
    (SELECT count(*) FROM requests WHERE user_id IS NULL) AS requests_null_user,
    (SELECT count(*) FROM requests r WHERE user_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM auth.users a WHERE a.id::text=r.user_id)) AS requests_nonexistent_user,
    (SELECT count(*) FROM places WHERE owner_id IS NULL) AS ownerless_places,
    (SELECT count(*) FROM places l WHERE owner_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM auth.users a WHERE a.id::text=l.owner_id)) AS places_nonexistent_owner,
    (SELECT count(*) FROM campaigns c LEFT JOIN places l ON l.local_id=c.local_id
      WHERE l.local_id IS NULL) AS campaigns_missing_local,
    (SELECT count(*) FROM campaigns c JOIN places l ON l.local_id=c.local_id
      WHERE c.user_id IS DISTINCT FROM l.owner_id OR l.owner_id IS NULL) AS campaigns_owner_mismatch,
    (SELECT count(*) FROM campaigns WHERE starts_at IS NULL OR ends_at IS NULL) AS campaigns_missing_dates,
    (SELECT count(*) FROM metrics m WHERE NOT EXISTS
      (SELECT 1 FROM places l WHERE l.local_id=m.local_id)) AS metrics_missing_local,
    (SELECT count(*) FROM metrics WHERE local_id IS NULL OR day IS NULL) AS metrics_null_upsert_keys,
    (SELECT count(*) FROM metrics WHERE views IS NULL OR clicks IS NULL OR visits IS NULL) AS metrics_null_counters,
    (SELECT count(*) FROM metrics WHERE coalesce(views,'') !~ '^[0-9]+$'
      OR coalesce(clicks,'') !~ '^[0-9]+$' OR coalesce(visits,'') !~ '^[0-9]+$') AS metrics_not_nonnegative_integer_text,
    (SELECT count(*) FROM duplicate_metrics) AS duplicate_metric_groups,
    (SELECT count(*) FROM repeated_requests) AS repeated_request_groups,
    (SELECT count(*) FROM repeated_places) AS repeated_place_groups,
    (SELECT count(*) FROM candidates) AS request_local_candidate_pairs
)
SELECT jsonb_build_object(
  'bloco',4,'inspection_role',current_user,'read_only',current_setting('transaction_read_only'),
  'limit_per_detail_section',200,'integrity',(SELECT to_jsonb(x) FROM integrity x),
  'status_counts',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM status_counts x),'[]'::jsonb),
  'ownerless_places',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT local_id,name,city,visible,created_at,'regularizacao_administrativa_pendente' AS diagnostic
    FROM places WHERE owner_id IS NULL ORDER BY local_id LIMIT 200) x),'[]'::jsonb),
  'request_local_candidates',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT * FROM candidates ORDER BY request_id,local_id LIMIT 200) x),'[]'::jsonb),
  'repeated_requests',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT * FROM repeated_requests ORDER BY total DESC,user_id,name_key LIMIT 200) x),'[]'::jsonb),
  'repeated_places',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT * FROM repeated_places ORDER BY total DESC,name_key,city_key LIMIT 200) x),'[]'::jsonb),
  'duplicate_metrics',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT * FROM duplicate_metrics ORDER BY total DESC,local_id,day LIMIT 200) x),'[]'::jsonb)
) AS validation_result;
ROLLBACK;
