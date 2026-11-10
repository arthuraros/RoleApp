# RolêApp — pacote único para revisão técnica final

**Data de referência: 09/11/2026 — America/Sao_Paulo.**
**Estado: BLOQUEADO. Apenas revisão estática externa. Nenhuma autorização de execução ou implantação.**

Este documento reúne o conteúdo integral dos quatro arquivos de migração atuais, a matriz SQL completa, dependências, ordem prevista, limites de validação e riscos. O procedimento de primeiro administrador está incluído como anexo operacional para revisar a dependência de bootstrap; não constitui uma quinta migração nem etapa automaticamente autorizada.

Foi criado somente este arquivo de documentação local. Os SQLs foram lidos como texto e copiados sem substituições, preenchimento de parâmetros, remoção de comentários ou alteração de travas. Nenhum SQL foi executado; não houve acesso ao Supabase, criação de ambiente remoto, commit ou push.

## 1. Escopo e integridade do pacote

Branch local de referência: feature/arquitetura-usuarios-admin. O conteúdo reflete a árvore de trabalho local, incluindo propostas ainda não commitadas; não representa uma versão implantada ou certificada. A lista abaixo identifica os arquivos originais e seus SHA-256 sobre os bytes originais. As cópias integrais estão neste documento, dispensando acesso aos links do projeto para ler os SQLs.

| Origem local | Bytes | Linhas | SHA-256 original |
| --- | ---: | ---: | --- |
| supabase/migrations/20261109000100_user_roles_foundation.sql | 1269 | 34 | 35a9a6b7314966e4675a72174323ceef961bc265c0b609516fb47084bfb160fb |
| supabase/migrations/20261109000150_campaign_draft_status.sql | 4094 | 58 | 6732a3fb2470d250b43ca50982df6e26614cc53df50520353a66cda47c5378be |
| supabase/migrations/20261109000175_public_places_view_guarded.sql | 7114 | 116 | b5af51ccfc205fe293714b397a92091903bd3819418a0d34a037a45b15e93b24 |
| supabase/migrations/20261109000200_partner_access_hardening.sql | 54189 | 805 | 2931d4b6b456e8bff7524be4e670f1baab4dc07433a5a9c1f2e4c40560bcf8e4 |
| supabase/tests/20261109_partner_access_authorization.sql | 25319 | 362 | 209e877588e8fb8e187858788d84231ceac2866b70e1ea128d04821a55f82ecf |
| supabase/operations/primeiro_admin_guarded.sql | 2167 | 36 | ac886f72bf4ec34c8387664a833142f0acd667772ab53e79524cb9f1879d2920 |

Conferência do pacote: conteúdo de cada bloco comparado integralmente à origem; hashes das origens conferidos antes/depois da geração; arquivos preexistentes de src, test, supabase, docs e manifests do pacote conferidos para detectar alterações. Esta verificação é de integridade documental, não de sintaxe PostgreSQL nem de autorização.

Os comentários e placeholders dos originais foram preservados literalmente, mesmo quando se referem a revisões anteriores ou dados já informados pelo responsável. Divergências entre comentário, proposta e catálogo devem ser apontadas na revisão, sem editar o conteúdo copiado para aparentar aprovação.

## 2. Base factual informada pelo responsável

- Projeto React Native + Expo + Supabase. Não houve nova coleta pelo Codex nesta tarefa.
- Quinze tabelas públicas analisadas; onze com RLS e quatro sem RLS: solicitacoes_parceria, eventos_locais, campanhas_impulsionamento e metricas_locais. anon/authenticated têm CRUD amplo nas quinze tabelas.
- Zero usuarios sem Auth e zero proprietários sem Auth. Três locais visíveis sem proprietário: IDs 2, 3 e 4; não atribuir donos nem alterar visibilidade automaticamente.
- Seis solicitações pendentes; pedidos 2/4 de Gustavo's Bar formam um grupo repetido. Local 6 já vinculado ao solicitante e invisível; locais 7/8 também associados a solicitantes. Treze pares candidatos não significam treze duplicações confirmadas.
- locais.preco é numeric(10,2), NOT NULL e > 0; preco_entrada aceita NULL ou valor >= 0; faixa_preco aceita $, $$, $$$.
- Solicitações usam pendente/em_analise/aprovado/rejeitado. usuarios.plano usa comum/pro e não concede papel de autorização.
- Campanhas usam ativa/pausada/finalizada, default ativa; duração 3/7/14 e valor > 0. data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(); data_fim TIMESTAMPTZ NOT NULL DEFAULT now()+intervalo de sete dias. Não foram encontrados triggers personalizados nas tabelas investigadas na última coleta.
- metricas_locais possui UNIQUE(id_local,data), a preservar.
- avaliacoes e avaliacoes_locais são independentes, ambas com RLS ativo e leitura pública. A primeira exige nota inteira 1–5, comentário não vazio e vínculo a usuarios. A segunda aceita smallint 0–5, comentário vazio/até 1.000 caracteres e vínculo a Auth.
- locais_com_avaliacoes pertence a postgres, sem security_invoker/filtro de visibilidade e com grants excessivos; depende de locais e exclusivamente avaliacoes. Nenhuma outra view dependente foi identificada no catálogo fornecido, sem excluir consumidores externos ou SQL dinâmico.
- O código atual não consulta essa view diretamente: lê locais e avaliacoes_locais. Não misturar as duas origens nem trocar automaticamente o histórico da view.

## 3. Ordem prevista — condicionada a revisão e autorização futura

A ordem abaixo é um plano de dependências, não um roteiro liberado para colar no SQL Editor. Os arquivos copiados abortam pelas travas. Não remover travas nem preencher manifestos por inferência nesta revisão.

| Ordem | Artefato/atividade | Pré-condição e efeito esperado |
| --- | --- | --- |
| 0 | Revisão estática externa deste pacote | Revisar SQL, assinaturas, grants/RLS, search_path, estados finais e dependências; registrar achados sem execução. |
| 1 | Autorização separada para testes em clone isolado | Ainda não concedida. Planejar ambiente, dados anonimizados, backup/restauração, ausência de e-mail/pagamento/webhook produtivo e evidência do catálogo. Não criar clone nesta tarefa. |
| 2 | 00100 | Criar user_roles ligado a Auth, SELECT próprio e sem escrita de cliente; não conceder admin/parceiro automaticamente. |
| 3 | 00150 | Expandir CHECK/default de status para rascunho, remover NOT NULL/defaults das duas datas e validar CHECK de datas por status; nenhum UPDATE do legado. |
| 4 | 00175 | Confirmar contrato/OID/origem/RLS e grants; restringir leitura das fontes e substituir a view preservando nove colunas e origem avaliacoes. |
| 5 | 00200 | Exige fundação, datas já adaptadas e view corrigida; revisar manifestos do estado após 00175; aplicar autorização, RPCs, auditoria e fechamento de caminhos antigos. |
| 6 | Configuração operacional no clone, separadamente autorizada | Testar bootstrap auditado de admin por UUID verificado; revisar ofertas comerciais e eventual flag de métricas. Não há seed automático produtivo. |
| 7 | Matriz SQL em clone autorizado | Requer migrações revisadas aplicadas no clone, marcador isolated, valores de fixtures confirmados e usuário postgres; usa escrita de fixtures e ROLLBACK. |
| 8 | Concorrência, testes HTTP/JWT e regressões Expo | Validar permissões efetivas, cache PostgREST, autenticação, mapa/filtros/favoritos, Storage/fotos e Cardápio; não substituídos pela matriz de uma conexão. |
| 9 | Nova decisão de implantação | Somente após evidências e autorização distinta. RPCs/backend compatíveis antes da distribuição do app. Nenhuma implantação está liberada. |

Entre 00175 e 00200, a restrição temporária de SELECT em locais limita também a leitura privada de parceiro/admin. O corte deve ser coordenado, sem servir esse estado intermediário ao app. Cada arquivo possui sua própria transação; isso NÃO implica atomicidade automática dos quatro arquivos como um conjunto. Um eventual artefato de aplicação coordenada e recuperação precisa de revisão separada.

O manifesto de políticas de locais em 00200 deve refletir o estado **após 00175**, e não simplesmente o hash da coleta anterior. A definição revisada da view em 00200 também é a definição corrigida após 00175. Derivar/conferir esses valores no clone autorizado antes de qualquer proposta de liberação.

## 4. Dependências e decisões técnicas

### 4.1 Catálogo e permissões

- PostgreSQL 15+ para a proposta de security_invoker; executor/dono postgres revisado. Verificar schemas expostos na API, USAGE/CREATE, heranças, BYPASSRLS, grants de tabela/coluna/sequência, default privileges, overloads, rules, triggers e outros definers.
- Preencher manifestos somente com definições/hashes revisados: nome e expressão do CHECK de status, defaults originais, contrato de colunas da view, dependências e políticas/triggers. As travas adicionais NULL/false continuam presentes mesmo além do RAISE inicial.
- Schema interno roleapp_security não pode ser exposto pela API nem permitir CREATE de clientes. Funções definer devem ter search_path fixo, objetos qualificados e EXECUTE mínimo; o JWT/metadata/cliente não fornece o papel confiável.
- Conferir tipos e colunas usados pelas RPCs e políticas. Manter índice único de métricas e constraints/FKs não relacionadas. Colisões de objetos exigem conciliação, sem sobrescrita por conveniência.
- Preservar auth.users -> ao_criar_usuario -> criar_perfil_usuario(); testar cadastro/perfil sem conceder INSERT amplo em usuarios.

### 4.2 View e leitura direta

- A view mantém id_local, nome, descricao, endereco, preco, latitude, longitude, media_avaliacao e quantidade_avaliacoes; LEFT JOIN/COALESCE/arredondamento permanecem sobre avaliacoes.
- security_invoker requer SELECT das colunas utilizadas nas fontes e RLS compatível. A proposta restringe avaliacoes a id_local/nota/id_avaliacao e locais visíveis, sem expor comentários/usuário por causa da agregação.
- A política ampla USING(true) em locais é limitada em 00175 e substituída em 00200 por leitura pública visível ou gestão de proprietário aprovado/admin. Testar tanto a view quanto a tabela direta em cada papel.
- CREATE OR REPLACE e conferência de contrato/OID evitam DROP/CASCADE, mas não provam compatibilidade de consumidores externos, dependências dinâmicas ou acesso anterior a comentários/INSERT RETURNING.
- Locais visíveis sem proprietário continuam públicos; nenhum dono é atribuído. Médias da view e da tela podem divergir por usarem tabelas independentes.

