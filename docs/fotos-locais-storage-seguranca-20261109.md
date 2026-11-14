# Proposta bloqueada: fotos de estabelecimentos e Storage

Data: 09/11/2026. Branch conferida: `feature/validacao-seguranca-supabase`.

**Toda a implantação permanece bloqueada.** Esta entrega prepara arquivos locais para revisão estática. Nenhum SQL foi executado, nenhuma conexão com o Supabase foi realizada e nenhum bucket, dado legado ou arquivo de `src/` foi alterado. As quatro migrações originais e a proposta de Cardápio/avatares foram somente inspecionadas; suas travas e manifestos foram preservados. Não houve commit, push ou merge. O arquivo local preexistente `TESTE_CODEX.md` foi preservado.

## Arquivos preparados

| Arquivo novo | Finalidade |
| --- | --- |
| [Diagnóstico READ ONLY](../supabase/diagnostics/20261109_fotos_locais_storage_readonly.sql) | Coleta futura de catálogo, manifesto, policies completas, ACLs de tabela/coluna, privilégios efetivos, membros de papéis, dependências e contagens. Transação READ ONLY com ROLLBACK; não chama funções de negócio. |
| [Proposta SQL complementar bloqueada](../supabase/proposals/20261109_fotos_locais_storage_blocked.sql) | Trava incondicional antes de qualquer DDL/LOCK, manifesto e prefixo de URL NULL, três confirmações false, preflight e pós-verificações. Não integra a fila automática de migrations. |
| [Matriz SQL bloqueada](../supabase/tests/20261109_fotos_locais_authorization_blocked.sql) | Exercícios futuros de autorização com fixtures novas em clone autorizado, manifesto de fixtures NULL, checagem de ambiente isolado e ROLLBACK. Não grava em `storage.objects`. |
| [Teste offline dos arquivos](../test/fotosLocaisProposal.test.mjs) | Confere igualdade literal do manifesto entre coleta/preflight, presença da trava e limites textuais do diagnóstico. Não interpreta PostgreSQL e não simula RLS. |
| Este relatório | Decisões, dependências, matriz HTTP/JWT futura, riscos e bloqueadores. |

## Evidência e contratos ainda não confirmados

As informações fornecidas pelo responsável do banco confirmam RLS ativo e FORCE RLS desativado em `fotos_locais`, SELECT público com `USING (true)`, ausência de policies de escrita, grants excessivos, PK `id_foto` e FK `id_local → locais(id_local)` com exclusão em cascata. Também confirmam `url_foto`, `locais.imagem_url`, bucket público com limite de 5 MB e MIME JPEG/PNG/WebP, sem fotos ou objetos no momento da coleta. Não recolhemos esses dados remotamente.

A ausência de policies de escrita já impede CRUD de clientes normais sob RLS, apesar dos grants. TRUNCATE não é limitado por RLS; privilégios administrativos de tabela, caminhos com SECURITY DEFINER e papéis que ignoram RLS precisam de tratamento próprio. A proposta não parte da premissa de que todos os grants de escrita atuais já permitem gravar linhas.

Ainda faltam os tipos completos, nulabilidade, defaults/identidade de `id_foto`, colunas adicionais, CHECKs/domínios, triggers, índices, grants de coluna, sequência eventual, ACLs efetivas e dependências. O diagnóstico preparado retorna definições de constraints, defaults, hashes de triggers e os objetos dependentes para revisão. Não inventa tipo de ID, nome de sequência, nome de policy remota nem host de Storage. Domínios, corpos de triggers/RPCs e dependências transitivas identificados pela coleta precisam de revisão complementar antes da autorização.

A busca local em `src/` não encontrou `fotos_locais`, `url_foto` ou upload para `imagens-locais`. Encontrou consumo de `imagem_url` em [HomeScreen.js](../src/screens/HomeScreen.js), [DetalhesLocalScreen.js](../src/screens/DetalhesLocalScreen.js) e [MapaScreen.js](../src/screens/MapaScreen.js). Serviços de locais consultam a tabela `locais`. Não foi identificada sincronização automática entre `url_foto` e `imagem_url`; ela não foi introduzida. Ausência no repositório não prova ausência de consumidores externos, jobs, SQL dinâmico ou links persistidos.

