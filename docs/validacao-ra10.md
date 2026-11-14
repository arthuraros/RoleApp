# RA-10 — Categorias em Favoritos

## Diagnóstico

FavoritosScreen renderizava MainLayout sem `selectedCategory` e sem `onSelectCategory`. Assim, os nove controles e o carrossel apareciam, mas os toques não atualizavam nenhum filtro da tela. A lista aplicava apenas pesquisa por nome sobre `getLocaisFavoritos(user.id)`.

MainLayout já transmite o ID visual no toque, destaca a seleção e mantém uma chave constante para o carrossel. `resolveHomeCategory` já resolve nomes normalizados para IDs reais; `categoriasService` já consulta o catálogo e os vínculos reais. `favoritosService.getLocaisFavoritos` já restringe a consulta por `id_usuario`. Não era necessário alterar esses componentes/serviços, a Home ou o banco.

## Implementação

- Favoritos passa seleção e callback ao MainLayout. Tocar novamente desmarca; tocar em outro porquinho substitui a seleção. Nenhuma chave de montagem ou posição de rolagem foi adicionada à tela/componente.
- Reutiliza `resolveHomeCategory` e `filterHomePlaces`. O catálogo normalizado precisa ter correspondência única; somente o `id_categoria` resolvido é enviado à consulta de vínculos. IDs visuais não são IDs do banco.
- A fonte da listagem é **sempre** `getLocaisFavoritos` do usuário autenticado. Os IDs de locais da categoria apenas restringem essa fonte; nunca constroem uma nova lista com locais de fora dos favoritos. Não há consulta à listagem geral de locais.
- A pesquisa continua por nome, sem alterar sua semântica anterior, e é aplicada junto com a categoria. Limpar a categoria mantém o texto pesquisado.
- Ao ganhar foco, recarrega favoritos, catálogo e vínculos da categoria selecionada, mantendo seleção/pesquisa da mesma conta. Durante a atualização os dados antigos não são apresentados como resultados atuais.
- Dados e filtros pertencem à conta atual. Ao trocar conta ou sair, registros da conta anterior ficam imediatamente indisponíveis, antes das novas respostas. Respostas atrasadas de outra conta, foco, seleção ou tentativa anterior são ignoradas.
- Remoção mantém o serviço existente e atualiza a lista local assim que a operação é confirmada. Durante a operação, o botão correspondente fica desabilitado para evitar duplicação. Falha preserva o favorito e mostra erro; permite tentar novamente. Seleção e busca continuam ativas.
- Se uma remoção concluir durante uma leitura que ainda contém aquele favorito, a resposta é descartada e uma nova leitura é feita. Isso evita recolocar o local removido ao retornar à tela.
- Estados distintos: carregamento; erro de favoritos/filtro com botão para tentar novamente; categoria ausente/ambígua com opção de limpar; categoria válida sem favoritos com mensagem específica. Sem filtro de categoria, uma falha no catálogo não impede mostrar favoritos carregados corretamente.
- Navegação para detalhes e registro de métricas mantidos. Falha de métricas continua sem bloquear detalhes.

As consultas de Favoritos têm ciclo de atualização próprio, pois sua fonte é privada por usuário e permite remoção local. O mapeamento e a interseção foram reaproveitados das funções existentes, sem alterar o comportamento da Home nem criar uma segunda definição de categorias.

## Arquivos desta tarefa

- `src/screens/FavoritosScreen.js`: conexão dos controles, leituras protegidas por conta/foco, interseção, mensagens e atualização após remoção.
- `test/favoritosFilters.test.mjs`: testes de integração da tela com serviços substituídos por mocks offline.
- `test/mergeIntegration.test.mjs`: adapta a regressão existente de detalhes/métricas para fornecer o catálogo e as funções compartilhadas à tela.
- `docs/validacao-ra10.md`: este diagnóstico e guia.

MainLayout, HomeScreen, homeFilters, os serviços existentes, imagens, formulários, teclado, dependências e configuração Android foram preservados. Não houve consulta real ao Supabase nesta sessão, execução de SQL, alterações de dados/schema/RLS, commit ou push. O trabalho local anterior permanece no checkout.

## Validação automatizada

