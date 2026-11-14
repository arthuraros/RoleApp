# Verificação dos contratos administrativos — preparação de Locais

Data: 13/11/2026. Escopo: leitura e diagnóstico, sem alteração da aplicação ou do banco.

## 1. Resultado e evidências disponíveis

Não foi possível inspecionar diretamente o catálogo do Supabase ativo. A sessão não dispõe de conector Supabase/PostgreSQL nem de CLI `psql`/`supabase` disponível no PATH. A consulta **GET `/rest/v1/`**, somente de metadados OpenAPI, com a chave pública configurada localmente, retornou **HTTP 401**. A tentativa inicial na execução restrita havia retornado `EACCES`; a tentativa com acesso de rede chegou ao servidor e retornou 401.

Nenhuma chave foi exibida, nenhum registro pessoal consultado e nenhuma RPC chamada. Não foi executado SQL remoto, inclusive de leitura. Não se investigou o motivo do 401 alterando credenciais, autenticação ou configurações. Esse retorno não prova ausência de funções, falha dos fluxos do aplicativo ou insegurança de RLS. A confirmação de funcionamento da RA-11 no SM-X210 é evidência operacional informada pelo usuário; não substitui inventário de catálogo ou teste de autorização.

Foram relidos os quatro arquivos solicitados, os serviços atuais de administração/locais/parceiros, a leitura de papéis, as migrações bloqueadas e os diagnósticos anteriores. A aplicação não foi modificada.

### Correção de escopo da coleta anterior

O script `20261113_ra11_admin_contracts_readonly.sql` investigava `public.campanhas`, mas o código atual usa **`public.campanhas_impulsionamento`** (`parceiroService.js`, consulta de campanhas) e a proposta de hardening usa essa mesma tabela. Foram corrigidos os alvos de existência, políticas, FKs e triggers. O nome `public.campanhas` foi mantido somente como alternativa a verificar, sem presumi-lo real.

Os documentos anteriores usam também “campanhas” como nome de domínio. Isso não deve ser interpretado como certificação de uma tabela com esse nome. Nenhum resultado antigo do banco foi invalidado por uma consulta nova: a limitação foi identificada no SQL local, não em catálogo ativo.

## 2. RPCs comerciais e contrato esperado pelo cliente

As três funções sem definição SQL versionada continuam sendo:

| RPC | Payload confirmado em `adminService.js` | Consumo do retorno atual |
| --- | --- | --- |
| `encaminhar_solicitacao_decisao` | `p_id_solicitacao`: Number; `p_observacao`: texto aparado, 10–2000 caracteres | A tela aguarda sucesso e recarrega a lista; não exige um formato específico de `data` |
| `decidir_solicitacao_comercial` | `p_id_solicitacao`: inteiro positivo seguro; `p_decisao`: `aprovado`/`rejeitado`; `p_justificativa`: 10–2000; `p_id_local`: inteiro positivo seguro na aprovação ou null na rejeição; dois booleanos de confirmação | A tela aguarda sucesso e recarrega; não verifica estrutura de `data` |
| `obter_detalhe_decisao_admin` | `p_id_solicitacao`: inteiro positivo seguro | A tela espera um objeto com `justificativa`, `data_decisao`, `administrador_email` ou `id_admin`, e `id_local` quando aplicável |

**Number no JavaScript não identifica o tipo PostgreSQL.** Não foi confirmado se o banco usa integer, bigint ou outro tipo nas assinaturas/IDs. Também não foi confirmado se o retorno é json/jsonb, composite, TABLE ou SETOF. A consulta de detalhe precisa ser compatível com o objeto consumido; retorno SETOF/TABLE normalmente exige conferir a forma entregue pela API. Não inventar uma assinatura `bigint` ou um `RETURNS jsonb` por conveniência.

Os payloads não enviam papel nem ator administrativo; a identidade precisa ser obtida por `auth.uid()` no backend. A validação de ID do encaminhamento é menos estrita no cliente que a das outras duas chamadas; o servidor deve validar tipo/faixa/existência/transição independentemente dessa diferença. Nenhuma validação foi alterada nesta auditoria.

### Permissões e comportamento a conferir nas três RPCs