## Decisões da proposta

### Autorização individual e leitura

Reutiliza `roleapp_security.partner_owns(id_local::text)` da migração 00200. Ele chama `approved_local_owner`, que exige simultaneamente proprietário atual, papel parceiro no banco, vínculo individual ativo, solicitação aprovada e auditoria correspondente à revisão. O papel global e a propriedade isolados não concedem gestão. `is_admin()` consulta autorização confiável em `public.user_roles`; não confia em papel informado pelo cliente.

`fotos_locais` recebe permissivas explícitas para as operações propostas e guardas RESTRICTIVE para limitar permissivas antigas ou futuras. SELECT permite local visível, parceiro individualmente autorizado ou admin. INSERT/UPDATE/DELETE exigem parceiro autorizado naquele local ou admin. UPDATE verifica a linha antiga e a nova. O SELECT antigo `true` não é apagado: sua combinação com a guarda limita a leitura. Policies restritivas anteriores também continuam válidas e podem exigir compatibilidade adicional no clone.

Locais legados com proprietário, mas sem vínculo aprovado/auditado, permanecem sem acesso de parceiro. Locais sem proprietário não são atribuídos a ninguém. Fotos de locais visíveis podem ser públicas independentemente da aprovação do parceiro; isso não concede escrita. Administradores legítimos poderão corrigir URLs e excluir/criar metadados inclusive em locais sem dono. Não há aprovação, promoção de usuário, vinculação ou regularização automática.

### Privilégios mínimos em fotos_locais

Revoga ALL de PUBLIC/anon/authenticated na tabela e em todas as colunas, incluindo TRUNCATE, TRIGGER, REFERENCES e MAINTAIN quando conhecido pela versão. Reconcede:

| Papel cliente | Grants propostos |
| --- | --- |
| anon | SELECT apenas de `id_foto`, `id_local`, `url_foto`, sujeito à RLS |
| authenticated | Mesmo SELECT; INSERT de `id_local,url_foto`; UPDATE de `url_foto`; DELETE de linhas, sempre sujeito à RLS |

`id_foto` e `id_local` não são atualizáveis pela API, inclusive pelo admin autenticado. Reassociação exigirá decisão explícita e revisão futura; não se introduz um bypass de administrador. SELECT `*` poderá falhar se houver outras colunas: esse consumidor deve ser identificado antes da aprovação. Colunas adicionais obrigatórias sem default/identidade fazem o preflight recusar o INSERT mínimo.

Se houver sequência própria de `id_foto`, a proposta a identifica pelo catálogo, recusa outros consumidores catalogados, revoga os grants clientes e concede somente USAGE a authenticated. Não presume que PK seja serial; defaults UUID/identidades e seus privilégios continuam pendentes de validação. Não concede UPDATE/setval, não reinicia sequência e não altera IDs.

Pós-verificações usam privilégios efetivos de tabela, coluna e sequência, incluindo grant options. Grants herdados que continuarem excessivos abortam a transação. A coleta inclui memberships e distingue herança atual de associação que pode permitir SET ROLE; essas associações exigem revisão explícita. Não revogamos automaticamente papéis/grupos compartilhados. Também bloqueamos membership no owner, superuser/BYPASSRLS e CREATE nos schemas relevantes para os clientes.

### Caminho e URL: contrato NOVO sob aprovação

**`id_local/nome_arquivo` é uma proposta, não um formato comprovado de produção.** Para novos objetos, o candidato usa exatamente dois segmentos, ID canônico igual a `locais.id_local::text` e basename ASCII alfanumérico com `_`/`-` e extensão minúscula `jpg`, `jpeg`, `png` ou `webp`. Não aceita segmentos extras, `%`, query, fragmento ou traversal. A allowlist de nomes/extensões é uma decisão proposta; precisa ser aceita pelos futuros consumidores. Nome/extensão não comprovam o conteúdo do arquivo.

