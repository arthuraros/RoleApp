# Proposta de implementação — perfis, parcerias e administração

Status: para revisão. Não constitui autorização de execução. Nenhuma migração nova de negócio foi criada ou aplicada nesta preparação.

## Regras centrais

- usuario, parceiro e admin são papéis da aplicação em user_roles; não são papéis PostgreSQL nem metadados editáveis do Auth.
- Solicitação pendente não concede acesso de parceiro nem cria local. Administrador não perde seu papel ao aprovar uma parceria própria/de outra conta; aprovação concede no máximo parceiro e preserva admin existente.
- visivel é publicação do estabelecimento, separado de aprovação de parceria. A aprovação cria um novo local invisível, salvo decisão explícita distinta de vinculação de local existente.
- Papel desconhecido, ausente ou consulta indisponível não concede privilégio. RLS/grants no banco são a autoridade; flags de navegação são apenas apresentação.
- Usuário comum mantém Início, Favoritos, Mapa e Perfil. Parceiro aprovado ganha Meus Lugares. Admin acessa painel administrativo por rota protegida; não ganha automaticamente propriedade de locais.

## Matriz proposta para as quatro tabelas com RLS desligada

Todas exigem habilitação de RLS, revisão dos grants e substituição das políticas amplas aplicáveis na mesma mudança transacional, após inventário. Nomes exatos a remover serão definidos pelo relatório; não remover políticas por padrão de nome ou com exclusão genérica.

### solicitacoes_parceria

| Operação | Permissão proposta |
| --- | --- |
| SELECT | Usuário autenticado consulta próprias solicitações; admin consulta todas |
| INSERT | Apenas autenticado, id_usuario = auth.uid(), status = pendente e campos administrativos vazios |
| UPDATE direto | Nenhum cliente, inclusive admin; decisão somente por RPC validada |
| DELETE direto | Nenhum cliente; preservar histórico |

Preferir id_usuario derivado da sessão na operação de criação; manter WITH CHECK no banco para qualquer inserção direta permitida. Conceder INSERT apenas nas colunas do formulário/identidade necessárias, sem permitir campos de decisão. Atualização de status, ator e data é exclusiva da função administrativa. Defaults não substituem proteção de colunas.

Definir explicitamente reenvio após rejeição e múltiplos estabelecimentos. Não impor unicidade de uma solicitação pendente por usuário antes de inventariar duplicações e aprovar essa regra, pois um parceiro pode solicitar outro local. Prever chave de idempotência por envio para evitar duplicações de rede; novos campos devem aceitar histórico legado e só exigir valores nas novas operações.

### eventos_locais

| Operação | Permissão proposta |
| --- | --- |
| SELECT público | Somente evento ativo de local visivel; limitar campos publicados |
| SELECT privado | Parceiro aprovado lê eventos de seus locais, inclusive inativos; admin lê para moderação |
| INSERT/UPDATE/DELETE parceiro | Apenas em local próprio, com papel confirmado e integridade do vínculo |
| Moderação admin | Operação específica, autorizada e auditada |

UPDATE usa USING para a linha atual e WITH CHECK para a linha resultante. Não permitir mover id_local para local de terceiro nem editar campo de moderação. Restringir colunas e revisar FK/índices. Não conceder escrita genérica de todas as colunas ao admin só para viabilizar a UI.

### campanhas_impulsionamento

| Operação | Permissão proposta |
| --- | --- |
| Leitura pública | Apenas projeção publicável de campanhas ativas, dentro da vigência e de locais visíveis |
| SELECT completo | Proprietário aprovado lê próprias campanhas; admin lê para operação |
| Criar/editar pelo parceiro | Operação controlada de rascunho/solicitação, sem definir ativação, cobrança ou alcance |
| Ativar/cancelar/alterar condições | Fluxo confiável validado e auditado; pagamento, se existir, confirmado no servidor |

RLS não oculta colunas. A Home e o mapa devem usar uma projeção com campos publicáveis, sem dados financeiros/segmentação do parceiro. Opções para revisão: RPC de leitura SECURITY INVOKER com grants mínimos, ou view security_invoker quando suportada pela versão e pelos grants de coluna. Garantir que a tabela base não exponha os campos omitidos por outra política/grant. Não criar view com bypass implícito de RLS.

Definir se leitura pública será de anon e authenticated ou só authenticated, conforme produto. Hoje o app exige login, mas isso não justifica expor campos privados a todos os autenticados. Preservar vínculo de destaque ao local e impedir campanha sem local retornado de entrar no resultado.

O cliente atual cria status ativa e calcula valor/datas. Isso precisa mudar antes do endurecimento; não perpetuar esse acesso por compatibilidade.

### metricas_locais

| Operação | Permissão proposta |
| --- | --- |
| SELECT de agregados | Parceiro aprovado do local e admin; sem leitura pública dos totais privados |
| INSERT/UPDATE/DELETE direto | Nenhum cliente |
| Registro de interação | Função controlada, sem permissão de sobrescrever contadores |

