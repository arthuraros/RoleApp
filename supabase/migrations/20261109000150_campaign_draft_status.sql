-- RASCUNHO BLOQUEADO: estados/default confirmados; nome/expressão de catálogo ainda exigem manifesto.
-- Não executar. Não altera preço/duração/valor, enums, dados ou índice de métricas.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Expansao de status depende da definicao exata revisada da constraint.';
END;
$guard$;
DO $reviewed_constraint_only$
DECLARE reviewed_name text := NULL; reviewed_definition text := NULL; found_definition text; status_att smallint;
  reviewed_original_default text := NULL;
  reviewed_date_defaults jsonb := NULL;
  reviewed_as_pure_status_allowlist boolean := false;
BEGIN
  IF reviewed_name IS NULL OR reviewed_definition IS NULL OR reviewed_original_default IS NULL OR
    reviewed_date_defaults IS NULL OR NOT reviewed_as_pure_status_allowlist THEN
    RAISE EXCEPTION 'Preencher nome e definicao exatos apos revisao do relatorio.'; END IF;
  SELECT attnum INTO STRICT status_att FROM pg_attribute
    WHERE attrelid='public.campanhas_impulsionamento'::regclass AND attname='status'
      AND NOT attisdropped AND attnotnull AND atttypid IN ('text'::regtype,'varchar'::regtype);
  IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d
    WHERE d.adrelid='public.campanhas_impulsionamento'::regclass AND d.adnum=status_att)
    IS DISTINCT FROM reviewed_original_default THEN
    RAISE EXCEPTION 'Default de status divergiu da revisao.'; END IF;
  SELECT pg_get_constraintdef(oid,true) INTO STRICT found_definition FROM pg_constraint
    WHERE conrelid='public.campanhas_impulsionamento'::regclass AND conname=reviewed_name
      AND contype='c' AND conkey=ARRAY[status_att];
  IF found_definition IS DISTINCT FROM reviewed_definition THEN
    RAISE EXCEPTION 'Constraint divergiu da revisao.'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.campanhas_impulsionamento'::regclass
    AND contype='c' AND status_att=ANY(conkey))<>1 THEN
    RAISE EXCEPTION 'Mais de uma regra de status: revisar todas, sem enfraquece-las.'; END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.campanhas_impulsionamento'::regclass
    AND attname IN ('data_inicio','data_fim') AND atttypid='timestamptz'::regtype AND attnotnull AND NOT attisdropped)<>2 OR
    (SELECT jsonb_object_agg(a.attname,pg_get_expr(d.adbin,d.adrelid)) FROM pg_attribute a
      JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.campanhas_impulsionamento'::regclass AND a.attname IN ('data_inicio','data_fim'))
      IS DISTINCT FROM reviewed_date_defaults THEN
    RAISE EXCEPTION 'Tipos/defaults/nullability das datas divergem da coleta.'; END IF;
  -- Somente a lista de estados revisada é expandida; quaisquer outros CHECKs ficam intactos.
  EXECUTE format('ALTER TABLE public.campanhas_impulsionamento DROP CONSTRAINT %I',reviewed_name);
  EXECUTE format('ALTER TABLE public.campanhas_impulsionamento ADD CONSTRAINT %I CHECK
    (status IN (''ativa'',''pausada'',''finalizada'',''rascunho'')) NOT VALID',reviewed_name);
  EXECUTE format('ALTER TABLE public.campanhas_impulsionamento VALIDATE CONSTRAINT %I',reviewed_name);
  -- Altera somente o default futuro. Não atualiza campanhas existentes.
  ALTER TABLE public.campanhas_impulsionamento ALTER COLUMN status SET DEFAULT 'rascunho';
  -- Metadados somente: campanhas antigas conservam integralmente suas datas e status.
  ALTER TABLE public.campanhas_impulsionamento
    ALTER COLUMN data_inicio DROP NOT NULL, ALTER COLUMN data_inicio DROP DEFAULT,
    ALTER COLUMN data_fim DROP NOT NULL, ALTER COLUMN data_fim DROP DEFAULT;
  ALTER TABLE public.campanhas_impulsionamento ADD CONSTRAINT roleapp_campaign_dates_by_status
    CHECK ((status='rascunho' AND data_inicio IS NULL AND data_fim IS NULL) OR
      (status IN ('ativa','pausada','finalizada') AND data_inicio IS NOT NULL AND data_fim IS NOT NULL)) NOT VALID;
  ALTER TABLE public.campanhas_impulsionamento VALIDATE CONSTRAINT roleapp_campaign_dates_by_status;
  -- Sem regra retroativa de duração/ordem: datas antigas não são recalculadas.
END;
$reviewed_constraint_only$;
COMMIT;
