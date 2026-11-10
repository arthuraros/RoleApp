# Cardápio, Storage e funções invoker — proposta local

**09/11/2026. IMPLANTAÇÃO BLOQUEADA.** Nenhum SQL executado, acesso ao Supabase, migração aplicada, alteração de dados legados, commit ou push. As quatro migrações continuam com suas travas. Nenhum manifesto/flag foi desbloqueado. A proposta complementar também tem exceção incondicional antes de qualquer DDL.

## Evidência utilizada e limites

O responsável confirmou políticas de escrita do Cardápio e de imagens-locais baseadas apenas em propriedade, INSERT/UPDATE de avatars limitados apenas pelo bucket, SELECT amplo de itens, privilégios administrativos excessivos e SECURITY INVOKER nas três funções legadas. O resumo não contém nomes/expressões integrais de todas as policies, exemplos dos objetos de imagens-locais ou o estado público/privado dos buckets. Não foram inventados esses dados.

Evidência adicional no código local:

- src/services/userService.js, uploadUserAvatar: bucket avatars; caminho exatamente `${userId}/avatar.${fileExt}`; extensão extraída da URI e normalizada para minúscula; upload com upsert:true; obtenção de URL pública e UPDATE de usuarios.foto_url.
- src/services/cardapioService.js: criação com INSERT seguido de SELECT/single, listagem, UPDATE com whitelist de campos e exclusão com retorno do ID. Itens aceitam id_categoria opcional; atualizações não transmitem id_local.
- Não foram encontrados uploads para imagens-locais em src. Não há evidência local que associe um segmento do nome desse bucket a UID, ID do local ou outro identificador.

## 1. Proposta complementar de Cardápio

Arquivo: supabase/proposals/20261109_cardapio_avatars_guards_blocked.sql. É proposta para revisão, não quinta migração autorizada. Depende da versão corrigida de 00200 e deve ser considerada depois dela: o postflight de 00200 continua verificando que não alterou políticas de Cardápio/Storage durante sua própria transação.

Antes de qualquer mudança futura, a proposta exige hashes revisados das políticas de categorias_cardapio, itens_cardapio e storage.objects, hashes dos helpers instalados e revisão dos contratos administrativo/avatares/upsert. Os valores permanecem NULL/false. RLS precisa já estar ativo e clientes não podem ser donos/membros do dono, superuser ou BYPASSRLS. Colisões dos nomes novos abortam; não há DROP de policies antigas.

Para as duas tabelas do Cardápio, a proposta acrescenta:

- Guardas RESTRICTIVE de INSERT/UPDATE/DELETE: partner_owns(id_local) ou is_admin(). O helper de parceiro exige propriedade atual, papel atual, vínculo individual ativo, solicitação aprovada e auditoria correspondente. Papel global e propriedade isolados não passam.
- UPDATE verifica a linha anterior em USING e os novos valores em WITH CHECK, impedindo transferência para local não autorizado.
- SELECT restritivo: local visível, parceiro individualmente autorizado ou admin. Assim, o USING(true) antigo de itens deixa de expor cardápio de local invisível a terceiros. A leitura pública existente de locais visíveis continua, sem inventar filtros novos de disponibilidade/atividade.
- SELECT permissivo para o parceiro aprovado ler sua gestão, inclusive em local invisível; política administrativa explícita para manter operações válidas do admin conferido no banco. Guardas restritivas continuam valendo para admin e políticas restritivas antigas também podem limitar a operação; isso precisa passar na matriz do clone.
- Em itens, WITH CHECK exige categoria NULL ou categoria do mesmo local. USING/DELETE ficam baseados na autorização do local, permitindo corrigir ou excluir um eventual item legado com categoria inconsistente, em vez de bloquear a manutenção. Nenhuma linha é corrigida automaticamente.

Não há novos grants de CRUD, alteração dos campos do serviço ou da UI. A proposta depende dos grants legítimos existentes; INSERT RETURNING, SELECT e sequências devem ser validados. Administrador ganha permissiva explícita, não bypass de RLS nem permissão TRUNCATE/TRIGGER/REFERENCES/MAINTAIN.

## 2. imagens-locais — mantido bloqueado

Não foi gerado DDL para esse bucket: o código analisado não comprova o formato dos caminhos nem a ligação objeto/estabelecimento. Reutilizar apenas proprietário ou assumir que a primeira pasta seja id_local repetiria o problema ou quebraria arquivos existentes.

Correção necessária, depois de receber a evidência:

| Operação | Condição a propor sobre o vínculo real comprovado |
| --- | --- |
| INSERT/upload | Novo nome/vínculo canônico aponta para estabelecimento individualmente autorizado; admitir manutenção administrativa legítima com formato validado. |
| UPDATE/upsert | USING autoriza o objeto antigo e WITH CHECK autoriza o destino; nome/bucket/vínculo não podem ser usados para escapar da regra. Requer SELECT da linha própria para upsert. |
| SELECT | Preservar leitura pública contratada de arquivos de locais visíveis e gestão privada apenas do parceiro autorizado/admin. Não confundir listagem de metadados e download do objeto. |
| DELETE | Exigir autorização individual do local real do objeto ou manutenção administrativa legítima; definir tratamento de órfãos antes de bloquear limpeza administrativa. |

