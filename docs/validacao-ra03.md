# RA-03 — filtros dos porquinhos na Home

## Estado e diagnóstico

Os arquivos locais MainLayout.js, HomeScreen.js, categoriasService.js e locaisService.js foram lidos antes de qualquer alteração. Não tinham diff local no início desta tarefa. As alterações locais da build e das RA-01/06/08, os arquivos não rastreados e demais trabalhos da equipe foram preservados.

MainLayout já oferecia seleção visual e callback, mas a Home não os conectava. Busca e filtros avançados escreviam na mesma lista filtrada por caminhos separados, fazendo uma alteração na pesquisa descartar o filtro aplicado. Havia ainda locais de demonstração como fallback da consulta vazia e um cartão fixo de estabelecimento no cabeçalho; ambos foram removidos da listagem para não simular resultados de categoria. A lógica dos destaques, incluindo seu fallback preexistente, permanece separada da lista filtrada.

## Correspondência com o banco real

Consultas somente de leitura foram executadas com a chave pública local e sem sessão privilegiada em 13/11/2026. Foram consultadas `categorias`, `local_categorias` e os registros de `locais` com `visivel=true`. Não foram modificados dados, credenciais, estruturas, permissões ou políticas RLS.

| Porquinho | ID encontrado em categorias | Locais visíveis vinculados na leitura pública |
| --- | --- | --- |
| Comidas | 1 | 4 — Sabor do Cerrado |
| Festas | 2 | Nenhum vínculo encontrado |
| Parques | 3 | 2 — Parque das Águas |
| Cinemas | 4 | 3 — Cine Brasília |
| Cafés | 5 | Nenhum local visível: existe vínculo com id_local=1, ausente da lista pública de locais visíveis |
| Eventos | 6 | Nenhum vínculo encontrado |

O local visível 8 não tinha vínculo em local_categorias nessa leitura: aparece na lista completa, mas não pertence a nenhum dos seis filtros. Não foi inventado um vínculo para ele. Esse retrato pode mudar conforme a equipe cadastra dados e conforme a visibilidade da sessão.

As seis categorias visuais possuem correspondência hoje. IDs coincidentes não são usados como contrato: `resolveHomeCategory` compara o nome visual com `categorias.nome`, normalizando espaços nas extremidades, caixa e acentos. Só uma correspondência única é aceita, e seu `id_categoria` é enviado a `getLocaisIdsPorCategorias`. Não há associação por ordem, ID visual, substring, nome do estabelecimento ou categoria presumida. Não foram acrescentados sinônimos como restaurantes/bares.

Se uma categoria for removida, renomeada para outro conceito ou ficar ambígua, a seleção é preservada e aparece uma mensagem de indisponibilidade com opção de limpar/escolher outra. A lista não é substituída por todos os locais e não utiliza o ID visual como fallback.

## Composição dos filtros

- Tocar em um porquinho seleciona a categoria; tocar de novo remove só essa seleção; tocar em outro a substitui. O banner mostra a categoria e permite limpar somente o porquinho.
- A pesquisa permanece independente e os porquinhos continuam disponíveis durante a busca.
- Preço, distância e categorias do modal são rascunhos até tocar em “Aplicar Filtros”. A lista é derivada de um único caminho, em vez de ser sobrescrita por cada controle.
- Regra: locais públicos **E** texto **E** preço máximo **E** raio **E** categoria do porquinho **E** grupo de categorias avançadas. Dentro do grupo avançado, as categorias usam união, mantendo a semântica anterior de `.in(...)`; o grupo é intersectado com o porquinho.
- Preço continua usando `preco ?? preco_entrada`. Distância usa as coordenadas atuais e Haversine. Se uma distância positiva exigir GPS e a permissão falhar, o novo conjunto não é aplicado silenciosamente sem esse critério; a seleção anterior permanece.
- “Limpar Filtros” no modal limpa porquinho e filtros avançados. A pesquisa continua digitada e é respeitada. “Limpar” no banner limpa só o porquinho.
- Consultas em andamento deixam a lista de resultados vazia com indicador de carregamento. Falha mostra erro e tentativa novamente; categoria válida sem locais mostra mensagem vazia amigável. Respostas atrasadas de filtros anteriores são ignoradas.
- Destaques permanecem independentes, identificados na sua própria seção. Favoritos, métricas, detalhes e navegação dos cards continuam com os mesmos handlers.

## Arquivos desta tarefa