O prefixo HTTPS real do endpoint público permanece NULL. A proposta requer revisão desse prefixo e o incorpora como literal SQL nas policies de URL; não consulta parâmetro de cliente ou GUC para autorizar operações. `url_foto` deverá apontar para o mesmo `id_local` da linha. CDN, URL transformada, domínio customizado com outro formato ou arquivo externo não são presumidos compatíveis. Se o contrato real divergir, deve-se revisar a proposta antes de preencher parâmetros.

Não se exige que o objeto já exista ao inserir o metadado. Upload de bytes e gravação PostgreSQL não formam uma transação única: falhas podem deixar objeto sem metadado ou URL sem objeto. Recuperação/compensação, exclusão e manutenção de `locais.imagem_url` precisam de contrato futuro. ON DELETE CASCADE remove metadados de fotos, não os bytes do Storage. Nenhum dado, arquivo ou URL existente é normalizado nesta entrega.

### Storage: escopo, administração e limite de privacidade

As novas policies são restritas ao bucket `imagens-locais`; as guardas são neutras para os demais buckets. Escrita exige caminho proposto válido, local existente e autorização individual ou admin. UPDATE avalia origem e destino dentro desse bucket. Não se concede acesso a outro local pendente do mesmo parceiro. Admin pode listar/excluir metadados do bucket para manutenção; upload/atualização exige destino válido, sem criar dono ou aprovação. Movimentos entre buckets dependem também das policies do outro bucket e dos contratos da API; não se promete imutabilidade de `bucket_id` por estas guardas isoladamente.

Não altera `storage.buckets`, MIME, limite, visibilidade ou objetos existentes. Não revoga globalmente grants de `storage.objects`, porque isso alcançaria avatares e outros buckets. O preflight exige grants CRUD necessários e recusa privilégios efetivos fora de CRUD nessa tabela; caso os encontre, a implantação continua bloqueada para revisão dos consumidores e de uma revogação separada. Nenhum grant global é ampliado para contornar erro de API.

**Bucket público: RLS de `storage.objects` não protege o download pela URL pública.** Listagem/metadados e escrita podem ser limitados, mas a URL de uma imagem de local invisível pode continuar acessível sem JWT e por cache/CDN. A proposta exige aprovação explícita da semântica de ativo público, inclusive quando um local perde visibilidade. Se a exigência for confidencialidade/revogação de download, esta proposta não atende: será necessária outra decisão sobre armazenamento privado e URLs assinadas, fora desta etapa. `locais.imagem_url` também pode conter links externos que estas policies não controlam.

## Dependências e ordem apenas prevista

1. Revisar esta entrega estaticamente. A execução e a criação de clone continuam proibidas nesta etapa.
2. Após autorização separada, preparar clone isolado e confirmar versão PostgreSQL, schema real, roles/grants, consumidores, contratos de URL/nome/publicidade, sequências e dependências. Não usar tokens/dados de produção nos testes.
3. Após revisões próprias, a ordem candidata das quatro migrações continua **00100 → 00150 → 00175 → 00200**. Este relatório não as libera nem modifica suas travas.
4. Revisar a proposta anterior de Cardápio/avatares e, somente se autorizada, aplicá-la no clone antes desta proposta. 00200 verifica preservação das policies anteriores; as complementares ficam depois dela.
5. Coletar novamente o manifesto no clone **no ponto exato anterior a esta complementar**, já considerando as policies de Cardápio/avatares revisadas. Manifestos/OIDs/ACLs de outro ponto ou ambiente não devem ser copiados cegamente. Revisar resultados, dependências, hosts e flags; não preencher valores fictícios.
6. Somente uma autorização posterior poderá aprovar uma versão executável. Neste arquivo a primeira exceção continua incondicional. O preflight também recusa novos registros/objetos: a evidência de vazio tem prazo e não autoriza limpeza automática.
7. Sob autorização futura, usar janela de manutenção: o LOCK de `storage.objects` pode bloquear operações de todos os buckets enquanto a transação revisada altera policies. Não executar DDL concorrente. Falha de preflight/pós-verificação deve abortar toda a transação; não continuar no SQL Editor após erro sem ROLLBACK.
8. Executar as matrizes SQL e HTTP/JWT no clone. Regressões de autenticação, mapa, filtros, favoritos, avaliações, Cardápio e avatares continuam necessárias. Aplicação real só poderá ser discutida depois das evidências e autorização explícita.

