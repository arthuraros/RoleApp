-- RA-11 / PROPOSTA DE CONTRATOS, NAO MIGRACAO. NAO EXECUTAR.
-- Nao define/redefine RPC comercial existente. Nao habilita operacoes no app.
-- Catalogo, tipos, dependencias, politicas e recuperacao aguardam revisao.
-- Duas travas, sem provisionamento, sem alteracao de dados existentes.
BEGIN;
DO $guard$
BEGIN
  RAISE EXCEPTION 'RA-11 BLOQUEADA: contratos administrativos exigem inventario, revisao e aprovacao explicita.';
END;
$guard$;

DO $manifest$
DECLARE
  reviewed_catalog jsonb := NULL;
  reviewed_commercial_rpc_bodies boolean := false;
  reviewed_all_alternative_write_paths boolean := false;
  reviewed_recovery_and_last_admin_lock boolean := false;
BEGIN
  IF reviewed_catalog IS NULL OR NOT reviewed_commercial_rpc_bodies OR
     NOT reviewed_all_alternative_write_paths OR NOT reviewed_recovery_and_last_admin_lock THEN
    RAISE EXCEPTION 'Manifesto ausente: nao remover a trava inicial para implantar esta proposta.';
  END IF;
END;
$manifest$;

-- MODELO CANDIDATO da base. Reutilizar roleapp_security somente se seu contrato
-- privado for confirmado. Sem IF NOT EXISTS que esconda definicoes divergentes.
-- A criacao do schema, se ausente, pertence a migracao revisada, nao a este roteiro.
-- Nao expor roleapp_security no PostgREST; conferir USAGE/ACL/default privileges.
CREATE TABLE roleapp_security.admin_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  level text NOT NULL CHECK (level IN ('operador','recuperacao')),
  active boolean NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000)
);

CREATE TABLE roleapp_security.admin_capability_grants (
  user_id uuid NOT NULL REFERENCES roleapp_security.admin_access(user_id) ON DELETE RESTRICT,
  capability text NOT NULL CHECK (capability IN (
    'solicitacoes.ler','solicitacoes.decidir',
    'locais.ler','locais.editar','locais.moderar','locais.arquivar',
    'campanhas.ler','campanhas.revisar','campanhas.ativar','campanhas.pausar',
    'administradores.ler','administradores.gerenciar')),
  PRIMARY KEY (user_id, capability)
);

ALTER TABLE roleapp_security.admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleapp_security.admin_capability_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE roleapp_security.admin_access,
  roleapp_security.admin_capability_grants FROM PUBLIC, anon, authenticated;
-- Sem policies permissivas nem DML/SELECT direto pelo cliente. RPCs conferem
-- user_roles.role='admin' E admin_access.active E capacidade atual no banco.
-- Nenhuma linha criada; administradores existentes nao sao elevados automaticamente.

-- PERMISSOES / CONTRATO CANDIDATO (nao ha CREATE FUNCTION nesta RA):
-- obter_minhas_permissoes_admin() -> capacidades efetivas do proprio auth.uid().
-- Operador nao recebe administradores.gerenciar, mesmo que apareca grant invalido.
-- Recuperacao nao e papel novo em user_roles: preservar role='admin' no aplicativo.
-- Revogacao invalida novas chamadas mesmo com JWT/tela ainda abertos.
-- A capacidade inicial de recuperacao exige manutencao explicitamente autorizada.

-- CONSULTA DE LOCAIS / RA-13 (assinaturas logicas, tipos de ID ainda a confirmar):
-- listar_locais_admin(busca text, situacao text, visibilidade boolean,
--                    limite integer, cursor text) -> pagina + proximo_cursor.
-- obter_local_admin(id_local <tipo_real>) -> projecao permitida + versao.
-- Exigir locais.ler; limitar pagina (ex.: teto revisado de 100), ordem estavel,
-- cursor validado, busca parametrizada, sem interpolar SQL/PostgREST do cliente.
-- Incluir invisiveis/arquivados apenas no contrato privado, nunca reusar a consulta
-- publica filtrada nem devolver auth.users ou SELECT * de responsaveis.

-- OPERACOES AUDITAVEIS / RA-12..15:
-- Reutilizar public.roleapp_admin_audit SE instalada e compativel; nao criar log
-- concorrente. Se ausente, preparar DDL incremental com seu contrato revisado.
-- Campos: ator=auth.uid(), acao, alvo, instante do servidor, motivo, versao,
-- correlacao/idempotencia e antes/depois SOMENTE dos campos autorizados.
-- Auditoria + mutacao na mesma transacao; falha da auditoria reverte mutacao.
-- Sem UPDATE/DELETE/INSERT de auditoria por anon/authenticated. Leitura por
-- capacidade, paginada e com dados pessoais minimos. Nao registrar tokens.
-- RPC privilegiada: SECURITY DEFINER apenas quando necessario, search_path='',
-- nomes qualificados, owner revisado, REVOKE EXECUTE FROM PUBLIC/anon, permissao
-- de chamada nao substitui conferencia da capacidade dentro da funcao.
-- Exigir versao esperada + chave idempotente para mutacoes e validar resultado.
-- Bloquear/invalidar tambem rotas alternativas antigas; nao confiar so na UI.

