# Correção baseada no diagnóstico real — 09/11/2026

> Atualização: constraints e definição da view foram fornecidas pelo responsável. A revisão atual, diferença avaliacoes/avaliacoes_locais, proposta bloqueada 00175 e ciclo de datas de rascunho estão em [compatibilidade-view-campanhas-20261109.md](compatibilidade-view-campanhas-20261109.md). Pendências abaixo sobre ausência integral desses resultados são históricas; manifestos de catálogo e permissões das fontes ainda exigem revisão. Nada foi liberado para execução.

Proposta local para revisão. Nenhum SQL foi executado, nenhum dado remoto foi alterado e não houve commit/push. Todas as travas permanecem. Este documento substitui as descrições da implementação nos relatórios anteriores, que ficam como histórico da revisão.

## Evidência e bloqueios

Os resultados são informações fornecidas pelo responsável, não uma inspeção executada pelo Codex. Das 15 tabelas públicas, 11 têm RLS e quatro não: solicitacoes_parceria, eventos_locais, campanhas_impulsionamento e metricas_locais. anon/authenticated têm CRUD nas 15. Não há usuários órfãos de Auth nem proprietários sem Auth; há três locais visíveis sem proprietário (2, 3, 4).

O resumo não inclui as expressões completas dos CHECKs de preço, duração, valor e status, nem a definição da view. A coleta complementar está em [20261109_constraints_e_view_readonly.sql](../supabase/diagnostics/20261109_constraints_e_view_readonly.sql): um bloco READ ONLY, resultado JSON e ROLLBACK. Retorna constraints, tipos, defaults, hashes de políticas/triggers e definição/metadados da view; não retorna corpos de funções. O hash de trigger inclui um digest do corpo para detectar mudanças, sem exibi-lo.

**Qualquer alteração em public.locais_com_avaliacoes está bloqueada até receber e revisar sua definição.** Não há CREATE/ALTER/DROP/GRANT dessa view nas migrações propostas. A migração principal exige sua definição revisada exata, security_invoker e revisão do filtro público; portanto também se recusa a prosseguir enquanto a dependência não estiver resolvida em revisão separada. O app atual não consulta essa view, mas ela permanece uma possível via alternativa de leitura da API.

Os manifestos de políticas/triggers, revisão de outras funções/regras/views e confirmação de que roleapp_security não está nos schemas expostos pela API estão deliberadamente vazios/falsos. As exceções incondicionais são a primeira barreira; preencher manifestos não autoriza execução nem remove as travas.

## Alterações SQL propostas

| Arquivo | Proposta e dependências |
| --- | --- |
| 20261109000100_user_roles_foundation.sql | Fundação anterior preservada. Papéis usuario/parceiro/admin em tabela confiável ligada a Auth. Nenhuma concessão automática de admin, promoção pelo cadastro ou backfill de parceiros. |
| 20261109000150_campaign_draft_status.sql | Novo rascunho bloqueado. Só expande o CHECK puro de status, após conferir nome/definição exatos. Mantém ativa/pausada/finalizada e acrescenta rascunho. Recusa enum/domínio/regras combinadas ou múltiplas regras sem revisão específica. Outros CHECKs permanecem intactos. |
| 20261109000200_partner_access_hardening.sql | Revisada para contratos reais, aprovação explícita, fechamento de caminhos alternativos, RLS/grants coordenados e auditoria. Não faz limpeza nem vinculação dos dados legados. |
| operations/primeiro_admin_guarded.sql | Procedimento de manutenção bloqueado, sem RPC e sem credencial privilegiada no app. Exige UUID existente em Auth/usuarios, justificativa/ticket e operador verificado; recusa se já existir admin. Concessão e auditoria são transacionais. |

A migração principal substitui integralmente as políticas das **13 tabelas explicitamente listadas**, apenas após conferir seus snapshots revisados. Isso evita manter permissivas antigas combinadas com OR e inclui as dependências necessárias a favoritos, avaliações, filtros e cardápio. Não se assume que as políticas anteriores são suficientes para editar locais/horários.

