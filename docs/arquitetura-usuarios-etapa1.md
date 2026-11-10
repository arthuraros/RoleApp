# Arquitetura de usuários — etapa 1

Status: preparação local. Nenhum SQL foi executado e nenhuma política remota foi verificada.

## Informações obrigatórias antes de aplicar a migração

- Confirmar o projeto/ambiente de destino, versão do PostgreSQL, histórico de migrações e backup/recuperação.
- Obter definições das tabelas, constraints, grants, RLS, políticas, funções, views e triggers atuais.
- Confirmar se public.usuarios.id_usuario é UUID, único e corresponde a auth.users.id. Verificar órfãos, duplicatas e criação de perfil nos cadastros por senha e Google.
- Confirmar existência e permissões de usuarios.foto_url. O serviço inicial consulta somente id_usuario e foto_url.
- Confirmar que public.user_roles NÃO existe e que esse nome está livre. A migração falha em colisão, em vez de sobrescrever objetos existentes.
- Identificar qualquer modelo de papéis já existente, inclusive claims, funções SECURITY DEFINER, hooks e triggers que possam escrever na nova tabela ou conceder privilégios.
- Auditar papéis herdados, default privileges e acessos de PUBLIC, anon, authenticated e service_role. Confirmar que clientes comuns não são donos da tabela nem têm BYPASSRLS.
- Confirmar tipos e vínculos de solicitacoes_parceria.id_usuario, locais.id_proprietario, locais.id_local e tabelas filhas, inclusive categorias/itens de cardápio.
- Confirmar estados de solicitações e a diferença entre aprovação da parceria e publicação (visivel). Inventariar locais/solicitações antigos; não promover proprietários automaticamente.
- Resolver a divergência dos horários: horario_abertura/horario_fechamento no cadastro versus abre/fecha na leitura e edição.
- Definir processo confiável e auditado de provisionamento/revogação de parceiro e administrador, responsáveis e primeiro administrador. Não usar e-mail, user_metadata ou dados enviados pelo cliente para promover contas.
- Planejar e testar RLS para locais, solicitações, cardápio, horários, eventos, campanhas, métricas, favoritos e Storage antes de ativar o novo fluxo.

## Contrato inicial

`createProfileService(client).getCurrentProfile()` valida a identidade via Auth e consulta somente o próprio perfil e papel. Não contém escrita. O cliente é injetado para permitir testes sem rede.

`public.user_roles`: user_id UUID (PK/FK para auth.users), role com valores usuario, parceiro ou admin, created_at. Não há seed, trigger de promoção, backfill, RPC administrativa ou sincronização com metadados. Sem registro, papel inválido ou consulta indisponível, role é null e privilégios são falsos. O papel usuario também precisa vir de registro confiável; null não impede as telas atuais.

`AuthContext` mantém user/session e loading originais. Acrescenta profile, role, permissions, isPartner, isAdmin, profileLoading, profileError e refreshProfile. A consulta é independente do carregamento da navegação. Sem configuração real ou durante recuperação, não consulta permissões. Respostas atrasadas são descartadas e o perfil é vinculado à identidade atual. refreshProfile limpa privilégios durante a atualização.

Por enquanto o contexto atualiza após mudança de identidade e por refreshProfile explícito. Atualização ao retomar o app, revogação durante sessão, proteção das rotas e integração visual ficam para a próxima etapa. Flags no cliente nunca substituem RLS.

## Migração preparada

Arquivo: supabase/migrations/20261109000100_user_roles_foundation.sql.

Está bloqueada por uma exceção incondicional ANTES do DDL. Após confirmar os itens acima, revisar o SQL e remover a trava em uma alteração explicitamente autorizada. Não usar db push/reset nem executar o arquivo nesta etapa.

O DDL proposto cria apenas a tabela de papéis e uma política de leitura do próprio registro. Revoga privilégios dos clientes e libera apenas SELECT para authenticated. Não cria acesso administrativo global. Não modifica tabelas existentes. Não torna seguro o fluxo antigo de parceiros por si só.

Rollback planejado: primeiro retirar os consumidores da nova tabela; depois revisar dependências e remover explicitamente a política/tabela em migração futura autorizada. Não executar exclusões automáticas. Após haver papéis provisionados, preservar histórico e planejar recuperação antes de remover dados.

## Preservação e pendências

Branch criada a partir de feature/gestao-cardapio, carregando as alterações locais de PainelParceiroScreen, parceiroService, navigation, GerenciarCardapioScreen, cardapioService e TESTE_CODEX.md. Esses arquivos não são alterados nesta etapa.

Não são implementados aqui: aprovação transacional, painel administrativo, quinta aba, alteração no cadastro de parceiros ou políticas de negócio das tabelas existentes. O fluxo antigo continua e não deve ser considerado protegido pelas novas flags.

Referências oficiais: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/postgres/column-level-security . Papéis ficam fora de user_metadata editável; autorização depende de grants/RLS confiáveis no banco.

## Verificações realizadas

- `node --test test/profileService.test.mjs`: 13 testes aprovados, usando cliente simulado sem rede. Incluem cada papel, ausência/papel inválido, tentativa de promoção por metadados, erro de Auth/esquema/RLS e resposta de outra conta.
- `npm.cmd test`: bloqueado antes dos testes por ERR_PACKAGE_PATH_NOT_EXPORTED no import preexistente expo-auth-session/build/QueryParams.js. `npm` sem extensão também encontra a restrição de execução de npm.ps1 deste Windows; não foi alterada a política do sistema.
- Suítes existentes de locais/parceiros: 34 de 36 aprovados. TU03 e TU05 de parceiroService esperam o fallback removido nas alterações locais anteriores. Não foram restaurados comportamentos inseguros nem modificados esses arquivos.
- A execução dessas suítes foi repetida com fetch bloqueado por preload do Node, pois o teste de métricas não simula a RPC antes do fallback. Essa repetição teve os mesmos resultados. O harness existente também imprime storage.getItem is not a function na inicialização do AsyncStorage em Node.
- Parser Babel validou os 35 arquivos JS de src, incluindo JSX, navegação e telas locais. Inspeção da AST confirmou que todos os logs de AuthContext têm somente argumentos literais.
- `git diff --check` geral aponta whitespace anterior em PainelParceiroScreen.js:328; preservado. O diff de AuthContext não introduz erro de whitespace.
- Não foram executados SQL, migrações, testes de banco/RLS nem teste visual em dispositivo. Funcionamento em runtime de login por senha/Google, recuperação, mapa, filtros e cardápio ainda exige smoke test no Expo; validação de sintaxe não substitui esse teste.
