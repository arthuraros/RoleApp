# Supabase ativo — riscos e hardening incremental

Data: 13/11/2026. Entrega: auditoria local e propostas revisáveis, sem execução remota.

## 1. Base de evidência e limites

Os achados abaixo foram **confirmados pelo catálogo segundo o resultado informado pelo responsável nesta conversa**:

- RLS desativada e permissões amplas para clientes em `campanhas_impulsionamento`, `eventos_locais`, `metricas_locais`, `roles` e `roles_etapas`.
- RLS ativa em `locais`, com INSERT para `authenticated` usando `WITH CHECK(true)`; proprietário pode atualizar `visivel`.
- Leitura pública de `usuarios` com `USING(true)`.
- `roleapp_admin_audit` instalada com RLS ativa.
- As três RPCs comerciais estão instaladas; seus corpos ainda não foram fornecidos.

O responsável esclareceu que o catálogo completo está em anexo, sem caminho local confirmado; os arquivos `20261113_admin_places_verification_readonly.sql` e `20261113_commercial_rpc_bodies_readonly.sql` são **consultas, não resultados**. O conteúdo integral do anexo não está acessível nesta execução. Não foram inventados nomes de policies, ACLs exatas, assinaturas SQL, owners, colunas adicionais ou corpos de funções.

Esses achados atualizam o estado antes marcado apenas como não verificado: instalação da auditoria e das três RPCs agora é evidência informada do catálogo. Isso não comprova segurança interna das funções ou privilégio exato de cada role/comando. Não foi realizada nova conexão ao Supabase, nem GET, SQL, chamada RPC ou teste mutador remoto nesta execução.

O código React Native atual, inclusive trabalho local não commitado, foi relido e preservado. As propostas anteriores de 09/11 e RA-11 são referências de desenho, **não contratos considerados instalados**. Em particular, não reaplicar migração que tenta criar `roleapp_admin_audit` ou redefinir funções que já existem. Não executar o conjunto antigo de migrações nem retirar suas travas.

## 2. Riscos priorizados

| Prioridade | Objeto e evidência | Risco técnico | O que ainda precisa ser confirmado |
| --- | --- | --- | --- |
| P0 | `locais`: INSERT autenticado com `WITH CHECK(true)` | Falta de validação por linha para criação. Se grants/constraints permitirem preencher proprietário/visibilidade, pode contornar revisão e criar vínculos indevidos | Colunas insertáveis, defaults, triggers, outras restritivas e requisitos reais das RPCs comerciais |
| P0 | `campanhas_impulsionamento`: RLS off + grants amplos | Cada operação concedida fica sem isolamento por usuário; escrita de status/conteúdo/vigência pode contornar aprovação; leitura pode expor dados comerciais | ACL por role/comando/coluna e checagens de publicação/ativação. Não houve demonstração de exploração |
| P0 para inspeção | RPCs comerciais existentes, corpos desconhecidos | Função privilegiada vulnerável pode contornar todo endurecimento de tabela, inclusive gravar propriedade/papel/auditoria | Autorização, owners, search_path, auxiliares, SQL dinâmico, locks, idempotência, auditoria e retornos |
| P1 | `metricas_locais`: RLS off + grants amplos | Exposição dos agregados e, quando houver escrita concedida, fabricação/remoção de totais | Overloads antigos de métrica, ACLs, incremento, deduplicação e atomicidade do RPC atual |
| P1 | `eventos_locais`: RLS off + grants amplos | Operações concedidas não distinguem local próprio de terceiro; conteúdo público pode ser adulterado | Colunas, vínculo com local, sequências, consumidores públicos e integrações |
| P1 | `usuarios`: leitura pública `true` | Todas as linhas passam nessa policy; confidencialidade depende dos grants e de outras restrições | Colunas efetivamente expostas, outras policies, views e usos externos. Não afirmar exposição de campos que não foram fornecidos |
| P1 para classificação | `roles`/`roles_etapas`: RLS off + grants amplos | Acesso sem isolamento às operações concedidas, com impacto dependente da finalidade real | Modelo, dados, dono, FKs, integrações, funções e política de compartilhamento |
| P1 | `locais.visivel` editável pelo proprietário | Um único booleano compartilhado não pode representar bloqueio administrativo persistente | Política de moderação independente e consumidores que a respeitam; não retirar o toggle legítimo por conveniência |
| P1 para certificação | Auditoria instalada com RLS ativa | RLS ativa não prova append-only, leitura administrativa ou log obrigatório nas transações | Grants de tabela/coluna, policies, FKs/ON DELETE, triggers e inserts efetivos das RPCs |
| P1 | Concorrência/autorizações em cache | Decisões ou edições podem sobrescrever mudanças/repetir efeitos; revogação pode competir com operação em andamento | Garantias nos corpos reais; testes em duas conexões num clone |

