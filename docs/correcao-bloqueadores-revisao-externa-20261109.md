# Correções limitadas aos bloqueadores — 09/11/2026

**IMPLANTAÇÃO BLOQUEADA. SQL NÃO EXECUTADO.** Não houve acesso ao Supabase, alteração de dados legados, criação de clone/remoto, commit ou push. As quatro travas incondicionais permanecem. Esta rodada não adiciona telas, fluxo comercial, concessão automática de papéis ou regularização automática.

O pacote PACOTE_REVISAO_TECNICA_FINAL_ROLEAPP_20261109.md fica preservado como snapshot da versão examinada externamente. Seus SQLs/hashes não representam as correções posteriores deste relatório. Para uma nova revisão, usar os arquivos atuais abaixo; não executar nem reapresentar o pacote anterior como versão corrigida.

## 1. PostgreSQL 42725 e manifestos

00200 e o diagnóstico 20261109_constraints_e_view_readonly.sql agora concatenam p.polcmd::text e g.tgenabled::text. A alteração evita deixar ao resolvedor a escolha de sobrecarga de concatenação para os tipos de catálogo. Não houve reprodução do erro ou validação pelo PostgreSQL nesta rodada.

Foram mantidos o mesmo separador, ordenação, representação de papéis/permissividade, expressões USING/WITH CHECK, tratamento de conjunto vazio, exclusão de triggers internos e digest da definição da função do trigger. Dois testes offline comparam as expressões efetivas de serialização entre os arquivos para detectar divergências futuras.

Nenhum hash/manifesto foi preenchido por inferência. reviewed_policy_hashes e reviewed_trigger_hashes continuam NULL, e os demais flags de revisão permanecem bloqueantes. Hashes do catálogo dependem da versão/estado real do banco, não dos SHA-256 dos arquivos locais. O manifesto de locais deve representar o estado após 00175; não copiar o snapshot anterior ao acréscimo da política restritiva.

## 2. Autorização por estabelecimento

A falha era real no texto anterior: partner_owns exigia somente papel parceiro e id_proprietario correspondente. Aprovar um único local podia habilitar gestão de outros locais legados do mesmo usuário.

A proposta corrigida reaproveita request_local_links, sem criar um segundo fluxo de aprovação:

- Acrescenta subject (UUID do beneficiário) e active ao vínculo privado. Não há backfill, vínculo por nome, aprovação em lote ou seed produtivo. subject é snapshot verificado pela RPC, sem nova FK que bloqueie exclusão de conta Auth; user_roles e a propriedade atual continuam sendo conferidos.
- O predicado privado approved_local_owner exige simultaneamente: papel parceiro atual, propriedade atual, vínculo ativo para aquele ID de local/beneficiário, solicitação correspondente aprovada para o mesmo usuário e auditoria de aprovação com solicitação/local/beneficiário/revisão correspondentes.
- partner_owns passa a chamar esse predicado com auth.uid(). O helper com parâmetro de ator não é executável por PUBLIC/anon/authenticated; apenas funções confiáveis o utilizam. Foi movido para depois da criação das tabelas referenciadas, evitando resolução de relação ainda inexistente no CREATE FUNCTION SQL.
- A decisão administrativa grava o beneficiário no vínculo e confere esse estado ao final. Mudança autorizada de proprietário invalida o vínculo anterior, sem transferir sua autorização ao novo dono.
- Solicitação e ativação de campanhas, além da publicação de destaques, usam a mesma autorização individual. A ativação por admin verifica o beneficiário real da campanha, não o papel do decisor como se fosse parceiro.

O papel global segue necessário para a interface de parceiro, mas não é autorização suficiente de um estabelecimento. Um local visível ainda pode ser lido como informação pública, mesmo sem autorização de gestão. Um local invisível de mesmo proprietário permanece inacessível à gestão comum enquanto não houver aprovação individual. A UI existente pode listar um local público do mesmo dono; esse fato não concede escrita no banco.

Tratamento do legado permanece manual:

