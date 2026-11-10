# Revisão técnica da migração de hardening

> Histórico dos achados anteriores. As correções locais e pendências atuais estão em [correcao-diagnostico-real-20261109.md](correcao-diagnostico-real-20261109.md); a coleta complementar das constraints/view permanece necessária e as migrações continuam bloqueadas.

Status: NÃO LIBERADA PARA APLICAÇÃO. Revisão do arquivo local e da documentação, sem SQL executado, sem alteração de banco. Ambas as migrações foram preservadas integralmente, incluindo suas travas. Não foram alterados serviços nem testes da aplicação nesta revisão.

## Como obter os resultados em quatro blocos

Os arquivos em supabase/diagnostics/partner_hardening_review são consultas de validação, NÃO migrações nem testes com fixtures:

1. **01_estrutura_constraints.sql** — colunas necessárias, tipos/domínios/enums, constraints/FKs de entrada e saída, índices e sequências/defaults.
2. **02_grants_rls.sql** — grants efetivos por tabela/coluna/schema/sequência, default privileges, dono/heranças e políticas completas das tabelas públicas, Auth relacionado e schema interno se existir.
3. **03_funcoes_triggers_acessos.sql** — metadados e EXECUTE das funções, overloads/colisões, triggers/regras/views, referências registradas em catálogo e configurações relevantes de API/roles. Sem corpo de funções.
4. **04_legado_duplicacoes.sql** — integridade e candidatos a vínculos históricos, solicitações/locais repetidos, três locais sem proprietário e grupos duplicados de métricas. Sem associação automática nem escrita.

Executar futuramente **um arquivo por vez**, em aba/sessão dedicada do SQL Editor, e enviar o JSON da coluna validation_result identificado por bloco. Cada arquivo abre transação REPEATABLE READ READ ONLY, contém um único SELECT de resultado e termina em ROLLBACK. Não executar a pasta migrations nem o arquivo de testes de autorização para coletar estes relatórios.

Se o editor mostrar somente o comando final, o resultado a exportar é o SELECT com a coluna validation_result. É possível selecionar apenas o WITH ... SELECT completo: ele também contém somente leitura e funções internas de catálogo, sem RPC/DDL/DML de negócio. Não presumir que execuções separadas no editor reutilizam a mesma conexão/transação. Se houver erro com transação aberta, encerrar a sessão dedicada com ROLLBACK antes de outra coleta autorizada.

Os blocos 1–3 toleram ausência dos objetos novos. user_roles é ausência esperada antes da fundação, mas deve existir e ser validada antes do hardening. Qualquer objeto do schema roleapp_security ou das novas RPCs já existente exige conciliação: a migração usa CREATE e não sobrescreve nomes. O bloco 4 depende das tabelas de negócio confirmadas; uma ausência/erro deve ser reportado, não corrigido com escrita.

As consultas refletem a visibilidade do papel de inspeção. Uma coleta filtrada por RLS não comprova ausência de dados/duplicações. Usar papel autorizado para inspeção completa e registrar inspection_role. Cada bloco tem seu snapshot; mudanças concorrentes entre blocos podem exigir reconciliação das contagens. O bloco 4 limita detalhes a 200 itens por seção e informa contagens globais, sem truncar essas contagens.

Não há pg_get_functiondef ou retorno de prosrc/prosqlbody. A triagem de código existente só produz flags booleanas/nomes de objetos mencionados; não chama código de negócio. Metadados/defaults/expressões de políticas/argumentos de trigger ainda podem conter literais sensíveis legados: redigir segredos antes de compartilhar. O bloco 4 omite e-mails, nome pessoal do solicitante, preferências e credenciais; retorna identificadores/nomes de estabelecimentos para revisão administrativa.

## Achados que impedem a liberação atual

