# Roteiro de implantação, clone e recuperação

> Estado atual: [fechamento-compatibilidade-supabase-20261109.md](fechamento-compatibilidade-supabase-20261109.md). Testar ativação auditada 3/7/14, preservação exata de políticas de Storage/Cardápio e manifestos correspondentes ao estado após 00175; sem liberação de execução.

> Complemento atual: [compatibilidade-view-campanhas-20261109.md](compatibilidade-view-campanhas-20261109.md). A etapa separada da view agora tem rascunho bloqueado 00175; manter a origem legada até confirmação das dependências e testar datas NULL nos rascunhos. A coleta anterior confirmou valores de constraints, mas não elimina a coleta específica das fontes/datas.

Preparado, não executado. Nenhum trecho autoriza remover travas ou executar SQL nesta etapa. O clone precisa de projeto/credenciais próprios, dados anonimizados e nenhuma integração externa produtiva (e-mail, pagamentos ou webhooks). Não colar fixtures no SQL Editor do projeto real.

## Ordem segura para uma etapa futura autorizada

1. Exportar catálogo completo e backup recuperável; confirmar restore em ambiente isolado. Registrar grants/políticas/default privileges, owner/heranças, tipos/CHECKs/índices, views, funções/overloads e triggers, inclusive Auth. Arquivar resultados sem segredos e hash dos scripts revisados.
2. Receber constraints e CREATE VIEW completos. Revisar visibilidade/colunas/joins da view e schemas expostos na API. Preparar correção separada da view só depois desses dados; manter esta etapa bloqueada até lá.
3. Revisar os manifestos e valores dependentes do banco. Com autorização explícita futura, preparar artefato de execução revisado separado dos rascunhos bloqueados, mantendo os rascunhos com suas travas. Não contornar checks para forçar uma implantação.
4. No clone: fundação 00100 -> expansão revisada de status 00150 -> pré-requisito separado da view -> hardening 00200. Garantir janela de manutenção das operações de parceria/campanha se necessário. Não publicar o novo app ainda. PostgREST deve refletir assinaturas/grants novos antes do teste HTTP.
5. Validar criação de conta e perfil pelo trigger original. Configurar primeiro admin SOMENTE no clone inicialmente, pelo procedimento auditado e UUID verificado; testar que não existe concessão automática nem segundo bootstrap. Configurar ofertas revisadas e decidir habilitação de métricas por manutenção confiável; as tabelas nascem vazias em produção.
6. Executar testes SQL no clone com postgres e configuração explícita roleapp.test_environment=isolated. Preencher roleapp.test_local_price, roleapp.test_campaign_days e roleapp.test_campaign_value com valores aprovados que satisfaçam as constraints reais. O script de testes valida o marcador e termina em ROLLBACK; falha exige ROLLBACK antes de reuso da sessão. Fixtures novas têm prefixo reservado e não sobrescrevem contas existentes.
7. Executar os testes com dois clientes concorrentes abaixo e HTTP com JWTs reais de cada perfil. SET ROLE/JWT em sessão postgres simula RLS, mas não comprova grants da API, schemas expostos, cache de schema ou emissão de tokens. Não colocar service_role no aplicativo.
8. Regressão no Expo/dispositivo com backend clone: login/cadastro/recuperação, quatro abas, mapa, filtros, favoritos, avaliações, fotos e cardápio; Meus Lugares só para parceiro aprovado; painel só admin; troca de conta/retorno do foreground/role revogada. Testar edição de horários/eventos/cardápio próprios e recusa de terceiros. Testar local sem dono público mantendo mapa/filtros; não permitir gestão. Testar campanhas antigas ativa/pausada/finalizada e novos rascunhos, sem ativação/cobrança automática.
9. Somente após evidência e nova autorização, repetir mudanças revisadas no ambiente alvo com backup e verificação pós-corte. Ativar/validar RPCs e permissões antes de distribuir o app; acompanhar falhas 401/403, cadastro/perfil e contagens de legado. Bootstrap produtivo exige sua autorização específica e UUID confirmado.

## Matriz de autorização preparada

O arquivo supabase/tests/20261109_partner_access_authorization.sql contém fixtures transacionais e asserções, mas não foi executado.