- src/components/MainLayout.js: controles acessíveis, seleção e imagens originais; destaque com borda/fundo usando a paleta existente.
- src/screens/HomeScreen.js: integração dos porquinhos, composição de filtros, estados de leitura e limpeza, remoção de locais fictícios da listagem.
- src/services/categoriasService.js: respostas nulas são listas vazias; preservados métodos e consultas existentes.
- src/utils/homeFilters.js: definições visuais sem IDs de banco, resolução por nome e filtragem comum.
- test/homeFilters.test.mjs e test/fixtures/homeCategories.real.json: testes e retrato público real da consulta para regressão offline. A fixture não é importada pelo aplicativo e não substitui leituras reais do Supabase.
- Este guia. locaisService.js permanece intacto: sua consulta pública já exige `visivel=true`.

Nenhuma alteração em dependências ou configuração Android. Nenhum commit ou push.

## Validação automatizada

- Testes cobrem seleção, troca, remoção, limpar, composição com texto/preço/distância/categorias avançadas, correspondência por nomes reais, IDs diferentes dos visuais, catálogo pendente/ausente/ambíguo, vazio real, erro/recuperação e resposta fora de ordem.
- Incluem regressão de favoritos/detalhes, GPS negado, serviço Supabase, imagens e acessibilidade dos seis porquinhos.
- A fixture real registra apenas campos públicos relevantes e é um retrato, não uma asserção de que o banco nunca mudará. Testes automatizados substituem a rede por mocks e não alteram o banco.
- `npm.cmd test`: **202 testes aprovados, zero falhas**, incluindo 16 testes novos da RA-03 e as regressões existentes das RA-01/06/08.
- `npx.cmd expo-doctor`: **20/20 verificações aprovadas**.
- `git diff --check`: sem erros; apenas avisos já existentes de normalização LF/CRLF do Git.
- `npx.cmd expo export --platform android --output-dir android/audit-ra03-export`: bundle Android/Hermes gerado com sucesso. Saída local ignorada pelo Git; nenhuma alteração na configuração Android. Persiste o aviso preexistente sobre o import privado de expo-auth-session/build/QueryParams, que não impediu a exportação e não foi alterado nesta tarefa.

## Validação manual no Android

1. Abra a Development Build com Metro e uma conta de teste, no celular e no Samsung SM-X210. Não é necessário prebuild ou reinstalação por estas mudanças JavaScript.
2. Na Home sem filtros, confira os locais públicos atuais. Toque em Comidas: o porquinho deve ganhar destaque, o banner indicar “Categoria: Comidas” e somente os locais com vínculo real devem aparecer. No retrato acima, apenas Sabor do Cerrado.
3. Toque novamente em Comidas: a seleção deve sumir e retornar a lista completa, respeitando a busca e filtros avançados que ainda estiverem aplicados. Selecione Parques e depois Cinemas: deve substituir o porquinho anterior. Confira o botão “Limpar” do banner.
4. Sem outros filtros, Festas, Eventos e Cafés devem mostrar vazio amigável enquanto o banco continuar como no retrato. A seleção não deve retornar todos os locais nem criar cartões fictícios. A seção Destaques continua independente da lista.
5. Selecione Comidas e pesquise “cerrado”: o local deve permanecer. Pesquise “hambúrguer”: deve aparecer vazio se nenhum nome/endereço vinculado corresponder. Apague a busca: a seleção Comidas deve continuar.
6. No modal, aplique preço 40 com Comidas: no retrato consultado, o local custa 45 e será excluído. Aumente para 45; digite e apague a pesquisa, verificando que o limite de preço permanece.
7. Marque Cinemas nas categorias avançadas e mantenha Comidas no porquinho: a interseção deve ficar vazia no retrato atual. Remova o porquinho: deve mostrar o cinema. Marque também Comidas no modal e aplique: o grupo avançado admite ambas, ainda sujeito ao texto/preço/distância.
8. Aplique um raio de distância e confira o GPS. Negue a permissão numa conta/dispositivo de teste: deve informar a necessidade, sem fingir que aplicou o raio. Use “Limpar Filtros” e confira que limpa a seleção e os avançados, mantendo a busca.
9. Para testar falha de rede, desligue a conexão depois de carregar a Home e selecione outra categoria; deve mostrar erro, não uma lista de outra categoria. Reconecte e toque em “Tentar novamente”. Troque rapidamente entre categorias e confira que a resposta antiga não sobrescreve a nova.
10. Adicione/remova um favorito e abra detalhes mantendo um porquinho selecionado; confira retorno, contador da RA-08 e navegação. Verifique as imagens originais e a rolagem horizontal dos seis porquinhos nos dois tamanhos de dispositivo.

Os testes com APIs nativas simuladas não substituem esta conferência visual/GPS/sessão autenticada no dispositivo. Não foram usados logins ou escritas no Supabase para validar esta tarefa.