| Achado | Consequência | Mudança necessária antes da aplicação |
| --- | --- | --- |
| Aprovação com p_id_local_existente NULL sempre insere local | Pode duplicar local já criado pelo fluxo antigo ou por outro pedido | Reconciliação de legado e escolha explícita criar/vincular; não usar NULL como autorização implícita para criar |
| Unicidade de auditoria é por solicitação | Não identifica dois pedidos referentes ao mesmo estabelecimento | Vínculo persistente com origem/estabelecimento validado e regra de idempotência de negócio; não impor um local por usuário |
| Escritas não verificam quantidade/estado final após triggers | BEFORE trigger pode suprimir operação ou alterar papel/status/dono sem falhar; RPC pode auditar sucesso incoerente | Conferir RETURNING/ROW_COUNT e reler/validar as invariantes antes da auditoria/retorno |
| Escrita de locais depende dos grants/permissivas antigos | Edição própria pode falhar; admin pode continuar inserindo/excluindo locais diretamente | Definir grants/permissivas explícitos; se criação só por RPC, negar INSERT direto de todos os clientes |
| Trigger de proprietário cobre UPDATE OF id_proprietario | Outro BEFORE trigger pode mudar proprietário em UPDATE de outra coluna ou após a checagem | Revisar ordem/conteúdo de todos os triggers e usar validação final de propriedade em toda atualização pertinente |
| user_roles só tem teste de existência e privilégios parciais | Forma da tabela, constraints, papéis herdados e caminhos de alteração ainda não são certificados | Validar estrutura/ACLs e rotas privilegiadas; não reutilizar tabela incompatível |
| Postflight verifica herança de dono com USAGE | Pode deixar de identificar associação NOINHERIT com capacidade de SET ROLE | Revisar MEMBERSHIP e set_option/SET ROLE conforme versão, inclusive vínculos indiretos |
| Overloads conhecidos de incrementar_metrica são revogados | Wrappers, outras RPCs definer, views/regras ou jobs podem continuar escrevendo | Revisar as rotas identificadas no bloco 3 e a configuração externa; revogar/corrigir cada caminho confirmado |
| Campanha retorna to_jsonb(campaign) completo | Colunas internas novas seriam devolvidas sem revisão do contrato | Usar projeção explícita de retorno e revisar SELECT completo da tabela |
| Ativação de campanha não está implementada | Novos rascunhos não serão publicados por este pacote | Definir operação administrativa/comercial confiável, pagamento se aplicável, auditoria e vigência recalculada na ativação |

Nenhuma correção da tabela acima foi aplicada à migração nesta revisão. A descrição anterior de idempotência deve ser lida como **proteção da mesma solicitação**, não deduplicação de estabelecimento. Igualmente, “somente aprovação cria local” ainda não é garantido para admin com grants/permissivas legados de INSERT em locais.

## Dependências exatas das funções

### decidir_parceria_segura

- **Identidade/autorização:** auth.uid() deve existir, retornar UUID confiável e ser invocável no contexto esperado. user_roles requer user_id UUID único/PK para ON CONFLICT, role compatível com texto/valores e campos adicionais com defaults aceitáveis. Bloqueio do admin FOR SHARE e do solicitante exige privilégios reais do dono da função, além do bypass RLS. O lock de auth.users FOR KEY SHARE também exige os privilégios necessários para SELECT com bloqueio; confirmar acesso de postgres a Auth.
- **Solicitação:** id_solicitacao deve identificar exatamente uma linha; id_usuario UUID deve representar Auth válido. status deve aceitar atualização textual para aprovada/rejeitada; enums/domínios e VARCHAR curto exigem casts/tamanho/constraints revisados. O preflight atual só rejeita alguns tipos; não comprova a aceitação dos valores nem a existência de todas as colunas.
- **Local:** o INSERT fornece nome, cidade_uf, endereco, preco=1, preco_entrada=0, faixa_preco='$', id_proprietario e visivel=false. Qualquer outra coluna NOT NULL sem default/identidade/geração é bloqueador. Validar CHECKs, unicidade, limites de texto e defaults de id_local/created_at. O vínculo com local existente altera somente proprietário, porém triggers podem ter efeitos adicionais.
- **Relacionamentos:** FKs podem apontar para usuarios em vez de Auth; conta Auth válida pode não ter perfil complementar. Receber zero órfãos em usuarios não prova o inverso (Auth sem usuarios). Triggers de criação de perfil, local ou aprovação podem duplicar efeitos.
- **Auditoria:** tabelas/índices novos precisam de nomes livres; tipos de IDs são snapshots textuais, não FKs de negócio. Revisar retenção e o índice único parcial de decisão. RLS/grants de auditoria não impedem o próprio dono postgres de alterar histórico.
- **Resultado:** assinatura e payload do adminService estão alinhados ao texto local, mas criação, triggers e invariantes não foram comprovados no servidor. Veredito: bloqueada por legado, tipos e efeitos de triggers.