RLS desligada é evidência confirmada; **quais comandos cada cliente consegue efetuar** depende da ACL integral. Não se assume que todo grant amplo inclua todos os comandos para `anon`. A hipótese de autoativação depende também do caminho de escrita e publicação. Não foram feitas escritas para provar ataques.

Uma cadeia potencial a investigar é criação de local sem revisão → propriedade usada como autorização → campanha indevida. Ela não foi comprovada: uma RPC pode exigir aprovação individual e impedir a segunda etapa. Por isso fechar INSERT e auditar a fonte de aprovação são ações complementares.

### `roles` não significa `user_roles`

O aplicativo lê o papel por **`user_roles(user_id,role)`** e reconhece `usuario`, `parceiro`, `admin`. Não foram encontradas chamadas a `roles` ou `roles_etapas` no `src`. Não há base para tratá-las como tabela de administradores ou migrar seus registros para `user_roles`. A ausência de consumidor RN também não prova que possam ser isoladas sem afetar jobs, integrações ou auxiliares SQL. Sua finalidade permanece pendente, sem atribuição de dono/coluna inventada.

## 3. Mapeamento de leituras e escritas do aplicativo

| Tabela/domínio | Operações atuais e fontes | Dependência do fluxo / impacto do corte |
| --- | --- | --- |
| `locais` público | `locaisService.getLocais/searchLocais`: SELECT * de visíveis; `getLocalById`: SELECT * por ID | Home, mapa e detalhes. Não há filtro de visibilidade no cliente por ID; o backend deve decidir acesso |
| `locais` em favoritos | `favoritosService.getLocaisFavoritos`: relação `locais(*)` | Alterações de RLS local podem tornar a relação null; o serviço já filtra relações ausentes. Não apagar favoritos por esse motivo |
| `locais` do parceiro | `getLocaisDoParceiro`: SELECT * por proprietário; `listarMeusLocais`: projeção por proprietário; `getLocalComDetalhes`: local por ID + horários/eventos | Painel do parceiro, edição, estatísticas e impulsionamento; consulta de propriedade não prova aprovação individual |
| `locais` escrita | `locaisService.updateLocal` e `parceiroService.updateLocal`: UPDATE com allowlist do cliente, RETURNING; `EditarLocaisScreen`: sete campos textuais e toggle separado de `visivel` | Revogar UPDATE de `visivel` quebra uma ação validada. Allowlist deve existir também no banco; IDs/proprietário não podem ser alteráveis pelo cliente |
| `locais` coordenadas | `atualizar_localizacao_parceiro`: ID numérico, latitude/longitude; cliente valida confirmação de ID/coordenadas | RA-06 deve continuar funcionando. Se o RPC atual for invoker e depender de grants diretos, adaptar/revisar antes de restringir colunas |
| `locais` criação/exclusão | `createLocal` e `deleteLocal` públicos recusam execução; decisão comercial recebe ID existente | Fechar INSERT/DELETE direto não altera uma operação pública legítima desses métodos. Ainda depende de conferir criação/vinculação dentro do backend comercial e consumidores externos |
| `eventos_locais` leitura | `getLocalComDetalhes/getEventos`: SELECT * filtrado por local | Edição do parceiro carrega eventos. Não foi localizado consumidor anônimo de eventos no código atual |
| `eventos_locais` escrita | `criarEvento`: INSERT de `id_local,titulo,dias,hora,detalhes,ativo`, SELECT/single; `removerEvento`: DELETE por ID | Serviço de criação existe; não foi localizado chamador de criação na tela atual. Remoção é chamada na edição. DELETE deve conferir o dono da linha no banco, não apenas o ID |
| `campanhas_impulsionamento` leitura | `getCampanhas`: SELECT * com filtro opcional por local | Impulsionar consulta por local; chamar o serviço sem ID hoje gera consulta ampla. RLS deve limitar mesmo sem filtro |
| Campanhas escrita/publicação | `solicitar_campanha_segura`, `ativar_campanha_segura`; `listar_ofertas_campanha`, `listar_destaques_publicos` | Serviço não manda preço/status/datas/ator na solicitação. Home/mapa dependem da publicação pública continuar funcionando sem SELECT amplo na tabela privada |
| `metricas_locais` leitura | `getMetricasDoLocal`: SELECT * por local/data | Painel/estatísticas do parceiro; local deve ser próprio aprovado ou leitura administrativa autorizada |
| Métricas escrita | `registrar_interacao_segura`, evento unitário; Home, mapa, Favoritos e detalhes registram views/cliques/visitas | Cliente atual não faz upsert direto. Falha de registro é geralmente capturada sem bloquear navegação; isso pode ocultar regressão de métricas, portanto verificar backend explicitamente |
| `usuarios` leitura | `profileService`: próprio id/nome/foto e próprio id/foto no perfil inicial | SELECT próprio dessas colunas precisa permanecer. Não foi localizado SELECT * ou busca de todos os perfis no RN atual |
| `usuarios` escrita | `updateName`: próprio nome, RETURNING id/nome; `uploadUserAvatar`: Storage e UPDATE próprio de foto_url | A proposta de privacidade não altera essas escritas nem bucket/Storage. Provisionamento por triggers/integrações ainda exige revisão do SQL real |
| `roles`/`roles_etapas` | Nenhum consumidor direto no `src` encontrado | Operações externas/indiretas desconhecidas: classificação obrigatória antes de qualquer revogação |
| `roleapp_admin_audit` | Nenhum acesso direto do RN; histórico vem por RPC | Não recriar nem limpar. Conservar o formato de histórico e a escrita transacional do backend |
| Solicitações/papéis | `solicitacoes_parceria` tem INSERT próprio/pendente e leitura própria pelo serviço; `user_roles` é lida no perfil; administração por RPCs | São dependências de raiz: não revogar INSERT de solicitações/telefone nem promover usuários como efeito colateral deste plano |