| Recurso | Leitura proposta | Escrita de cliente proposta |
| --- | --- | --- |
| usuarios | Própria conta ou admin; sem leitura geral de e-mail/preferências | Próprio nome/foto/preferências; sem email/plano/papel/identidade. Perfil continua criado pelo trigger de Auth. |
| solicitações | Próprias ou admin | INSERT próprio e pendente. Nenhum UPDATE/DELETE direto, inclusive admin. |
| locais | Visíveis; ou próprios do parceiro aprovado; ou admin | Parceiro aprovado atualiza campos comerciais permitidos do próprio local. Sem alteração de ID/proprietário. Nenhum INSERT/DELETE direto, inclusive admin. |
| horários/eventos | Dados públicos do local visível (eventos ativos); próprios do parceiro aprovado; admin | Parceiro aprovado do local; UPDATE não muda id_local. DELETE/INSERT de horários existentes continua permitido para seu proprietário aprovado. |
| campanhas | Próprias do parceiro aprovado ou admin | Sem escrita direta. RPC cria somente rascunho, orçamento/duração vindos de oferta aprovada no servidor. |
| métricas | Próprias do parceiro aprovado ou admin | Sem escrita direta. RPC unitária, inicialmente desabilitada por configuração privada. |
| categorias/cardápio | Dados públicos vinculados a local visível; próprios do parceiro aprovado; admin | Categorias e itens só do parceiro aprovado proprietário; item não pode apontar para categoria de outro local. |
| favoritos | Apenas do próprio usuário | Criar para local público e excluir próprio favorito; mantém vínculos antigos. |
| avaliações | Públicas de local visível; próprias do autor; proprietário aprovado/admin | Próprio autor em local público; identidade/local imutáveis, inclusive no upsert. |
| auditoria | Admin | Sem INSERT/UPDATE/DELETE do cliente. |

São revogados privilégios administrativos TRUNCATE/REFERENCES/TRIGGER das tabelas públicas, incluindo REFERENCES por coluna; sequências perdem privilégios de clientes e recebem apenas USAGE onde há INSERT legítimo. Não há UPDATE de sequência/setval. O postflight verifica privilégios efetivos/herdados e propriedade, CREATE nos schemas e EXECUTE das funções novas. As duas tabelas públicas fora do conjunto de substituição ainda exigem revisão própria de seus CRUD/RLS; não foram certificadas como seguras pelo simples total de 15 tabelas.

Nenhum comando recria ou altera auth.users -> ao_criar_usuario -> criar_perfil_usuario(). Suas permissões e efeitos devem ser confirmados no clone com cadastro real e criação de perfil, sem conceder INSERT amplo em usuarios para contornar falhas.

## Aprovação, duplicações e concorrência

O Painel Administrativo é a interface funcional de aprovação. A presença da tela não autoriza uma operação: todas as RPCs verificam o papel admin diretamente no banco, não em metadata, e-mail, parâmetros ou flags do cliente.

1. listar_solicitacoes_admin permite listagem privada somente a admin.
2. revisar_parceria_segura captura solicitação, candidatos e pedidos relacionados. Emite revisão ligada ao administrador, com validade de 15 minutos; nenhum local é escolhido automaticamente.
3. decidir_parceria_segura exige revisão, justificativa e ação explícita: vincular_existente, criar_novo ou bloquear (em_analise). Rejeição usa nenhuma. Status reais: pendente/em_analise/aprovado/rejeitado.
4. Vincular exige candidato da revisão e proprietário vazio ou o próprio solicitante. Nunca toma local de terceiro. Criar exige ausência de candidatos/pedidos relacionados ativos e dados de endereço/preços confirmados; não usa endereço ou preço inventado. Confirmar identidade e duplicações é obrigatório para aprovação.
5. Lock transacional global, locks das linhas e nova comparação do snapshot impedem decisões com revisão desatualizada. As RPCs exigem READ COMMITTED para obter snapshots após o lock. Alterações de locais/solicitações usam a mesma ordem de serialização por trigger de statement.
6. Revisão consumida com a mesma entrada retorna o resultado anterior; outra entrada falha. Mapa privado de origem/local/chave comercial e unicidade da auditoria impedem aprovar outra solicitação para o mesmo vínculo já registrado. Não há retry automático com decisão diferente.
7. Papel (preservando admin), local, solicitação, mapa de origem, revisão consumida e auditoria são conferidos ao final da transação. Qualquer falha reverte tudo, inclusive criação de local e promoção.