### solicitar_campanha_segura

- Exige papel exato parceiro e propriedade; um admin que continua com role admin não pode usar essa RPC de parceiro, mesmo possuindo local. Essa é a regra implementada, e precisa ser aceita ou revisada explicitamente.
- Depende dos tipos de id_local/id_usuario e das colunas tipo, titulo, mensagem, interesses, faixa_etaria, raio_km, duracao_dias, valor_total, status, alcance, data_inicio/data_fim. O texto atual exige interesses text[]; JSONB, enum[] ou domínio diferente demanda adaptação.
- CHECKs/enums/domínios devem permitir destaque/visibilidade, rascunho, as faixas da UI (inclusive o caractere “–”), raio 5 e durações 3/7/14. Títulos/mensagens nulos de visibilidade podem conflitar com NOT NULL. Outros campos obrigatórios precisam de defaults.
- Orçamento calculado de 60 por dia é regra proposta, não inferência do banco. Precisa de aprovação comercial. Datas now()/interval exigem tipos de tempo compatíveis e semântica de fuso revisada; em rascunho elas não devem ser tratadas como início de campanha paga.
- Campo interesses tem limite de quantidade, mas não de comprimento de cada item nem validação de catálogo; reforçar contrato/limites. Triggers existentes não podem transformar rascunho em ativa sem operação confiável e auditoria.
- Veredito: contrato de chamada compatível com o JS local; persistência e ativação não estão validadas. Retorno integral deve ser reduzido a campos explícitos.

### listar_destaques_publicos

- Compara IDs entre campanhas/locais/user_roles: confirmar igualdade de tipos e unicidade de user_roles.user_id para evitar multiplicação dos resultados. Relacionamentos podem ser nulos/órfãos; o INNER JOIN os omite, mas não os regulariza.
- status/tipo devem aceitar comparações aos literais; data_inicio/data_fim precisam ser comparáveis a now(). Timestamp sem fuso ou date exige decidir o limite de vigência; texto não deve ser presumido compatível.
- A função definer publica somente campos explícitos, porém deliberadamente ignora RLS de locais/campanhas. visivel=true é o filtro público da proposta. Se existirem políticas de região, moderação, suspensão ou plano além desse campo, podem ser contornadas pela projeção e devem ser incorporadas/reconciliadas.
- Campanhas de local sem proprietário, parceiro não provisionado, usuário divergente, data nula ou fora da vigência deixam de aparecer. Manter as tabelas intactas não garante o mesmo conjunto de destaques. Confirmar impacto antes do corte.
- Retorno JSONB/estrutura locais está alinhado a Home/mapa, mas o agregado é ilimitado; prever paginação/limite e índices após conhecer o volume.
- Veredito: exposição reduzida por projeção explícita, condicionada à regra real de publicação e aos tipos de data/IDs.

### registrar_interacao_segura