Revisar incrementar_metrica existente antes de reutilizar. A operação recebe tipo de evento permitido, valida local público, limita incremento e usa data do servidor; não aceitar totais arbitrários ou negativos. Atomicidade exige índice/constraint de unicidade compatível com id_local,data, confirmado no inventário. Limitação de abuso/idempotência e eventual endpoint com rate limiting precisam de desenho explícito: RPC no cliente não torna métricas à prova de fraude.

Remover o fallback de upsert direto do serviço quando a RPC segura estiver disponível. Registro de métricas deve continuar não bloqueante para Home, mapa e detalhes; falha não impede descoberta ou favoritos. Erro deve ter diagnóstico sanitizado sem tokens.

## Proteção das demais tabelas

- locais: leitura pública de visivel = true preservada, inclusive legados sem proprietário; escrita de parceiro somente nos próprios, com USING/WITH CHECK e colunas permitidas. Proprietário, aprovação e campos administrativos ficam protegidos. Bloquear autoatribuição de local sem dono.
- horarios_funcionamento: leitura segue a publicação do local; escrita segue propriedade e papel. Resolver nomes abre/fecha versus horario_abertura/horario_fechamento antes da RPC de criação. Substituir delete+insert separado por atualização transacional quando necessário.
- categorias/local_categorias: preservar leitura usada pelos filtros. Escrita dos vínculos depende do local próprio; definições globais de categorias são administrativas.
- favoritos: SELECT/INSERT/DELETE apenas do próprio usuário; preservar FK e leitura aninhada de locais. Se um local ficar privado, não apagar favorito: a tela omite o local indisponível e permite remover o favorito próprio.
- categorias_cardapio/itens_cardapio: proprietário aprovado lê/gerencia seu local invisível; público lê somente categorias ativas e itens disponíveis de local visível. Impedir troca de id_local e garantir que id_categoria pertença ao mesmo local por constraint/validação confiável, após conferir tipos e dados legados.
- usuarios: substituir leitura geral por leitura própria/admin conforme necessidade real. Não expor email, preferencias ou plano em projeções públicas de autores de avaliações. Verificar joins existentes antes de restringir. Escrita própria só de campos pessoais aprovados; plano não pode ser autopromovido.
- avaliações/Storage: preservar leitura pública necessária e escrita própria. Inventariar os objetos existentes para identificar dependências; não alterar política global de Storage sem necessidade.

Não usar helper que consulta user_roles sob uma política de user_roles que chama o próprio helper, causando recursão. Proposta: leitura própria de user_roles simples; helper interno de autorização mínimo, com dono sem login/privilégios revisados e search_path fixo. SECURITY DEFINER somente onde necessário e com EXECUTE mínimo. Conferir schemas expostos e acessos herdados.

## Cadastro pendente e decisão transacional

1. SejaParceiroScreen envia apenas formulário validado da conta autenticada; apresenta protocolo/estado pendente e não navega para painel.
2. parceiroService não cria local/horários no envio e não ignora erro ao gravar solicitação.
3. Admin consulta fila por serviço específico. API não aceita id do decisor fornecido pelo cliente.
4. RPC obtém auth.uid(), valida admin atual no banco e protege essa autorização contra alteração concorrente durante a operação, com ordem de locks definida.
5. Bloqueia a solicitação com SELECT FOR UPDATE e exige estado pendente. Pedido repetido não cria nova decisão/local: retornar decisão prévia ou conflito definido; não decidir duas vezes.
6. Confirma que solicitante existe, payload é válido e alvo da vinculação foi explicitamente selecionado. Não associar por nome/e-mail.
7. Aprovação: concede parceiro apenas se permitido pelo papel atual, preservando admin; cria local novo invisível e horários válidos OU vincula local existente por operação de regularização. Guardar vínculo explícito solicitação-local (novo campo/tabela conforme tipos reais) para idempotência e rastreabilidade.
8. Rejeição: registra motivo obrigatório; não cria local nem remove uma parceria anterior válida.
9. Atualiza estado/responsável/data, grava auditoria e confirma tudo em uma transação. Qualquer falha reverte papel, local, horários e decisão juntos.

Dados legados com solicitações nulas, duplicadas ou locais já criados exigem análise antes do processamento. Não reaprovar tudo em lote. Não habilitar exclusão física de solicitações pelo app.

## Auditoria e regularização dos três locais

Proposta de tabela de eventos append-only: ID, horário do servidor, ação, ator obtido da sessão, solicitante/alvo, solicitação/local, motivo, correlação/idempotência e diferenças relevantes antes/depois. Tipos dos IDs serão definidos pelo inventário.

Não copiar tokens, credenciais, sessão ou formulário completo para JSON de auditoria. Definir retenção e acesso: admin com SELECT restrito; nenhum cliente com INSERT/UPDATE/DELETE/TRUNCATE. As operações privilegiadas gravam eventos; alterações confiáveis de papel devem ter trigger ou caminho único que impeça lacuna de auditoria. Helpers não podem aceitar ator arbitrário como parâmetro.