A serialização global é conservadora e pode limitar throughput; exige teste de contenção/deadlock com triggers reais antes de liberação. O mecanismo não identifica semanticamente todos os negócios repetidos: homônimos, grafias diferentes ou proprietários diferentes exigem evidência e revisão humana. A regra conservadora considera também outros locais do mesmo proprietário candidatos; isso pode bloquear a criação de um segundo local legítimo. Ampliação para múltiplos estabelecimentos exige decisão de produto e fluxo auditado específico, sem retirar a proteção silenciosamente.

Tratamento do legado, sem UPDATE automático:

- Pedidos 2 e 4 / Gustavo's Bar: investigar como um grupo; conferir local 6 e identidade. Administrador pode escolher um vínculo explícito; o outro pedido permanece para análise/rejeição justificada. Não aprovar ambos criando locais.
- Locais 7 e 8: verificar vínculos dos solicitantes antes de qualquer nova criação.
- Locais 2, 3 e 4: continuam sem proprietário e com visibilidade original. Regularização futura só por decisão individual com comprovação de identidade, nunca por nome semelhante.
- Os 13 pares candidatos são indícios, não 13 duplicações. Nenhum pedido/local legado é excluído ou modificado ao aplicar a proposta.

## SECURITY DEFINER e caminhos antigos

Todas as novas funções definer têm search_path vazio e nomes qualificados; não recebem papel/ator confiável do cliente. O schema interno permite apenas USAGE e EXECUTE dos predicados mínimos, sem acesso às tabelas privadas nem CREATE. PUBLIC perde EXECUTE das funções novas. Authenticated pode chamar RPCs, mas as administrativas revalidam admin; anon só pode chamar a projeção pública de destaques.

CREATE recusa colisões dos novos objetos; a preflight detecta também qualquer overload das novas RPCs. Todos os overloads de public.incrementar_metrica perdem EXECUTE de PUBLIC/anon/authenticated, com conferência de privilégios herdados. Não são apagados, para preservar dependências e permitir inspeção. O app não chama mais a função antiga nem faz upsert de totais como fallback.

Revogar só a função antiga não prova ausência de caminhos alternativos: outros definers, views, rules, triggers, default privileges, heranças, papéis donos e configuração PostgREST precisam de revisão do inventário. Há uma trava explícita de revisão desses caminhos. O executor postgres e sua capacidade de bypass são decisões operacionais confiáveis, nunca uma credencial do app.

## Métricas e campanhas: decisões ainda pendentes

A deduplicação proposta é **uma interação por usuário Auth + local + tipo de evento + dia UTC**. Eventos distintos contam separadamente. Repetição retorna registrada=false. O índice único metricas_locais(id_local,data) não é alterado; o incremento atômico usa esse índice. O cliente não fornece ator/data/totais nem grava anonimamente. Recibos ficam privados.

A tabela privada feature_flags nasce vazia: registrar_interacao_segura recusa gravação enquanto metrics_daily_dedup não for habilitada por manutenção autorizada. É necessário aprovar semântica, fuso, retenção dos recibos e necessidade de proteção adicional contra abuso/criação de várias contas; deduplicação diária não comprova visita física nem elimina fraude. Antes da habilitação, o app continua navegando, mas não contabiliza essas interações. Não há fallback inseguro.

campaign_offers também nasce vazia. Nenhum valor comercial foi inferido: o antigo preço fixo foi removido da UI/RPC. Uma oferta aprovada no servidor define tipo, duração e orçamento, sujeitos aos CHECKs reais. Sem ofertas, a tela informa indisponibilidade e desabilita solicitação. Uma solicitação cria rascunho e nunca cobra/ativa campanha. Cobrança/ativação e manutenção das ofertas exigem fluxo confiável separado. Campanhas antigas ficam intactas, mas destaques sem local visível/proprietário autorizado/vigência deixam de ser publicados pela RPC.