Dependências adjacentes: horários, `local_categorias`, categorias, cardápio, avaliações e fotos referenciam locais ou participam de leituras públicas. Não serão alteradas em massa. `EditarLocaisScreen` salva dados e horários em paralelo; `salvarHorarios` faz DELETE e INSERT em chamadas separadas. A operação composta não é atômica hoje e não deve ser anunciada como corrigida por RLS.

As telas de estatísticas/painel ainda contêm fallbacks demonstrativos. A ausência de erro visual não comprova que os agregados estejam acessíveis após o corte. Conferir respostas reais e distinguir “sem dados” de falha; não usar números fictícios para validar o hardening.

## 4. Contratos que devem ser seguros no servidor

| Operação | Destino recomendado | Compatibilidade nesta preparação |
| --- | --- | --- |
| Encaminhar/decidir parceria | Auditar e endurecer **as RPCs comerciais existentes**, sem substituição cega | Preservar nomes, argumentos, tipos e respostas atuais após confirmar DDL |
| Consultar decisão | RPC administrativa com projeção mínima e autorização atual | Preservar objeto consumido pelo histórico |
| Criar/vincular local e mudar proprietário | Somente backend auditado, autorização e evidência de vínculo | Nenhum INSERT cliente, autoassociação por nome ou promoção por propriedade |
| Editar local administrativamente | RPC nova/adaptada: capacidade, versão, patch permitido, motivo, idempotência, log atômico | Interface ainda não implementada; não liberar UPDATE direto a admin como atalho |
| Bloquear/arquivar local | RPC própria + estado administrativo separado + publicação coerente | Não apagar relações nem usar `visivel` como único bloqueio. Exclusão física permanece fora do pacote |
| Edição simples do parceiro | Pode permanecer UPDATE limitado por grants + RLS | Preservar os sete campos atuais e `visivel`. Migração para RPC só quando o cliente compatível estiver pronto |
| Coordenadas | Reutilizar `atualizar_localizacao_parceiro`, após revisão | Não conceder UPDATE direto de latitude/longitude para contornar erro |
| Local + horários em conjunto | RPC transacional candidata em etapa própria | Não revogar a API antiga antes de versão compatível; não foi implementada agora |
| Campanha: solicitar/ativar/revisar/pausar/retomar/encerrar | RPCs autorizadas; reutilizar existentes e criar só transições necessárias após revisar trigger | Nada de INSERT/UPDATE direto, novo preço/plano ou reinício de vigência no retry |
| Publicar destaques | RPC/view com campos publicáveis e verificação de autorização individual/vigência/local | Tabela privada não pode exigir fallback para SELECT público completo |
| Registrar métricas | RPC unitária, atômica e com identidade/data do servidor | Reutilizar sem alterar silenciosamente deduplicação, semântica ou contagens |
| Evento próprio simples | Pode permanecer INSERT/UPDATE/DELETE sob RLS e allowlist | Preservar RETURNING e sequência necessária; mudar `id_local` por UPDATE não é autorizado |
| Perfil próprio nome/foto | Pode permanecer UPDATE próprio com campos limitados | Não alterar Auth ou Storage neste pacote; leitura privada é mudança separada |
| Conceder/revogar admin | Futuro contrato de recuperação autorizado, auditado e serializado | Não instalado por este pacote; não conceder papel pelo cliente nem remover último recuperador |

