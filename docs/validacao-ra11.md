# RA-11 — Estrutura e contratos administrativos

Data: 13/11/2026. Base: `docs/auditoria-painel-administrativo-ra11-ra15.md`.

## Escopo implementado

O Painel Administrativo possui as seções **Solicitações**, **Locais**, **Campanhas** e **Administradores**. A seção inicial continua sendo Solicitações, com Revisão, Pendentes e Histórico e os mesmos serviços, validações, confirmações e operações anteriores.

A navegação principal é horizontal: usa a largura disponível e permite deslizar quando os quatro itens não cabem. Os itens têm altura mínima de 64 dp, texto sem altura fixa/redução de fonte e estado de seleção acessível. A identidade visual, largura de conteúdo, áreas seguras e componentes de teclado locais foram preservados. O resultado visual ainda precisa ser conferido no dispositivo.

Locais, Campanhas e Administradores apresentam somente título, descrição e a mensagem **Funcionalidade em preparação**. Não possuem formulários, atualização por gesto, consultas novas ou botões para operações ainda indisponíveis. Uma falha de carregamento em Solicitações não impede a consulta dessas mensagens.

Alternar seções mantém a aba, o pedido selecionado e o texto em edição de Solicitações. Não remonta o componente, não repete a consulta por causa da troca de seção e não altera os contratos comerciais. Durante encaminhamento/decisão em andamento, a troca de seção fica desabilitada.

Nenhuma operação de edição/arquivamento de locais, administração de campanhas ou concessão de acesso foi implementada. As melhorias de seleção de local, paginação e concorrência apontadas na auditoria permanecem na RA-12.

## Arquivos desta etapa

| Arquivo | Alteração da RA-11 |
| --- | --- |
| `src/screens/PainelAdminScreen.js` | Navegação entre quatro seções, estados informativos e acessibilidade das abas |
| `test/adminPanel.test.mjs` | Testes de navegação, preservação de estado, regressões de solicitações e AccessGate |
| `test/adminContracts.test.mjs` | Contratos comerciais offline e verificações estáticas das travas SQL |
| `supabase/diagnostics/20261113_ra11_admin_contracts_readonly.sql` | Inventário de catálogo administrativo, somente leitura, não executado |
| `supabase/proposals/20261113_ra11_admin_contracts_blocked.sql` | Proposta bloqueada de capacidades e contratos futuros, não executada |
| `docs/validacao-ra11.md` | Decisões, pendências e roteiro desta entrega |

A tela já tinha alterações locais anteriores de teclado e responsividade, que foram preservadas. O diff em relação ao último commit inclui essas alterações da equipe. `adminService`, autenticação, navegação global, Home, Favoritos, Perfil, dependências, configurações nativas e migrações existentes não foram modificados nesta etapa.

## Contratos: evidência e pendências

### Confirmado no código atual

| Fluxo | Contrato atual | Situação da definição SQL no repositório |
| --- | --- | --- |
| Listagem | `listar_solicitacoes_admin` | Presente na proposta anterior, não comprova instalação |
| Revisão → Pendentes | `encaminhar_solicitacao_decisao` | Corpo não localizado |
| Aprovação/rejeição | `decidir_solicitacao_comercial` | Corpo não localizado |
| Histórico de decisão | `obter_detalhe_decisao_admin` | Corpo não localizado |

`adminService` envia IDs/dados da decisão e justificativas; não envia papel ou identidade do administrador. As chamadas comerciais foram mantidas e testadas com cliente offline. Nenhuma tentativa de escrita direta ou RPC alternativa foi acrescentada em caso de falha.

Os tipos numéricos usados no payload JavaScript não certificam a assinatura PostgreSQL. Não foram inventados corpos ou usados `CREATE OR REPLACE` para as três funções ausentes. O contrato alternativo `revisar_parceria_segura`/`decidir_parceria_segura` continua preservado, sem substituir o fluxo atual nesta etapa.

### Proposta SQL versionada

O arquivo em `supabase/proposals` é um **artefato de revisão, não uma migração instalável**. Tem exceção incondicional antes de DDL, segunda trava com manifesto nulo/revisões falsas e termina com `ROLLBACK`. Não remover travas ou executar trechos manualmente. Uma implantação futura exige artefato incremental separado, catálogo confirmado e aprovação explícita.