- Ausência de EXECUTE efetivo por `PUBLIC`/`anon` nas operações administrativas. Conferir todos os overloads, defaults e privilégios herdados.
- `authenticated` pode ter permissão de chamada, mas a função deve negar usuário/parceiro sem autorização administrativa atual. ACL de chamada não distingue administradores dentro de `authenticated`.
- Leitura de papel/capacidade confiável no banco, sem confiança em parâmetros, metadados editáveis ou e-mail.
- Owner, `SECURITY DEFINER` quando necessário, `search_path` fixo seguro e referências qualificadas; revisar auxiliares e SQL dinâmico. Owner privilegiado não prova sozinho uma falha, mas amplia o impacto de uma validação ausente.
- Encaminhamento somente de estado permitido; decisão somente de pedido apto, com usuário/local/vínculo conferidos no servidor. Confirmações na tela não comprovam propriedade.
- Locks/versionamento/idempotência, auditoria na mesma transação e autorização ainda válida durante a alteração. Nenhuma dessas garantias foi certificada apenas pelo código do cliente.
- Detalhes de decisão e contatos acessíveis apenas a quem pode consultá-los, com projeção mínima.

`listar_solicitacoes_admin`, `revisar_parceria_segura`, `decidir_parceria_segura` e `ativar_campanha_segura` possuem referência em código e/ou definição em proposta local. A presença dessas propostas também não confirma instalação. Não substituir as três funções comerciais pelo fluxo alternativo sem reconciliar comportamento e dados.

## 3. Relação de contratos: existente, ausente ou não verificado

Legenda: **código** = consumidor implementado; **proposta** = artefato SQL bloqueado/comentado; **ausente localmente** = implementação não localizada. A coluna do banco descreve somente evidência direta desta execução.

| Objeto/contrato | Evidência local | Situação no Supabase ativo |
| --- | --- | --- |
| Três RPCs comerciais acima | Chamadas existentes; corpos SQL ausentes localmente | Não verificado |
| `listar_solicitacoes_admin` | Código e proposta SQL | Não verificado |
| `user_roles(user_id,role)` | Consulta em `profileService`; fundação SQL proposta | Não verificado por catálogo atual |
| `usuarios`, `locais`, `solicitacoes_parceria` | Usados pelo aplicativo | Não verificado por catálogo atual |
| `campanhas_impulsionamento`, `metricas_locais` | Usados por `parceiroService` e hardening proposto | Não verificado por catálogo atual |
| `roleapp_admin_audit` | DDL e uso transacional na proposta 00200 | Não verificado |
| `partnership_reviews`, `request_local_links`, `campaign_offers` em `roleapp_security` | DDL/helpers na proposta 00200 | Não verificado |
| `solicitar_campanha_segura`, `ativar_campanha_segura`, `listar_destaques_publicos` | Serviços e proposta SQL | Não verificado |
| `admin_access`, `admin_capability_grants` | DDL candidato bloqueado da RA-11, sem provisionamento | Não verificado |
| `local_admin_state`, `campaign_admin_reviews` | Especificação comentada, sem implementação de tabela na RA-11 | Não verificado |
| `listar_locais_admin`, `obter_local_admin`, `editar_local_admin` | Contratos candidatos; implementação não localizada | Não verificado; não afirmar ausência no banco |
| RPCs de moderação/arquivamento, revisão/pausa de campanhas e concessão/revogação | Especificação de próximas etapas, sem implementação localizada | Não verificado; procurar equivalentes antes de criar |

**Nenhum objeto foi certificado como ausente no banco nesta execução.** Em uma coleta autorizada completa, `installed=null` comprova ausência do nome qualificado consultado; `public_signatures=[]` comprova ausência desse nome de função pública no snapshot. Isso não exclui implementação equivalente com outro nome/schema. Por esse motivo a coleta complementar inclui todas as relações e rotinas de `public`/`roleapp_security`, além de auxiliares de triggers/RLS.

## 4. Papéis e estruturas reutilizáveis

### Papéis administrativos

O modelo do aplicativo reconhece apenas `usuario`, `parceiro` e `admin`, lidos de `user_roles`, com comparação exata. `admin` não é automaticamente parceiro; `superadmin` é rejeitado como papel desconhecido. Não há níveis efetivos de operador/recuperação no contrato atual da aplicação.

`admin_access`/capacidades são apenas proposta. Conferir se há outro modelo já instalado antes de criar estrutura nova. Catálogo/constraints/enums mostram valores permitidos; opcionalmente uma contagem agregada de `user_roles` pode confirmar os valores presentes, sem expor identidades. Quantidade de linhas `admin` não comprova existência de um recuperador nem protege contra duas revogações simultâneas.