Em falha durante a transação, ROLLBACK desfaz grants/policies sem reescrever dados. Após COMMIT autorizado no futuro, não há rollback genérico seguro nesta entrega: será preciso comparar o snapshot de ACLs/policies do ambiente, interromper novas gravações e revisar a recuperação específica. Não restaurar automaticamente `USING(true)` ou grants excessivos. Não manipular bytes/linhas do Storage diretamente para simular recuperação.

## Matriz SQL preparada, não executada

O arquivo de testes usa fixtures novas A/B/C/D: A visível e aprovado para o parceiro; B invisível do mesmo proprietário, sem aprovação individual; C visível de terceiro; D invisível sem dono. Os usuários comum/parceiro/admin devem existir no Auth do clone, com papéis confiáveis e auditoria de aprovação criada pelo fluxo real. O manifesto de fixtures e o prefixo de URL permanecem NULL. A matriz recusa tabelas de fotos já preenchidas e não deve receber IDs legados.

Sequências podem avançar mesmo com ROLLBACK; a matriz é exclusiva de clone descartável e não tenta restaurar contadores. Para o caso isolado de URL NULL, aceita-se recusa por RLS ou por NOT NULL caso essa constraint seja confirmada. Os testes de autorização usam cargas válidas para evitar confundir bloqueio de autorização com erro de dados.

Cobertura preparada: leitura pública A/C e ocultação B/D; negação de escrita anônima/comum; CRUD permitido em A; negação de INSERT em B e UPDATE/DELETE em C; `id_local` imutável; URL cruzada, externa, codificada, com query e NULL rejeitada; vínculo desativado retira escrita; admin lê/corrige/exclui em D sem atribuir dono; privilégios perigosos ausentes e snapshot integral de `locais` preservado. Tudo termina em ROLLBACK. Os cenários SQL não comprovam upload, bytes, semântica da API ou concorrência.

## Matriz HTTP/JWT futura — exclusivamente clone autorizado

Os exemplos abaixo são especificações de requisição, **não foram executados**. `CLONE_URL`, `CLONE_PUBLIC_KEY` e JWTs de fixtures devem vir de ambiente isolado expressamente autorizado. Não imprimir JWTs, usar service_role nos testes de autorização ou reaproveitar sessão de produção. Confirmar os endpoints/contratos contra a versão do Storage usada no clone; erros Storage podem ser 400/403/404, portanto validar corpo, efeito final e bytes, não apenas código HTTP.

Requisições-base propostas:

```text
GET  {CLONE_URL}/rest/v1/fotos_locais?select=id_foto,id_local,url_foto
POST {CLONE_URL}/rest/v1/fotos_locais
     JSON {"id_local": <ID conforme tipo real>, "url_foto": <prefixo revisado + ID + /nome.jpg>}
     Prefer: return=representation
PATCH/DELETE {CLONE_URL}/rest/v1/fotos_locais?id_foto=eq.<ID_FOTO>

POST {CLONE_URL}/storage/v1/object/imagens-locais/<ID_LOCAL>/nome.jpg
     Content-Type: image/jpeg; x-upsert: false; body: bytes reais de fixture
POST mesmo endpoint, x-upsert: true, para testar substituicao
PUT  mesmo endpoint, para testar atualizacao
POST {CLONE_URL}/storage/v1/object/list/imagens-locais
     JSON {"prefix":"<ID_LOCAL>/","limit":100,"offset":0}
DELETE {CLONE_URL}/storage/v1/object/imagens-locais
     JSON {"prefixes":["<ID_LOCAL>/nome.jpg"]}
GET {CLONE_URL}/storage/v1/object/public/imagens-locais/<ID_LOCAL>/nome.jpg
     Sem Authorization nem chave: comprovar explicitamente o limite do bucket publico
```