### 4.3 Aprovação, campanhas e métricas

- Solicitação nasce própria e pendente. Aprovação requer admin no banco, revisão vinculada ao decisor, justificativa, escolha explícita de vínculo/criação/bloqueio, confirmação de identidade/duplicidade e auditoria transacional. Não inferir vínculo por nome/e-mail.
- Locks, snapshot, idempotência e mapa de origem devem impedir duplicação de decisões; algoritmos conservadores podem bloquear um segundo local legítimo. Normalização textual não comprova identidade comercial.
- Rascunho exige duas datas NULL; outros estados exigem ambas não NULL. Campanhas antigas conservam todos os valores; não recalcular datas antigas que usavam o default fixo de sete dias.
- Ativação exige admin, parceiro aprovado/propriedade/visibilidade, linha bloqueada, auditoria e verificação final. Usa um instante do servidor e 24 horas multiplicadas por 3/7/14; confirmar semântica comercial. Retry auditado não reinicia vigência.
- Pausa/retomada/finalização/edição comercial não receberam endpoints; jobs que façam essas escritas precisam de compatibilização. Justificativa administrativa não é integração/verificação automática de pagamento.
- Catálogo de ofertas nasce vazio; preços não foram inferidos. Métricas dependem de flag privada inicialmente ausente; regra proposta é uma interação por Auth+local+tipo+dia UTC. Decidir fuso, retenção e proteção adicional contra abuso antes de ativar.
- Fechar EXECUTE de todos os overloads de incrementar_metrica e procurar caminhos alternativos. Não usar upsert direto/fallback inseguro no cliente.

### 4.4 Storage, Cardápio e objetos dependentes de locais

- categorias_cardapio/itens_cardapio estão fora do loop de substituição de políticas; hash antes/depois confere suas políticas e as de Storage. Não há alteração de políticas do schema storage.
- Permanecem propostas de revogação de privilégios administrativos de tabelas públicas e manipulação de sequências; isso exige teste das operações legítimas de Cardápio/IDs. Preservação de política não certifica sua segurança.
- Dependências de locais incluem favoritos, avaliações nas duas fontes, horários, eventos, campanhas, métricas, cardápio e categorias/filtros; confirmar FKs, views, funções, rules, triggers e consumidores externos.
- Consultas auxiliares já existentes: supabase/diagnostics/20261109_security_inventory_readonly.sql; supabase/diagnostics/partner_hardening_review/01_estrutura_constraints.sql até 04_legado_duplicacoes.sql; supabase/diagnostics/20261109_review_sources_campaign_lifecycle_readonly.sql. São dependências de evidência de catálogo, não foram executadas nesta tarefa e não substituem seus resultados reais. Seus conteúdos não fazem parte dos blocos de migração abaixo.

## 5. Matriz de revisão e limites dos testes

| Cenário | Resultado esperado / evidência ainda necessária |
| --- | --- |
| Anônimo | SÓ dados públicos; sem admin/solicitações/PII/escrita de métricas; view e locais diretos não revelam invisíveis. |
| Comum e solicitante pendente | Pedidos próprios pendentes; sem gestão/ativação, inclusive local legado já associado. |
| Parceiro aprovado | Gerencia apenas seus locais/horários/eventos; campanha rascunho por oferta do servidor; não ativa nem altera dono/totais. |
| Admin | Revisão/decisão/ativação conferidas no banco, sem escrita direta ampla nem apagar auditoria; aprovação própria preserva admin. |
| Duplicidade e retries | Uma decisão/vínculo/ativação, sem criação automática nem reinício de datas; revisão velha/diferente recusada. |
| Auditoria falha | Reverter status/papel/local/vínculo/datas; não deixar sucesso parcial. |
| Campanhas 3/7/14 | Rascunho com NULL/NULL; ativa com vigência exata; estados/datas inválidos recusados; legado intacto. |
| Duas avaliações | Fixture 5 em avaliacoes e 0 em avaliacoes_locais: view usa somente a primeira; comentário legado não é aberto por SELECT mínimo. |
| Legado | Snapshots de pedidos, locais/donos/visibilidade e campanhas preservados; índice de métricas e constraints não relacionadas mantidos. |
| Storage/Cardápio | Políticas idênticas e operações reais de foto/menu funcionais; nenhuma edição de terceiros permitida pela autorização real. |
| Concorrência e API | Duas conexões/JWTs reais, decisões concorrentes, revogação de papel/alteração de propriedade, RPCs e cache de schema. Ainda pendentes. |

A matriz SQL integral abaixo tem guard de ambiente, fixtures e ROLLBACK: **não é somente leitura** e não deve ser executada em produção. Exige postgres, roleapp.test_environment=isolated e parâmetros roleapp.test_local_price, roleapp.test_campaign_days e roleapp.test_campaign_value com valores válidos. O marcador não é criado automaticamente e, isoladamente, não comprova que uma conexão seja segura: verificar destino real antes de uma futura execução autorizada.

Resultados anteriores registrados na revisão local: 123 testes offline passaram; 47 arquivos JavaScript analisados; git diff --check passou. São resultados da etapa anterior, **não testes reexecutados para gerar este pacote**. Cliente simulado/rede bloqueada; não validam parser PostgreSQL, RLS, transações, cálculo de datas, concorrência, PostgREST ou UI/dispositivo. Checagens textuais anteriores de guard/signaturas também não equivalem a validação do servidor.

### Concorrência a preparar no clone, após autorização

1. Duas revisões da mesma solicitação, ligadas aos respectivos admins: A decide e mantém transação aberta; B deve aguardar; após commit A, B deve recusar snapshot desatualizado. Com rollback A, B só prossegue se a revisão continuar válida.
2. Mesma revisão/identidade/entrada em duas conexões: um resultado, um vínculo e uma auditoria, sem duplicação. Repetir com pedidos distintos do mesmo negócio e candidatos de terceiros.
3. Duas ativações da mesma campanha: uma transição; retry idêntico não reinicia datas; outra decisão é recusada. Testar disputa com revogação de papel e alteração de proprietário/visibilidade.
4. Duas interações de métricas iguais contam uma; eventos/usuários distintos contam separadamente; falha não consome recibo sem incremento. Usar timeouts finitos e inspecionar deadlocks/locks reais.

## 6. Riscos ainda pendentes e critérios para próxima decisão

- Sintaxe/PLpgSQL, constraints reais, privilégios efetivos e caminhos alternativos ainda não foram executados/testados em PostgreSQL isolado. Este pacote pode conter achados a corrigir; sua consolidação não certifica os SQLs.
- Manifestos/flags continuam deliberadamente incompletos. Derivar o estado intermediário correto, conciliar colisões e revisar defaults/grants/heranças antes de propor qualquer execução; não preencher apenas para passar nos checks.
- Redução de SELECT em avaliacoes e filtro de invisíveis podem afetar consumidores externos. Pausas/finalizações de campanhas por jobs antigos podem ser recusadas. Nenhum desses consumidores foi certificado.
- Corte parcial entre quatro transações pode deixar app incompatível; planejar rollback de etapas, janela de manutenção, backup/restauração e schema cache. Reverter somente o binário não restaura contratos antigos.
- Locks globais/por linha, snapshots e retries precisam de teste real de contenção/deadlock. A matriz de uma sessão não demonstra segurança concorrente.
- Storage/Cardápio preservados ainda exigem regressão e revisão de segurança; não presumir que políticas anteriores impedem todo acesso indevido.
- Primeiro admin exige UUID/evidência/ticket e operação separadamente aprovada; não promover por metadata/plano. Ofertas, deduplicação, retenção de recibos e semântica comercial de 24 horas dependem de decisão.
- Auth, recuperação, avatar, quatro abas, Meus Lugares, painel admin, mapa, filtros, favoritos e cardápio precisam de regressão no clone/dispositivo antes de distribuir o app.
- Preservar dados/auditoria. Não atribuir donos automaticamente a locais 2/3/4 nem excluir pedidos repetidos. Regularização exige decisão explícita futura.

A revisão externa deve produzir achados por arquivo/trecho, impacto e recomendação, distinguindo bloqueadores de execução de decisões de produto. SÓ depois dessa revisão o responsável poderá autorizar, separadamente, testes em clone isolado. **Não há liberação de implantação nem autorização de acesso remoto neste pacote.**

Recuperação a revisar: falha antes do commit exige rollback e conferência do estado; corte parcial exige plano coordenado. Após commit, suspender operações incompatíveis/distribuição, preservar auditoria e preferir correção testada. Não reabrir CRUD amplo, USING(true), definer sem controles, métricas antigas ou credencial service_role no app para contornar problemas.

## 7. Conteúdo integral das origens

Os blocos seguintes são transcrições integrais, sem correção editorial. São separados para impedir que a apresentação sugira um script único executável. Não concatenar nem executar os blocos deste documento.

### 7.1 Migração 00100 — fundação dos papéis

Origem: supabase/migrations/20261109000100_user_roles_foundation.sql

SHA-256: 35a9a6b7314966e4675a72174323ceef961bc265c0b609516fb47084bfb160fb

<!-- BEGIN_SOURCE: supabase/migrations/20261109000100_user_roles_foundation.sql -->
````sql
-- RASCUNHO BLOQUEADO. NÃO EXECUTAR.
-- Pré-requisitos: docs/arquitetura-usuarios-etapa1.md.
-- Remover esta trava SOMENTE após revisão do esquema e autorização de aplicação.
BEGIN;

DO $migration_guard$
BEGIN
  RAISE EXCEPTION 'Migração bloqueada: confirme o esquema e autorize a aplicação antes de remover esta trava.';
END;
$migration_guard$;