- Pedidos repetidos 2/4: avaliar identidade e local 6; uma decisão explícita não aprova automaticamente o outro pedido. Unicidades e chave comercial continuam impedindo duas aprovações para a mesma origem/local.
- Locais 6/7/8: ter proprietário não gera autorização. Cada vínculo precisa passar pela revisão/decisão individual já proposta. Nenhum desses IDs é usado como fixture ou atualizado pelo texto da migração.
- Locais sem dono 2/3/4: leitura pública se visíveis; sem gestão por parceiro, sem atribuição de dono, sem alteração de visibilidade.
- Vínculo desativado continua como histórico. Reaprovação/transferência de um vínculo já ocupado exige procedimento específico futuro; não foi criado endpoint para editar registros privados ou apagar histórico.

A matriz SQL passou a construir autorizações positivas de fixtures pelos próprios revisar/decidir, em vez de tratar papel parceiro como autorização. Acrescenta um segundo local do mesmo parceiro que permanece pendente e sem vínculo. Testa recusa de helper/SELECT privado/UPDATE/evento/horário/campanha nesse local, mantendo a operação positiva no local aprovado. Todas essas escritas são fixtures novas sob guard de clone e ROLLBACK, ainda não executadas.

## 3. Rotas públicas e funções existentes

| Caminho | Evidência local e consequência |
| --- | --- |
| buscar_locais e buscar_locais_por_orcamento | Não há definições nem chamadas dessas funções no código src/assets analisado. Não é possível declarar filtro, projeção, SECURITY DEFINER ou dependências seguros a partir dos nomes. Nenhuma definição/grant dessas funções foi alterado. |
| locais_com_avaliacoes | 00175 mantém avaliacoes e nove colunas, filtro visivel, security_invoker e SELECT mínimo. Ainda depende de teste de RLS/grants e consumidores externos. Não troca a origem por avaliacoes_locais. |
| locaisService.getLocais/searchLocais | Leitura de locais com filtro visível no cliente; esse filtro não protege outros consumidores da API. A política proposta no banco também restringe leitura. |
| locaisService.getLocalById e favoritos -> locais | Dependem da RLS da tabela; leitura privada deve exigir autorização própria individual/admin. Não presumir que o filtro das listas protege a busca por ID ou joins. |
| listar_destaques_publicos | Definer novo com projeção explícita, status/vigência/visibilidade/propriedade e autorização individual. Não publica campanha de outro local apenas pelo papel global do proprietário. |
| Outros definers/views/rules | Podem contornar RLS como dono/BYPASSRLS, expor SELECT * ou delegar a outra rotina. Inventário de catálogo e revisão dos corpos/consumidores continuam obrigatórios. |

Foi preparado 20261109_public_local_routes_readonly.sql: uma transação READ ONLY, metadados/digests/configuração de segurança/EXECUTE efetivo, dependências e views que consultam locais. Não executa buscar_locais nem qualquer outra rotina de negócio e não retorna corpos completos. Flag de menção a visivel não comprova filtro: comentários, SQL dinâmico, ramificações e helpers podem gerar falso positivo/negativo.

Receber/revisar as definições efetivas de todos os overloads, seus consumidores e campos de retorno é pendência bloqueante. A coleta só de metadados não resolve essa análise. O flag alternate_write_paths_reviewed continua false; não liberá-lo sem evidência, mesmo se as demais correções passarem.

## 4. SELECT, grants e sequências: compatibilidade

Foi identificado e reduzido um efeito concreto do texto anterior: REVOKE ALL em todas as sequências podia remover USAGE de INSERTs legados fora da lista de restauração, por exemplo avaliacoes. Agora a revogação global de sequências públicas retira UPDATE (setval), preservando USAGE/SELECT preexistentes; o fechamento completo continua nas sequências internas e de auditoria. Os grants USAGE específicos e verificações de UPDATE/propriedade/herança permanecem. Isso não certifica que grants anteriores eram mínimos; evita retirar permissões legítimas desconhecidas sem análise.

Nenhum outro grant de negócio foi ampliado nesta rodada. Revogações de TRUNCATE/REFERENCES/TRIGGER em public continuam propostas; não há DDL de Storage. As políticas de categorias_cardapio/itens_cardapio e Storage continuam fora da substituição, com conferência de hash antes/depois.

