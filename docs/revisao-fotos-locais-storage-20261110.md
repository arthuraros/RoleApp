# Revisão bloqueada de fotos/Storage — 10/11/2026

Branch conferida: `feature/validacao-seguranca-supabase`. Nenhum SQL foi executado, local ou remotamente. Não houve acesso ao Supabase, alteração de dados/buckets/aplicativo, commit, push ou merge. A trava incondicional, o manifesto NULL e todas as confirmações false continuam presentes. **Implantação e execução continuam bloqueadas.**

Arquivos desta revisão:

- [Proposta SQL corrigida](../supabase/proposals/20261109_fotos_locais_storage_blocked.sql).
- [Verificações offline](../test/fotosLocaisProposal.test.mjs).
- Este relatório.

Esta revisão substitui as descrições anteriores de regex preenchida, transições entre buckets e estratégia de locks no [relatório de 09/11](fotos-locais-storage-seguranca-20261109.md).

## Problemas e correções

1. **Separadores:** a cópia em disco já não continha `::regclassLOOP` nem `WITHGRANT OPTION`. As duas consultas `FOR` agora separam explicitamente o cast e `LOOP` em linhas distintas. Testes recusam a reintrodução dos dois padrões inválidos.
2. **Tipos e SQL dinâmico:** papéis clientes são resolvidos em `pg_roles` e as funções de privilégios recebem `actor_oid`; a sequência é passada como OID explicitamente. Foram conferidos aliases, fechamentos e placeholders `%s`, `%I`, `%L`, inclusive argumentos posicionais. O manifesto mantém o mesmo algoritmo e conteúdo estrutural do diagnóstico, sem hashes inventados.
3. **Transições entre buckets:** permissivas combinam-se com OR e restritivas com AND; isso não obriga que a mesma permissiva autorize os dois estados do UPDATE. Uma linha de imagens e uma linha de avatar podem passar por políticas distintas. [Referência PostgreSQL sobre RLS](https://www.postgresql.org/docs/15/ddl-rowsecurity.html).

   A proposta acrescenta função SECURITY INVOKER com search_path vazio e trigger imediato `AFTER UPDATE`, sem `UPDATE OF`, para rejeitar alteração de `bucket_id` envolvendo `imagens-locais` **ou** `avatars`, nos dois sentidos, com SQLSTATE 42501. Não há exceção para admin/worker. AFTER permite verificar o resultado de triggers BEFORE; ENABLE ALWAYS mantém essa verificação também em modo replica. EXECUTE da função é revogado dos clientes. A instalação exige confirmação false adicional e recusa colisões de nomes. [Referência de triggers](https://www.postgresql.org/docs/15/sql-createtrigger.html).

   As policies existentes de avatares/Cardápio são preservadas; as novas guardas permanecem neutras para outros buckets. O trigger restringe transições envolvendo os buckets protegidos, inclusive quando ambas as pontas seriam autorizadas. Movimentos entre dois buckets diferentes dos protegidos não são regulados por ele.

   **Limite:** copy ou DELETE+INSERT não são UPDATE de bucket_id. Devem passar pelas autorizações de origem/destino e pela validação real da API. Um bucket público permite baixar bytes conhecidos e enviá-los novamente a um destino autorizado; esta proposta não oferece controle de cópia nem confidencialidade de URLs públicas. Não se presumiu bloqueio pela API.
4. **Caminhos/URL:** prefixo e regex agora ficam ambos NULL; foi retirada a allowlist de extensões e o endpoint previamente embutidos. `id_local/nome_arquivo` continua sendo apenas o formato candidato suportado pelo template. O código mantém dois segmentos e o vínculo ao ID real; se os consumidores exigirem outro contrato, deve-se revisar o template, não apenas habilitar flags. Não existe sincronização automática com `locais.imagem_url` nem regravação de legado.
5. **Grants/RETURNING:** mantém SELECT de `id_foto,id_local,url_foto`, INSERT de `id_local,url_foto`, UPDATE de `url_foto` e DELETE para authenticated, sujeitos à RLS. SELECT dessas três colunas permite sua projeção em RETURNING e filtros autorizados; admin/parceiro possuem caminho de leitura das próprias linhas inclusive invisíveis. `id_local` e `id_foto` continuam imutáveis por UPDATE de cliente; PK/FK CASCADE são verificadas e preservadas. SELECT/RETURNING `*`, colunas extras, defaults e INSERT mínimo dependem do schema real e de consumidores ainda não confirmados: nova confirmação de contrato permanece false. Não se concedeu SELECT amplo para contornar incompatibilidades.

## ACCESS EXCLUSIVE e estratégia futura no clone

O lock em `storage.objects` bloqueia leituras e escritas de metadados de **todos** os buckets até o término da transação, não somente imagens. Não é uma pausa garantida dos downloads públicos/CDN. O código mantém o lock para estabilizar vazio/manifesto/policies e acrescenta NOWAIT, lock_timeout de 2s, statement_timeout de 30s e idle_in_transaction_session_timeout de 30s, todos após a trava. Outros DDL podem adquirir locks adicionais; os valores são limites propostos para o clone, não medição de produção. [Locks PostgreSQL](https://www.postgresql.org/docs/15/explicit-locking.html), [timeouts](https://www.postgresql.org/docs/15/runtime-config-client.html).

Somente após autorização separada para um clone isolado:

1. Confirmar versão, ownership de Storage, permissões do executor, dependências de triggers, workers/replicação e contrato real de caminhos/URL/projeção. A nova invariante também impede moves administrativos; essa decisão exige aprovação explícita.
2. Parar clientes, jobs e workers de escrita do clone. Coletar o manifesto no ponto correto, com o mesmo contexto de search_path. Nunca copiar OIDs/hashes de outro ambiente ou remover travas nesta revisão.
3. Em uma futura versão executável autorizada, testar primeiro a aquisição NOWAIT com sessão concorrente mantendo SELECT aberto. Deve falhar rapidamente sem DDL parcial; fazer ROLLBACK imediatamente. Repetir sem concorrentes e medir a duração por observador do clone. Não deixar a sessão pausada com locks e não aumentar timeout automaticamente.
4. Usar objetos novos criados pela API apenas nos buckets existentes do clone. Testar UPDATE de bucket_id nos dois sentidos: imagens↔avatars, imagens↔outro e avatars↔outro, incluindo admin/worker e origem/destino individualmente autorizados. Exercitar também alterações causadas por trigger BEFORE em fixture descartável; o AFTER deve recusar. Não usar objetos legados. Conferir metadados e hashes dos bytes antes/depois. Testes SQL de metadados devem ser transacionais, com ROLLBACK; não substituem as chamadas Storage reais.
5. Testar upload/upsert/rename no mesmo bucket, cópia, DELETE+INSERT, papel comum, parceiro de outro local pendente do mesmo dono e admin, além de avatar próprio/alheio. Validar CRUD de fotos com RETURNING das três colunas, SELECT/RETURNING `*` conforme schema confirmado, e regressões de Cardápio. Comparar policies anteriores e verificar trigger/ACLs. Qualquer falha mantém o bloqueio.

## Verificações e pendências

- **143 verificações offline passaram**, zero falhas, em `npm.cmd test` (inclui o subteste do preload). Os 11 testes estáticos de proposta/manifestos passaram separadamente. Há seis verificações novas para separadores, OIDs, parâmetros vazios, grants, locks, contraexemplo lógico de RLS, trigger e placeholders; o modelo lógico não simula PostgreSQL.
- Manifesto da proposta e diagnóstico continuam correspondentes. Conferência de delimitadores/aspas, whitespace e hashes dos arquivos protegidos complementa os testes textuais; não constitui parser SQL.
- Não foi encontrado PostgreSQL no PATH, nos serviços ou nos diretórios padrão locais. **Não houve validação real de sintaxe, permissões, triggers ou RLS.** Nenhum teste SQL/HTTP/JWT foi executado.
- Permanecem pendentes a revisão externa, o schema/versão real, as permissões de owner de Storage, a compatibilidade do novo trigger com o serviço/replicação, todos os contratos não confirmados e a matriz real em clone. As quatro migrações anteriores, a proposta Cardápio/avatares, o diagnóstico e `src/` foram preservados.

**Nenhuma implantação está liberada.**