-- Sem IF NOT EXISTS: colisões devem interromper a aplicação para revisão.
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'usuario'
    CONSTRAINT user_roles_role_check CHECK (role IN ('usuario', 'parceiro', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

CREATE POLICY user_roles_select_own
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Sem INSERT/UPDATE/DELETE ou políticas de escrita para clientes.
-- Nenhum usuário é promovido ou criado por esta migração.
-- Provisionamento privilegiado/auditado será definido em etapa posterior.
COMMIT;
````
<!-- END_SOURCE: supabase/migrations/20261109000100_user_roles_foundation.sql -->

### 7.2 Migração 00150 — status e datas de campanhas

Origem: supabase/migrations/20261109000150_campaign_draft_status.sql

SHA-256: 6732a3fb2470d250b43ca50982df6e26614cc53df50520353a66cda47c5378be

<!-- BEGIN_SOURCE: supabase/migrations/20261109000150_campaign_draft_status.sql -->
````sql
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
````
<!-- END_SOURCE: supabase/migrations/20261109000150_campaign_draft_status.sql -->

### 7.3 Migração 00175 — view pública e leitura das fontes

Origem: supabase/migrations/20261109000175_public_places_view_guarded.sql

SHA-256: b5af51ccfc205fe293714b397a92091903bd3819418a0d34a037a45b15e93b24

<!-- BEGIN_SOURCE: supabase/migrations/20261109000175_public_places_view_guarded.sql -->
````sql
-- PROPOSTA BLOQUEADA. NÃO EXECUTAR. Ver docs/compatibilidade-view-campanhas-20261109.md.
-- Preserva a fonte avaliacoes existente; NÃO troca por avaliacoes_locais.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'View bloqueada: depende de aprovar origem, RLS, grants e dependencias reais.';
END;
$guard$;

DO $preflight$
DECLARE
  reviewed_original_definition text := NULL;
  reviewed_column_contract jsonb := NULL;
  reviewed_dependencies jsonb := NULL;
  base_acl_rls_and_privacy_reviewed boolean := false;
  actual_contract jsonb; actual_dependencies jsonb;
BEGIN
  IF current_setting('server_version_num')::integer<150000 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'Requer PostgreSQL 15+ e executor/dono revisados.'; END IF;
  IF reviewed_original_definition IS NULL OR reviewed_column_contract IS NULL OR reviewed_dependencies IS NULL OR
    NOT base_acl_rls_and_privacy_reviewed THEN
    RAISE EXCEPTION 'Manifesto de origem/colunas/dependencias e revisao de acesso pendentes.'; END IF;
  IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')) IS DISTINCT FROM 'v' OR
    pg_get_viewdef('public.locais_com_avaliacoes'::regclass,true) IS DISTINCT FROM reviewed_original_definition THEN
    RAISE EXCEPTION 'Definicao divergiu da revisao.'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN (to_regclass('public.locais'),to_regclass('public.avaliacoes'))
    AND (c.relkind NOT IN ('r','p') OR NOT c.relrowsecurity)) OR to_regclass('public.avaliacoes') IS NULL THEN
    RAISE EXCEPTION 'Revisar fonte avaliacoes e RLS das duas tabelas base.'; END IF;
  SELECT jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attcollation) ORDER BY attnum)
    INTO actual_contract FROM pg_attribute WHERE attrelid='public.locais_com_avaliacoes'::regclass
      AND attnum>0 AND NOT attisdropped;
  SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind) ORDER BY n.nspname,c.relname)
    INTO actual_dependencies FROM (SELECT DISTINCT d.refobjid FROM pg_rewrite r JOIN pg_depend d
      ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid AND d.refclassid='pg_class'::regclass
      WHERE r.ev_class='public.locais_com_avaliacoes'::regclass AND d.refobjid<>r.ev_class) x
    JOIN pg_class c ON c.oid=x.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace;
  IF actual_contract IS DISTINCT FROM reviewed_column_contract OR actual_dependencies IS DISTINCT FROM reviewed_dependencies OR
    actual_dependencies IS DISTINCT FROM jsonb_build_array(
      jsonb_build_array('public','avaliacoes','r'),jsonb_build_array('public','locais','r')) THEN
    RAISE EXCEPTION 'Colunas/dependencias reais exigem conciliacao; nao substituir fontes automaticamente.'; END IF;
  -- Guardar contrato/OID no contexto desta transação, sem modificar dados de negócio.
  PERFORM set_config('roleapp.review.view_oid','public.locais_com_avaliacoes'::regclass::oid::text,true);
  PERFORM set_config('roleapp.review.view_contract',actual_contract::text,true);
END;
$preflight$;

-- Fechar SELECT amplo nas fontes sem tocar nas políticas de escrita existentes.
-- A restrição de locais vale durante o corte; 00200 a substitui pela leitura
-- visível/proprietário aprovado/admin. Implantar em janela sem uso intermediário.
CREATE POLICY roleapp_view_visible_places ON public.locais AS RESTRICTIVE FOR SELECT
  TO anon,authenticated USING (visivel IS TRUE);
CREATE POLICY roleapp_view_visible_reviews ON public.avaliacoes AS RESTRICTIVE FOR SELECT
  TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.locais l WHERE l.id_local=avaliacoes.id_local AND l.visivel IS TRUE));
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT (id_local,nome,descricao,endereco,preco,latitude,longitude,visivel)
  ON TABLE public.locais TO anon,authenticated;
-- Avaliações legadas: somente os três campos usados pela agregação.
REVOKE SELECT ON TABLE public.avaliacoes FROM PUBLIC,anon,authenticated;
DO $review_column_acl$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
    WHERE attrelid='public.avaliacoes'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s) ON TABLE public.avaliacoes FROM PUBLIC,anon,authenticated',cols);
END;
$review_column_acl$;
GRANT SELECT (id_local,nota,id_avaliacao) ON TABLE public.avaliacoes TO anon,authenticated;

CREATE OR REPLACE VIEW public.locais_com_avaliacoes
WITH (security_invoker=true, security_barrier=true) AS
SELECT l.id_local,l.nome,l.descricao,l.endereco,l.preco,l.latitude,l.longitude,
  COALESCE(round(avg(a.nota),1),0::numeric) AS media_avaliacao,
  count(a.id_avaliacao) AS quantidade_avaliacoes
FROM public.locais l
LEFT JOIN public.avaliacoes a ON a.id_local=l.id_local
WHERE l.visivel IS TRUE
GROUP BY l.id_local,l.nome,l.descricao,l.endereco,l.preco,l.latitude,l.longitude;

REVOKE ALL ON TABLE public.locais_com_avaliacoes FROM PUBLIC,anon,authenticated;
DO $column_acl$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
    WHERE attrelid='public.locais_com_avaliacoes'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.locais_com_avaliacoes FROM PUBLIC,anon,authenticated',cols);
END;
$column_acl$;
GRANT SELECT ON TABLE public.locais_com_avaliacoes TO anon,authenticated;

DO $postflight$
DECLARE actual_contract jsonb; actor text;
BEGIN
  SELECT jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attcollation) ORDER BY attnum)
    INTO actual_contract FROM pg_attribute WHERE attrelid='public.locais_com_avaliacoes'::regclass
      AND attnum>0 AND NOT attisdropped;
  IF actual_contract IS DISTINCT FROM current_setting('roleapp.review.view_contract')::jsonb OR
    'public.locais_com_avaliacoes'::regclass::oid::text<>current_setting('roleapp.review.view_oid') THEN
    RAISE EXCEPTION 'Contrato/OID da view alterados.'; END IF;
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF NOT has_table_privilege(actor,'public.locais_com_avaliacoes','SELECT') OR
      has_table_privilege(actor,'public.locais_com_avaliacoes','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_any_column_privilege(actor,'public.locais_com_avaliacoes','INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'ACL efetiva/herdada da view ainda inadequada.'; END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.avaliacoes'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND
      has_column_privilege(actor,a.attrelid,a.attnum,'SELECT') IS DISTINCT FROM
        (a.attname IN ('id_local','nota','id_avaliacao'))) THEN
      RAISE EXCEPTION 'SELECT efetivo/herdado da origem avaliacoes inadequado.'; END IF;
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.locais'::regclass
      AND a.attname IN ('id_local','nome','descricao','endereco','preco','latitude','longitude','visivel')
      AND NOT has_column_privilege(actor,a.attrelid,a.attnum,'SELECT')) THEN
      RAISE EXCEPTION 'SELECT insuficiente na origem locais.'; END IF;
  END LOOP;
END;
$postflight$;
COMMIT;
````
<!-- END_SOURCE: supabase/migrations/20261109000175_public_places_view_guarded.sql -->

### 7.4 Migração 00200 — autorização, RPCs e auditoria

Origem: supabase/migrations/20261109000200_partner_access_hardening.sql

SHA-256: 2931d4b6b456e8bff7524be4e670f1baab4dc07433a5a9c1f2e4c40560bcf8e4

<!-- BEGIN_SOURCE: supabase/migrations/20261109000200_partner_access_hardening.sql -->
````sql
-- PROPOSTA BLOQUEADA. NÃO EXECUTAR. Ver docs/correcao-diagnostico-real-20261109.md.
-- Depende da fundação user_roles revisada/aplicada em etapa autorizada.
-- Tipos, constraints, triggers, helpers e grants herdados ainda exigem inventário.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Revisão obrigatória: migração de segurança ainda não autorizada.';
END;
$guard$;