### Auditoria, moderação e campanhas

- **Auditoria:** `roleapp_admin_audit` é o candidato a reutilizar se existir com contrato compatível. A proposta registra ator, ação, motivo e alvo; possui limites de unicidade para decisão e ativação. Conferir colunas, índices, acesso, retenção e se as RPCs comerciais realmente escrevem nela ou em outra trilha.
- **Moderação:** o código possui `locais.visivel`. Não existe no cliente uma garantia independente de bloqueio/arquivamento administrativo. A proposta permite ao parceiro aprovado editar visibilidade, portanto isso não basta para moderação persistente.
- **Campanhas:** fonte efetiva no código é `campanhas_impulsionamento`. A proposta possui criação em rascunho, ofertas privadas e ativação auditada. Revisão individual, pausa/retomada e encerramento não foram implementados pela RA-11.
- **Métricas:** `metricas_locais` é fonte por local/data. Não presumir atribuição por campanha, faturamento, ROI ou demografia.
- **Relacionamentos:** conferir entradas/saídas de FKs de `locais`, campanhas e usuários, incluindo favoritos, horários, eventos, categorias, cardápio, fotos, avaliações, métricas e vínculos de parceria. Não deduzir ON DELETE pelo React Native.

O fechamento de 09/11 relata duas tabelas independentes de avaliações, datas de campanha TIMESTAMPTZ obrigatórias com defaults, status antigos `ativa`/`pausada`/`finalizada`, default `ativa` e durações 3/7/14. Esses são resultados históricos informados, não nova coleta. A proposta posterior de rascunho/ativação não pode ser considerada instalada sem comparação atual.

## 5. Riscos a avaliar antes de liberar edição de locais

| Risco/evidência | Verificação necessária |
| --- | --- |
| `locaisService.updateLocal` e `parceiroService.updateLocal` fazem UPDATE direto com allowlist do cliente | Conferir grants de tabela/coluna, USING e WITH CHECK, triggers e todas as rotas alternativas. Allowlist no cliente não impede requisição manual |
| As consultas do parceiro filtram proprietário; a listagem pública filtra `visivel=true` | Não reutilizar como contrato administrativo para locais invisíveis nem conceder papel parceiro ao administrador como contorno |
| Payload de atualização não leva versão/justificativa administrativa | Verificar proteção existente no banco; contrato novo precisa evitar sobrescrita concorrente e registrar antes/depois atomicamente |
| `updateLocal` retorna `data[0]` sem comprovar uma linha alterada | Contrato administrativo deve distinguir acesso negado, conflito, alvo inexistente e sucesso; nunca anunciar gravação por simples ausência de erro |
| `visivel` é editável no modelo do parceiro proposto | Separar bloqueio/arquivo administrativo ou regra equivalente; todos os leitores públicos e campanhas devem respeitá-la |
| Horários são salvos por DELETE/INSERT separados no serviço atual | Não incluir esse fluxo na primeira edição administrativa sem contrato transacional próprio |
| RPCs comerciais sem corpo local; política nova pode coexistir com permissiva antiga | Revisar corpos, auxiliares, heranças, views, defaults e overloads, sem considerar seguro apenas o endpoint novo |
| Autorização consultada antes de lock pode ficar obsoleta com revogação concorrente | Definir ordem de locks/versões compatível entre edição, mudança de proprietário e revogação; testar em clone |
| Campanha ativa/publicável sem aprovação individual comprovada | Conferir trigger, função de publicação, legado e trilha; aprovação de parceiro não equivale a aprovação de campanha |
| Último administrador protegido apenas por contagem prévia | Exigir serialização comum das alterações de papel/nível/atividade, revalidação sob lock e proteção contra caminhos alternativos |

Esses itens são lacunas no contrato visível ou riscos a confirmar. Não são alegações de exploração comprovada no Supabase atual. Nenhuma RPC mutadora deve ser chamada em produção nesta etapa, nem para testar que “nega” um payload.

## 6. Consultas manuais no SQL Editor

Usar o projeto correto no Dashboard e uma sessão do responsável autorizado. Abrir cada arquivo e executar **o conteúdo completo**, incluindo `BEGIN ... READ ONLY` e `ROLLBACK`. Não executar arquivos de `supabase/proposals`, migrações bloqueadas ou fixtures de testes. Não retirar travas. Não usar SELECT que chame uma RPC de negócio.

### Coleta A — catálogo completo para Locais

