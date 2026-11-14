# Painel Administrativo — auditoria e plano RA-11 a RA-15

Data: 13/11/2026. Escopo desta execução: diagnóstico e planejamento, sem implementação dos módulos.

## 1. Conclusão e limites da auditoria

O painel atual atende solicitações de parceria. Já há serviços de locais, campanhas, métricas e propostas extensas de segurança que devem ser aproveitados. Ainda não existem as três interfaces administrativas de Locais, Campanhas e Administradores, nem uma hierarquia administrativa implementada no contrato de papéis do aplicativo.

A prioridade é reconciliar os contratos realmente utilizados pelo aplicativo com o backend instalado. O painel atual usa RPCs comerciais que não têm definição SQL versionada no repositório. As migrações locais de hardening estão deliberadamente bloqueadas; não comprovam a configuração do banco em produção e não devem ser aplicadas automaticamente.

Foram examinados o estado de trabalho não commitado, telas, serviços, autenticação, autorização, propostas SQL, diagnósticos, testes e documentação anterior. Há alterações locais extensas de outras tarefas, inclusive no painel administrativo, no tratamento do teclado e nos fluxos de parceiro. O código atual foi tratado como referência de comportamento; essas alterações foram preservadas.

Uma tentativa de leitura de metadados públicos da API Supabase retornou HTTP 401. Não foram chamados endpoints de mutação, RPCs operacionais ou consultas de dados pessoais. Não foi executado SQL. Portanto, este relatório distingue três fontes de evidência:

- **Código atual:** comportamento implementado no checkout, inclusive alterações locais.
- **SQL proposto:** contratos em arquivos locais bloqueados, cuja instalação não foi comprovada.
- **Relatos anteriores:** resultados informados em 09/11/2026, que precisam de confirmação atual antes de uma implantação.

`npm test` foi executado como referência: **289 testes passaram, zero falhas**. Isso valida a suíte local existente, não a autorização real no Supabase. Nenhuma validação visual do painel foi realizada nesta execução. Expo Doctor e bundle Android não foram repetidos porque a entrega altera somente documentação.

## 2. Funcionalidades existentes e lacunas

### 2.1 Solicitações de parceria

Fontes principais: `src/screens/PainelAdminScreen.js`, `src/services/adminService.js`, `src/services/partnerAccessService.js`.

Implementado:

- Entrada protegida por `AccessGate role="admin"` e navegação condicionada ao papel administrativo.
- Abas internas **Revisão**, **Pendentes** e **Histórico**. Elas pertencem ao fluxo de solicitações, não são módulos administrativos independentes.
- Listagem via `listar_solicitacoes_admin`, atualização manual, pull-to-refresh, carregamento, erro e nova tentativa.
- Consulta de contato e estabelecimento; ações para abrir telefone/e-mail.
- Encaminhamento para decisão com observação, aprovação/rejeição com justificativa e confirmação antes da decisão.
- Aprovação condicionada, na interface, a usuário vinculado, ID positivo de local existente, identidade confirmada e duplicidade revisada.
- Histórico com detalhes da decisão, responsável e data obtidos por RPC.
- Uso dos componentes compartilhados de teclado e de largura de conteúdo, mantendo a identidade visual atual.

Lacunas:

- Pesquisa, paginação, filtros adicionais e atualização ao voltar à tela.
- Seleção de local por consulta verificável; hoje o administrador informa manualmente um ID numérico.
- Controle de respostas assíncronas: a resposta de detalhes da solicitação A pode chegar após a seleção de B e sobrescrever o detalhe. O fluxo precisa descartar respostas obsoletas e isolar carregamento/erro por seleção.
- Testes específicos da tela e dos contratos comerciais de `adminService`.
- Comprovação de validação, transação, concorrência, idempotência e trilha de auditoria das RPCs comerciais no banco.
- Histórico administrativo transversal: o histórico de decisões de parceria não cobre alterações em locais, campanhas e acessos.

Contratos em uso:

| Operação atual | RPC chamada | Evidência SQL local |
| --- | --- | --- |
| Listar solicitações | `listar_solicitacoes_admin` | Existe na proposta de hardening; instalação não confirmada |
| Encaminhar para decisão | `encaminhar_solicitacao_decisao` | Definição não localizada |
| Decidir parceria | `decidir_solicitacao_comercial` | Definição não localizada |
| Consultar decisão | `obter_detalhe_decisao_admin` | Definição não localizada |