-- A trava acima permanece mesmo com estes preflights. Não usar IF NOT EXISTS para
-- esconder colisões dos novos objetos. Asserções não substituem revisão dos relatórios.
DO $preflight$
DECLARE client_role text; target text; actual_hash text;
  -- Preencher SOMENTE após receber/revisar os relatórios exatos; nenhuma inferência.
  reviewed_policy_hashes jsonb := NULL;
  reviewed_trigger_hashes jsonb := NULL;
  reviewed_public_view_definition text := NULL;
  public_view_filter_reviewed boolean := false;
  internal_schema_not_exposed_reviewed boolean := false;
  alternate_write_paths_reviewed boolean := false;
  campaign_dates_and_triggers_reviewed boolean := false;
  legacy_reviews_access_reviewed boolean := false;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Revisar dono executor das funções SECURITY DEFINER (esperado postgres).';
  END IF;
  IF to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'Fundação user_roles ausente.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('decidir_parceria_segura','revisar_parceria_segura',
      'listar_solicitacoes_admin','solicitar_campanha_segura','listar_ofertas_campanha',
      'listar_destaques_publicos','registrar_interacao_segura','ativar_campanha_segura')) THEN
    RAISE EXCEPTION 'RPC proposta já existente: revisar assinaturas e caminhos alternativos antes do corte.';
  END IF;
  IF reviewed_policy_hashes IS NULL OR reviewed_trigger_hashes IS NULL OR reviewed_public_view_definition IS NULL OR
    NOT public_view_filter_reviewed OR NOT internal_schema_not_exposed_reviewed OR NOT alternate_write_paths_reviewed OR
    NOT campaign_dates_and_triggers_reviewed OR NOT legacy_reviews_access_reviewed THEN
    RAISE EXCEPTION 'Manifesto de políticas/triggers e definição segura da view ainda não revisados.';
  END IF;
  -- Rascunho não consome vigência. Não relaxar NOT NULL/CHECKs de datas às cegas.
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.campanhas_impulsionamento'::regclass
    AND attname IN ('data_inicio','data_fim') AND NOT attisdropped AND NOT attnotnull)<>2 THEN
    RAISE EXCEPTION 'Datas de rascunho exigem revisão separada de nullability/CHECKs/triggers.';
  END IF;
  IF to_regclass('public.locais_com_avaliacoes') IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')) <> 'v' OR
      pg_get_viewdef(to_regclass('public.locais_com_avaliacoes'),true) IS DISTINCT FROM reviewed_public_view_definition OR
      NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.locais_com_avaliacoes')
        AND 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'View legada requer correção separada/revisada antes deste corte. Não será alterada aqui.';
    END IF;
  END IF;
  FOREACH target IN ARRAY ARRAY['solicitacoes_parceria','eventos_locais','campanhas_impulsionamento',
    'metricas_locais','locais','horarios_funcionamento','usuarios','categorias_cardapio',
    'itens_cardapio','local_categorias','categorias','favoritos','avaliacoes_locais'] LOOP
    SELECT md5(coalesce(string_agg(p.polname || '|' || p.polcmd || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' ||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' ORDER BY p.polname),''))
      INTO actual_hash FROM pg_policy p WHERE p.polrelid=to_regclass('public.' || target);
    IF reviewed_policy_hashes->>target IS DISTINCT FROM actual_hash THEN
      RAISE EXCEPTION 'Políticas não revisadas ou alteradas em %.',target;
    END IF;
    SELECT md5(coalesce(string_agg(pg_get_triggerdef(g.oid,true) || '|' || g.tgenabled || '|' ||
      md5(pg_get_functiondef(g.tgfoid)),E'\n' ORDER BY g.tgname),'')) INTO actual_hash
      FROM pg_trigger g WHERE g.tgrelid=to_regclass('public.' || target) AND NOT g.tgisinternal;
    IF reviewed_trigger_hashes->>target IS DISTINCT FROM actual_hash THEN
      RAISE EXCEPTION 'Triggers não revisados ou alterados em %.',target;
    END IF;
  END LOOP;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role AND (rolsuper OR rolbypassrls)) OR
       has_table_privilege(client_role,'public.user_roles','DELETE,TRUNCATE') OR
       has_any_column_privilege(client_role,'public.user_roles','INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Papel % pode contornar autorização ou alterar user_roles.', client_role;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE
    attrelid IN ('public.solicitacoes_parceria'::regclass,'public.campanhas_impulsionamento'::regclass)
    AND attname = 'status' AND atttypid NOT IN ('text'::regtype,'varchar'::regtype)
    AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Adaptar casts de status ao tipo real antes da aplicação.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.metricas_locais'::regclass
    AND attname = 'data' AND atttypid = 'date'::regtype AND NOT attisdropped) OR
    NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.campanhas_impulsionamento'::regclass
      AND attname = 'interesses' AND atttypid = 'text[]'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Adaptar tipos data/interesses ao esquema real.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid IN ('public.usuarios'::regclass, 'public.locais'::regclass,
                         'public.solicitacoes_parceria'::regclass)
      AND a.attname IN ('id_usuario', 'id_proprietario') AND a.atttypid <> 'uuid'::regtype
      AND NOT a.attisdropped
  ) THEN RAISE EXCEPTION 'Revisar tipos dos vínculos com Auth.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.metricas_locais'::regclass
      AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indnkeyatts = 2
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= i.indnkeyatts) = ARRAY['data', 'id_local']::text[]
  ) THEN RAISE EXCEPTION 'Métricas exigem unicidade não parcial em id_local,data.'; END IF;
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO actual_hash
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' OR (n.nspname='public' AND c.relname IN ('categorias_cardapio','itens_cardapio'));
  PERFORM set_config('roleapp.review.preserved_policies',actual_hash,true);
END;
$preflight$;

CREATE SCHEMA roleapp_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA roleapp_security FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA roleapp_security TO anon, authenticated;

-- Predicados mínimos. Nunca usam metadados, e-mail, parâmetros de ator ou papel JWT.
CREATE FUNCTION roleapp_security.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'admin');
$fn$;

CREATE FUNCTION roleapp_security.partner_owns(p_local text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.locais l JOIN public.user_roles r
    ON r.user_id = l.id_proprietario
    WHERE l.id_local::text = p_local AND l.id_proprietario = (SELECT auth.uid())
      AND r.role = 'parceiro');
$fn$;

CREATE FUNCTION roleapp_security.local_public(p_local text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.locais WHERE id_local::text = p_local AND visivel IS TRUE);
$fn$;

REVOKE ALL ON FUNCTION roleapp_security.is_admin(),
  roleapp_security.partner_owns(text), roleapp_security.local_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION roleapp_security.is_admin(),
  roleapp_security.partner_owns(text), roleapp_security.local_public(text) TO anon, authenticated;

CREATE TABLE roleapp_security.metric_receipts (
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id text NOT NULL, event text NOT NULL CHECK (event IN ('view','clique','visita')),
  day date NOT NULL, PRIMARY KEY (actor, local_id, event, day)
);
ALTER TABLE roleapp_security.metric_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE roleapp_security.metric_receipts FROM PUBLIC, anon, authenticated;

-- IDs de alvo são snapshots textuais: preservam tipos/IDs legados e histórico mesmo
-- após exclusão de contas; sem FK destrutiva. RPC verifica e bloqueia alvos reais.
CREATE TABLE public.roleapp_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at timestamptz NOT NULL DEFAULT now(),
  actor uuid, origin text NOT NULL DEFAULT 'app', action text NOT NULL, request_id text, local_id text,
  subject uuid, reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT roleapp_audit_origin CHECK ((origin='app' AND actor IS NOT NULL) OR
    (origin='maintenance' AND actor IS NULL AND action='bootstrap_admin'))
);
CREATE UNIQUE INDEX roleapp_one_decision_per_request
  ON public.roleapp_admin_audit(request_id) WHERE action IN ('aprovado','rejeitado');
CREATE UNIQUE INDEX roleapp_one_campaign_activation
  ON public.roleapp_admin_audit((details->>'id_campanha')) WHERE action='campanha_ativada';
ALTER TABLE public.roleapp_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roleapp_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.roleapp_admin_audit TO authenticated;
CREATE POLICY roleapp_audit_admin_read ON public.roleapp_admin_audit FOR SELECT TO authenticated
  USING ((SELECT roleapp_security.is_admin()));