Inclui DDL candidato de duas estruturas privadas, sem criar linhas:

- `roleapp_security.admin_access`: usuário, nível operador/recuperação, atividade, versão, responsável, data e motivo da alteração; referências sem cascata.
- `roleapp_security.admin_capability_grants`: capacidades por usuário. RLS habilitada e privilégios diretos de `PUBLIC`, `anon` e `authenticated` revogados no modelo proposto.

O schema privado deve ser confirmado e não exposto na API. Não há concessão automática a administradores existentes, políticas permissivas, DML de provisionamento ou RPC operacional nova nesse arquivo. A aplicação continua usando `role='admin'`; não foi introduzido papel `superadmin` incompatível com a normalização atual.

Os demais módulos têm especificação SQL comentada de assinatura lógica, validações e invariantes, deliberadamente sem função executável nesta RA:

| Domínio | Contratos candidatos e invariantes |
| --- | --- |
| Capacidades | Consulta das próprias permissões; identidade por `auth.uid()`, papel e capacidade atuais no banco |
| Consulta de locais | Listagem paginada parametrizada, consulta por ID real e projeção mínima do responsável, incluindo invisíveis apenas para autorização adequada |
| Auditoria | Reutilizar `roleapp_admin_audit` se instalada/compatível; mutação e log atômicos, versão/idempotência, ator/data no servidor e nenhum log editável pelo cliente |
| Moderação/arquivamento | Estado administrativo independente da preferência `visivel` do parceiro; arquivamento lógico, motivo e histórico; nenhuma exclusão física/cascata |
| Campanhas | Revisão individual separada de execução; ativação autorizada da versão aprovada; pausa/retomada/encerramento com trigger e auditoria coordenados |
| Administradores | Gestão somente por recuperação autorizada, sem delegação superior; revogação efetiva no servidor, locks comuns e proteção do último recuperador |

Nomes de tabelas/assinaturas futuras são candidatos. Tipos de IDs, FKs, retornos, constraints, colunas de moderação e migrações finais dependem do inventário. A documentação comentada não deve ser confundida com recursos prontos de RA-13, RA-14 ou RA-15.

### Matriz proposta de capacidades

| Domínio | Capacidades candidatas |
| --- | --- |
| Solicitações | `solicitacoes.ler`, `solicitacoes.decidir` |
| Locais | `locais.ler`, `locais.editar`, `locais.moderar`, `locais.arquivar` |
| Campanhas | `campanhas.ler`, `campanhas.revisar`, `campanhas.ativar`, `campanhas.pausar` |
| Administradores | `administradores.ler`, `administradores.gerenciar` |

As capacidades efetivas precisam ser consultadas pelo backend; ocultar botões não concede nem protege acesso. O nível operador não pode gerir administradores. Recuperação exige nível ativo, papel administrativo e capacidade de gestão, sem inferência por e-mail/metadados. Nenhuma capacidade nova é usada como autorização pelo aplicativo nesta RA.

O último recuperador deve ser protegido em concessões, revogações, rebaixamentos, alterações de papel e caminhos de exclusão de conta. As operações precisam compartilhar bloqueio e revalidar ator/contagem depois de adquiri-lo, inclusive em concorrência. Não basta contar administradores no cliente. O bootstrap será manutenção explícita fora do aplicativo; o script bloqueado existente de primeiro admin não foi alterado nem executado.

## Dependências de verificação do Supabase

Não houve nova conexão ao Supabase nesta RA. A tentativa de metadados na auditoria anterior retornou 401; nenhuma proposta é considerada instalada por existir no repositório.

O responsável autorizado pelo backend precisa obter/revisar:

1. Inventário atualizado de tabelas, tipos, grants/RLS efetivos e herdados, views, triggers, schemas expostos e relacionamentos/ON DELETE.
2. Assinaturas, corpos, owners, `search_path`, EXECUTE e todos os overloads das RPCs comerciais atuais, em canal restrito. O novo diagnóstico produz metadados/hash, não copia corpos nem consulta dados pessoais.
3. Compatibilidade de `telefone` enviado nas solicitações com os grants de inserção da proposta anterior.
4. Contrato real de auditoria/vínculos e eventuais rotas antigas que contornem autorização.
5. Estados/defaults reais de campanhas, publicação do legado e transições antes de propor mudanças coordenadas.
6. Recuperação administrativa e políticas para antigos administradores sem registros de capacidades. Não elevar todos automaticamente nem bloquear a operação existente sem corte planejado.