Para REST e operações autenticadas de Storage, enviar `apikey: CLONE_PUBLIC_KEY` e `Authorization: Bearer <JWT fixture>`; para anônimo, usar a credencial pública apropriada à configuração do gateway, sem JWT de usuário. É necessário testar também requisições totalmente sem credenciais e tokens ausentes/inválidos/expirados. O admin usa JWT normal de usuário cuja autorização existe no banco, nunca chave administrativa para simular o papel.

| Cenário | Resultado esperado a verificar no clone |
| --- | --- |
| anon e comum: SELECT metadados, listagem e download público | Somente metadados de locais visíveis; nenhuma escrita; download público de objeto conhecido pode funcionar mesmo quando a listagem é negada. |
| parceiro: A aprovado, B do mesmo dono sem aprovação, C de terceiro, D sem dono | Upload/insert/upsert/update/delete permitidos apenas em A; negação nas outras três destinações, sem alteração dos bytes/metadados existentes. |
| admin autorizado no banco | Gestão nos locais existentes, inclusive D; ausência de atribuição de proprietário ou aprovação implícita. Admin falso em user_metadata/app claims não amplia acesso. |
| JWT do parceiro trocado pelo de comum, assinatura inválida ou papel global sem vínculo | Nenhum caminho de escrita liberado. Revalidar também requisições após inativação do vínculo/remoção de aprovação ou auditoria, sem emitir JWT novo. |
| URL de B associada a foto de A; UPDATE de id_local/id_foto; SELECT * com colunas extras | Cruzamento/ID update recusados; confirmar projeção explícita de três colunas e compatibilidade dos consumidores. |
| caminhos aninhados, IDs inexistentes, / inicial, //, .., encoding simples/duplo, Unicode, extensão fora da proposta | Negação sem objeto novo/resíduo; coletar a normalização efetiva da API antes da autorização. Não presumir que o nome enviado chega intacto ao SQL. |
| bytes JPEG/PNG/WebP válidos; mais de 5 MB; MIME não aceito; MIME/extensão divergentes | Validar limites reais do bucket/API; extensão não assegura inspeção de conteúdo. Requisito de validação adicional de conteúdo é decisão pendente. |
| upsert do próprio objeto e tentativas de sobrescrever B/C | Próprio A deve funcionar com SELECT/INSERT/UPDATE; B/C não mudam. Comparar hash dos bytes antes/depois. |
| move/copy/rename em A; destino B/C; mudança entre imagens-locais e avatars | Usar endpoints reais da versão no clone. Origem/destino devem respeitar autorização; testar policies dos dois buckets. Nenhum teste pode ser substituído por INSERT direto em storage.objects. |
| local A fica invisível após upload; mesma URL conhecida, sem JWT | Listagem/metadados passam a restritos; registrar que download público pode continuar disponível/cacheado. Este resultado exige aceitação explícita, não é sucesso de confidencialidade. |
| falha de upload depois do metadado / falha do metadado depois do upload; exclusão de local | Registrar órfãos e comportamento de cascata apenas nas fixtures; não introduzir compensação ou limpeza de legado sem revisão. |
| avatares e Cardápio | Upload/upsert/avatar próprio e negação de avatar alheio; CRUD de Cardápio autorizado e leitura pública apenas de locais visíveis; hashes das policies anteriores preservados. |

Para testes negativos REST de UPDATE/DELETE, resposta 2xx com zero linhas não prova sucesso indevido: usar `Prefer: return=representation`, conferir linhas retornadas e comparar o estado final por observador autorizado do clone. Verificar recusa real de INSERT sem confundir com erro de CHECK, FK, tipo ou arquivo malformado. Fluxos positivos devem passar primeiro com as mesmas cargas válidas.