-- Controles internos não são expostos como endpoints. A substituição coordenada de
-- políticas ocorre ao final, somente com snapshots previamente revisados.
CREATE TABLE roleapp_security.partnership_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid NOT NULL,
  request_id text NOT NULL, snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  consumed_at timestamptz, decision_input jsonb, outcome jsonb
);
CREATE TABLE roleapp_security.request_local_links (
  request_id text PRIMARY KEY, local_id text NOT NULL UNIQUE, business_key text NOT NULL UNIQUE,
  review_id uuid NOT NULL UNIQUE REFERENCES roleapp_security.partnership_reviews(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roleapp_security.campaign_offers (
  tipo text NOT NULL CHECK (tipo IN ('destaque','visibilidade')),
  duracao_dias integer NOT NULL CHECK (duracao_dias IN (3,7,14)),
  valor_total numeric NOT NULL CHECK (valor_total>0), active boolean NOT NULL DEFAULT false,
  approved_by text NOT NULL, reason text NOT NULL,
  PRIMARY KEY(tipo,duracao_dias)
);
CREATE TABLE roleapp_security.feature_flags (
  name text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
  approved_by text NOT NULL, reason text NOT NULL
);
-- Sem seed comercial, habilitação de métrica, backfill de proprietário ou admin.
ALTER TABLE roleapp_security.partnership_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.request_local_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.campaign_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA roleapp_security FROM PUBLIC,anon,authenticated;

CREATE FUNCTION roleapp_security.norm(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
  SELECT lower(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.norm(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION roleapp_security.partnership_state(p_request text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  WITH req AS (SELECT * FROM public.solicitacoes_parceria WHERE id_solicitacao::text=p_request)
  SELECT jsonb_build_object('solicitacao',jsonb_build_object('id_solicitacao',r.id_solicitacao,
      'id_usuario',r.id_usuario,'estabelecimento',r.estabelecimento,'cidade_estado',r.cidade_estado,'status',r.status),
    'candidatos',coalesce((SELECT jsonb_agg(jsonb_build_object('id_local',l.id_local,
      'nome',l.nome,'cidade_uf',l.cidade_uf,'id_proprietario',l.id_proprietario,'visivel',l.visivel)
      ORDER BY l.id_local::text) FROM public.locais l WHERE l.id_proprietario=r.id_usuario OR
        (roleapp_security.norm(l.nome)=roleapp_security.norm(r.estabelecimento) AND
         (roleapp_security.norm(l.cidade_uf)=roleapp_security.norm(r.cidade_estado) OR
          roleapp_security.norm(l.cidade_uf)='' OR roleapp_security.norm(r.cidade_estado)=''))),'[]'::jsonb),
    'solicitacoes_relacionadas',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id_solicitacao',s.id_solicitacao,'status',s.status) ORDER BY s.id_solicitacao::text)
      FROM public.solicitacoes_parceria s WHERE s.id_solicitacao<>r.id_solicitacao
        AND s.id_usuario=r.id_usuario AND roleapp_security.norm(s.estabelecimento)=roleapp_security.norm(r.estabelecimento)
        AND roleapp_security.norm(s.cidade_estado)=roleapp_security.norm(r.cidade_estado)),'[]'::jsonb)) FROM req r;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.partnership_state(text) FROM PUBLIC,anon,authenticated;

-- Uma ordem global simples para decisões e mudanças que afetam candidatos/identidade.
-- Não usa GUC do cliente como autorização. Reavaliar escalabilidade depois do clone.
CREATE FUNCTION roleapp_security.serialize_partnership_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(7331,20261109);
  RETURN NULL; -- trigger de statement: retorno ignorado
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.serialize_partnership_changes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_serialize_local BEFORE INSERT OR UPDATE OR DELETE ON public.locais
  FOR EACH STATEMENT EXECUTE FUNCTION roleapp_security.serialize_partnership_changes();
CREATE TRIGGER roleapp_serialize_request BEFORE INSERT OR UPDATE OR DELETE ON public.solicitacoes_parceria
  FOR EACH STATEMENT EXECUTE FUNCTION roleapp_security.serialize_partnership_changes();

CREATE FUNCTION roleapp_security.protect_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT roleapp_security.is_admin() THEN
      RAISE EXCEPTION 'Novo local exige decisao administrativa.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id_local IS DISTINCT FROM OLD.id_local THEN
      RAISE EXCEPTION 'Identificador imutavel.' USING ERRCODE='42501';
    END IF;
    IF NEW.id_proprietario IS DISTINCT FROM OLD.id_proprietario THEN
      IF NOT roleapp_security.is_admin() THEN
        RAISE EXCEPTION 'Proprietario imutavel para parceiro.' USING ERRCODE='42501';
      END IF;
      INSERT INTO public.roleapp_admin_audit(actor,action,local_id,subject,reason,details)
        VALUES(auth.uid(),'proprietario_alterado',NEW.id_local::text,NEW.id_proprietario,
          'Vinculo administrativo explicito',jsonb_build_object('anterior',OLD.id_proprietario,'novo',NEW.id_proprietario));
    ELSIF NOT roleapp_security.is_admin() AND NOT roleapp_security.partner_owns(NEW.id_local::text) THEN
      RAISE EXCEPTION 'Parceria aprovada e propriedade requeridas.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_owner AFTER INSERT OR UPDATE ON public.locais
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_owner();

CREATE FUNCTION roleapp_security.protect_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.id_usuario IS DISTINCT FROM auth.uid() OR NEW.status IS DISTINCT FROM 'pendente' OR
      length(btrim(coalesce(NEW.estabelecimento,''))) NOT BETWEEN 1 AND 200 OR
      length(btrim(coalesce(NEW.cidade_estado,''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Solicitacao propria e pendente requerida.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id_solicitacao IS DISTINCT FROM OLD.id_solicitacao OR NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR
      NEW.estabelecimento IS DISTINCT FROM OLD.estabelecimento OR NEW.cidade_estado IS DISTINCT FROM OLD.cidade_estado THEN
      RAISE EXCEPTION 'Identidade da solicitacao imutavel.' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND
      (NOT roleapp_security.is_admin() OR OLD.status NOT IN ('pendente','em_analise') OR
       NEW.status NOT IN ('em_analise','aprovado','rejeitado')) THEN
      RAISE EXCEPTION 'Transicao nao autorizada.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_request AFTER INSERT OR UPDATE ON public.solicitacoes_parceria
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_request();

CREATE FUNCTION public.listar_solicitacoes_admin() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NOT roleapp_security.is_admin() THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id_solicitacao',id_solicitacao,'nome',nome,
    'email',email,'estabelecimento',estabelecimento,'cidade_estado',cidade_estado,'status',status)
    ORDER BY created_at,id_solicitacao),'[]'::jsonb) FROM public.solicitacoes_parceria);
END;
$fn$;

CREATE FUNCTION public.revisar_parceria_segura(p_id_solicitacao text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE state jsonb; review_id uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Revisao requer READ COMMITTED para snapshot apos lock.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  state:=roleapp_security.partnership_state(p_id_solicitacao);
  IF state IS NULL OR state#>>'{solicitacao,status}' NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Solicitacao indisponivel para revisao.' USING ERRCODE='22023';
  END IF;
  INSERT INTO roleapp_security.partnership_reviews(actor,request_id,snapshot)
    VALUES(auth.uid(),p_id_solicitacao,state) RETURNING id INTO STRICT review_id;
  RETURN jsonb_build_object('revisao_id',review_id,'estado',state);
END;
$fn$;

CREATE FUNCTION public.decidir_parceria_segura(p_revisao uuid,p_decisao text,p_acao text,
  p_motivo text,p_id_local_existente text,p_identidade_validada boolean,
  p_duplicidade_revisada boolean,p_novo_local jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE review roleapp_security.partnership_reviews%ROWTYPE;
  req public.solicitacoes_parceria%ROWTYPE; loc public.locais%ROWTYPE; supplied public.locais%ROWTYPE;
  state jsonb; input jsonb; result jsonb; old_role text; final_role text; v_business_key text; linked_before jsonb;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Decisao requer READ COMMITTED para snapshot apos lock.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  IF p_decisao IS NULL OR p_decisao NOT IN ('aprovado','rejeitado','em_analise') OR
    p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 1 AND 2000 OR p_acao IS NULL THEN
    RAISE EXCEPTION 'Decisao invalida.' USING ERRCODE='22023'; END IF;
  input:=jsonb_build_object('decisao',p_decisao,'acao',p_acao,'motivo',btrim(p_motivo),
    'local',p_id_local_existente,'identidade',p_identidade_validada,
    'duplicidade',p_duplicidade_revisada,'novo',p_novo_local);
  SELECT * INTO STRICT review FROM roleapp_security.partnership_reviews WHERE id=p_revisao AND actor=auth.uid() FOR UPDATE;
  IF review.consumed_at IS NOT NULL THEN
    IF review.decision_input IS DISTINCT FROM input THEN
      RAISE EXCEPTION 'Revisao consumida por outra decisao.' USING ERRCODE='22023'; END IF;
    RETURN review.outcome;
  END IF;
  IF review.expires_at<now() THEN RAISE EXCEPTION 'Revisao expirada.' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT req FROM public.solicitacoes_parceria WHERE id_solicitacao::text=review.request_id FOR UPDATE;
  state:=roleapp_security.partnership_state(review.request_id);
  IF state IS DISTINCT FROM review.snapshot OR req.status NOT IN ('pendente','em_analise') THEN
    RAISE EXCEPTION 'Dados mudaram. Reabra a revisao.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM auth.users WHERE id=req.id_usuario FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitante sem Auth.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=req.id_usuario FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil complementar ausente.' USING ERRCODE='22023'; END IF;
  IF p_decisao='aprovado' THEN
    IF p_identidade_validada IS DISTINCT FROM true OR p_duplicidade_revisada IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Validacao explicita requerida.' USING ERRCODE='22023'; END IF;
    v_business_key:=jsonb_build_array(req.id_usuario,roleapp_security.norm(req.estabelecimento),
      roleapp_security.norm(req.cidade_estado))::text;
    IF EXISTS(SELECT 1 FROM roleapp_security.request_local_links
      WHERE request_id=review.request_id OR request_local_links.business_key=v_business_key) THEN
      RAISE EXCEPTION 'Origem comercial ja aprovada. Revisao manual requerida.' USING ERRCODE='22023'; END IF;
    SELECT role INTO old_role FROM public.user_roles WHERE user_id=req.id_usuario FOR UPDATE;
    INSERT INTO public.user_roles(user_id,role) VALUES(req.id_usuario,'parceiro')
      ON CONFLICT(user_id) DO UPDATE SET role=CASE WHEN public.user_roles.role='admin' THEN 'admin' ELSE 'parceiro' END;
    IF p_acao='criar_novo' AND p_id_local_existente IS NULL AND p_novo_local IS NOT NULL THEN
      IF jsonb_array_length(state->'candidatos')>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(state->'solicitacoes_relacionadas') s
        WHERE s->>'status' IN ('pendente','em_analise','aprovado')) THEN
        RAISE EXCEPTION 'Vinculo possivel: criacao bloqueada.' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_novo_local) k WHERE k NOT IN ('endereco','preco','preco_entrada')) THEN
        RAISE EXCEPTION 'Campos do novo local invalidos.' USING ERRCODE='22023'; END IF;
      SELECT * INTO supplied FROM jsonb_populate_record(NULL::public.locais,p_novo_local);
      IF length(btrim(coalesce(supplied.endereco,'')))=0 OR supplied.preco IS NULL OR supplied.preco<=0 OR
        supplied.preco_entrada IS NULL OR supplied.preco_entrada<0 THEN
        RAISE EXCEPTION 'Dados confirmados de endereco e preco requeridos.' USING ERRCODE='22023'; END IF;
      INSERT INTO public.locais(nome,cidade_uf,endereco,preco,preco_entrada,faixa_preco,id_proprietario,visivel)
        VALUES(req.estabelecimento,req.cidade_estado,supplied.endereco,supplied.preco,supplied.preco_entrada,'$',req.id_usuario,false)
        RETURNING * INTO STRICT loc;
    ELSIF p_acao='vincular_existente' AND p_id_local_existente IS NOT NULL AND p_novo_local IS NULL THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'candidatos') l WHERE l->>'id_local'=p_id_local_existente) THEN
        RAISE EXCEPTION 'Local fora da revisao.' USING ERRCODE='22023'; END IF;
      SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text=p_id_local_existente FOR UPDATE;
      IF loc.id_proprietario IS NOT NULL AND loc.id_proprietario<>req.id_usuario THEN
        RAISE EXCEPTION 'Local pertence a terceiro.' USING ERRCODE='42501'; END IF;
      linked_before:=to_jsonb(loc);
      UPDATE public.locais SET id_proprietario=req.id_usuario WHERE id_local=loc.id_local RETURNING * INTO STRICT loc;
    ELSE RAISE EXCEPTION 'Escolha criar/vincular explicitamente.' USING ERRCODE='22023'; END IF;
    SELECT role INTO STRICT final_role FROM public.user_roles WHERE user_id=req.id_usuario;
    IF final_role IS DISTINCT FROM CASE WHEN old_role='admin' THEN 'admin' ELSE 'parceiro' END THEN
      RAISE EXCEPTION 'Papel final incoerente.'; END IF;
    PERFORM 1 FROM public.locais WHERE id_local=loc.id_local AND id_proprietario=req.id_usuario
      AND (p_acao<>'criar_novo' OR visivel IS FALSE);
    IF NOT FOUND THEN RAISE EXCEPTION 'Vinculo final incoerente.'; END IF;
    INSERT INTO roleapp_security.request_local_links(request_id,local_id,business_key,review_id)
      VALUES(review.request_id,loc.id_local::text,v_business_key,p_revisao);
  ELSIF p_id_local_existente IS NOT NULL OR p_novo_local IS NOT NULL OR
    p_acao IS DISTINCT FROM CASE WHEN p_decisao='em_analise' THEN 'bloquear' ELSE 'nenhuma' END THEN
    RAISE EXCEPTION 'Decisao sem aprovacao nao vincula local.' USING ERRCODE='22023';
  END IF;
  UPDATE public.solicitacoes_parceria SET status=p_decisao WHERE id_solicitacao=req.id_solicitacao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atualizacao suprimida.'; END IF;
  PERFORM 1 FROM public.solicitacoes_parceria WHERE id_solicitacao=req.id_solicitacao
    AND status=p_decisao AND id_usuario=req.id_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estado final incoerente.'; END IF;
  INSERT INTO public.roleapp_admin_audit(actor,action,request_id,local_id,subject,reason,details)
    VALUES(auth.uid(),p_decisao,review.request_id,loc.id_local::text,req.id_usuario,btrim(p_motivo),
      jsonb_build_object('revisao',p_revisao,'acao',p_acao,'status_anterior',req.status,
        'papel_anterior',old_role,'identidade_validada',p_identidade_validada,'duplicidade_revisada',p_duplicidade_revisada));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida.'; END IF;
  PERFORM 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid() AND action=p_decisao
    AND request_id=review.request_id AND details->>'revisao'=p_revisao::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria final incoerente.'; END IF;
  result:=jsonb_build_object('id_solicitacao',req.id_solicitacao,'status',p_decisao,'id_local',loc.id_local);
  UPDATE roleapp_security.partnership_reviews SET consumed_at=now(),decision_input=input,outcome=result WHERE id=p_revisao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de idempotencia suprimido.'; END IF;
  PERFORM 1 FROM roleapp_security.partnership_reviews WHERE id=p_revisao AND consumed_at IS NOT NULL
    AND decision_input=input AND outcome=result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resultado de idempotencia incoerente.'; END IF;
  PERFORM 1 FROM public.solicitacoes_parceria WHERE id_solicitacao=req.id_solicitacao
    AND id_usuario=req.id_usuario AND status=p_decisao;
  IF NOT FOUND OR NOT roleapp_security.is_admin() THEN RAISE EXCEPTION 'Estado administrativo final incoerente.'; END IF;
  IF p_decisao='aprovado' THEN
    SELECT * INTO STRICT loc FROM public.locais WHERE id_local=loc.id_local;
    SELECT role INTO STRICT final_role FROM public.user_roles WHERE user_id=req.id_usuario;
    IF loc.id_proprietario IS DISTINCT FROM req.id_usuario OR
      final_role IS DISTINCT FROM CASE WHEN old_role='admin' THEN 'admin' ELSE 'parceiro' END THEN
      RAISE EXCEPTION 'Vinculo ou papel final alterado por trigger.'; END IF;
    IF p_acao='criar_novo' AND (loc.visivel IS DISTINCT FROM false OR loc.nome IS DISTINCT FROM req.estabelecimento
      OR loc.cidade_uf IS DISTINCT FROM req.cidade_estado OR loc.preco IS DISTINCT FROM supplied.preco
      OR loc.preco_entrada IS DISTINCT FROM supplied.preco_entrada) THEN
      RAISE EXCEPTION 'Dados confirmados do novo local divergiram.'; END IF;
    IF linked_before IS NOT NULL AND
      (to_jsonb(loc)-'id_proprietario'-'updated_at') IS DISTINCT FROM (linked_before-'id_proprietario'-'updated_at') THEN
      RAISE EXCEPTION 'Vinculo alterou dados legados alem do proprietario.'; END IF;
    PERFORM 1 FROM roleapp_security.request_local_links WHERE request_id=review.request_id
      AND local_id=loc.id_local::text AND business_key=v_business_key AND review_id=p_revisao;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapa de origem final incoerente.'; END IF;
  END IF;
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.solicitar_campanha_segura(p_id_local text, p_tipo text,
  p_titulo text, p_mensagem text, p_interesses text[], p_faixa_etaria text,
  p_raio_km integer, p_duracao_dias integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE loc public.locais%ROWTYPE; campaign public.campanhas_impulsionamento%ROWTYPE;
  offer roleapp_security.campaign_offers%ROWTYPE;
BEGIN
  -- Só parceiro aprovado e proprietário; admin não se passa por proprietário.
  PERFORM 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'parceiro' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceria aprovada requerida.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text = p_id_local FOR SHARE;
  IF loc.id_proprietario IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Local de terceiro.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('destaque','visibilidade') OR
    p_duracao_dias IS NULL OR p_duracao_dias NOT IN (3,7,14) OR
    p_raio_km IS DISTINCT FROM 5 OR p_faixa_etaria IS NULL OR
    p_faixa_etaria NOT IN ('Todos','18–24','25–34','35+') OR
    coalesce(cardinality(p_interesses),0) > 20 OR
    length(coalesce(p_titulo,'')) > 200 OR length(coalesce(p_mensagem,'')) > 2000 OR
    (p_tipo = 'destaque' AND length(btrim(coalesce(p_titulo,''))) = 0) THEN
    RAISE EXCEPTION 'Campanha inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT offer FROM roleapp_security.campaign_offers
    WHERE tipo=p_tipo AND duracao_dias=p_duracao_dias AND active IS TRUE FOR SHARE;
  INSERT INTO public.campanhas_impulsionamento(id_local,id_usuario,tipo,titulo,mensagem,interesses,
    faixa_etaria,raio_km,duracao_dias,valor_total,status,alcance,data_inicio,data_fim)
  VALUES (loc.id_local,auth.uid(),p_tipo,CASE WHEN p_tipo='destaque' THEN p_titulo END,
    CASE WHEN p_tipo='destaque' THEN p_mensagem END,coalesce(p_interesses,ARRAY[]::text[]),
    p_faixa_etaria,5,p_duracao_dias,offer.valor_total,'rascunho',0,
    NULL,NULL) RETURNING * INTO STRICT campaign;
  -- Valor é orçamento do servidor, não pagamento. Nenhuma ativação é feita aqui.
  PERFORM 1 FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha
    AND status='rascunho' AND id_local=loc.id_local AND id_usuario=auth.uid()
    AND valor_total=offer.valor_total AND duracao_dias=offer.duracao_dias
    AND data_inicio IS NULL AND data_fim IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha final incoerente.'; END IF;
  SELECT * INTO STRICT campaign FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha;
  RETURN jsonb_build_object('id_campanha',campaign.id_campanha,'id_local',campaign.id_local,
    'tipo',campaign.tipo,'titulo',campaign.titulo,'mensagem',campaign.mensagem,
    'status',campaign.status,'duracao_dias',campaign.duracao_dias,'valor_total',campaign.valor_total,
    'data_inicio',campaign.data_inicio,'data_fim',campaign.data_fim);
END;
$fn$;

-- Sem endpoint para escolher status/datas arbitrários. Somente ativação administrativa.
CREATE FUNCTION public.ativar_campanha_segura(p_id_campanha text,p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE campaign public.campanhas_impulsionamento%ROWTYPE; started timestamptz; ends timestamptz; result jsonb;
BEGIN
  PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin requerido.' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Justificativa requerida.' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT campaign FROM public.campanhas_impulsionamento WHERE id_campanha::text=p_id_campanha FOR UPDATE;
  -- Retry somente da própria ativação já auditada, nunca adoção de campanha legada ativa.
  IF campaign.status='ativa' AND EXISTS(SELECT 1 FROM public.roleapp_admin_audit
    WHERE actor=auth.uid() AND action='campanha_ativada' AND reason=btrim(p_motivo)
      AND details->>'id_campanha'=p_id_campanha
      AND (details->>'inicio')::timestamptz=campaign.data_inicio
      AND (details->>'fim')::timestamptz=campaign.data_fim) THEN
    RETURN jsonb_build_object('id_campanha',campaign.id_campanha,'status',campaign.status,
      'data_inicio',campaign.data_inicio,'data_fim',campaign.data_fim);
  END IF;
  IF campaign.status<>'rascunho' OR campaign.data_inicio IS NOT NULL OR campaign.data_fim IS NOT NULL OR
    campaign.duracao_dias NOT IN (3,7,14) THEN
    RAISE EXCEPTION 'Transicao invalida.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=campaign.id_usuario AND role='parceiro' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro aprovado requerido.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.locais WHERE id_local=campaign.id_local AND id_proprietario=campaign.id_usuario
    AND visivel IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Propriedade e visibilidade requeridas.' USING ERRCODE='42501'; END IF;
  started:=clock_timestamp(); ends:=started+interval '24 hours'*campaign.duracao_dias;
  INSERT INTO public.roleapp_admin_audit(actor,action,local_id,subject,reason,details)
    VALUES(auth.uid(),'campanha_ativada',campaign.id_local::text,campaign.id_usuario,btrim(p_motivo),
      jsonb_build_object('id_campanha',p_id_campanha,'inicio',started,'fim',ends,'duracao_dias',campaign.duracao_dias));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida.'; END IF;
  UPDATE public.campanhas_impulsionamento SET status='ativa',data_inicio=started,data_fim=ends
    WHERE id_campanha=campaign.id_campanha;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ativacao suprimida.'; END IF;
  PERFORM 1 FROM public.campanhas_impulsionamento WHERE id_campanha=campaign.id_campanha AND status='ativa'
    AND data_inicio=started AND data_fim=ends AND duracao_dias=campaign.duracao_dias
    AND id_usuario=campaign.id_usuario AND id_local=campaign.id_local AND valor_total=campaign.valor_total;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid()
    AND action='campanha_ativada' AND details->>'id_campanha'=p_id_campanha
    AND (details->>'inicio')::timestamptz=started AND (details->>'fim')::timestamptz=ends) THEN
    RAISE EXCEPTION 'Estado final de ativacao/auditoria incoerente.'; END IF;
  result:=jsonb_build_object('id_campanha',campaign.id_campanha,'status','ativa','data_inicio',started,'data_fim',ends);
  RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ativar_campanha_segura(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_campanha_segura(text,text) TO authenticated;

CREATE FUNCTION roleapp_security.protect_campaign_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'rascunho' OR NEW.data_inicio IS NOT NULL OR NEW.data_fim IS NOT NULL THEN
      RAISE EXCEPTION 'Nova campanha deve ser rascunho sem vigencia.' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.id_campanha IS DISTINCT FROM OLD.id_campanha OR NEW.id_local IS DISTINCT FROM OLD.id_local OR
      NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR NEW.duracao_dias IS DISTINCT FROM OLD.duracao_dias OR
      NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.tipo IS DISTINCT FROM OLD.tipo THEN
      RAISE EXCEPTION 'Identidade e condicoes comerciais imutaveis.' USING ERRCODE='42501'; END IF;
    IF ROW(NEW.status,NEW.data_inicio,NEW.data_fim) IS DISTINCT FROM ROW(OLD.status,OLD.data_inicio,OLD.data_fim) THEN
      IF NOT roleapp_security.is_admin() OR OLD.status IS DISTINCT FROM 'rascunho' OR NEW.status IS DISTINCT FROM 'ativa' OR
        NEW.data_inicio IS NULL OR NEW.data_fim IS NULL OR
        NEW.data_fim IS DISTINCT FROM NEW.data_inicio+interval '24 hours'*NEW.duracao_dias OR
        NOT EXISTS(SELECT 1 FROM public.roleapp_admin_audit WHERE actor=auth.uid() AND action='campanha_ativada'
          AND details->>'id_campanha'=NEW.id_campanha::text
          AND (details->>'inicio')::timestamptz=NEW.data_inicio AND (details->>'fim')::timestamptz=NEW.data_fim) THEN
        RAISE EXCEPTION 'Transicao ou vigencia nao autorizada.' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_campaign_lifecycle() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_campaign_lifecycle AFTER INSERT OR UPDATE ON public.campanhas_impulsionamento
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_campaign_lifecycle();

CREATE FUNCTION public.listar_ofertas_campanha() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('parceiro','admin')) THEN
    RAISE EXCEPTION 'Perfil autorizado requerido.' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'duracao_dias',duracao_dias,
    'valor_total',valor_total) ORDER BY tipo,duracao_dias),'[]'::jsonb)
    FROM roleapp_security.campaign_offers WHERE active IS TRUE);