Há também os contratos `revisar_parceria_segura` e `decidir_parceria_segura` em `partnerAccessService`, exportados por `adminService`. A proposta correspondente tem revisão temporária, snapshot, bloqueios e decisão auditada, mas esse não é o fluxo chamado pela interface atual. Não se deve substituir o fluxo funcional ou manter dois caminhos concorrentes sem primeiro revisar o backend dos contratos comerciais.

Outra incompatibilidade a resolver: o envio atual de solicitação inclui `telefone`; a lista de colunas de inserção da proposta de hardening não inclui esse campo. Aplicá-la sem reconciliação pode quebrar o cadastro de solicitações.

### 2.2 Gestão de locais

Fontes: `src/services/locaisService.js`, `src/services/parceiroService.js`, `src/utils/partnership.js` e telas de edição do parceiro.

Implementado:

- Leitura pública de locais visíveis, busca e consulta por ID.
- Consulta de locais do proprietário, detalhes, horários e eventos no fluxo de parceiro.
- Atualização limitada no cliente a `nome`, `descricao`, `telefone`, `faixa_preco`, `endereco`, `bairro`, `cidade_uf` e `visivel`.
- Atualização de coordenadas por RPC de parceiro.
- Criação direta e exclusão direta pelo serviço público recusadas com mensagens explicativas.

Falta a área administrativa: listagem incluindo invisíveis, pesquisa/paginação, filtros, responsável, edição autorizada, moderação de visibilidade, arquivamento e histórico.

Cuidados para reaproveitar:

- A listagem pública força `visivel=true`; não serve como listagem administrativa.
- As consultas e escritas de parceiro pressupõem propriedade. Um `admin` não é automaticamente `parceiro` no modelo atual.
- A proposta RLS concede atualização de locais ao parceiro aprovado proprietário, não cria um caminho de edição administrativa genérica.
- `visivel=false` não equivale a bloqueio administrativo: o parceiro também pode editar esse campo no modelo proposto. É necessário distinguir preferência de publicação do parceiro de restrição administrativa persistente.
- A gravação de horários usa DELETE e INSERT separados. Se essa operação integrar uma edição administrativa, precisa de transação no servidor para evitar perda parcial.
- A busca pública interpola texto no filtro PostgREST. Uma busca administrativa deve validar/escapar a sintaxe ou usar parâmetros de função; isso não é evidência de injeção SQL executável.

O mapa de dependências deve conferir as FKs e suas ações reais para favoritos, categorias de locais, horários, eventos, campanhas, métricas, cardápio, fotos/Storage, vínculos de solicitações e as duas tabelas de avaliações. Uma busca no código não certifica relacionamentos e consumidores externos.

**Decisão proposta:** implementar exclusão lógica/arquivamento, com justificativa, responsável e histórico. Não oferecer exclusão física nesta primeira versão. Exclusão física futura depende de análise de relacionamentos e autorização explícita; nenhuma cascata será presumida.

### 2.3 Gestão de campanhas

Fontes: `src/screens/ImpulsionarScreen.js`, `src/services/partnerAccessService.js`, `src/services/parceiroService.js` e proposta de hardening.

Implementado:

- Consulta de ofertas do servidor e solicitação de campanha por `solicitar_campanha_segura`.
- O payload de criação não envia preço, status, datas de ativação ou identidade do administrador. Ofertas e condições são responsabilidade do servidor.
- Consulta de campanhas e métricas por local no fluxo de parceiro.
- Serviço `ativar_campanha_segura`, sem botão administrativo atual.
- Consulta pública de destaques ativos por RPC.

Na proposta SQL, a criação gera rascunho e a ativação exige administrador, proprietário aprovado, local visível, bloqueio de linha, auditoria na mesma transação e vigência calculada no servidor. Retry reconhecido não reinicia a vigência. Isso é reaproveitável após confirmação do contrato instalado.

Faltam listagem administrativa, detalhes, aprovação/rejeição da campanha com justificativa, pausa, retomada, encerramento e histórico. A aprovação de uma parceria não deve ser confundida com aprovação individual de todas as suas campanhas.