| Cenário | Resultado exigido |
| --- | --- |
| Anônimo | Dados públicos somente; sem usuarios/solicitações/admin/escrita de métricas; view não revela local invisível. |
| Comum sem pedido | Não lê pedidos de terceiros nem altera seus locais/roles; sem aprovação. |
| Solicitante pendente | Consulta pedidos próprios; não gerencia nem mesmo local legado já associado; sem aprovação/campanha/escrita direta de métricas. |
| Parceiro aprovado | Edição própria permitida; terceiros recusados; campanha só rascunho por oferta autorizada. |
| Admin | Revisão/decisão explícita; sem INSERT direto em locais, sem apagar auditoria; papel admin preservado ao aprovar pedido próprio. |
| Repetição/duplicação | Mesmo token e entrada retorna um resultado; snapshot antigo ou outro pedido do mesmo negócio não cria/vincula novamente. |
| Falha de auditoria | Trigger de teste suprime INSERT na auditoria; RPC deve falhar e reverter status/local/papel/mapa/consumo da revisão. Trigger existe somente na transação de teste. |
| Legado | Snapshots dos locais/proprietários/visibilidade, pedidos/status e campanhas permanecem iguais. Três locais sem dono mantidos. |
| Métricas/função antiga | Evento repetido não incrementa; totais diretos negados; todos os overloads de incrementar_metrica fechados; sequência sem UPDATE/setval. |
| Revogação | Papel de parceiro revogado durante sessão deve impedir nova escrita no banco, mesmo se UI ainda tiver estado antigo. |

Adicionalmente, preparar no clone requests/campanhas com cada estado antigo válido; comprovar leitura esperada por proprietário/admin, ausência de publicação indevida e inexistência de UPDATE de estado por cliente. Comparar catálogo de CHECKs (exceto expansão expressamente aprovada), índice único de métricas e trigger Auth antes/depois. Testar policy/grant de cada operação real de favoritos, avaliação/upsert, cardápio e horário, incluindo INSERT RETURNING e sequências; não considerar apenas contagens totais.

## Concorrência em duas conexões (não executada)

O script com ROLLBACK usa uma única conexão; não demonstra concorrência. Criar fixtures persistidas exclusivamente no clone autorizado, guardar seus IDs e removê-las ao descartar o clone. Não usar IDs 2/4/6 produtivos.

Obter duas revisões da mesma solicitação pendente, cada uma usando uma sessão/admin real. Cada token só funciona para o admin que o criou. Em duas conexões READ COMMITTED:

1. Conexão A: BEGIN; identidade admin A; chamar decidir_parceria_segura com revisão A, ação e argumentos completos e não commitar ainda.
2. Conexão B: BEGIN; identidade admin B; mesma solicitação via revisão B; enviar a decisão. Deve aguardar o lock de A. Configurar timeout finito no cliente de teste, sem abrir locks indefinidos.
3. Commit A; B deve falhar por revisão/estado alterado, sem novo local/papel/auditoria. ROLLBACK B. Conferir um vínculo, uma decisão final, proprietário correto e nenhuma criação extra.
4. Repetir usando MESMA revisão/identidade/entrada nas duas conexões: após commit A, B deve retornar o resultado já persistido, sem duplicar auditoria.
5. Repetir com pedidos diferentes do mesmo negócio; o segundo não pode criar outro local. Com empresas homônimas/terceiros, recusar vínculo indevido e exigir investigação.
6. Repetir A com ROLLBACK em vez de COMMIT: B deve conseguir prosseguir se a revisão continua válida. Testar alteração concorrente de candidato/status/role e transação com isolamento mais forte: mudanças devem invalidar revisão ou ser recusadas, nunca usar snapshot antigo.

Assinatura proposta, não um comando com IDs produtivos:

```text
decidir_parceria_segura(
  p_revisao uuid, p_decisao text, p_acao text, p_motivo text,
  p_id_local_existente text, p_identidade_validada boolean,
  p_duplicidade_revisada boolean, p_novo_local jsonb
)
```

Também testar interações simultâneas: duas chamadas iguais contam uma; usuários/eventos diferentes contam separadamente; falha no incremento não deixa recibo consumido. Revisar deadlocks/tempo de espera contra os triggers reais. Nenhum desses resultados está confirmado por testes offline.

## Recuperação

Falha antes do COMMIT de uma migração/transação: encerrar com ROLLBACK e conferir que catálogo/dados são iguais ao snapshot. Não pular a asserção que falhou. Exceção da trava é comportamento esperado dos rascunhos.

Falha após o corte: interromper distribuição e operações administrativas/campanhas; manter leituras públicas válidas e monitorar Auth. Não desabilitar RLS, devolver CRUD amplo, reabrir incrementar_metrica ou incluir service_role no app para contornar erros. Usar operação de manutenção autorizada para desabilitar a flag de métricas/suspender ofertas, sem apagar dados/auditoria.

Investigar diff de catálogo/logs sanitizados em clone do estado atual. Preferir correção pequena revisada, testada e transacional. Se restauração for necessária, validar backup/PITR no clone e reconciliar decisões e vínculos feitos após o backup; não desfazer aprovação com DELETE em cascata nem apagar auditoria. UUIDs/proprietários/visibilidade anteriores estão nos snapshots de implantação; restauração de ownership exige decisão auditada específica.

Reverter o binário sozinho não restaura contratos antigos: a versão antiga pode usar criação direta de local ou RPC antiga bloqueada. Manter operações incompatíveis indisponíveis até binário/backend compatíveis serem confirmados. Só reabrir a distribuição após repetir matriz, Auth, contratos RPC e regressões do app.