END;
$fn$;

CREATE FUNCTION public.listar_destaques_publicos() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id_campanha',c.id_campanha,'id_local',c.id_local,'tipo',c.tipo,
    'titulo',c.titulo,'mensagem',c.mensagem,'status',c.status,
    'data_fim',c.data_fim,'created_at',c.created_at,
    'locais',jsonb_build_object('id_local',l.id_local,'nome',l.nome,'descricao',l.descricao,
      'endereco',l.endereco,'preco',l.preco,'preco_entrada',l.preco_entrada,
      'faixa_preco',l.faixa_preco,'visivel',l.visivel)
  ) ORDER BY c.created_at DESC),'[]'::jsonb)
  FROM public.campanhas_impulsionamento c JOIN public.locais l ON l.id_local = c.id_local
  JOIN public.user_roles r ON r.user_id = l.id_proprietario AND r.role IN ('parceiro','admin')
  WHERE c.id_usuario = l.id_proprietario AND c.tipo = 'destaque' AND c.status = 'ativa'
    AND l.visivel IS TRUE AND c.data_inicio <= now() AND c.data_fim > now();
$fn$;

CREATE FUNCTION public.registrar_interacao_segura(p_id_local text, p_evento text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE loc public.locais%ROWTYPE; actor_id uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date; inserted integer;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Login requerido.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM roleapp_security.feature_flags WHERE name='metrics_daily_dedup'
    AND enabled IS TRUE) THEN
    RAISE EXCEPTION 'Regra de deduplicacao aguarda decisao documentada.' USING ERRCODE='42501'; END IF;
  IF p_evento IS NULL OR p_evento NOT IN ('view','clique','visita') THEN
    RAISE EXCEPTION 'Interação inválida.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO STRICT loc FROM public.locais WHERE id_local::text = p_id_local AND visivel IS TRUE FOR SHARE;
  INSERT INTO roleapp_security.metric_receipts(actor,local_id,event,day)
    VALUES (actor_id,p_id_local,p_evento,today) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN jsonb_build_object('registrada',false); END IF;
  INSERT INTO public.metricas_locais(id_local,data,views,cliques,visitas)
    VALUES (loc.id_local,today,(p_evento='view')::integer,(p_evento='clique')::integer,(p_evento='visita')::integer)
    ON CONFLICT (id_local,data) DO UPDATE SET
      views = coalesce(public.metricas_locais.views,0) + EXCLUDED.views,
      cliques = coalesce(public.metricas_locais.cliques,0) + EXCLUDED.cliques,
      visitas = coalesce(public.metricas_locais.visitas,0) + EXCLUDED.visitas;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 OR NOT EXISTS (SELECT 1 FROM public.metricas_locais
    WHERE id_local=loc.id_local AND data=today AND views>=0 AND cliques>=0 AND visitas>=0) THEN
    RAISE EXCEPTION 'Contabilizacao final incoerente.';
  END IF;
  RETURN jsonb_build_object('registrada',true);