Os metadados relatados em 09/11 indicavam `ativa`, `pausada`, `finalizada`, default `ativa`, e datas obrigatórias com defaults. A proposta local acrescenta `rascunho`, muda o default e permite datas nulas em rascunhos, sem regravar o legado. Não se deve apresentar esses ajustes como já implantados.

O trigger proposto só permite a transição nova `rascunho -> ativa`. Pausa, retomada e encerramento exigem evolução coordenada do trigger e dos endpoints; adicionar botões isolados não basta. A auditoria proposta também limita a uma ativação por campanha, portanto retomada precisa de ação própria, preservando a ativação original.

Métricas: `metricas_locais` contém totais por local/data, não comprova atribuição por campanha. O significado de `alcance` precisa ser confirmado. As telas atuais de estatísticas/painel do parceiro ainda possuem séries e percentuais de demonstração/fallback; a utilidade `partnerMetrics.js` não torna esses dados reais por si só. A área administrativa deve usar apenas métricas persistidas identificáveis, com estados de indisponibilidade e ausência de dados, sem inventar ROI, perfis demográficos ou resultados de campanha.

A Home também possui destaques de fallback ilustrativos. Eles não criam campanhas no banco e não comprovam autorização administrativa. Na RA-14, deve-se verificar o contrato de publicação para que conteúdo ilustrativo não seja apresentado como campanha aprovada.

### 2.4 Gestão de administradores

Fontes: `src/utils/permissions.js`, `src/services/profileService.js`, `src/contexts/AuthContext.js`, `src/utils/navigation.js` e `AccessGate`.

O aplicativo reconhece somente `usuario`, `parceiro` e `admin`. O papel é consultado de `user_roles`, não inferido de e-mail, metadados do Auth, plano ou propriedade de local. O contexto verifica correspondência de usuário/sessão e descarta respostas antigas de perfil. São controles existentes a preservar.

Não há níveis administrativos, lista de administradores, editor de permissões, concessão/revogação normal ou proteção implementada no aplicativo contra remoção do último administrador de recuperação. Adicionar literalmente um papel `superadmin` quebraria a normalização atual, que rejeita valores desconhecidos.

A proposta `user_roles` restringe leitura ao próprio usuário e não concede escrita ao cliente. É uma base adequada, mas não implementa os novos recursos. O script `supabase/operations/primeiro_admin_guarded.sql` é manutenção privilegiada, bloqueada, com identificação e justificativa explícitas; recusa a operação quando já existe administrador. Não substitui uma gestão de acessos nem deve ser exposto como endpoint do aplicativo.

## 3. Segurança: achados e prioridade

| Prioridade | Achado | Consequência e encaminhamento |
| --- | --- | --- |
| Bloqueador | SQL das três RPCs comerciais não versionado | Não é possível certificar autorização, atomicidade e auditoria. Obter definições, ACLs e dependências antes de expandir operações |
| Bloqueador | Banco ativo não certificado; propostas bloqueadas | Validar inventário atual. Não presumir que RLS/grants/SECURITY DEFINER locais estejam instalados |
| Alta | Ausência de níveis e de proteção do último administrador de recuperação | Definir capacidades e invariantes no backend antes de permitir gestão de acesso |
| Alta | Visibilidade editável pelo parceiro não representa moderação | Criar estado administrativo independente e impedir sua reversão por escrita de parceiro |
| Alta | Publicação proposta filtra campanha ativa/vigente e parceiro aprovado, mas não exige decisão individual/auditoria da campanha legada | Revisar campanhas legadas e condição de publicação; não aprovar ou migrar todas automaticamente |
| Alta | Transições de campanhas incompletas | Evoluir RPC, trigger, auditoria e publicação juntos, sem liberar UPDATE direto |
| Média | Respostas de detalhe sem descarte de requisição obsoleta | Evitar exibir ou decidir com detalhes de outra solicitação |
| Média | Marcadores `BACKEND_READINESS=false` sem consumo nos fluxos atuais | Não constituem proteção efetiva. Usar contratos comprovados e disponibilidade por seção/ação |
| Média | Fallbacks demonstrativos de métricas | Não reutilizar números fictícios como evidência administrativa |
| Média | Erros do backend podem chegar diretamente à interface | Padronizar mensagens públicas e correlação técnica sem expor detalhes internos |