## Aplicativo e arquivos

Papéis vêm de profileService/user_roles, com falha fechada para permissões privilegiadas. AuthContext mantém autenticação independente, sanitiza logs e atualiza perfil ao renovar sessão/voltar ao app, descartando respostas de outra conta. Usuário comum mantém quatro abas. Parceiro aprovado ganha Meus Lugares; administrador acessa Painel Administrativo pelo Perfil, sem ser promovido implicitamente a parceiro.

PainelAdminScreen usa revisão explícita, candidatos, justificativa e confirmações. SejaParceiro envia pendente e não abre gestão antes da autorização. Serviços locais rejeitam mudanças de proprietário e criação/exclusão fora do fluxo. Impulsionar usa ofertas do servidor. Não distribuir esse app antes das RPCs/políticas compatíveis: sem elas, as operações novas ficam indisponíveis por segurança.

Arquivos desta correção (incluindo arquivos novos), além das migrações acima:

- src/contexts/AuthContext.js; src/components/AccessGate.js e CustomTabBar.js; src/utils/navigation.js e partnership.js.
- src/services/adminService.js, partnerAccessService.js, parceiroService.js e locaisService.js.
- src/screens/PainelAdminScreen.js, PerfilScreen.js, SejaParceiroScreen.js, ImpulsionarScreen.js, EditarLocaisScreen.js e PainelParceiroScreen.js.
- package.json; test/helpers/supabase-offline.mjs; test/locaisService.test.mjs, partnerAccessService.test.mjs e partnership.test.mjs.
- supabase/tests/20261109_partner_access_authorization.sql; diagnostics/20261109_constraints_e_view_readonly.sql; operations/primeiro_admin_guarded.sql; este documento, roteiro do clone e avisos de histórico nos dois relatórios anteriores.

GerenciarCardapioScreen.js, cardapioService.js, HomeScreen.js, MapaScreen.js, FavoritosScreen.js e a fundação de papéis foram preservados. O botão de Cardápio no painel foi mantido como ação independente para evitar botão aninhado. APIs de leitura de locais, categorias e favoritos continuam disponíveis, sujeitas ao novo isolamento no banco. Preservação do contrato não substitui regressão visual/dispositivo e integração no clone.

## Validação e próximos passos

Resultados locais: npm.cmd test passou com **109 testes, zero falhas**. O parser Babel analisou **47 arquivos JavaScript/JSX**, com **98 imports relativos** conferidos, sem erro. git diff --check passou. Checagens estáticas adicionais conferiram as 28 referências de assinatura nos grants/revokes das 17 funções propostas, search_path dos definers, travas presentes, ausência de DDL da view e de recriação do índice de métricas.

O Node emitiu aviso MODULE_TYPELESS_PACKAGE_JSON (reinterpretação de módulos ESM); não houve falha e não foi alterado o tipo global do pacote, para preservar Expo. A cobertura agregada reportada foi 88,36%, sobre os arquivos carregados pelos testes, com Supabase substituído pelo loader; não é cobertura do aplicativo nem prova de integração.

Ver resultados finais desta revisão e [roteiro-clone-seguranca-20261109.md](roteiro-clone-seguranca-20261109.md). Os testes offline usam cliente simulado e bloqueiam fetch. Validam contratos, permissões calculadas e payloads; não validam RLS, transações, triggers, concorrência ou autenticação remota. O parser de QueryParams usado pelos testes de Auth é o arquivo real instalado do Expo, resolvido pelo loader somente no teste.

SQL foi revisado como texto. Nenhuma validação pelo parser/servidor PostgreSQL ou execução isolada ocorreu. Constraints, tipos/domínios, grants herdados, funções antigas, triggers e view ainda podem exigir ajustes. Não há liberação para produção.

Antes de avançar: receber resultados exatos da coleta complementar; revisar a view separadamente; fechar o manifesto e caminhos alternativos; decidir deduplicação, preços/ofertas e regra para múltiplos locais; escolher UUID/evidência do primeiro admin. Só então pedir autorização para clone, realizar testes reais e propor liberação separada.