Dados que faltam: expressões/nome/papéis de todas as policies aplicáveis; chamadas reais de upload/update/move/remove/list/download; exemplos representativos de caminhos novos/legados; vínculo canônico objeto/local; buckets.public; contratos de manutenção/admin. Atributo de metadata ou ID fornecido pelo cliente, sozinho, não comprova que o objeto pertence àquele local.

Se o bucket for público, downloads por URL pública podem não depender de SELECT RLS de storage.objects. Policies de metadados não tornam o arquivo privado nem revogam URL já conhecida. Não converter bucket para privado, mover nomes ou introduzir URLs assinadas sem revisar consumidores e obter autorização específica. Essa parte permanece bloqueadora da liberação geral.

## 3. Avatares — padrão comprovado, sem migração de nomes

A proposta protege INSERT, UPDATE e DELETE somente quando bucket_id='avatars'; para outros buckets, a guarda é neutra e não cria permissiva. Exige auth.uid(), primeira pasta igual ao UID, dois segmentos e basename avatar.ext com extensão não vazia. Não cria uma allowlist de extensões que o código não possui. UID de outro usuário, raiz do bucket e diretórios extras não são aceitos para escrita.

Em UPDATE a guarda aplica-se à origem e ao destino, protegendo contra renomeação para pasta alheia; novo SELECT permite ao usuário consultar sua própria linha para upsert. Não concede escrita nova nem permite a um admin móvel sobrescrever avatar de outro UID. Não muda as políticas públicas de leitura já existentes nem buckets.public: a URL pública usada hoje pelo serviço permanece um contrato a confirmar, não uma promessa nova de privacidade.

Não há alteração de userService, normalização/movimentação de objetos legados ou nomes inventados. Arquivos antigos em outro padrão e URIs de upload com query/fragmento/separadores precisam de evidência e teste antes de aplicação; o flag de revisão do contrato legado continua false. O fato de o cliente atual produzir esse caminho não comprova que todos os objetos antigos o sigam.

## 4. Privilégios e MAINTAIN

00200 já propunha revogar TRUNCATE/TRIGGER/REFERENCES em public, incluindo REFERENCES por coluna, e conferir privilégios efetivos/herdados. Foi acrescentada revogação de MAINTAIN especificamente nas duas tabelas do Cardápio e uma asserção de postflight correspondente.

O suporte a MAINTAIN é detectado pelo conjunto de privilégios da versão real do servidor via acldefault/aclexplode. O REVOKE é dinâmico, sem introduzir sintaxe desconhecida para servidores que não tenham o privilégio. Grants herdados que ainda permitam MAINTAIN fazem a migração abortar; não foram modificadas automaticamente associações de papéis.

SELECT/INSERT/UPDATE/DELETE e USAGE de sequências necessários aos contratos continuam previstos. Revogar MAINTAIN não retira o CRUD usado pelos serviços. Isso é uma proposta textual: a compatibilidade de grants efetivos, RETURNING, FK/constraints e execução da API ainda exige clone. Não se remove nenhum privilégio de Storage nesta rodada.

## 5. Funções legadas SECURITY INVOKER

buscar_locais, buscar_locais_por_orcamento e calcular_ces foram preservadas integralmente: não há CREATE/ALTER/REPLACE/REVOKE dessas funções nesta rodada. SECURITY INVOKER confirmado evita justificar uma reescrita apenas pelo nome da função, mas não certifica filtros, projeções, grants e chamadas transitivas a definers/views.

Testes futuros, com assinatura/payload reais do diagnóstico, sem inventar parâmetros:

1. Mesmas fixtures e snapshot para SELECT direto de locais e para cada overload das buscas, sob anon, comum, parceiro aprovado em A mas pendente em B e admin. Os IDs retornados pelas funções devem ser subconjunto do que a RLS permite à persona, além de respeitarem o contrato de filtros da função.
2. Fazer B invisível e de preço/coordenadas/categoria compatíveis com a busca para evitar falso sucesso por filtros que o excluiriam mesmo sem RLS. Anônimo/comum/P sem autorização não podem obter B. Repetir B visível: leitura pública permitida não concede escrita de Cardápio/Storage.
3. Conferir os campos retornados, e não apenas IDs ou presença de visivel, para detectar dados privados/projeções amplas. Conferir também views/definers chamados indiretamente pelas rotinas.
4. Para calcular_ces, usar vetores e contrato de retorno reais. Se consulta/agrega locais, variar apenas fixture invisível e conferir ausência de influência indevida sobre resultado de persona sem acesso. Se for cálculo puro, testar resultados e seus consumidores sem inventar um filtro de tabela inexistente.
5. Repetir a forma real de invocação: HTTP/JWT quando exposta como RPC, ou seu chamador real quando for helper interno. Não tratar erro de assinatura, filtro incompatível ou retorno vazio como prova de respeito à RLS.

