-- RA-09: PROPOSTA. Não executada. Requer autorização antes do INSERT.
-- Conferir com papel administrativo: a leitura anon não prova ausência sob RLS.
SELECT id_categoria, nome FROM public.categorias ORDER BY nome;
SELECT column_name, data_type, is_nullable, column_default, is_identity
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'categorias'
ORDER BY ordinal_position;

-- Após revisar o catálogo completo e os defaults, executar o bloco abaixo.
-- Não fixa IDs nem altera vínculos de estabelecimentos, schema ou políticas.
BEGIN;
LOCK TABLE public.categorias IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.categorias (nome)
SELECT desired.nome
FROM (VALUES ('Bares e pubs'), ('Oficinas culturais'), ('Aulas culturais')) AS desired(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categorias existing
  WHERE lower(btrim(regexp_replace(regexp_replace(normalize(existing.nome, NFD), U&'[\0300-\036f]', '', 'g'), '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(regexp_replace(normalize(desired.nome, NFD), U&'[\0300-\036f]', '', 'g'), '\s+', ' ', 'g')))
)
RETURNING id_categoria, nome;

-- Este arquivo encerra como ensaio, sem persistir nem deixar o lock aberto.
-- Para cadastrar, somente após autorização, substituir ROLLBACK por COMMIT.
ROLLBACK;