O diagnóstico novo usa transação `READ ONLY`, catálogo PostgreSQL e `ROLLBACK`; não chama as RPCs operacionais. Deve ser revisado/executado pelo responsável autorizado junto dos diagnósticos existentes. Não foi executado nesta entrega. Não são necessárias credenciais `service_role` no aplicativo.

Antes de qualquer liberação futura: revisar o SQL incremental, testar em clone autorizado com identidades/perfis diferentes, comprovar RLS/concorrência/auditoria e obter aprovação explícita para alterar o Supabase de destino. Não aplicar automaticamente as quatro migrações antigas bloqueadas. Testes com fixtures SQL também não devem usar produção.

## Evidências de segurança e testes

- `AccessGate role="admin"` foi mantido. Testes confirmam bloqueio na interface para usuário, parceiro, papel desconhecido e perfil em carregamento; alteração para papel não administrativo oculta o conteúdo na nova renderização.
- A lista de seções é somente organização visual, não nova fonte de permissão. Não há novos métodos de mutação, DML direto ou fallback de escrita no aplicativo.
- As três RPCs comerciais mantêm seus nomes e payloads; testes confirmam ausência de ator/papel forjados no envio e ausência de caminho alternativo após erro.
- A busca em `src` não encontrou referência a `service_role` ou `SUPABASE_SERVICE`. Não houve inserção de credenciais.
- Propostas SQL verificadas estaticamente: exceção antes de DDL, manifesto bloqueado, rollback, ausência de `GRANT`, funções operacionais novas, inserções, exclusões e cascata. Isso não é validação PostgreSQL.
- Testes focados: **18 aprovados, zero falhas**.
- `npm.cmd test`: **307 aprovados, zero falhas**, incluindo as regressões anteriores.
- `npx.cmd expo-doctor`: **20/20 verificações aprovadas**. A primeira tentativa restrita foi interrompida sem resultado; a execução com acesso ao cache/rede concluiu sem problemas. Não houve atualização de dependências do projeto.
- `git diff --check`: sem erros de whitespace. Arquivos novos também conferidos separadamente; os avisos LF/CRLF do checkout não representam erros de whitespace.

O renderer offline verifica JSX, hooks e handlers com dependências nativas substituídas. Não simula o motor RLS nem mede layout real. A autorização efetiva das RPCs instaladas continua pendente; não foi certificada pelos testes de interface ou contrato.

## Validação no Samsung SM-X210

1. Abrir a Development Build existente com o código atualizado e entrar com administrador já autorizado. Não conceder novos acessos para testar esta etapa.
2. Abrir o Painel Administrativo e conferir as quatro seções; em Solicitações, conferir Revisão, Pendentes e Histórico e os registros reais esperados.
3. Abrir um pedido, digitar observação/justificativa sem enviar, alternar para as outras seções e retornar. Conferir pedido e texto preservados. Fechar o detalhe e conferir a aba anterior.
4. Conferir mensagens de preparação em Locais, Campanhas e Administradores. Não deve haver botão de salvar, excluir, ativar campanha ou conceder acesso nessas seções.
5. Conferir retrato, paisagem, janela dividida/estreita e fonte ampliada: a navegação deve deslizar quando necessário, os textos permanecer legíveis e a rolagem vertical continuar funcionando.
6. Conferir retorno, carregamento e repetição após erro de rede em Solicitações. As seções informativas devem continuar acessíveis. Não usar pedidos reais para testar decisões por tentativa.
7. Em ambiente de teste autorizado, validar contato, encaminhamento e confirmação/cancelamento de aprovação/rejeição. Durante envio, as seções ficam desabilitadas. Conferir atualização de aba/histórico após sucesso.
8. Entrar como usuário/parceiro e confirmar ausência de acesso administrativo. Testes de revogação e de RLS real precisam de ambiente e responsáveis de backend; não remover o último administrador real.

A validação visual no SM-X210, em celular pequeno e no iOS permanece manual. Não foram gerados APKs novos nem alteradas dependências, configurações Android, autenticação ou dados reais. Nenhum SQL executado, commit ou push realizado.