Relatórios antigos registram grants amplos, tabelas sem RLS e view pública com permissões inadequadas. São riscos históricos a reconferir, não vulnerabilidades cuja permanência foi demonstrada nesta execução. O relatório de fechamento de 09/11 atualiza pontos anteriores, incluindo duas fontes independentes de avaliações; não se deve misturá-las ou reabrir diagnósticos já corrigidos sem evidência nova.

Não foi encontrada utilização de `service_role` no código de `src` examinado; a configuração do cliente usa URL e chave pública. Isso não equivale a auditoria integral de todos os segredos do ambiente. A solução proposta não precisa de credencial privilegiada no aplicativo.

`AccessGate` e botões ocultos são controles de apresentação. Toda leitura privilegiada e mutação deve conferir a identidade e capacidade atuais no servidor. Revogação precisa valer na próxima operação, mesmo com uma tela aberta e dados de papel em cache.

## 4. Banco: o que reutilizar, confirmar e acrescentar

### 4.1 Inventário antes de qualquer migração

Reutilizar os diagnósticos somente de leitura existentes:

- `supabase/diagnostics/partner_hardening_review/01_estrutura_constraints.sql`
- `supabase/diagnostics/partner_hardening_review/02_grants_rls.sql`
- `supabase/diagnostics/partner_hardening_review/03_funcoes_triggers_acessos.sql`
- `supabase/diagnostics/partner_hardening_review/04_legado_duplicacoes.sql`
- Diagnósticos de inventário de segurança, constraints/view e ciclo de campanhas em `supabase/diagnostics`.

Confirmar tabelas/colunas/tipos, FKs e ON DELETE, índices, constraints, todos os grants efetivos e herdados, RLS permissiva/restritiva, funções/overloads/EXECUTE/search_path, triggers, views e schemas expostos. Revisar também os caminhos antigos que poderiam contornar um endpoint novo. O diagnóstico de funções traz metadados/hash, não substitui revisão segura do corpo das três RPCs comerciais ausentes do repositório.

As quatro migrações locais `20261109000100`, `00150`, `00175` e `00200` têm travas intencionais. A proposta de hardening rejeita certos contratos preexistentes; um banco que evoluiu pode exigir migração incremental diferente. Não remover travas e executar a sequência antiga sem reconciliar o catálogo. A etapa da view pode restringir temporariamente leituras privadas e exige corte coordenado se essa estratégia for mantida.

### 4.2 Estruturas e políticas por domínio

| Domínio | Reutilização/estado conhecido localmente | Complemento necessário, sujeito ao catálogo e à aprovação |
| --- | --- | --- |
| Papéis | `user_roles`, `usuarios`, identidade de `auth.users`; fundação SQL proposta | Capacidades administrativas e nível de recuperação, enumeração autorizada e concessão/revogação segura |
| Solicitações | `solicitacoes_parceria`; contratos atuais comerciais e alternativos seguros | Reconciliar um contrato canônico; versionamento/concorrência, vínculo verificável, contato e paginação |
| Locais | `locais` e relações existentes | Estado de moderação/arquivamento, versão e responsáveis; leitura e escrita administrativa controladas |
| Campanhas | `campanhas`; ofertas/ativação no serviço e na proposta | Revisão individual, transições auditadas, consulta administrativa e publicação condicionada à autorização |
| Auditoria | `roleapp_admin_audit` na proposta | Reutilizar se instalada; expandir ações de locais, campanhas e acessos sem destruir histórico |
| Estruturas privadas | Propostas `partnership_reviews`, `request_local_links`, `campaign_offers`, `feature_flags`, `metric_receipts` em `roleapp_security` | Confirmar necessidade/instalação antes de criar. Não duplicar estruturas que já atendam ao contrato |

Nomes novos abaixo são **contratos candidatos**, não funções existentes nem SQL autorizado:

- Permissões: `obter_minhas_permissoes_admin`.
- Locais: `listar_locais_admin`, `obter_local_admin`, `editar_local_admin`, `definir_visibilidade_local_admin`, `arquivar_local_admin`; recuperação de arquivamento pode integrar o mesmo contrato controlado.
- Histórico: consulta paginada de auditoria por alvo/ação/período, com autorização apropriada.
- Campanhas: `listar_campanhas_admin`, `decidir_campanha_admin`, `pausar_campanha_admin`, `retomar_campanha_admin`, `encerrar_campanha_admin`; adaptar `ativar_campanha_segura` em vez de duplicá-la.
- Acessos: `listar_administradores`, `conceder_acesso_admin`, `revogar_acesso_admin`.