### Concorrência futura

Usar duas sessões/requisições com barreiras controladas em fixtures: (1) gravação de foto/upload enquanto admin inativa o vínculo; (2) alteração de proprietário ou aprovação durante gravação; (3) dois uploads/upserts para o mesmo caminho com bytes distintos; (4) exclusão do local enquanto upload e INSERT de metadado estão em andamento. Repetir com a revogação já COMMITada antes do início da nova requisição: nesse caso toda nova escrita deve falhar.

Um comando iniciado antes da revogação pode observar o snapshot anterior. Não se promete cancelamento instantâneo de uma operação em andamento; o helper atual não serializa a requisição de Storage com a decisão administrativa, e bytes/metadados não são atomicamente coordenados. Registrar resultados, resíduos e necessidade real de locks/protocolo adicional antes de aprovar a semântica de revogação. Não ampliar agora a implementação com triggers ou limpeza distribuída não solicitados.

## Verificações offline e limitações

`npm.cmd test`: **137 verificações passaram, zero falhas**, incluindo 3 novas verificações estáticas. A descoberta automática do Node inclui também o módulo de preload como um subteste; são 136 casos de teste e esse subteste. O preload existente substitui o cliente Supabase por mocks e bloqueia fetch; nenhum destes resultados prova RLS, permissões HTTP ou compatibilidade PostgreSQL. Há avisos preexistentes de tipo de módulo no package.json; nenhum ajuste de configuração foi feito.

A chamada inicial `npm test` foi bloqueada pela política de execução do PowerShell para npm.ps1; a suíte foi executada com npm.cmd sem alterar a política. Na primeira execução, a checagem textual nova confundiu o literal SQL `WITH GRANT OPTION` com comando; o teste foi corrigido para ignorar strings SQL e passou novamente. Isso reforça que essa checagem não é parser de SQL.

Revisão estática dos casts `polcmd::text`/`tgenabled::text`, ACL NULL/vazia, projeções, USING/WITH CHECK e preservação das policies. Nenhum parser/servidor PostgreSQL foi executado; sintaxe e comportamento real de PL/pgSQL, policies, identidade/sequência e API Storage continuam pendentes. A matriz SQL e toda a matriz HTTP/JWT acima **não foram executadas**.

O parser Babel analisou os 40 arquivos JavaScript de `src/` e o novo teste sem erro. `git diff --check` passou; uma checagem adicional dos cinco arquivos novos passou para espaços em branco e codificação, pois arquivos não rastreados não entram naquele diff. A checagem lexical de aspas, dollar quotes e parênteses dos três SQLs passou, sem usar parser PostgreSQL. O diff confirmou ausência de alterações em `src/`, nas quatro migrações e na proposta anterior; o índice Git está intacto.

## Bloqueadores restantes

- Aprovação explícita desta proposta, das quatro migrações e da proposta de Cardápio/avatares; nenhuma foi liberada por esta entrega.
- Coleta do diagnóstico preparado e revisão dos manifestos reais no ponto correto, dependências transitivas, CHECKs/domínios/defaults, triggers, ACLs/herança/SET ROLE, funções SECURITY DEFINER e consumidores externos/dinâmicos.
- Aceitação do caráter público das imagens inclusive para locais invisíveis; caso contrário, rever a arquitetura de privacidade antes de qualquer implantação.
- Confirmação do prefixo de URL e do contrato novo de caminho, nomes, MIME, projeções de coluna e relacionamento entre fotos e imagem principal. Não há upload implementado em src/ nesta etapa.
- Grants e policies globais de Storage sem bypass, sem revogação que prejudique avatares/outros buckets; grants herdados excessivos exigem solução revisada separadamente.
- Validação real em clone autorizado: sintaxe PostgreSQL, RLS com JWTs reais, operações positivas/negativas, move/copy/upsert, regressões, concorrência, cache e recuperação/órfãos. A evidência offline não substitui essa validação.

**A implantação continua bloqueada até revisão e autorização explícitas.**
