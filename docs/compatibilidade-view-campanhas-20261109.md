# Compatibilidade da view e das campanhas — 09/11/2026

> Revisão posterior à última coleta: [fechamento-compatibilidade-supabase-20261109.md](fechamento-compatibilidade-supabase-20261109.md). Tabelas independentes, defaults/NOT NULL e ausência de triggers foram confirmados. A proposta atual inclui alteração de nullability/defaults das datas, ativação auditada e preservação das políticas de Storage/Cardápio. Os pontos abaixo sobre essas definições ainda desconhecidas ou ativação não implementada são históricos. Migrações continuam bloqueadas.

Revisão local baseada nas definições fornecidas pelo responsável após coleta com read_only=on. O Codex não executou SQL, não conectou ao Supabase e não alterou dados remotos. Todas as migrações mantêm exceções incondicionais antes de qualquer mudança. Este documento atualiza as pendências de constraints/view do relatório anterior; não constitui liberação.

## Compatibilidade confirmada e ajustes

| Definição recebida | Compatibilidade/proposta |
| --- | --- |
| locais.preco numeric(10,2), NOT NULL, > 0 | Criação explícita usa o tipo real por jsonb_populate_record e exige valor positivo; nenhum preço fictício. Arredondamento para duas casas/limite de precisão podem causar rejeição no banco; não ampliar tipo/CHECK. |
| preco_entrada NULL ou >= 0 | Nenhuma alteração da constraint/dados. A UI nova é mais restritiva: pede número confirmado, inclusive 0 se gratuita, sem inferir que NULL significa gratuito. |
| faixa_preco em $/$$/$$$ | Novo local usa $ (valor permitido); edições permanecem limitadas e sujeitas ao CHECK. Não recalcular nem reclassificar locais antigos. |
| duração em 3/7/14 | Corrigidos serviço, filtro da UI, catálogo privado de ofertas e RPC; antes aceitavam qualquer inteiro positivo, incompatível com a constraint real. |
| valor_total > 0; tipo destaque/visibilidade | Catálogo privado mantém valor positivo e tipos permitidos. A RPC usa oferta aprovada do servidor; nenhum valor comercial foi inferido. |
| campanhas.status ativa/pausada/finalizada, DEFAULT ativa | Expansão bloqueada 00150 acrescenta rascunho e troca apenas o default futuro para rascunho. Estados de linhas existentes não são atualizados. |
| solicitações.status pendente/em_analise/aprovado/rejeitado | Contratos atuais já correspondem aos estados reais; cadastro permanece pendente, sem promover automaticamente. |
| métricas UNIQUE(id_local,data) | Índice/constraint preservados. Continua fundamento do incremento atômico; sem recriação, deduplicação retroativa ou regravação dos totais. |
| usuarios.plano comum/pro | Plano comercial permanece separado do papel de autorização. Nenhum plano concede parceiro/admin; não alterar CHECK ou dados. |

Ainda faltam nomes/expressões normalizadas de catálogo para preencher os manifestos exatos dos scripts, hashes e confirmação de tipos/nullability/defaults/CHECKs/triggers das datas. Os valores permitidos estão confirmados; a ausência desses detalhes não justifica remover travas ou recriar constraints por nomes supostos.

## Duas origens de avaliações

A definição recebida da view referencia locais e avaliacoes sem schema explícito. Isso comprova a referência nominal da definição fornecida, mas é preciso consultar pg_depend/pg_rewrite para confirmar o schema/OID realmente vinculado. Não assumir que a resolução atual de search_path reproduz a origem vinculada quando a view foi criada.

O aplicativo usa avaliacoes_locais:

- src/screens/DetalhesLocalScreen.js: consulta notas/comentários, calcula média e quantidade em memória e faz upsert por id_local/id_usuario.
- src/services/userService.js: conta avaliações do próprio usuário em avaliacoes_locais.
- src/services/locaisService.js: lê locais diretamente; favoritos usam favoritos -> locais; categorias/filtros usam suas tabelas próprias. A busca em src não encontrou consumo de locais_com_avaliacoes nem consulta à origem nominal avaliacoes.