END;
$fn$;

-- Fechar EXECUTE padrão de PUBLIC antes de conceder operações específicas.
REVOKE ALL ON FUNCTION public.decidir_parceria_segura(uuid,text,text,text,text,boolean,boolean,jsonb),
  public.solicitar_campanha_segura(text,text,text,text,text[],text,integer,integer),
  public.listar_destaques_publicos(), public.registrar_interacao_segura(text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_solicitacoes_admin(),public.revisar_parceria_segura(text),
  public.listar_ofertas_campanha() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listar_solicitacoes_admin(),public.revisar_parceria_segura(text),
  public.listar_ofertas_campanha() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decidir_parceria_segura(uuid,text,text,text,text,boolean,boolean,jsonb),
  public.solicitar_campanha_segura(text,text,text,text,text[],text,integer,integer),
  public.registrar_interacao_segura(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_destaques_publicos() TO anon, authenticated;

CREATE FUNCTION roleapp_security.protect_review_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NEW.id_local IS DISTINCT FROM OLD.id_local OR NEW.id_usuario IS DISTINCT FROM OLD.id_usuario THEN
    RAISE EXCEPTION 'Identidade da avaliacao imutavel.' USING ERRCODE='42501'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION roleapp_security.protect_review_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER roleapp_protect_review_identity AFTER UPDATE ON public.avaliacoes_locais
  FOR EACH ROW EXECUTE FUNCTION roleapp_security.protect_review_identity();

-- Substituição coordenada: somente as tabelas explicitamente listadas e cujos
-- snapshots foram revisados no preflight. Não deixa permissivas antigas em OR.
DO $access_v2$
DECLARE target text; cols text; policy record; sequence_ref record; old_rpc record;
  read_rule text; write_rule text; delete_rule text; insert_cols text; update_cols text; public_read boolean;
BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
  FOR sequence_ref IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='S' AND n.nspname IN ('public','roleapp_security') LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
  END LOOP;
  -- Controles administrativos nunca pertencem aos clientes, mesmo nas demais tabelas.
  FOR sequence_ref IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname='public' LOOP
    EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE %s FROM PUBLIC,anon,authenticated',sequence_ref.name);
    SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=sequence_ref.name AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE REFERENCES (%s) ON TABLE %s FROM PUBLIC,anon,authenticated',cols,sequence_ref.name);
  END LOOP;
  -- Cardápio: políticas existentes preservadas; não participam de DROP/CREATE POLICY.
  FOREACH target IN ARRAY ARRAY['solicitacoes_parceria','eventos_locais','campanhas_impulsionamento',
    'metricas_locais','locais','horarios_funcionamento','usuarios',
    'local_categorias','categorias','favoritos','avaliacoes_locais'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',target);
    SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=to_regclass('public.' || target) AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',cols,target);
    FOR policy IN SELECT polname FROM pg_policy WHERE polrelid=to_regclass('public.' || target) LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',policy.polname,target);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
    public_read:=true; insert_cols:=NULL; update_cols:=NULL; write_rule:='false'; delete_rule:='false';
    read_rule:='roleapp_security.local_public(id_local::text) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
    CASE target
    WHEN 'locais' THEN
      read_rule:='visivel IS TRUE OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
      update_cols:='nome,descricao,telefone,faixa_preco,endereco,bairro,cidade_uf,visivel';
      write_rule:='id_proprietario=auth.uid() AND roleapp_security.partner_owns(id_local::text)';
    WHEN 'solicitacoes_parceria' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid() OR roleapp_security.is_admin()';
      insert_cols:='id_usuario,nome,email,estabelecimento,cidade_estado,status';
      write_rule:='id_usuario=auth.uid() AND status=''pendente''';
    WHEN 'eventos_locais' THEN
      read_rule:='(ativo IS TRUE AND roleapp_security.local_public(id_local::text)) OR roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
      insert_cols:='id_local,titulo,dias,hora,detalhes,ativo'; update_cols:='titulo,dias,hora,detalhes,ativo';
      write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'horarios_funcionamento' THEN
      insert_cols:='id_local,dia_semana,abre,fecha,fechado'; update_cols:='dia_semana,abre,fecha,fechado';
      write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'usuarios' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid() OR roleapp_security.is_admin()';
      update_cols:='nome,foto_url,preferencias'; write_rule:='id_usuario=auth.uid()';
    WHEN 'campanhas_impulsionamento' THEN
      public_read:=false; read_rule:='(id_usuario=auth.uid() AND roleapp_security.partner_owns(id_local::text)) OR roleapp_security.is_admin()';
    WHEN 'metricas_locais' THEN
      public_read:=false; read_rule:='roleapp_security.partner_owns(id_local::text) OR roleapp_security.is_admin()';
    WHEN 'local_categorias' THEN
      insert_cols:='id_local,id_categoria'; write_rule:='roleapp_security.partner_owns(id_local::text)'; delete_rule:=write_rule;
    WHEN 'categorias' THEN read_rule:='true';
    WHEN 'favoritos' THEN
      public_read:=false; read_rule:='id_usuario=auth.uid()';
      insert_cols:='id_usuario,id_local'; write_rule:='id_usuario=auth.uid() AND roleapp_security.local_public(id_local::text)';
      delete_rule:='id_usuario=auth.uid()';
    WHEN 'avaliacoes_locais' THEN
      read_rule:='(' || read_rule || ') OR id_usuario=auth.uid()';
      insert_cols:='id_local,id_usuario,nota,comentario,updated_at'; update_cols:=insert_cols;
      write_rule:='id_usuario=auth.uid() AND roleapp_security.local_public(id_local::text)';
      delete_rule:='id_usuario=auth.uid()';
    END CASE;
    EXECUTE format('GRANT SELECT ON public.%I TO %s',target,CASE WHEN public_read THEN 'anon,authenticated' ELSE 'authenticated' END);
    EXECUTE format('CREATE POLICY roleapp_read ON public.%I FOR SELECT TO anon,authenticated USING (%s)',target,read_rule);
    IF insert_cols IS NOT NULL THEN
      EXECUTE format('GRANT INSERT (%s) ON public.%I TO authenticated',insert_cols,target);
      EXECUTE format('CREATE POLICY roleapp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',target,write_rule);
    END IF;
    IF update_cols IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated',update_cols,target);
      EXECUTE format('CREATE POLICY roleapp_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',target,write_rule,write_rule);
    END IF;
    IF delete_rule<>'false' THEN
      EXECUTE format('GRANT DELETE ON public.%I TO authenticated',target);
      EXECUTE format('CREATE POLICY roleapp_delete ON public.%I FOR DELETE TO authenticated USING (%s)',target,delete_rule);
    END IF;
  END LOOP;
  -- Defaults podem referenciar sequência sem OWNED BY: seguir dependência, não só pg_get_serial_sequence.
  FOR sequence_ref IN
    SELECT DISTINCT s.oid::regclass AS name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    JOIN pg_depend dep ON (dep.classid='pg_attrdef'::regclass AND dep.objid=d.oid AND dep.refclassid='pg_class'::regclass) OR
      (dep.classid='pg_class'::regclass AND dep.refobjid=t.oid AND dep.refobjsubid=a.attnum AND dep.deptype IN ('a','i'))
    JOIN pg_class s ON s.oid=CASE WHEN dep.classid='pg_attrdef'::regclass THEN dep.refobjid ELSE dep.objid END AND s.relkind='S'
    WHERE n.nspname='public' AND t.relname IN ('solicitacoes_parceria','eventos_locais','horarios_funcionamento',
      'categorias_cardapio','itens_cardapio','local_categorias','favoritos','avaliacoes_locais') LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',sequence_ref.name);
  END LOOP;
  FOR old_rpc IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='incrementar_metrica' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',old_rpc.name);
    IF has_function_privilege('anon',old_rpc.name::text,'EXECUTE') OR has_function_privilege('authenticated',old_rpc.name::text,'EXECUTE') THEN
      RAISE EXCEPTION 'RPC antiga ainda executavel por heranca.'; END IF;
  END LOOP;
END;
$access_v2$;

-- TRUNCATE e propriedade ignoram RLS: recusar aplicação com caminhos herdados.
DO $postflight$
DECLARE client_role text; target regclass; item record; allowed boolean; preserved_hash text;
BEGIN
  SELECT md5(coalesce(string_agg(p::text,E'\n' ORDER BY p.oid),'')) INTO preserved_hash
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' OR (n.nspname='public' AND c.relname IN ('categorias_cardapio','itens_cardapio'));
  IF preserved_hash IS DISTINCT FROM current_setting('roleapp.review.preserved_policies') THEN
    RAISE EXCEPTION 'Politicas de Storage/Cardapio divergiram; reverter corte.'; END IF;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_schema_privilege(client_role,'roleapp_security','CREATE') THEN
      RAISE EXCEPTION 'Papel % pode criar objetos no schema interno.',client_role;
    END IF;
    FOR target IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','roleapp_security') AND c.relkind IN ('r','p') LOOP
      IF has_table_privilege(client_role,target,'TRUNCATE,REFERENCES,TRIGGER') OR
        has_any_column_privilege(client_role,target,'REFERENCES') OR EXISTS (
        SELECT 1 FROM pg_class c WHERE c.oid = target AND pg_has_role(client_role,c.relowner,'MEMBER')) THEN
        RAISE EXCEPTION 'Papel % pode truncar ou assumir dono de %.',client_role,target;
      END IF;
    END LOOP;
    IF has_schema_privilege(client_role,'public','CREATE') THEN
      RAISE EXCEPTION 'CREATE herdado no schema publico.'; END IF;
    FOR item IN SELECT c.oid,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='S' AND n.nspname IN ('public','roleapp_security') LOOP
      IF has_sequence_privilege(client_role,item.oid,'UPDATE') OR pg_has_role(client_role,item.relowner,'MEMBER') THEN
        RAISE EXCEPTION 'Manipulacao de sequencia ainda permitida.'; END IF;
    END LOOP;
    FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='roleapp_security' LOOP
      allowed:=item.proname IN ('is_admin','partner_owns','local_public');
      IF has_function_privilege(client_role,item.oid,'EXECUTE') IS DISTINCT FROM allowed THEN
        RAISE EXCEPTION 'EXECUTE divergente no helper %.',item.proname; END IF;
    END LOOP;
    FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('decidir_parceria_segura','revisar_parceria_segura',
        'listar_solicitacoes_admin','solicitar_campanha_segura','listar_ofertas_campanha',
        'listar_destaques_publicos','registrar_interacao_segura','ativar_campanha_segura') LOOP
      allowed:=client_role='authenticated' OR item.proname='listar_destaques_publicos';
      IF has_function_privilege(client_role,item.oid,'EXECUTE') IS DISTINCT FROM allowed THEN
        RAISE EXCEPTION 'EXECUTE divergente na RPC %.',item.proname; END IF;
    END LOOP;
  END LOOP;
END;
$postflight$;
COMMIT;
````
<!-- END_SOURCE: supabase/migrations/20261109000200_partner_access_hardening.sql -->

### 7.5 Matriz SQL completa — autorização e regressão

Origem: supabase/tests/20261109_partner_access_authorization.sql

SHA-256: 209e877588e8fb8e187858788d84231ceac2866b70e1ea128d04821a55f82ecf

<!-- BEGIN_SOURCE: supabase/tests/20261109_partner_access_authorization.sql -->
````sql
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

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.expect_denied('SELECT * FROM public.usuarios');
SELECT pg_temp.expect_denied('INSERT INTO public.solicitacoes_parceria DEFAULT VALUES');
SELECT pg_temp.expect_denied('SELECT public.listar_solicitacoes_admin()');
SELECT pg_temp.expect_denied('INSERT INTO public.metricas_locais DEFAULT VALUES');
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
````
<!-- END_SOURCE: supabase/tests/20261109_partner_access_authorization.sql -->

### 7.6 Anexo operacional — primeiro administrador (não — migração)

Origem: supabase/operations/primeiro_admin_guarded.sql

SHA-256: ac886f72bf4ec34c8387664a833142f0acd667772ab53e79524cb9f1879d2920

<!-- BEGIN_SOURCE: supabase/operations/primeiro_admin_guarded.sql -->
````sql
-- PROCEDIMENTO DE MANUTENÇÃO PROPOSTO. NÃO EXECUTAR NESTA ETAPA.
-- Sem endpoint/RPC. Não cria contas, perfis, locais ou proprietários.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'Primeiro admin exige autorizacao separada, UUID verificado e ticket de duas pessoas.';
END;
$guard$;
DO $bootstrap$
DECLARE target_user uuid := NULL; operator_ticket text := NULL;
BEGIN
  IF current_user<>'postgres' OR target_user IS NULL OR length(btrim(coalesce(operator_ticket,'')))<10 THEN
    RAISE EXCEPTION 'Executor, UUID explicito e ticket aprovados requeridos.'; END IF;
  PERFORM pg_advisory_xact_lock(7331,20261109);
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE role='admin') THEN
    RAISE EXCEPTION 'Ja existe administrador; este script nao concede um segundo.'; END IF;
  PERFORM 1 FROM auth.users WHERE id=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta Auth inexistente.'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inexistente: revisar trigger original, sem cria-lo aqui.'; END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES(target_user,'admin')
    ON CONFLICT(user_id) DO UPDATE SET role='admin';
  PERFORM 1 FROM public.user_roles WHERE user_id=target_user AND role='admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'Concessao suprimida.'; END IF;
  INSERT INTO public.roleapp_admin_audit(actor,origin,action,subject,reason,details)
    VALUES(NULL,'maintenance','bootstrap_admin',target_user,operator_ticket,
      jsonb_build_object('db_current_user',current_user,'db_session_user',session_user));
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria suprimida: concessao sera revertida.'; END IF;
  PERFORM 1 FROM public.roleapp_admin_audit WHERE origin='maintenance' AND actor IS NULL
    AND action='bootstrap_admin' AND subject=target_user AND reason=operator_ticket;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target_user AND role='admin') THEN
    RAISE EXCEPTION 'Estado final de concessao/auditoria incoerente.'; END IF;
END;
$bootstrap$;
COMMIT;
````
<!-- END_SOURCE: supabase/operations/primeiro_admin_guarded.sql -->

## 8. Encerramento do pacote

Fim das cópias integrais. Todas as travas e parâmetros bloqueantes foram mantidos. Apenas este documento foi criado; nenhum teste SQL, migração, operação de bootstrap ou acesso remoto foi realizado. A finalidade permanece exclusivamente a revisão estática externa anterior a uma possível autorização de testes em clone.