- `npm.cmd test`: **278 testes aprovados, zero falhas**, incluindo 26 novos testes da RA-10 e as regressões da Home/RA-09.
- Testes das nove categorias usam IDs de banco deliberadamente diferentes dos IDs visuais. Um ID vinculado à categoria mas ausente dos favoritos é sempre excluído.
- Cobrem selecionar/trocar/desmarcar, pesquisa combinada por nome, categoria vazia/ausente/ambígua, falhas e recuperação de favoritos/catálogo/vínculos, remoção com sucesso/erro, refresh com preservação da seleção, consultas atrasadas, troca de conta/logout, remoção durante refresh e detalhes/métricas.
- O teste do carrossel da RA-09 permanece na suíte: identidade estável ao selecionar e nenhuma rolagem controlada. Estes testes não medem a posição física no dispositivo.
- `npx.cmd --yes expo-doctor`: **20/20 verificações aprovadas**.
- `npx.cmd expo export --platform android --output-dir android/audit-ra10-export`: **bundle Hermes Android gerado**, aproximadamente 3,6 MB. O aviso preexistente de `expo-auth-session/build/QueryParams` continua sem impedir a exportação.
- `git diff --check`: **aprovado**, com avisos preexistentes de normalização LF/CRLF. Logs locais ignorados: `.android-audit-ra10-tests.log`, `.android-audit-ra10-doctor.log`, `.android-audit-ra10-bundle.log`, `.android-audit-ra10-diff.log`.

Os catálogos, locais e vínculos adicionais usados nos testes são mocks, não são carregados pelo aplicativo nem enviados ao Supabase. Não foi recompilado/reinstalado APK; a exportação valida a geração do bundle para a Development Build existente.

## Conferência no Samsung SM-X210

1. Execute `npx.cmd expo start --dev-client` e abra a Development Build existente. Se usar USB/localhost, siga `docs/build-android-sdk58.md`. Entre com uma conta de teste que já tenha favoritos conhecidos e categorias/vínculos reais.
2. Em Favoritos, confirme que a lista inicial contém somente os favoritos dessa conta. Selecione Comidas: devem permanecer apenas os favoritos vinculados a Comidas. Compare com a Home: um local da categoria que não seja favorito nunca deve aparecer em Favoritos.
3. Toque novamente em Comidas para desmarcar. Selecione outra categoria para substituir a anterior. Confira o destaque dos porquinhos. Percorra as nove categorias; categorias ausentes no catálogo devem indicar indisponibilidade, e categorias válidas sem favoritos devem mostrar vazio, sem exibir toda a lista.
4. Deslize até Oficinas/Aulas culturais e selecione, troque e desmarque. O carrossel deve permanecer na posição. Os rótulos de arte pendente permanecem como na RA-09.
5. Selecione uma categoria e pesquise pelo nome de um favorito. Troque o texto, apague-o e desmarque a categoria: texto e categoria devem se combinar sem apagar um ao outro. Nenhum resultado fora dos favoritos deve aparecer.
6. Com filtro ativo, remova um favorito pelo coração. Aguarde a confirmação: o item deve sair, mantendo filtro/pesquisa. Se era o último resultado, deve aparecer a mensagem vazia. Em falha de rede, o favorito deve permanecer e o botão voltar a permitir tentativa.
7. Abra detalhes e volte: favoritos e vínculos devem atualizar, mantendo categoria/pesquisa. Também confira adicionar/remover um favorito pela Home/detalhes e voltar a Favoritos. O item removido não pode reaparecer por uma leitura antiga.
8. Desconecte a rede e troque a categoria ou saia/volte à tela. Deve aparecer erro de carregamento, sem lista de outra categoria ou dados antigos como atuais. Reconecte e use Tentar novamente. Faça trocas rápidas de categoria e confira que somente a seleção mais recente determina os resultados.
9. Saia da conta e entre em outra conta de teste: nenhum favorito ou filtro da conta anterior deve aparecer. Confira estado sem favoritos e retorno para detalhes com falha de métricas/rede.

Não houve validação visual autenticada no SM-X210 nesta sessão. A confirmação de rolagem, navegação, sessão e rede reais permanece manual. Não é necessário cadastrar categorias ou criar vínculos arbitrários para validar esta correção.
