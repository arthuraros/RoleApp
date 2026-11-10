# Segurança das quatro tabelas — proposta para revisão

> Histórico da proposta anterior. A implementação local foi revista após o diagnóstico real. Para contratos, políticas, bloqueios e implantação atuais, consultar [correcao-diagnostico-real-20261109.md](correcao-diagnostico-real-20261109.md). Preços fixos, status antigos e guardas restritivas descritos abaixo não representam a proposta atual.

## Revisão técnica posterior: aplicação continua bloqueada

Consultar **revisao-tecnica-hardening-20261109.md** e os quatro blocos em **supabase/diagnostics/partner_hardening_review/** antes de qualquer execução. Foram identificados riscos adicionais: aprovação com local existente omitido pode duplicar estabelecimento legado; triggers podem suprimir/alterar escritas sem que a RPC confira invariantes finais; grants/permissivas antigos de locais ainda permitem caminhos administrativos diretos e podem impedir edição própria.

A idempotência descrita abaixo cobre a mesma solicitação, não pedidos diferentes do mesmo estabelecimento. A afirmação de criação de local somente por aprovação ainda depende de fechar INSERT direto de admin em locais, conforme privilégios/políticas reais. As migrações não foram corrigidas, desbloqueadas ou executadas nesta revisão. Os resultados dos quatro blocos e as correções apontadas são pré-requisitos adicionais de liberação.

## Evidência e status

Informação confirmada pelo responsável: anon e authenticated possuem SELECT/INSERT/UPDATE/DELETE nas 15 tabelas public; solicitacoes_parceria, eventos_locais, campanhas_impulsionamento e metricas_locais estão sem RLS. Com esses grants e RLS desligada, o acesso direto não é isolado por usuário. A filtragem do aplicativo não impede chamadas diretas à API.

O inventário somente de leitura foi revisado como arquivo; não foi executado. Os relatórios completos de tipos, constraints, políticas, funções, triggers, views e heranças ainda não foram entregues. Não confundir o script de inventário com resultados coletados.

A nova migração 20261109000200_partner_access_hardening.sql está BLOQUEADA por exceção incondicional antes de qualquer DDL. A fundação 20261109000100_user_roles_foundation.sql mantém sua trava e conteúdo anteriores. Nenhum SQL foi executado, local ou remotamente. Não houve conexão ao banco, commit ou push nesta tarefa.

## O que a migração propõe

| Recurso | Leitura | Escrita pelo aplicativo |
| --- | --- | --- |
| Solicitações | Próprias ou admin | INSERT próprio e pendente; decisão só por RPC admin |
| Eventos | Ativos de local público; todos do local próprio para parceiro; admin | Parceiro aprovado do local ou admin, campos limitados; id_local não editável |
| Campanhas | Tabela completa apenas do parceiro proprietário ou admin | Nenhuma escrita direta; RPC cria rascunho, nunca ativa |
| Destaques públicos | RPC com projeção de campos publicáveis | Sem escrita |
| Métricas | Totais só do parceiro proprietário ou admin | Sem INSERT/UPDATE/DELETE direto; RPC aceita interação unitária |
| Auditoria | Admin | Somente operações confiáveis; nenhum cliente altera ou apaga |

RLS é habilitada nos quatro alvos. A proposta revoga privilégios de tabela e coluna de PUBLIC/anon/authenticated e concede somente operações necessárias. Sequências de IDs de solicitação/evento recebem USAGE apenas para authenticated, quando existentes. Privilégios herdados ainda precisam de revisão; postflight recusa TRUNCATE/propriedade herdados e preflight recusa escrita de user_roles pelos clientes.

Políticas novas incluem permissivas estritas e guardas AS RESTRICTIVE por comando. Os guardas restringem inclusive permissivas amplas antigas, sem apagá-las cegamente. UPDATE/DELETE de solicitações e escrita de campanhas/métricas têm guardas false e grants revogados. Políticas restritivas legadas podem bloquear acessos legítimos: o inventário e os testes devem reconciliá-las antes da implantação. Não presumir que todos os problemas de grants/herança foram resolvidos pelo texto proposto.

Os predicados ficam em schema interno roleapp_security sem CREATE de clientes. Só helpers booleanos mínimos têm EXECUTE. As RPCs têm search_path vazio, nomes qualificados e EXECUTE explícito; não usam user_metadata ou ator fornecido pelo cliente. O executor esperado é postgres, com revisão explícita do uso de SECURITY DEFINER/BYPASSRLS antes da autorização.

### Dependência em locais e dados legados

A propriedade de locais é raiz da autorização. Restringir somente eventos/campanhas seria insuficiente se qualquer usuário pudesse alterar id_proprietario em locais. Por isso há guardas restritivas de escrita em locais e trigger de alteração de propriedade, com auditoria. Parceiro não assume local sem dono, não muda proprietário e não apaga locais; novos locais são criados por aprovação administrativa.

Os três estabelecimentos sem proprietário não são alterados pela migração: nenhum UPDATE de dados em massa, backfill de proprietário ou mudança de visivel. A leitura de locais/filtros/favoritos/cardápio e seus IDs permanece. Vinculação futura ocorre somente se admin escolher explicitamente p_id_local_existente após verificar evidência. A RPC recusa local de terceiro e preserva visibilidade de local existente. Não vincula por nome, e-mail ou ordem de criação.

Os guardas não concedem permissivas novas de escrita em locais: dependem das permissivas existentes revisadas para edição própria. A aprovação por definer pode criar/vincular mesmo com políticas de cliente mais restritas.

## Novos contratos de serviço

- partnerAccessService.js recebe cliente injetado, permitindo unidade sem SDK/rede. parceiroService.js delega apenas os contratos alterados e preserva a consulta exclusiva de locais próprios e os demais métodos existentes.
- enviarSolicitacaoParceria deriva id_usuario de auth.getUser(), envia status pendente e não aceita papel, decisão, created_at ou usuário forjado. O nome cadastrarNovoParceiro permanece como alias, mas retorna solicitação em vez de local. A tela foi adaptada para esse contrato e não navega ao painel após enviar.
- criarCampanha chama solicitar_campanha_segura. Não transmite idUsuario, valorTotal, status ou datas. O SQL cria rascunho e calcula orçamento de 60 por dia para durações 3/7/14, alinhado à tabela atual da UI. Esse preço é PROPOSTO e precisa de aprovação de produto/comercial antes de implantação. Não representa cobrança ou pagamento. Ativação/pagamento ainda requerem fluxo confiável separado; admin não ativa via UPDATE direto. UI informa solicitação/rascunho.
- getDestaquesAtivos passa a usar listar_destaques_publicos, mantendo o formato consumido por Home/mapa. A RPC só retorna campanha ativa, vigente, de proprietário parceiro/admin aprovado, com id_usuario correspondente e local visível. Não expõe interesses, faixa etária, valor, métricas ou contatos privados. Campanhas legadas sem esses vínculos deixam de aparecer até regularização; não serão automaticamente aprovadas para preservar destaque.
- registrarMetrica aceita exatamente um de views/cliques/visitas com valor 1. Faz apenas registrar_interacao_segura, sem upsert ou chamada da antiga incrementar_metrica. A data vem do servidor UTC; identidade de auth.uid(). Locais demo não geram escrita. Falha não bloqueia os consumidores que já usam catch na Home/mapa/detalhes.
- getCampanhas e leitura de métricas continuam pelas tabelas, agora filtradas pelo banco. Eventos mantêm os métodos existentes e passam pelas políticas/colunas autorizadas.
- adminService.js chama decidir_parceria_segura; nenhum método concede admin. Não foi criado painel visual ou alterada a navegação por papel nesta tarefa.

Sem as migrações autorizadas/aplicadas, as novas RPCs não existem: campanhas e destaques ficam indisponíveis nesta versão de desenvolvimento. Não publicar o app isoladamente; não reintroduzir fallback inseguro para compatibilidade.

## Métricas: proteção e mudança de semântica

A RPC exige login, local visível, evento permitido e incrementa somente 1. Uma tabela privada deduplica por conta/local/tipo/dia UTC, com PK; a atualização do agregado é atômica. Não aceita totais, data, identidade ou decrementos do cliente. Revoga EXECUTE de todos os overloads públicos da antiga incrementar_metrica e falha se houver EXECUTE herdado restante.

Essa semântica mede interação única diária por tipo, não impressões ilimitadas. Exige aprovação de produto e ajuste de comunicação dos relatórios antes do lançamento. Usuários anônimos não registram métricas. Deduplicação por conta limita repetição, mas não prova visita física nem impede abuso por múltiplas contas. Rate limiting, retenção/limpeza de receipts e eventual endpoint confiável são pendências operacionais. A exclusão de conta pode remover receipts, mas não decrementa totais históricos.

## Aprovação, concorrência e auditoria

decidir_parceria_segura bloqueia o registro de admin FOR SHARE, a solicitação FOR UPDATE e o papel do solicitante/locais envolvidos. Exige estado pendente e justificativa. Aprovação concede no máximo parceiro, preserva admin existente e cria local invisível ou vincula local selecionado; rejeição não revoga parceria anterior e não cria local.

A mesma transação atualiza status e grava evento de decisão, com unicidade por solicitação. Repetir decisão produz conflito e não duplica local/auditoria. Falha em qualquer passo reverte tudo. Não cria horários fictícios: os horários são configurados depois, evitando a divergência de nomes de coluna do fluxo antigo. A configuração posterior de horários ainda precisa da revisão das políticas dessa tabela.

Auditoria guarda ator, alvo, solicitação/local, motivo e diferenças mínimas, sem tokens, sessão ou formulário completo. Identidades/IDs de alvo são snapshots (sem CASCADE que apague histórico). roleapp_admin_audit não possui grants de escrita para clientes; roleapp_one_decision_per_request impede duas decisões. O dono do banco continua tecnicamente capaz de alterar auditoria: manutenção e concessão inicial de admin exigem processo operacional confiável. Provisões externas de papéis não são auditadas automaticamente por esta migração e precisam de caminho dedicado antes de uso.

Locks evitam decisão duplicada e uso de papel de admin já revogado antes da operação. Operações concorrentes com alvos compartilhados podem gerar deadlock: testar duas sessões e definir retry de transação para SQLSTATE 40P01/40001. Não repetir automaticamente uma decisão após resposta perdida sem consultar seu estado/auditoria.

## Bloqueadores antes de remover as travas

1. Receber resultados completos do inventário e snapshot dos grants/políticas. Revisar qualquer view, função definer, trigger, regra, job ou caminho externo capaz de escrever nos alvos. Guardas não protegem contra funções privilegiadas vulneráveis. A RPC antiga conhecida é revogada, mas não se presume inexistência de outras.
2. Confirmar usuarios/id_usuario e proprietários UUID, colunas necessárias, constraints e FKs. Confirmar status text/varchar com CHECK permitindo pendente/aprovada/rejeitada e campanha rascunho/ativa. A migração não altera checks desconhecidos; adaptar expressamente após revisar dados legados. Preflight rejeita enums sem casts revisados.
3. Confirmar metricas_locais.data como date e índice único válido/imediato/não parcial em id_local,data; contadores compatíveis. Confirmar interesses text[], raio/duração compatíveis, limites de campos, colunas obrigatórias e defaults de solicitações/eventos/campanhas/locais. Tipos divergentes exigem revisão, não casts genéricos silenciosos.
4. Confirmar novos nomes de schema/tabela/funções/índices/políticas livres. CREATE não sobrescreve objetos existentes. Rever default privileges e papéis herdados/BYPASSRLS/donos de tabelas/functions, incluindo user_roles. Não usar service_role no aplicativo.
5. Revisar fundação de papéis e definir provisão segura de usuario para novas/existentes contas. Não promover donos de locais ou pedidos legados. Definir quem pode aprovar o primeiro admin, com registro auditável, fora da migração e do app.
6. Regularizar solicitações nulas/duplicadas e estabelecer se um pedido pendente por usuário limita múltiplos estabelecimentos. Esta proposta não impõe unicidade arbitrária nem cria local a partir de todos os pedidos antigos. Evitar duplicação quando pedido legado já originou local: admin deve selecionar vínculo explicitamente.
7. Aprovar orçamento e semântica de métricas; testar horários, cardápio e demais tabelas com políticas amplas. Esta migração não endurece todos os 15 objetos nem toda a plataforma. Horários/cardápio continuam sujeitos à auditoria completa de suas próprias políticas.
8. Validar schema interno não exposto na Data API. Os helpers booleanos têm USAGE/EXECUTE mínimos por necessidade de RLS; nenhuma função de manutenção interna fica exposta.

## Ordem segura de implantação futura

1. Revisar os arquivos e autorizar separadamente coleta/aplicação. Preparar backup/PITR e restauração testada; guardar snapshot de contagens, vínculos, grants, políticas e contratos existentes.
2. Criar clone descartável. Revisar tipos/checks e retirar travas SOMENTE em mudança autorizada. Aplicar fundação e hardening no clone, não rodar o conjunto completo de migrações cegamente. A fundação bloqueada interrompe db push; isso é intencional.
3. Provisionar identidades de teste por procedimento confiável no clone. Executar testes de RLS preparados e testes complementares abaixo; revisar planos, índices e custo dos casts de ID para texto (compatibilidade com tipos ainda não confirmados). Após inventário, preferir assinaturas tipadas para usar índices em alto volume.
4. Preparar build compatível do aplicativo, sem publicá-lo sozinho. Coordenar janela de manutenção/corte: restringir clientes antigos, aplicar DDL/grants/políticas em transação única e só então habilitar a versão compatível. Nenhuma escrita insegura ficará aberta como fallback durante transição. Se necessário, suspender envios antigos em vez de manter autoaprovação.
5. Validar como anon/authenticated reais (não apenas postgres). Provisionar admin legítimo fora da migração; conferir aprovação/rejeição, parcerias preexistentes explicitamente revisadas e locais sem proprietário.
6. Smoke test Expo em login senha/Google, recuperação/logout, Home/destaques, mapa/filtros, favoritos, detalhes/cardápio, edição própria, eventos, campanhas e métricas. Monitorar 42501/erros de RPC de forma sanitizada.
7. Liberar gradualmente, observando rejeições/latência/locks. Verificar que não existe chamada residual à RPC antiga nem escrita direta em campanhas/métricas. Só declarar concluída a segurança quando o clone e produção autorizada passarem nos testes reais.

## Recuperação em caso de falha

- Antes do COMMIT: qualquer erro aborta a transação; executar ROLLBACK na sessão de manutenção autorizada. Confirmar catálogo/estado real e histórico de migrações antes de tentar novamente. As travas atuais sempre abortam: isso não é falha a contornar automaticamente.
- Após COMMIT: suspender apenas operação incompatível, manter RLS e restrições. Corrigir grants/colunas/RPC por nova migração estreita e revisada. Não desligar RLS, não restaurar CRUD amplo, não reativar incrementar_metrica e não distribuir service_role ao app.
- Reverter somente o aplicativo pode quebrar cadastro/campanhas antigos: manter build compatível ou tela de indisponibilidade para esses fluxos. Leituras de locais/favoritos/cardápio devem continuar onde seguras; não prometer recuperação integral de escrita via versão antiga.
- Preservar user_roles, auditoria, recibos e IDs já criados; não dropar tabelas/schemas nem “desaprovar” tudo. Conciliar solicitação/status/auditoria antes de reprocessar uma resposta perdida.
- Se houver corrupção de dados, usar restauração previamente testada com autorização e conciliação das alterações posteriores; não executar rollback destrutivo automático. Para perda de admin, usar procedimento privilegiado auditado, nunca autopromoção no app.

## Testes e validação nesta tarefa

Comando offline executado:

```text
node --import ./test/helpers/supabase-offline.mjs --test test/profileService.test.mjs test/partnerAccessService.test.mjs test/parceiroService.test.mjs test/locaisService.test.mjs
```

Resultado: 74 testes aprovados, zero falhas. Inclui 25 novos testes de contrato e atualização de 10 testes legados para contratos seguros. O preload bloqueia fetch e substitui apenas o módulo Supabase para evitar inicialização de Auth/Storage no Node. Não é carregado pelo Expo.

Esses testes comprovam payloads/chamadas e ausência de fallback, não a execução de RLS. Erros 42501 simulados nos testes de cliente não provam que o banco os emitirá.

Arquivo preparado, NÃO executado: supabase/tests/20261109_partner_access_authorization.sql. É transacional com ROLLBACK e trava de ambiente isolated; cria fixtures Auth/local/evento/solicitação e testa grants/RLS como anon, usuário, parceiro A contra parceiro B, parceiro revogado e admin. Inclui status forjado, troca de usuário, autopromoção, dono ausente, campanha rascunho, métricas deduplicadas, decisão única e auditoria protegida. As fixtures precisam ser adaptadas a triggers/NOT NULL reais antes de rodar no clone. Nunca rodar em produção.

Ainda preparar/executar no clone: concorrência em duas conexões; erro forçado na escrita de auditoria confirmando rollback de todos os efeitos; resposta perdida/retry; rejeição sem revogar parceiro anterior; preservação de admin solicitante; propriedade/visibilidade/expiração de destaques e projeção sem campos privados; eventos inativos/locais invisíveis; smoke tests das demais funcionalidades.

npm.cmd test continua bloqueado antes de executar a suíte de Auth por ERR_PACKAGE_PATH_NOT_EXPORTED no import interno expo-auth-session/build/QueryParams.js, problema preexistente não alterado nesta tarefa. Sem preload, o harness legado também inicializa AsyncStorage incompatível com Node; o preload isola os testes sem mudar o cliente do app.

Sintaxe JS/JSX revisada com Babel nos 37 arquivos de src. SQL recebe apenas revisão estática/lexical: nenhum parser PostgreSQL, servidor ou catálogo real foi usado. Não há certificação de compilação de PL/pgSQL nem de compatibilidade com constraints remotas. Nenhuma execução de SQL é necessária ou foi feita para essa validação.

## Arquivos e preservação

Novos: migração hardening; roteiro SQL de autorização; partnerAccessService.js; adminService.js; partnerAccessService.test.mjs; preload offline; este documento.

Modificados: parceiroService.js (somente operações inseguras substituídas), SejaParceiroScreen.js e ImpulsionarScreen.js (mensagens/fluxos compatíveis), test/parceiroService.test.mjs (contratos atualizados, casos não afetados mantidos).

AuthContext, navigation, PainelParceiroScreen, GerenciarCardapioScreen, cardapioService, inventário de diagnóstico e migração de fundação foram preservados integralmente. Não houve descarte de alterações locais ou atribuição dos três locais sem dono.

Referências oficiais: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/functions .