Para RPC privilegiada: preferir invoker onde a RLS segura atende ao contrato; usar definer só quando necessário, com owner/grants/search_path revisados. `auth.uid()` e papel/capacidade atuais vêm do servidor. `authenticated` poder chamar a função não significa estar autorizado a decidir. Não usar e-mail, metadados editáveis ou papel no payload como autoridade.

## 5. Auditoria das RPCs: pendente de definições

As três instaladas são `encaminhar_solicitacao_decisao`, `decidir_solicitacao_comercial` e `obter_detalhe_decisao_admin`. A consulta existente `20261113_commercial_rpc_bodies_readonly.sql` permite uma coleta futura pelo responsável; **não foi executada nesta etapa**. Definições podem conter literais sensíveis, portanto precisam de canal restrito e revisão antes de compartilhamento.

Checklist por função/overload:

1. Assinatura, defaults, retorno e owner correspondem ao contrato atual? IDs Number do cliente não autorizam inventar tipo PostgreSQL.
2. PUBLIC/anon têm EXECUTE administrativo? Authenticated comum/parceiro são recusados no corpo? Auxiliares têm escopo mínimo?
3. A identidade é `auth.uid()` e a autorização é revalidada sob protocolo de locks compatível com revogação? O pedido/local/proprietário é conferido no banco?
4. Transições são válidas? Repetir/concorrer uma decisão não duplica vínculo/local/papel/log? Rejeitar não remove parceria anterior válida?
5. Auditoria instalada recebe ator/motivo/alvo/antes-depois necessários na mesma transação? Falha de log reverte a decisão?
6. Erros/triggers não produzem falso sucesso, zero linhas, resultado alterado ou gravação parcial? Retry após timeout reconcilia o estado confirmado?
7. `search_path`, nomes qualificados e SQL dinâmico impedem resolução/injeção indevida? Examinar toda cadeia de auxiliares, não apenas o corpo principal.

Aplicar o mesmo exame a coordenadas, solicitação/ativação/publicação/ofertas/interações e overloads legados como `incrementar_metrica`. RLS/grants nas tabelas não fecham uma função definer vulnerável. Mudanças necessárias nesses corpos terão proposta incremental própria após receber o SQL; nenhum corpo foi fabricado, substituído ou aprovado agora.

## 6. Propostas SQL e condições de liberação

Pasta: `supabase/proposals/20261113_hardening_incremental/`. O README detalha cada contrato.