Exigências transversais:

1. RLS e privilégios mínimos; ausência de acesso anônimo a dados administrativos. Escrita sensível somente pelo caminho seguro, sem INSERT/UPDATE/DELETE genérico liberado ao cliente.
2. Funções privilegiadas apenas quando necessárias, com `search_path` seguro, referências qualificadas e EXECUTE restrito. `authenticated` poder chamar uma RPC não dispensa a conferência de capacidade no seu corpo.
3. Ator derivado de `auth.uid()` e permissões consultadas no banco. Nunca confiar em papel, responsável ou autorização enviados no payload.
4. Bloqueios/versionamento, idempotência de decisões e alteração + auditoria na mesma transação. Falha no registro de auditoria deve reverter a operação.
5. Auditoria não editável pelo aplicativo: ação, alvo, ator, instante do servidor, justificativa, versão/correlação e alterações anteriores/posteriores de campos permitidos. Não registrar tokens ou perfis completos sem necessidade.
6. Schema privado não exposto pela API. Proteger também views, helpers, overloads e endpoints antigos; uma política permissiva adicional pode ampliar acesso apesar de uma política nova restrita.
7. Pesquisa paginada e limites no servidor. Nenhuma exportação ampla de dados de responsáveis para simples seleção de local.

## 5. Organização de telas proposta

Manter uma entrada **Painel Administrativo** e quatro seções: **Solicitações | Locais | Campanhas | Administradores**.

- Em celular, navegação horizontal acessível entre seções; em tablet, aproveitar a largura para lista e detalhe quando houver espaço, mantendo os mesmos componentes e lógica.
- Solicitações conserva Revisão/Pendentes/Histórico como filtros internos. Preservar justificativas, confirmações, contato e histórico existentes.
- Locais oferece busca, filtros de situação/visibilidade, lista, detalhe do responsável, edição permitida, ação de visibilidade e arquivamento com resumo do impacto.
- Campanhas oferece filtros de revisão/execução, local responsável, conteúdo, vigência, decisão motivada, ações compatíveis com o estado e métricas efetivamente disponíveis.
- Administradores mostra acesso e permissões; ações de concessão/revogação aparecem apenas para capacidade apropriada. A proteção real permanece no servidor.

Reutilizar componentes de teclado, áreas seguras, largura máxima, cores, botões e mensagens. Lista virtualizada/paginada, seleção estável, descarte de respostas antigas e atualização ao retornar são comportamentos comuns. Extrair componentes compartilhados conforme os módulos forem implementados, evitando uma reescrita antecipada do painel inteiro.

Cada seção terá estados de carregamento, vazio, erro/repetir, acesso negado e contrato indisponível. Indisponibilidade de um módulo novo não deve bloquear solicitações já funcionais. Após timeout de uma mutação, reconciliar pelo servidor antes de anunciar sucesso ou repetir cegamente. Confirmações sensíveis devem mostrar alvo e consequência; confirmação visual não substitui validação transacional.

## 6. Plano de implementação

### RA-11 — Contratos, autorização e estrutura do painel

**Objetivo:** estabelecer uma base verificável sem recriar solicitações.

- Atualizar inventário do banco e versionar, de forma revisada, as definições dos contratos comerciais em uso.
- Escolher o contrato canônico de parceria a partir das implementações reais e reconciliar telefone, IDs, decisões e auditoria.
- Definir matriz de capacidades, modelo de recuperação e trilha de auditoria compartilhada; preparar somente as mudanças necessárias à base.
- Organizar as quatro seções com disponibilidade independente, preservando solicitações existentes. Novas operações permanecem indisponíveis até seu backend ser validado.
- Preparar migrações incrementais revisáveis e testes em clone autorizado, sem aplicar SQL em produção nesta etapa automaticamente.

**Aceite:** contratos documentados e testados, matriz de acesso explícita, navegação preservada e ausência de regressão nos fluxos validados. Definição de privilégios superiores não eleva automaticamente administradores existentes.

### RA-12 — Consolidar solicitações de parceria

**Objetivo:** completar o fluxo existente e torná-lo verificável.