Arquivo: `supabase/diagnostics/20261113_admin_places_verification_readonly.sql`.

Produz um único JSON `admin_verification_result`, sem linhas de negócio. Exportar o resultado completo, sem capturas truncadas. Precisamos analisar:

| Campo do JSON | Decisão que permite tomar |
| --- | --- |
| `inspection` | Confirmar projeto/sessão pelo contexto e que `read_only=on`; o papel de inspeção não simula a autorização do app |
| `expected_relations`, `relations` | Objetos instalados, nomes alternativos, owner, RLS/force e opções |
| `columns`, `enums`, `domains` | Tipos reais de IDs, valores de papéis/status, nulabilidade, defaults, versão/updated_at e campos editáveis |
| `constraints`, `indexes` | FKs/ON DELETE, unicidade de auditoria, vínculos e mecanismos de concorrência |
| `table_access`, `column_access`, `schema_access` | Privilégios efetivos de anon/authenticated e possível escrita de campos sensíveis |
| `policies` | Leitura de invisíveis, edição de terceiros, USING/WITH CHECK e combinação permissiva/restritiva |
| `expected_rpcs`, `routines` | Assinaturas/overloads, retorno, SETOF, owner, SECURITY DEFINER, search_path, ACL efetiva e hash da definição |
| `triggers`, `views` | Auditoria/moderação realmente conectadas às tabelas e leituras que possam contornar visibilidade/RLS |
| `client_roles`, `memberships`, `default_privileges`, `sequence_access` | Heranças/bypass e concessões indiretas, inclusive TRUNCATE/setval |

`has_table_privilege`/`has_column_privilege` verdadeiros não significam automaticamente acesso às linhas: é necessário combinar grants, RLS, papel efetivo e comportamento das funções. RLS habilitada também não basta se uma política permissiva ou função privilegiada abre outro caminho.

`session_api_schemas` nulo ou preenchido no SQL Editor não certifica quais schemas a instância PostgREST usa. Confirmar a configuração de schemas expostos no projeto, somente visualmente/leitura, sem alterá-la. `roleapp_security` não deve ser exposto como API de tabelas privadas.

A coleta cobre os schemas conhecidos e auxiliares vinculados por catálogo. SQL dinâmico e funções de outros schemas chamados indiretamente podem exigir coleta complementar; ausência de dependência em `pg_depend` não prova ausência de uso em PL/pgSQL. O diagnóstico antigo `partner_hardening_review/03_funcoes_triggers_acessos.sql` complementa a triagem de rotas e configurações mais amplas.

### Coleta B — corpos das três RPCs, em canal restrito

Arquivo: `supabase/diagnostics/20261113_commercial_rpc_bodies_readonly.sql`.

Retorna assinatura, retorno, owner, SECURITY DEFINER, hash e `pg_get_functiondef` das três RPCs, incluindo overloads. **Não executa as funções retornadas.** Revisar os corpos antes de compartilhar: funções antigas podem conter literais sensíveis. Não publicar tokens/chaves/senhas. Não é necessário fornecer credenciais ou registros reais para esta análise.

Precisamos verificar autorização, transições, propriedade, locks, auditoria, exceções e retorno. Auxiliares chamados precisam da mesma revisão de definição; um hash ou nome “seguro” não comprova seu comportamento. Uma consulta de corpo é leitura, não autorização para executar o DDL retornado.

### Coleta C — visão resumida e comparação

O arquivo corrigido `supabase/diagnostics/20261113_ra11_admin_contracts_readonly.sql` continua disponível para resumo. Retorna múltiplos conjuntos; se usado, exportar cada SELECT. A coleta A oferece resultado único e cobre permissões por coluna, defaults e índices que o resumo não detalha.

Os diagnósticos anteriores 01/02/03 podem complementar a inspeção. O bloco 04 antigo lê dados de negócio/identidades para legado/duplicidade; ele **não é necessário para a primeira coleta de contratos** e não deve ser enviado indiscriminadamente junto dos metadados.

### Opcional — valores presentes de papéis, sem identificar pessoas