-- MODERACAO / ARQUIVAMENTO DE LOCAIS / RA-13:
-- local_admin_state (nome candidato) deve referenciar locais com MESMO TIPO de ID,
-- FK ON DELETE RESTRICT, sem backfill inventado. Campos candidatos:
-- id_local PK, blocked_at/by/reason, archived_at/by/reason, version.
-- Nao criar essa tabela sem confirmar constraints/tipos/leituras dependentes.
-- editar_local_admin(id, versao, campos_permitidos, motivo, chave_idempotente).
-- definir_visibilidade_local_admin(id, versao, restricao, motivo, chave).
-- arquivar_local_admin(id, versao, motivo, chave).
-- Nenhum endpoint de DELETE fisico proposto. Nenhum ON DELETE CASCADE novo.
-- Preferencia locais.visivel do parceiro nao remove bloqueio/arquivo administrativo.
-- Publicacao efetiva = visivel E nao bloqueado E nao arquivado; conferir tabela,
-- views, destaques, mapa, detalhes e favoritos. Escrita de parceiro nao altera
-- estado administrativo. Operacao de arquivar depende de impacto transacional
-- definido sobre campanhas/relacoes; nunca apagar favoritos/avaliacoes em cascata.

-- CAMPANHAS / RA-14:
-- campaign_admin_reviews (nome candidato): FK tipo real da campanha, decisao,
-- versao do conteudo revisado, decisor, instante/motivo. Estrutura privada.
-- Separar revisao pendente/aprovada/rejeitada do ciclo existente
-- rascunho/ativa/pausada/finalizada, conforme catalogo confirmado.
-- listar_campanhas_admin(...) requer campanhas.ler, pagina e projecao minima.
-- decidir_campanha_admin(...) requer campanhas.revisar e motivo.
-- Adaptar ativar_campanha_segura; nao criar ativador concorrente.
-- Ativacao exige capacidade atual, aprovacao individual da versao, local apto,
-- propriedade autorizada e vigencia valida. Sem confianca em status/ator do cliente.
-- Pausa/retomada/encerramento exigem RPC + trigger + auditoria compativeis;
-- preservar ativacao original e nao reiniciar prazo/valor automaticamente.
-- Publicacao deve verificar aprovacao individual inclusive no legado. Nao marcar
-- campanhas antigas como aprovadas em massa. Expiradas nao sao publicadas.
-- Reutilizar ofertas e metricas reais; nao introduzir preco/plano/cobranca nova.

-- CONCESSAO / REVOGACAO / RA-15:
-- listar_administradores(...) requer administradores.ler, projecao restrita.
-- conceder_acesso_admin(alvo uuid, nivel, capacidades, versao, motivo, chave).
-- revogar_acesso_admin(alvo uuid, versao, motivo, chave).
-- Somente recuperacao ATIVA + administradores.gerenciar pode alterar acessos;
-- capacidades concedidas nao superam as proprias e nivel nao supera o do ator.
-- Locks com ordem unica para TODAS as alteracoes de role/active/nivel/grants.
-- Serializar em lock global de recuperacao, revalidar ator apos adquirir lock,
-- conferir quantidade de recuperadores efetivos apos alteracao, negar zero.
-- Recuperador efetivo = role admin + acesso ativo + nivel recuperacao + capacidade
-- gerenciar. Impedir tambem contorno por DELETE Auth/cascata/manutencao paralela.
-- Mudanca de user_roles e concessoes e auditoria atomicas. Revogar nao concede
-- parceiro implicitamente: restauracao requer regra/evidencia de vinculo aprovado.
-- Nao criar RPC publica de bootstrap. Nao usar service_role no app.

-- RPCs COMERCIAIS ATUAIS: NAO SUBSTITUIR NEM ADIVINHAR CORPOS.
-- encaminhar_solicitacao_decisao(p_id_solicitacao numero, p_observacao texto)
-- decidir_solicitacao_comercial(p_id_solicitacao numero, p_decisao texto,
--   p_justificativa texto, p_id_local numero/nulo,
--   p_identidade_confirmada boolean, p_duplicidade_revisada boolean)
-- obter_detalhe_decisao_admin(p_id_solicitacao numero)
-- Acima: tipos LOGICOS do payload JS, nao assinaturas PostgreSQL certificadas.
-- Verificar todos overloads, EXECUTE herdado, auth.uid/capacidades, transicoes,
-- locks, idempotencia, auditoria e retorno; coletar DDL em canal seguro e versionar
-- definicao revisada antes de qualquer CREATE OR REPLACE. Conferir campo telefone
-- no envio de solicitacoes versus allowlist de INSERT da proposta 00200.

-- Mesmo uma execucao parcial autorizada futura deve usar um artefato revisado,
-- nao selecionar trechos deste arquivo. RA-11 nao instala esses contratos.
ROLLBACK;