A redução de SELECT em avaliacoes de 00175 não foi revertida nem ampliada sem evidência. O app atual usa avaliacoes_locais; porém consumidores externos de comentario/id_usuario, filtros que referenciem essas colunas e INSERT/UPDATE RETURNING podem quebrar. Permitir INSERT ou ter policy de escrita não concede SELECT das colunas retornadas. Esse contrato precisa ser inventariado/testado antes da aprovação.

O diagnóstico de funções/triggers existente passou a incluir supabase_auth_admin na inspeção de permissões. O trigger de perfil Auth não foi alterado. Revogar privilégios de PUBLIC pode afetar rotinas invoker/papéis que dependam deles; cadastro precisa de teste real com Auth e criação de usuarios, não somente INSERT de fixture por postgres.

Preservar políticas de Cardápio não demonstra autorização individual: se a política existente aceitar apenas id_proprietario, pode continuar permitindo gestão do local B pendente. Também pode haver policies de Storage baseadas apenas em UID/propriedade. Não foram reescritas nesta rodada sem seus consumidores/dependências. Esses caminhos são bloqueadores remanescentes, não exceções autorizadas à nova regra. A implantação permanece impedida até confirmar os resultados e, se necessário, propor correção mínima específica.

## 5. Matriz HTTP/JWT futura — preparada, não executada

Executar somente após revisão e autorização explícita de clone. Verificar destino isolado, usar chave pública e JWTs emitidos pelo Auth do clone, nunca service_role para simular usuário, nunca registrar tokens ou URIs com credenciais. Não produzir efeitos em e-mail/pagamento/storage produtivos.

Fixtures: usuário comum U; parceiro P; local A aprovado individualmente para P; local B do mesmo P ainda pendente; local C de terceiro; local D sem dono. Incluir B invisível e repetir o caso com B visível para separar acesso público de gestão. Não usar IDs produtivos 2/4/6/7/8. Criar valores geográficos/orçamento/categorias compatíveis com os filtros reais; ausência de um resultado por filtro diferente não prova proteção de visibilidade.

Formato da chamada a preparar, sem chave, token, URL ou payload real:

```http
POST <REST_DO_CLONE>/rpc/solicitar_campanha_segura
apikey: <CHAVE_PUBLICA_DO_CLONE>
Authorization: Bearer <JWT_DA_PERSONA>
Content-Type: application/json

<payload válido confirmado na assinatura, com A ou B como único campo diferente>
```

| Teste HTTP | Resultado exigido |
| --- | --- |
| GET /locais com ID B invisível; GET /locais_com_avaliacoes; joins de favoritos | Anônimo/U/P sem autorização de B não recebem o ID/dados privados; view pública exclui invisíveis inclusive para admin. |
| RPC buscar_locais e buscar_locais_por_orcamento | Usar assinatura real de cada overload, limites/orçamentos que incluiriam as fixtures e JWTs de cada persona. Conferir IDs/projeção, não só status HTTP ou presença do campo visivel. Nenhum resultado invisível em rota classificada como pública. |
| PATCH local/evento, POST horário/campanha A vs B/C | Payload válido: P consegue em A; B/C negados ou UPDATE afeta zero linhas. Verificar banco/auditoria em sessão de inspeção do clone, não confiar só em resposta vazia. |
| Aprovação/ativação por anônimo, U ou P | Negação de autorização, sem papel/local/status/datas/auditoria alterados. Admin consegue somente a operação explícita válida. |
| Avaliações atuais: nota 0/comentário vazio, nota 5 e upsert | avaliacoes_locais mantém contrato, unicidade, RETURNING/IDs e autoria; usuário não modifica avaliação alheia. |
| Fonte antiga avaliacoes | SELECT apenas nas colunas mínimas; view preserva média/contagem da origem correta. Identificar consumidores quebrados por SELECT reduzido e testar antes de liberar. |
| Cadastro/recuperação/foto | Auth real do clone cria perfil pelo trigger original sem papel elevado; recuperação funcional e upload/leitura/exclusão de avatar conforme policies existentes. Sem mensagens externas produtivas. |
| Favoritos/Cardápio/Storage | INSERT/SELECT/DELETE favoritos, upsert avaliação, criação/edição/exclusão de categoria/item com IDs/sequências e foto. A permitido; B/C negados para gestão. Falha revela bloqueador, não autoriza relaxar policies. |
| Sessão revogada e JWT inválido/expirado | Sem nova escrita; resposta de autenticação correta. Não confundir 404/assinatura incorreta/erro 500 com prova de autorização. |