Somente se a coleta A confirmar `public.user_roles.role`, executar separadamente:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT role, count(*) AS quantidade
FROM public.user_roles
GROUP BY role
ORDER BY role;
ROLLBACK;
```

Essa contagem não confere níveis de recuperação, concorrência ou decisões de concessão. Não consultar e-mails/UUIDs de todos os administradores para uma simples verificação de modelo.

Se qualquer coleta falhar, guardar a mensagem/SQLSTATE e não contornar com permissões novas. Cancelar a transação com `ROLLBACK` se necessário. Nenhum resultado desta coleta deve ser apresentado como teste negativo/positivo de RLS com JWT real.

## 7. Próximos passos seguros, priorizando Locais

1. **Fechar evidência do backend.** Analisar A/B, confirmar tipos de `locais`, RLS/grants, retornos comerciais, schema de campanhas e auditoria instalada. Identificar contratos equivalentes antes de propor novos. O aplicativo funcional permanece intacto.
2. **Preparar consulta administrativa de locais.** Contrato de lista paginada/pesquisa parametrizada e detalhe, incluindo invisíveis conforme capacidade. Projetar apenas dados necessários do responsável; não retornar `auth.users` ou perfis completos. Reaproveitar segurança existente se comprovada.
3. **Preparar edição administrativa mínima.** Assinatura lógica candidata: `editar_local_admin(id_no_tipo_real, versao_esperada, patch, justificativa, chave_idempotente)`. O banco revalida a capacidade atual, bloqueia/confere versão e exige exatamente um alvo. Retorna local/versão confirmados e referência da auditoria. Repetição da mesma chave e conteúdo não duplica gravação; mesma chave com conteúdo diferente é conflito.
4. **Definir allowlist no servidor.** Começar pelas informações textuais já previstas: nome, descrição, telefone, faixa de preço, endereço, bairro e cidade/UF, somente após confirmar tipos/limites/nulos. Rejeitar campos desconhecidos. Não permitir edição genérica de proprietário, papel, IDs, plano, aprovação ou estado de campanha. Tratar visibilidade/moderação separadamente. Categorias, horários, coordenadas e relações complexas não entram implicitamente nessa primeira edição.
5. **Auditar a alteração atomicamente.** Ator e data do servidor, motivo, alvo, versão e antes/depois de campos permitidos; rollback se o log falhar. Não criar segunda trilha se a existente puder ser adaptada. Proteger contra acesso/escrita direta que contorne a nova função.
6. **Revisar moderação/arquivamento em contrato separado.** Distinguir preferência de publicação do parceiro de bloqueio administrativo; conferir publicação em Home/mapa/detalhes/favoritos/campanhas e relacionamentos antes de liberar. Exclusão lógica como padrão; nenhuma exclusão física/cascata nesta preparação.
7. **Somente depois, avançar campanhas e acessos.** Aproveitar fontes reais e mecanismos auditados, revisar lifecycle/legado, e implementar gestão de acessos somente com matriz de capacidades e proteção serializada do último recuperador. Não inventar preços, planos ou regras financeiras.

Quando houver proposta de implementação: revisar SQL incremental, testar em clone autorizado, validar operações com identidades de teste e concorrência em conexões separadas, obter aprovação explícita antes de alterar o Supabase de destino e só então conectar a interface administrativa. Nesta execução não foi autorizado nem realizado teste mutador.

Para a futura edição, os testes precisam incluir usuário/parceiro A/B sem permissão, administrador autorizado/revogado, dois editores com a mesma versão, revogação concorrente, retry após timeout, payload com campos proibidos, auditoria falhando, local inexistente/invisível e atualização preservando todas as relações. Testes do app não substituem esses testes de backend.

## 8. Arquivos e verificações desta execução

- Corrigido somente o diagnóstico de leitura da RA-11 quanto ao nome da tabela de campanhas e filtro de rotinas.
- Acrescentados os dois diagnósticos de leitura A/B e este relatório.
- Aplicação, dependências, configurações nativas, propostas bloqueadas e dados preservados. Nenhuma proposta foi executada ou alterada.
- SQLs revisados estaticamente; não foram analisados/executados por PostgreSQL nesta sessão. Não há afirmação de validação de RLS, concorrência ou instalação de contratos.
- `test/adminContracts.test.mjs`: **4 testes aprovados, zero falhas**, com cliente offline.
- Os três diagnósticos foram conferidos estaticamente quanto a limites `READ ONLY`/`ROLLBACK` e ausência de comandos mutadores; isso não é parsing ou execução PostgreSQL.
- `git diff --check`: aprovado; os arquivos novos também foram conferidos sem erros de whitespace.
- A suíte completa/Expo Doctor da RA-11 não foram repetidos nesta entrega de documentação e SQL de diagnóstico. Nenhum resultado offline comprova execução ou autorização no banco.
- Nenhum commit ou push.