Os corpos/assinaturas completos não foram colados nesta solicitação nem existem no código local analisado; a confirmação de SECURITY INVOKER não contém esses detalhes. As chamadas executáveis por overload e vetores de cálculo continuam bloqueadas até revisão desse conteúdo. Nenhuma função foi chamada nesta tarefa.

## 6. Matriz SQL/HTTP preparada

supabase/tests/20261109_partner_access_authorization.sql ganhou fixtures de Cardápio e agora requer também a proposta complementar revisada/aplicada no clone, além das quatro migrações. Não foi executado. Continua com guard de ambiente isolado e ROLLBACK; as únicas escritas preparadas são fixtures novas com UID reservado.

Inclui: local A aprovado; B invisível do mesmo dono sem aprovação; variante B visível para demonstrar que a propriedade não autoriza a gestão; item/categoria legados de fixture; anônimo não lê item de B invisível e continua lendo o público; P não faz INSERT/UPDATE/DELETE em B visível pendente, mas mantém CRUD/RETURNING/IDs em A; admin mantém edição de Cardápio sem fingir ser proprietário; teste de MAINTAIN efetivo.

Storage deve ser testado pela API, sem INSERT/UPDATE/DELETE direto de storage.objects nem manipulação de buckets por SQL:

| Cenário de clone futuro | Resultado esperado |
| --- | --- |
| Avatar UID-A/avatar.png: upload e upsert pelo A | Sucesso e foto_url próprio atualizado; SELECT/UPDATE necessários não se perdem. |
| A tenta UID-B/avatar.png, raiz ou pasta extra | Escrita negada sem alterar objeto de B. Repetir UPDATE/rename e DELETE. |
| Avatar próprio com extensão realmente usada pelo app | Contrato preservado; não presumir que só jpg/png existam. |
| Leitura pública de avatar e leitura própria para upsert | Preservar contrato real de bucket/policies; não prometer privacidade em bucket público. |
| imagens-locais A aprovado, B mesmo dono pendente, C terceiro | Upload/update/delete só no vínculo individual autorizado ou admin legítimo; caminhos reais ainda precisam ser fornecidos para montar casos. |
| Imagens de local invisível | Testar listagem e download (público/autenticado/signed URL conforme contrato real); RLS de metadata isolada não comprova proteção de URL pública. |
| Concorrência e legado | Revogação de vínculo/renomeação/upsert simultâneos; nenhuma gravação fora do destino autorizado; objetos e políticas anteriores preservados conforme contratos. |

Usar destino e JWTs reais do clone somente após autorização, sem service_role para simular usuários e sem registrar tokens. Conferir erro/efeito real, não considerar HTTP 400/404/500 como sucesso de autorização. Nenhum clone foi criado e nenhum desses casos HTTP foi executado.

## Arquivos e verificações desta rodada

Alterados:

- supabase/migrations/20261109000200_partner_access_hardening.sql — revogação/postflight de MAINTAIN no Cardápio; trava e manifestos preservados.
- supabase/tests/20261109_partner_access_authorization.sql — fixtures e casos negativos/positivos de Cardápio/MAINTAIN.

Criados:

- supabase/proposals/20261109_cardapio_avatars_guards_blocked.sql — proposta adicional bloqueada, sem DDL de imagens-locais.
- test/cardapioStorageContracts.test.mjs — testes offline dos contratos reais dos serviços existentes.
- docs/cardapio-storage-autorizacao-20261109.md — este relatório, proposta de imagens e matriz futura.

As migrações 00100/00150/00175, pacote histórico e código de UI/serviços (incluindo Cardápio, autenticação e upload de avatar) não foram modificados nesta rodada.

Testes executados: npm.cmd test, **123 passaram**; node --import ./test/helpers/supabase-offline.mjs --test test/securityBlockers.test.mjs test/cardapioStorageContracts.test.mjs, **10 passaram** (2 de hashes e 8 contratos novos). Total **133 testes offline, zero falhas**. Aviso MODULE_TYPELESS_PACKAGE_JSON permanece sem falha. Os testes de upload extraem a função real por AST e substituem apenas runtime Expo/cliente/arquivo; não executam Storage, não duplicam o algoritmo do caminho e não simulam o motor RLS.

Verificações estáticas: parser Babel em **49 arquivos JS/JSX/MJS**, sem erro; git diff --check passou. Conferidos os quatro guards originais, guard adicional, manifestos NULL/flags false, ausência de DROP/ALTER POLICY e ausência de formato inventado para imagens-locais. SHA-256 confirmou que userService.js, cardapioService.js e GerenciarCardapioScreen.js permanecem idênticos à referência anterior.

Nenhum resultado prova parsing/execução PostgreSQL, RLS, HTTP, grants herdados ou comportamento do servidor. Permanecem bloqueadores: caminhos/vínculos/bucket público de imagens-locais; compatibilidade legada dos avatares e leitura pública; políticas/contratos integrais e helpers instalados; administração, CRUD e upsert reais no clone; assinaturas/vetores das funções invoker e dependências transitivas. Toda a implantação continua bloqueada.