- Adicionar busca, paginação e atualização ao retornar, preservando abas, seleção e justificativas quando apropriado.
- Corrigir respostas obsoletas e estados de erro/decisão em andamento.
- Substituir digitação isolada de ID por seleção de candidato real com dados suficientes para conferir responsável, identidade e duplicidade.
- Garantir no backend a transição válida, vínculo, versão, idempotência e auditoria; reaproveitar a RPC comercial se atender aos requisitos.
- Criação de local durante decisão somente se o contrato aprovado já contemplar esse caminho, sem inventar dados ou atribuir proprietários automaticamente.

**Testes:** revisão/encaminhamento/aprovação/rejeição, erro e retry, seleção rápida A/B, decisão concorrente entre administradores, IDs inválidos, falta de identidade/vínculo, acesso revogado e decisão repetida sem duplicação.

**Aceite:** o fluxo atual permanece funcional e decisões não criam vínculos incorretos nem histórico duplicado.

### RA-13 — Gestão administrativa de locais

**Objetivo:** consultar e moderar locais com segurança.

- Listagem administrativa paginada, busca e filtros de status/visibilidade; detalhe do local e responsável com exposição mínima de dados.
- Edição por allowlist validada no servidor, com versão e auditoria. Não conceder troca de proprietário por atualização genérica.
- Separar publicação do parceiro de bloqueio administrativo; proprietário não pode remover restrição de moderação.
- Implementar arquivamento lógico com justificativa, confirmação e histórico. Não implementar exclusão física nesta versão.
- Conferir impactos em consultas públicas, mapa, favoritos, detalhes e publicação de campanhas. Definir o tratamento das campanhas relacionadas sem alterar automaticamente períodos ou condições comerciais.
- Se não houver contrato transacional para uma consequência necessária, manter a ação correspondente indisponível até resolvê-la; não arquivar deixando publicação incoerente.

**Testes:** locais invisíveis, busca e paginação, edição proibida, concorrência, parceiro tentando reverter bloqueio, auditoria obrigatória, relações preservadas e ausência de publicação do arquivado.

**Aceite:** dados relacionados permanecem íntegros e todas as alterações administrativas são rastreáveis.

### RA-14 — Gestão e ciclo de campanhas

**Objetivo:** administrar revisão, publicação e execução sem criar regras financeiras.

- Listar campanhas com local/responsável, filtros, conteúdo, vigência e métricas comprovadas.
- Separar revisão (`pendente`, `aprovada`, `rejeitada`) de execução (`rascunho`, `ativa`, `pausada`, `finalizada`) por estrutura compatível com o banco. Os nomes/modelo finais dependem do inventário; não supor que os seis estados pedidos caibam no CHECK atual.
- Definir qual ação envia um rascunho para revisão; não tratar todo rascunho automaticamente como solicitação pendente.
- Aprovar/rejeitar com motivo; aprovação não ativa automaticamente. Ativação exige capacidade administrativa atual, aprovação individual, local apto, propriedade autorizada e período válido.
- Evoluir RPCs, trigger, auditoria e publicação conjuntamente para pausar, retomar e encerrar. Retomada não reinicia automaticamente vigência nem orçamento; a regra precisa de revisão explícita.
- Usar relógio do servidor. Expiração deve impedir publicação mesmo antes de eventual rotina de encerramento atualizar o status. Não presumir que um agendador já exista.
- Rever campanhas legadas individualmente, sem aprovar em massa, reescrever datas históricas ou inventar pagamento/preço/plano.

**Testes:** todas as transições permitidas/proibidas, ausência de autorização individual, parceiro/anônimo sem ativação, vigência e limites, retry sem extensão, pausa/retomada, expiração, falha de auditoria, local bloqueado e métricas ausentes/erro.

**Aceite:** nenhuma campanha é publicada por simples escrita de status ou aprovação da parceria; os controles novos também cobrem o legado e os leitores públicos.

### RA-15 — Gestão de acessos administrativos

**Objetivo:** permitir consulta e concessão/revogação dentro de uma hierarquia segura.