Preservar identidade histórica do ator/alvo sem CASCADE destrutivo; combinar identificador histórico com FK nullable ou estratégia de retenção validada. Auditoria no banco não é inviolável para seu dono/superusuário; mudanças extraordinárias e provisionamento inicial exigem processo operacional auditado. Migração não concede admin automaticamente.

Regularização: relatório calculado lista os três locais sem alterar dados. Em etapa futura, fila administrativa pode usar essa consulta, sem gravar uma flag redundante. Admin verifica evidência, bloqueia o local, confere que segue sem proprietário e vincula conta válida por operação dedicada com motivo e auditoria. A concessão de parceria é uma decisão explícita no mesmo fluxo, nunca uma consequência automática de preencher id_proprietario. Manter ID, visibilidade e todas as relações existentes.

## Ordem de implementação e arquivos previstos

| Etapa | Arquivos/objetos previstos | Condição |
| --- | --- | --- |
| A — confirmar inventário | diagnostics/20261109_security_inventory_readonly.sql e diagnóstico | Revisar relatórios completos, sem presumir tipos/políticas |
| B — fundação | migração user_roles existente, ainda bloqueada; futuras migrações de provisionamento/auditoria | Nomes livres, grants/donos e integridade confirmados; sem admin automático |
| C — operações seguras | novas migrações de decisão, regularização e métricas; novo adminService.js | Transações, validações, locks, grants e auditoria testados isoladamente |
| D — adaptar clientes | SejaParceiroScreen.js, parceiroService.js, ImpulsionarScreen.js, EditarLocaisScreen.js | Remover cadastro imediato, autoatribuição, ativação de campanha e upsert de métricas |
| E — proteger acesso | novas migrações de políticas/grants das quatro tabelas e dependências | Substituir políticas reais por nome revisado; app compatível antes da ativação |
| F — UI por perfil | AuthContext.js, permissions.js, navigation.js, CustomTabBar.js, PerfilScreen.js, PainelParceiroScreen.js; nova PainelAdminScreen.js | Sem ampliar acesso por metadados; atualização/revogação de perfil |
| G — validar | testes de serviços/autorização, testes RLS isolados e smoke tests Expo | Todos os casos abaixo aprovados |

GerenciarCardapioScreen.js/cardapioService.js e alterações locais serão preservados e adaptados só se a autorização exigir. HomeScreen/MapaScreen/DetalhesLocalScreen podem precisar ajustar o consumo da projeção de campanhas; não reescrever busca, filtros ou mapa. favoritosService/categoriasService devem manter o contrato de leitura. A lista é previsão para revisão, não alteração realizada.

Aplicar futuras alterações de segurança em transações sem janela de RLS/grants amplos. Coordenar versão compatível do app e endurecimento do banco, com manutenção/janela de corte se necessário. Aplicativos antigos devem receber erro tratado, nunca manter escrita insegura como fallback. Revisar locks/custo de ALTER TABLE e construção/validação de constraints antes do rollout. Não impor NOT NULL/FKs/índices únicos sobre dados legados sem diagnosticar e regularizar.

Rollback: restaurar versão compatível do app e corrigir política de forma restrita; não desligar RLS nem restaurar políticas amplas como recuperação padrão. Preservar papéis/auditoria já gravados e não excluir estruturas automaticamente. Se incompatibilidade impedir o fluxo, suspender a operação afetada até correção.

## Critérios de aceitação antes de aplicar

- Confirmar relatório completo com grants, RLS, constraints, funções/triggers e views. Validar os três locais sem proprietário e ausência de órfãos em snapshot autorizado.
- Contas anon, usuario A/B, parceiro A/B e admin: testar leitura, INSERT, UPDATE, DELETE e tentativas diretas pela API; SQL Editor como dono não é evidência de RLS correta.
- Bloquear solicitação para outro usuário, status aprovado no envio, alteração do decisor, autopromoção e mudança de proprietário/id_local.
- Decisões simultâneas, reenvio de rede e falha de auditoria não deixam duplicação ou transação parcial. Revogação de admin não deixa operação autorizada por flag antiga do cliente.
- Três locais legados preservam IDs, visibilidade e favoritos/cardápio; edição por parceiro é negada até regularização auditada.
- Home/mapa listam locais e destaques elegíveis, filtros de categoria/preço continuam, favoritos privados funcionam e detalhes exibem cardápio público. Parceiro edita somente seu cardápio/local; categorias de terceiros são recusadas.
- Métricas falhas não bloqueiam navegação; RPC não aceita totais arbitrários, data forjada nem alteração de local privado de terceiro. Campanha não é ativada/paga pelo cliente.
- Login senha/Google, recuperação, restauração de sessão, logout/troca de conta e retomada do app não reutilizam privilégios de conta anterior.
- Corrigir separadamente o import interno do Expo que bloqueia a suíte de Auth e os testes legados TU03/TU05 que ainda esperam retorno de locais de terceiros; simular RPC de métricas para testes sem rede. Não reintroduzir fallback inseguro para fazer teste passar.

Referências oficiais: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/functions .