São oito arquivos candidatos independentes, todos com exceção incondicional antes de DDL, fingerprint esperado nulo, gates de revisão falsos e `ROLLBACK` final. Incluem preflight de alvos/helpers/raiz de papéis, detector de drift e postflight de RLS/ACLs efetivas por tabela/coluna. Não criam helpers, tabelas, usuários ou RPCs e não atualizam dados.

O DDL candidato acrescenta policies restritivas e grants mínimos, sem apagar policies desconhecidas. Permissivas antigas se combinam por OR; a guarda restritiva limita esse conjunto. Outras restritivas ainda podem bloquear usos legítimos, por isso precisam ser testadas. As propostas não usam loops para apagar todas as policies nem `CASCADE`.

Os helpers mencionados são **pré-requisitos propostos, instalação não confirmada**. Não aplicar uma policy baseada em `partner_owns` que exija vínculos novos ausentes e bloqueie parceiros antigos válidos. Primeiro provar a fonte canônica de aprovação individual pelas RPCs/auditoria existentes. Não gerar vínculo/papel/visibilidade por backfill automático para passar testes.

O preflight exige ausência de escrita direta cliente em `user_roles`, mas não a revoga: uma divergência interrompe a etapa e exige revisão específica preservando provisioning. Também exige fechamento de rotas alternativas inseguras, não apenas leitura dos corpos. Não habilitar flags para contornar esses requisitos.

O diagnóstico novo `20261113_hardening_manifest_readonly.sql` descreve uma coleta futura de fingerprint. Não foi executado. Digest identifica divergência do catálogo, não comprova segurança, aprovação, dados ou ausência de SQL dinâmico externo. Cada etapa usa o estado revisado **posterior à etapa anterior**. Não reutilizar um hash único para todos os arquivos ou copiar cegamente o hash do clone.

O postflight de catálogo não executa helpers/RPCs de negócio nem simula JWT. Não certifica comportamento de RLS ou concorrência. Sequências, schemas expostos e caminhos externos requerem inspeção adicional; não há grants genéricos de USAGE ou revogação de roles herdadas para “fazer passar”.

## 7. Sequência de implantação futura

### Preparação obrigatória, ainda bloqueante

- Receber o catálogo integral e os corpos em canal seguro; reconciliar com os achados desta conversa e exportar snapshots de policies/ACLs, tipos, FKs, triggers, views, funções e consumidores externos.
- Revisar `user_roles`, auditoria instalada e contratos canônicos. Preparar correções específicas de RPCs/auxiliares se necessárias, mantendo API atual e decisões antigas.
- Criar clone autorizado e plano de backup/PITR/restauração testado. Fixtures e testes mutadores somente nesse ambiente, não no Supabase real.
- Definir artefatos finais, fingerprints por ambiente/etapa e DDL de reversão limitado aos objetos tocados. Não inserir migrações antigas inteiras no corte.

### Etapas pequenas

| Ordem | Proposta | Pré-validação | Pós-validação antes de avançar |
| --- | --- | --- | --- |
| 0 | Correções de contratos ativos que a revisão demonstrar necessárias | Corpos/ACLs/retornos, fonte de aprovação, provisioning e auditoria | API compatível e testes positivos/negativos; fechar overloads inseguros sem presumir assinaturas |
| 1 | `01_auditoria` | RPCs conseguem registrar log sem grant direto do cliente | Cliente não insere/altera/apaga log; decisões legítimas têm log e rollback em falha |
| 2 | `02_locais_entrada` | Criação/vínculo administrativos funcionam por caminho confiável | INSERT/DELETE diretos negados para usuário/parceiro/admin; Home/mapa/favoritos e decisões preservados |
| 3 | `03_locais_edicao_parceiro` | Tipos, aprovação individual real, casos legados, coordenadas e RETURNING | Dono legítimo edita campos atuais e toggle; terceiros não editam; dono/ID permanecem imutáveis |
| 4 | `04_campanhas` | Solicitar/ativar/publicar funcionam com tabela privada | Sem escrita direta, sem leitura comercial de terceiros, destaques autorizados continuam públicos |
| 5 | `05_metricas` | RPC unitária e leitura privada, overloads alternativos fechados | Totais não são adulteráveis, parceiro lê só os seus e interações legítimas continuam registradas |
| 6 | `06_eventos` | Público/proprietário/colunas/seq identificados; integrações externas mapeadas | Criar/ler/remover próprios funciona; outro parceiro não interfere, inativos não vazam ao público |
| 7 | `07_usuarios_leitura` | Cadastro, perfil, nome/avatar, RETURNING, funções e consumidores públicos revisados | Perfil próprio funciona; outros perfis/colunas privadas não são expostos |
| 8 | `08_roles_legadas` ou variante revisada | Finalidade e todos os consumidores conhecidos | Nenhum fluxo legítimo interrompido; nenhum isolamento por dono inventado |