- Auth UID deve ser UUID válido e existente para a FK dos recibos. O local deve aceitar FOR SHARE e visivel booleano. IDs textuais comparados com id_local::text são compatíveis com várias chaves, mas podem impedir uso do índice normal: preferir tipos reais depois do inventário.
- metricas_locais.data precisa ser date na proposta; views/cliques/visitas devem aceitar inteiro 0/1, coalesce e soma sem casts inseguros/overflow. Campos extras obrigatórios precisam de defaults. NULL em legado é tratado na soma, mas constraints/triggers podem impedir o UPSERT.
- ON CONFLICT(id_local,data) exige chave única adequada. Revisar todos os índices/constraints correspondentes, inclusive deferráveis, parciais, expressões, validação e outros CHECKs. O preflight encontra um candidato imediato; isso não substitui conferir toda a inferência dos árbitros.
- A PK dos recibos e a transação impedem o mesmo evento diário de incrementar duas vezes; erro no agregado deve reverter o recibo. Triggers de métricas que também incrementem, mudem data/local ou suprimam INSERT/UPDATE podem invalidar essa semântica.
- Não aceita totais ou datas arbitrários, mas clientes autenticados ainda podem declarar uma interação falsa permitida por dia/local/tipo. Não é prova de visita física; multi-contas, retenção e rate limiting permanecem pendências.
- Veredito: fronteira de escrita mais restrita no texto local; eficácia depende da chave única, tipos, triggers e fechamento de todas as RPCs antigas/wrappers.

## Grants e SECURITY DEFINER

Os grants propostos são suficientes em princípio para: usuário inserir própria solicitação e ler seu RETURNING; parceiro inserir/editar campos de evento e excluí-lo; parceiro/admin ler campanhas/métricas autorizadas; usuários chamarem as RPCs cabíveis. SERIAL de solicitação/evento requer USAGE na sequência; apenas pg_get_serial_sequence é tratado hoje. Default nextval em sequência não vinculada por OWNED BY pode retornar NULL nessa detecção: o bloco 1 mostra também a dependência do default.

Não é preciso conceder UPDATE de status, escrita de métricas/campanhas ou escrita de auditoria aos clientes para as RPCs funcionarem: essas escritas usam o dono da função. SELECT FOR UPDATE/FOR SHARE, FKs e funções de trigger ainda exigem que o dono tenha privilégios apropriados; BYPASSRLS não concede privilégios de tabela por si só. Triggers SECURITY INVOKER herdam o contexto da operação; caminhos de INSERT direto em eventos/solicitações podem falhar se o trigger exigir escrita extra que não foi concedida. Não resolver liberando tabelas inteiras: redesenhar o trigger/operação controlada.

Revogar privilégio de coluna não sobrepõe um grant de tabela ou de grupo herdado. Os guardas RESTRICTIVE são defesa adicional, mas políticas novas não criam privilégios e não neutralizam outra restritiva que negue o acesso. Conferir ACLs efetivos, USING, WITH CHECK, SELECT necessário para UPDATE/RETURNING e a proteção de TRUNCATE/SET ROLE.

No texto local, todas as oito funções novas usam SECURITY DEFINER com search_path vazio e relações/tipos da aplicação qualificados. Não há SQL dinâmico nas quatro RPCs. As funções internas básicas do PostgreSQL resolvem pelo pg_catalog implícito; não há dependência de tabelas temporárias sem schema. Isso é uma boa base, não certificação de todos os caminhos herdados.

O revoke de EXECUTE de PUBLIC e grants seletivos ocorrem na mesma transação, sem janela de exposição antes do COMMIT. Conferir também grants via grupos/default privileges, overloads e schemas expostos. A função decidir pode ter EXECUTE de authenticated e ainda exigir admin no corpo; não existem papéis SQL distintos para cada perfil do app. Nunca conceder service_role ao app para fazê-la funcionar.

A proposta revoga apenas a antiga incrementar_metrica por nome. Funções chamadas indiretamente, outras RPCs, views do dono, regras, triggers e jobs precisam de revisão própria. O bloco 3 identifica metadados/flags e referências registradas; referências em PL/pgSQL/SQL dinâmico e corpos SQL em string podem não constar de pg_depend. A ausência de uma flag não significa ausência de acesso. Corpos selecionados deverão ser revisados privadamente depois da triagem, sem expô-los na coleta padrão.