Respostas filtradas por RLS podem ser 200 com lista vazia; negação de privilégios pode ser 401/403 conforme sessão. Avaliar o efeito real e o código de erro; um payload inválido não serve de teste negativo de autorização. Usar registros e snapshot/auditoria privados do clone, sem logs de segredos.

## 6. Concorrência futura — preparada, não executada

1. Duas conexões READ COMMITTED, admin/revisões próprios, mesma solicitação: A decide e segura a transação; B aguarda; commit A invalida revisão B. Repetir com rollback A e com retry da mesma revisão/entrada. Conferir um vínculo, uma decisão e nenhum local extra.
2. Pedidos repetidos para o mesmo negócio e mesmo local legado: decidir um não concede acesso a outro local do solicitante. Repetir IDs de fixtures equivalentes ao cenário 2/4 + local 6; verificar que 7/8 equivalentes continuam sem vínculo até decisão individual.
3. P autorizado em A escreve em B pendente enquanto admin aprova/rejeita B: antes do commit da aprovação, B continua negado; após commit, nova transação pode usar apenas vínculo aprovado completo. Rollback não deixa autorização parcial.
4. Revogar active do vínculo de A ou mudar propriedade por manutenção autorizada no clone enquanto há requisições: definir e conferir semântica de snapshot/locks; nova transação deve negar. O UPDATE de dono invalida o vínculo, sem repassá-lo ao novo dono. Não afirmar revogação instantânea de statement já iniciado sem teste.
5. Duas ativações/alteração de proprietário ou papel: não ativar campanha sem autorização individual válida nem duplicar auditoria/reiniciar datas. Conferir deadlocks, ordem de locks e tempo de espera finito. A matriz SQL de uma conexão não demonstra esses resultados.

## 7. Arquivos alterados e verificações

Alterados nesta rodada:

- supabase/migrations/20261109000200_partner_access_hardening.sql — casts, vínculo individual/predicados/consumidores e sequências.
- supabase/diagnostics/20261109_constraints_e_view_readonly.sql — algoritmo de hashes compatível.
- supabase/diagnostics/partner_hardening_review/03_funcoes_triggers_acessos.sql — papel Auth na inspeção.
- supabase/tests/20261109_partner_access_authorization.sql — fixtures e negativos de autorização individual.

Criados:

- supabase/diagnostics/20261109_public_local_routes_readonly.sql — triagem somente de leitura, sem execução.
- test/securityBlockers.test.mjs — dois testes do contrato de serialização dos hashes, sem simular RLS.
- docs/correcao-bloqueadores-revisao-externa-20261109.md — este relatório e planos de testes.

Sem mudanças nas migrações 00100/00150/00175, no pacote histórico, nas definições existentes de buscar_locais/buscar_locais_por_orcamento, no código de UI/serviços do app ou nas políticas reais do banco.

Resultados locais: npm.cmd test passou com **123 testes**; node --test test/securityBlockers.test.mjs passou com **2 testes adicionais**; total **125 testes offline, zero falhas**. Parser Babel analisou **48 arquivos JS/JSX/MJS** sem erro; git diff --check passou. Conferência textual: **19 funções/30 referências EXECUTE**, helper interno sem grant de execução a clientes e quatro travas preservadas. Aviso Node MODULE_TYPELESS_PACKAGE_JSON continua sem falha.

Esses resultados não reproduzem o PostgreSQL 42725 nem comprovam RLS, concorrência, Auth, HTTP ou SQL/PLpgSQL. Nenhum teste SQL/HTTP/clone foi executado. Permanecem bloqueantes a revisão efetiva das funções legadas, a autorização individual em caminhos preservados de Cardápio/Storage, a compatibilidade do SELECT reduzido e a comprovação dos grants/fluxos reais no clone após autorização. Não há liberação de implantação.