Locais e campanhas são prioridade funcional. A correção de privacidade de `usuarios` pode ser antecipada após fechar suas dependências. Não declarar raiz de autorização segura entre as etapas 2 e 3 se a inspeção revelar UPDATE amplo de proprietário/ID.

Cada etapa deve formar uma transação curta no artefato futuro aprovado, com locks/timeouts e pós-condições. Suspender alterações privilegiadas concorrentes de catálogo na janela; lock de tabela não serializa todas as mudanças de função/papel. Se o contrato compatível exige corte conjunto de RPC/policy, tratar esse par como unidade atômica. Não expor um estado intermediário incompatível aos clientes.

Após autorização explícita de implantação, validar leituras com JWTs de teste e realizar smoke tests do app conforme o risco. Nenhuma autorização para executar estes arquivos decorre deste relatório. Nesta execução não se alterou sequer configuração de sessão remota.

## 8. Matriz de autorização e concorrência para o clone

Identidades: anônimo; usuário comum; solicitante pendente; parceiro A com local aprovado; parceiro B; administrador atual; administrador revogado. Níveis de recuperação, se ainda inexistentes, não são simulados como funcionalidade pronta. Provisionamento/fixtures só por procedimento autorizado no clone, sem dados reais.

| Caso | Resultado exigido |
| --- | --- |
| Anônimo/comum/parceiro/admin fazem INSERT direto de local | Negado; nenhum vínculo/proprietário/papel/log de aprovação é criado |
| Aprovação comercial legítima / usuário comum chamando a mesma função | Admin autorizado conclui com log; comum/parceiro são negados, sem efeitos |
| Parceiro A atualiza texto/`visivel` do próprio local aprovado | Sucesso compatível com o app atual; local B e dono/ID não mudam |
| Parceiro B tenta editar A, usar ID falso, mudar dono/ID/coordenadas via PATCH genérico | Negado por grants/policy/contrato; verificar estado real, não apenas mensagem |
| Coordenadas pela RPC própria, local alheio e retorno adulterado | Próprio autorizado funciona; alheio é negado; frontend continua exigindo confirmação de ID/coordenadas |
| Favoritos/locais invisíveis/detalhes por ID | Leitura conforme regra revisada; nenhum DELETE em favorito/avaliação para ocultar local |
| Campanhas sem filtro, local B na rota ou proprietário forjado no payload | Nenhum vazamento/associação de campanha de outro parceiro |
| INSERT/UPDATE/DELETE de campanha por API direta | Negado inclusive ao admin cliente; ativação somente por função administrativa autorizada |
| Solicitação de campanha própria / ativação por comum ou parceiro | Solicitação segue contrato real; ativação não administrativa negada |
| Publicação de campanha sem autorização individual, fora do período ou local restrito | Não publicada; não autoaprovar legado para manter aparência de sucesso |
| Leitura/escrita direta de métricas por comum/parceiro B | Sem acesso aos totais alheios e sem escrita direta de totais |
| Interação unitária legítima | Registrada pelo contrato aprovado; ator/data/totais não aceitos do cliente; nenhuma mudança silenciosa de deduplicação |
| Criar evento com RETURNING, consultar próprios, remover por ID | Próprio funciona; evento de B não pode ser criado/modificado/removido por A |
| Evento com `id_local` alterado via UPDATE | Negado; vínculo imutável ao cliente |
| Perfil inicial, nome, foto, cadastro/login existentes | Funcionais; SELECT de terceiros e colunas não permitidas negado; Storage inalterado |
| DML direto na auditoria | Negado para cliente, inclusive admin; histórico por caminho autorizado preservado |
| `roles`/`roles_etapas` | Resultado definido pela classificação real; não testar com política inventada de proprietário |
| Role/metadata/payload falsificados | Não concedem capacidade administrativa ou parceria |