Configuração da Data API/Edge Functions/pagamentos/jobs fora dos catálogos não é certificada pelos blocos. Valores pgrst nulos no SQL Editor não provam schema não exposto. Conferir a configuração efetiva do serviço e fontes externas separadamente.

Se houver herança/particionamento, acesso direto a filhos pode usar grants/RLS distintos do pai. O bloco 1 informa vínculos e o bloco 2 também percorre descendentes, inclusive em outros schemas. A migração atual não endurece automaticamente todos os filhos nem certifica foreign tables; qualquer resultado desse tipo exige revisar o alcance das políticas/grants e das funções antes da liberação.

Referências oficiais: https://www.postgresql.org/docs/current/sql-createfunction.html (SECURITY DEFINER/search_path/EXECUTE) e https://www.postgresql.org/docs/current/ddl-rowsecurity.html (combinação de políticas, bypass e limites de RLS).

## Duplicação: o que os resultados podem provar

O bloco 4 oferece candidatos de mesmo proprietário ou mesmo nome normalizado/cidade, além de pedidos/locais repetidos. Nenhum critério prova identidade comercial. Não usa e-mail, unaccent, extensões nem comparação de CPF/CNPJ inexistente no contrato. Variações de nome/cidade ou históricos incompletos podem deixar duplicações sem candidato; coincidências legítimas também produzem candidatos.

Antes de liberar aprovação de legado: classificar explicitamente criar novo/vincular existente; bloquear decisão ambígua; manter vínculo durável solicitação-local e idempotência de negócio confiável. Não adicionar UNIQUE(id_proprietario) nem um limite global de solicitação por usuário, pois parceiros podem possuir vários locais. Para dois pedidos do mesmo negócio, definir uma identidade/decisão confiável e coordenar locks/constraints sobre ela, em vez de confiar somente no lock por solicitação.

Os três locais sem proprietário continuam sem UPDATE e visíveis conforme estado atual. A regularização deve selecionar ID real, verificar evidência e conferir dono no instante da decisão. Não migrar propriedade ou publicar/despublicar automaticamente a partir desta coleta.

## Ajustes à ordem de implantação e recuperação

1. Coletar os quatro resultados. Resolver cada achado desta revisão e os bloqueadores do documento de implantação antes de retirar qualquer trava em mudança separadamente autorizada.
2. Confirmar ordem de locks e validar invariantes finais sob triggers reais. Não reutilizar uma aprovação textual de migração como autorização para executá-la.
3. No clone, aplicar o candidato corrigido e testar anon/usuario/parceiro/admin por API real/SET ROLE apropriado, incluindo falha forçada de auditoria, operação suprimida por trigger, requests diferentes do mesmo negócio e resposta perdida. Os 74 testes Node anteriores são contratos simulados, não evidência de RLS ou de compilação SQL.
4. Planejar concessão inicial de admin e provisão de parceiros confiáveis sem promoção automática. Sem isso, a fundação deixa papéis ausentes e destaques/edições podem desaparecer; não “resolver” promovendo todos os proprietários.
5. Coordenar build compatível, corte de clientes antigos, transação de segurança e ativação comercial. Recalcular vigência ao ativar rascunhos; este pacote ainda não contém essa operação.
6. Em falha antes do COMMIT, ROLLBACK da transação. Depois do COMMIT, preservar RLS e dados/auditoria; suspender a operação afetada e corrigir por migração estreita. Reverter só o app não restaura os contratos antigos com segurança. Não restaurar CRUD amplo, RPC antiga ou distribuir service_role.

Esta revisão não executou migrações, testes SQL, RPCs, queries de catálogo ou dados. Os quatro blocos receberam revisão estática/lexical local, sem parser PostgreSQL e sem verificação de objetos remotos. Só os resultados e testes posteriores em clone podem fechar a compatibilidade.