- Manter `user_roles.role='admin'` como entrada compatível e representar nível/capacidades em estrutura administrativa protegida, se o catálogo não possuir equivalente.
- Propor níveis de operador e recuperação, com nomes e matriz aprovados. Capacidades podem separar leitura/decisão de solicitações, edição/moderação/arquivamento de locais, moderação/ativação de campanhas e gestão de administradores.
- Listar administradores e permissões; conceder/revogar somente mediante capacidade apropriada, justificativa e auditoria.
- O servidor impede concessão superior às próprias permissões e revalida a autorização a cada operação.
- Serializar concessões/revogações e proteger o último acesso ativo de recuperação em todas as rotas de alteração. Duas revogações concorrentes não podem deixar o sistema sem recuperação.
- Tratar autorrevogação/rebaixamento e acessos já revogados; não implementar exclusão de conta Auth como gestão de papel.
- Definir restauração do papel anterior: `user_roles` hoje tem um único papel por usuário. Revogar admin não pode conceder `parceiro` por suposição; exigir evidência de vínculo/aprovação quando aplicável.
- Provisionar o primeiro nível de recuperação por procedimento de manutenção explicitamente autorizado, sem credencial privilegiada no aplicativo e sem promoção automática por e-mail.

**Testes:** operador sem delegação, tentativa de elevação por payload, administrador revogado com tela aberta, último recuperador, duas revogações simultâneas, papéis anteriores e falha de auditoria com rollback.

**Aceite:** toda alteração tem responsável e motivo; nenhum caminho normal remove a última capacidade de recuperação.

## 7. Ordem e validação de cada entrega

Ordem recomendada: **RA-11 → RA-12 → RA-13 → RA-14 → RA-15**. A arquitetura de recuperação e as capacidades são definidas na RA-11, mesmo que sua interface de gestão só chegue na RA-15. Assim, a ampliação de operações já nasce sob o modelo de autorização correto.

Para cada módulo:

1. Revisar o contrato e o SQL necessário, com efeitos sobre dados existentes e procedimento de recuperação.
2. Testar em clone/ambiente isolado autorizado. As fixtures SQL existentes criam usuários/dados mesmo usando rollback; não devem ser executadas contra produção.
3. Testar por API com identidades reais de teste: anônimo, usuário, parceiro A/B, administrador operador/recuperação e administrador revogado. Conferir leitura, escrita, RPCs, grants efetivos, concorrência em conexões separadas e caminhos antigos.
4. Pedir aprovação explícita antes de qualquer SQL de alteração no Supabase de destino. Testar em clone não autoriza alterar produção.
5. Executar testes automatizados do módulo e regressões; `npm test`, Expo Doctor, bundle Android e `git diff --check` nas entregas de código.
6. Validar a Development Build no Samsung SM-X210 antes de liberar o módulo seguinte.

Roteiro manual futuro no SM-X210:

- Entrar como administrador de teste autorizado e como usuário sem acesso; conferir entrada, quatro seções e bloqueios reais.
- Solicitações: pesquisar, atualizar, abrir itens rapidamente, revisar e decidir somente fixtures; conferir responsável/histórico sem duplicação.
- Locais: buscar visível/invisível, editar campo permitido, moderar e arquivar apenas fixtures; confirmar que o parceiro não desfaz a moderação e que público/mapa/favoritos respeitam a restrição.
- Campanhas: revisar, aprovar/rejeitar, ativar/pausar/retomar conforme contratos aprovados; conferir período e publicação, sem campanhas ou métricas fictícias.
- Administradores: consultar e testar concessão/revogação somente em ambiente isolado com recuperação garantida; testar concorrência por API. Não arriscar o último administrador real no dispositivo.
- Em cada seção, verificar tablet retrato/paisagem, fontes ampliadas, listas extensas, campos com teclado, confirmação, voltar da tela e perda de conexão. Preservar a Development Build, sem alterar dependências ou configurações nativas por conveniência.

## 8. Entrega desta execução

- Acrescentado somente este documento de auditoria e plano.
- Código funcional, dependências, configurações Android, dados e políticas do Supabase preservados.
- Testes locais: **289 aprovados, zero falhas**; não comprovam execução das propostas SQL.
- `git diff --check`: sem erros de whitespace nas alterações rastreadas; o documento novo também foi conferido separadamente.
- Pendência principal: inventário atual e definições das RPCs comerciais para concluir a certificação do backend na RA-11.
- Nenhum módulo novo implementado, SQL de alteração executado, dado real excluído, commit ou push realizado.