Concorrência em conexões separadas:

- Duas decisões sobre o mesmo pedido: um efeito válido ou repetição idempotente, sem locais/logs duplicados.
- Revogação concorrente e ação administrativa: protocolo comum de locks/revalidação; revogação efetiva impede próxima operação. Não prometer que um cache de UI ofereça essa garantia.
- Duas futuras edições com a mesma versão: a segunda recebe conflito, sem sobrescrever a primeira; admin comum não obtém privilégios superiores.
- Retry após resposta perdida: consultar resultado/chave e não repetir efeitos nem reiniciar período de campanha.
- Falha ao inserir auditoria: rollback de toda a alteração; trigger que suprime escrita não pode gerar falso sucesso.
- Grant/policy herdada inesperada e mudança de catálogo: preflight/postflight interrompem a etapa; nenhuma revogação global improvisada.
- Duas revogações de futuros recuperadores: último acesso efetivo preservado por serialização no backend. Gestão de administradores não é instalada neste pacote.

Testar por SQL/HTTP com papéis reais de teste, não só como `postgres`, pois owner/BYPASSRLS podem mascarar falhas. Resposta vazia/zero linhas não é necessariamente erro de API; sempre verificar ausência de efeitos e retorno correto. Não executar esses testes mutadores em produção “para confirmar bloqueio”.

## 9. Reversão e preservação de dados

Antes do commit futuro, erro de DDL, drift, timeout ou grant inesperado deve abortar e reverter a transação. Não ignorar erro de policy já existente nem usar `IF NOT EXISTS` para aceitar definição divergente.

Após commit, suspender novas ações afetadas e preferir correção limitada. Guardar um DDL de restauração exato das ACLs/policies tocadas, condicionado a fingerprint e revisão, mas **não reabrir automaticamente o estado vulnerável**. A disponibilidade deve ser recuperada por contrato seguro, não por RLS off ou `WITH CHECK(true)`.

Uma reversão pode reverter só a mudança de apresentação/endpoint compatível ou corrigir uma guarda excessiva, preservando as restrições essenciais. Se uma correção segura não estiver pronta, manter a ação afetada temporariamente indisponível é preferível a liberar escrita irrestrita; isso exige comunicação operacional e não ocorreu nesta execução.

Não há DML, backfill, mudança de preço/plano, exclusão física ou CASCADE nos candidatos. Não apagar auditoria nem sobrescrever decisões novas com restauração indiscriminada. Recuperação de dados por backup/PITR, se algum dia necessária, exige procedimento próprio com reconciliação das alterações posteriores e autorização específica.

## 10. Entrega e limites de validação

- Relatório, README, oito propostas bloqueadas, diagnóstico de fingerprint e verificações estáticas locais.
- Nenhuma mudança em `src`, dependências, Android, Development Build ou propostas anteriores. O trabalho local da equipe foi preservado.
- Nenhuma chamada ao Supabase, execução SQL remota, alteração de dados/RLS/grants/funções, commit ou push.
- Sem corpos de RPC, sem catálogo integral acessível e sem execução PostgreSQL: **não existe parecer de backend seguro ou pacote liberado para implantação**.
- Testes offline focados: **16 aprovados, zero falhas** — 12 verificações novas dos artefatos e 4 regressões de contratos comerciais. Conferem travas, ausência de DML/DDL de funções, fingerprint consistente e limites de permissões propostos.
- `git diff --check` aprovado; todos os arquivos novos também conferidos sem erros de whitespace.
- Suíte completa, Expo Doctor e bundle Android não foram repetidos: nenhuma alteração de aplicação, dependência ou configuração nativa nesta entrega.
- Esses resultados não comprovam parsing PostgreSQL, autorização por JWT, compatibilidade de legado ou concorrência. Nenhum SQL, inclusive os testes de autorização, foi executado em banco.