Não há no código analisado um mecanismo que sincronize as duas origens. Isso não prova que sejam tabelas independentes: avaliacoes pode ser view/alias, ter triggers ou outras dependências. A coleta adicional inspeciona ambos os nomes, tipos de relação, definição se forem views, colunas, FKs/CHECKs, políticas, grants, triggers e dependências de catálogo, sem retornar registros pessoais ou corpos de funções. A ausência de dependência no catálogo não exclui SQL dinâmico ou consumidores externos.

**Não trocar avaliacoes por avaliacoes_locais, renomear, copiar, unir nem excluir dados nesta etapa.** Uma troca pode mudar médias/histórico e quebrar consumidores. A proteção anterior de avaliacoes_locais não protege automaticamente a origem real da view. A migração 00200 ganhou uma revisão pendente explícita do acesso a avaliações legadas.

## Proposta bloqueada da view (00175)

O proprietário postgres, reloptions=NULL, grants amplos e ausência de filtro de visibilidade são riscos: não há security_invoker configurado; a view pode usar o contexto de privilégios de seu proprietário para acessar linhas que o consumidor não deveria ler. O resultado exato depende de RLS/grants e das políticas das fontes, ainda não confirmadas para avaliacoes.

O novo arquivo 20261109000175_public_places_view_guarded.sql é uma **proposta com trava**, não uma substituição executada. Mantém as nove colunas, ordem e expressões recebidas:

```text
id_local, nome, descricao, endereco, preco, latitude, longitude,
media_avaliacao, quantidade_avaliacoes
```

Mantém o LEFT JOIN, COALESCE, round(avg(nota),1) e count(id_avaliacao), preservando locais sem avaliação com média/quantidade zero. Acrescenta WHERE l.visivel IS TRUE, security_invoker=true e security_barrier=true. A origem proposta continua public.avaliacoes, **somente se o catálogo comprovar essa origem**. Não será ajustada para a tabela do app por conveniência.

Usa CREATE OR REPLACE em vez de DROP/recriação. Compara OID e contrato de tipos/typmods/collations das colunas antes/depois, sem adicionar colunas ou cascatas. As relações de saída e dependências são pré-condições revisadas; a versão conservadora recusa fontes que não sejam exatamente as duas tabelas públicas esperadas, inclusive views/partições, até revisão específica. Dependências entrantes são coletadas para regressão; manter OID/colunas não garante que consumidores externos tolerem as novas permissões ou o filtro.

Revoga privilégios amplos da view, inclusive por coluna, e concede somente SELECT para anon/authenticated. Postflight recusa escrita/privilégios administrativos efetivos herdados. Não amplia SELECT das tabelas base às cegas: security_invoker exige acesso às colunas utilizadas e políticas RLS adequadas nas fontes, inclusive visivel para o filtro. A avaliação desses grants/RLS é um bloqueio explícito.

A aplicação de RLS pode mudar a média conforme o conjunto de avaliações legíveis por cada papel. Antes da aprovação, definir quais avaliações são publicáveis e testar média/contagem como anon, comum, parceiro e admin; sem política SELECT pública adequada, a média pode virar zero indevidamente. Não resolver falta de acesso concedendo leitura de dados pessoais inteiros em avaliacoes/usuarios ou usando outra função definer para contornar RLS.

O filtro exclui locais invisíveis inclusive para o proprietário/admin ao consultar esta view pública. Gestão continua pela tabela locais com suas políticas próprias. Locais legados visíveis sem dono continuam elegíveis na view; nenhum vínculo/visibilidade/dado desses locais é alterado.

## Ciclo de vida de campanha em rascunho

O rascunho anterior criava data_inicio=now() e data_fim=now()+duração. Isso consumia a vigência enquanto aguardava ativação e podia deixar o rascunho vencido antes da aprovação.

Proposta atual, ainda bloqueada:

1. DEFAULT futuro de status passa a rascunho, após expansão da allowlist. A RPC também escreve rascunho explicitamente; não depende do default. O default isolado não é autorização e não substitui revogar escrita direta.
2. RPC envia NULL para data_inicio/data_fim; defaults de coluna não são usados ao enviar NULL explícito. Confere as datas/status/valor/duração no registro persistido após triggers, recusando resultado incoerente e revertendo a transação.
3. Não remove automaticamente defaults, NOT NULL, CHECKs ou triggers de datas. Se datas forem NOT NULL, o preflight bloqueia; se CHECK/trigger impedir NULL ou preencher datas, a criação falha. Coletar e revisar essas regras antes de preparar uma alteração condicional específica para rascunho. Não usar datas sentinela nem datas falsas para passar na constraint.
4. Uma futura operação confiável de ativação deverá, na mesma transação, verificar condições comerciais/autorização, definir status ativa, data_inicio no instante aprovado e data_fim a partir da duração contratada. Essa operação não foi implementada nem exposta ao cliente. Definir também a semântica de pausas/reativação antes de escrever esse fluxo.
5. listar_destaques_publicos mantém status='ativa' e período vigente, além de local visível/proprietário autorizado. NULL de datas em rascunho não publica nada. Campanhas antigas ativa/pausada/finalizada e suas datas permanecem intactas, sem reiniciar vigência retroativamente.

A UI mostra o estado retornado e não exibe mais uma campanha fictícia com alcance/dias restantes quando a lista está vazia. Ofertas fora de 3/7/14 são descartadas na UI e rejeitadas no serviço. Nenhuma cobrança/ativação automática foi adicionada.

## Arquivos e validação

Criados: migração bloqueada 00175; supabase/diagnostics/20261109_review_sources_campaign_lifecycle_readonly.sql; este relatório.

Revisados: migrações bloqueadas 00150 e 00200; src/services/partnerAccessService.js; src/screens/ImpulsionarScreen.js; test/partnerAccessService.test.mjs; testes SQL preparados; avisos/ordem no relatório e roteiro anteriores. Outros arquivos locais, cardápio, autenticação, mapa, filtros e favoritos não foram editados nesta revisão.

Testes offline: npm.cmd test passou com **120 testes, zero falhas**, incluindo rejeição de durações inválidas e contratos para 3/7/14 sem envio de status/datas pelo cliente. Cliente simulado/rede bloqueada; cobertura agregada 88,73% dos arquivos carregados, não da aplicação completa. Aviso MODULE_TYPELESS_PACKAGE_JSON continua sem falha.

Parser Babel: 47 arquivos JavaScript/JSX/MJS sem erro; git diff --check passou. Asserções de texto confirmaram travas incondicionais nas quatro migrações, origem da view preservada, ausência de DROP VIEW/recriação do índice de métricas, datas NULL explícitas na RPC e transação READ ONLY na coleta. Essas verificações não executam nem fazem parsing PostgreSQL do SQL.

Os testes SQL preparados agora exigem datas NULL no rascunho e sua ausência dos destaques. Não foram executados. No clone ainda testar default sem status informado por operação confiável, cada estado legado, triggers/defaults de datas, grants/RLS das duas fontes de avaliação, média/contagem de registros distintos, locais invisíveis e sem dono, dependências entrantes e consumidores externos. Duração aceita não comprova preço/tipo/datas válidos perante todas as constraints reais.

Nenhum parser/servidor PostgreSQL foi usado. Checagens de texto não validam PL/pgSQL, grants efetivos ou concorrência. Antes de qualquer liberação, receber coleta específica, resolver fonte/privacidade das avaliações e ciclo de datas, preencher manifestos revisados, testar em clone autorizado e obter aprovação separada. Nova ordem proposta: 00100 -> 00150 -> 00175 (somente com pré-requisitos das fontes resolvidos) -> 00200 -> testes RPC/HTTP -> app; manter janela de manutenção para não expor estado intermediário inseguro entre essas mudanças.
