# RA-09 — Nove categorias da Home

Implementação: 13/11/2026. Escopo restrito às categorias, seu layout e testes. Não foram alterados formulários, tratamento de teclado, HomeScreen, serviços, dependências, configuração nativa ou banco. O trabalho local das tarefas anteriores foi preservado. Não houve commit/push.

## Ordem, imagens e integração

| Ordem | Categoria | Chave visual | Mascote | ID público consultado |
|---|---|---|---|---|
| 1 | Comidas | 1 | pig_food.png, original | 1 |
| 2 | Cafés | 5 | pig_coffe.png, original | 5 |
| 3 | Bares e pubs | 7 | Pendente | Não retornado |
| 4 | Festas | 2 | pig_party.png, original | 2 |
| 5 | Eventos | 6 | pig_events.png, original | 6 |
| 6 | Cinemas | 4 | pig_cinema.png, original | 4 |
| 7 | Parques | 3 | pig_parks.png, original | 3 |
| 8 | Oficinas culturais | 8 | Pendente | Não retornado |
| 9 | Aulas culturais | 9 | Pendente | Não retornado |

As chaves visuais antigas foram preservadas, mesmo com a nova ordem. As novas chaves 7/8/9 **não são IDs do Supabase**. O caminho da RA-03 continua resolvendo nomes normalizados e consultando exclusivamente o ID retornado pelo catálogo. A normalização também passa a reduzir espaços internos repetidos. Duplicatas normalizadas continuam indisponíveis, sem fallback por ID ou por nome do estabelecimento.

## Responsividade do componente — decisão atualizada

- Todos os dispositivos: uma única linha em carrossel horizontal com as nove categorias, na ordem da tabela. A decisão anterior de grade em duas linhas foi substituída.
- Largura segura abaixo de 600 dp: itens de 88 a 124 dp conforme a fonte, intervalo de 8 dp e margem interna lateral de 12 dp. A partir de 600 dp: itens de 104 a 144 dp, intervalo de 12 dp e margem interna de 16 dp. Textos centralizados, sem limite artificial de linhas; página com limite existente de 960 dp.
- Usa `useWindowDimensions` e insets laterais; janela dividida ajusta tamanhos e espaçamentos mantendo o mesmo ScrollView horizontal. A chave do carrossel é constante e não depende da seleção. Não há `contentOffset` controlado nem comando de rolagem ao selecionar: a posição permanece sob controle nativo.
- Imagens originais intactas e sempre com `resizeMode="contain"`: 52 dp no celular, 64 dp na grade. Sem esticar ou distorcer os arquivos.
- Área de toque com altura mínima de 88 dp e largura mínima de 88 dp. Textos de 12 sp respeitam escalonamento do sistema.
- Altura natural do conteúdo, sem o limite anterior de 45% que podia cortar os itens com fonte ampliada. Não há grade, quebra dos itens em linhas ou distribuição flexível que estique as imagens. O carrossel de Destaques não foi modificado.

## Assets pendentes — impedem concluir a identidade visual

O repositório contém somente os seis mascotes de categoria existentes, além de ilustrações de parceria/gráfico. As imagens foram inspecionadas; nenhuma é adequada para representar as três novas categorias sem alterar seu significado. Nenhuma arte foi gerada, adaptada, copiada de outra categoria ou substituída por ícone/emoji.

As três categorias novas têm controle funcional e rótulo explícito **Arte pendente**, com indicação acessível. Não são apresentadas como mascotes finalizados.

Arquivos propostos para entrega pela equipe de arte:

- `assets/pig_bars_pubs.png`: porquinho com elementos de bar.
- `assets/pig_cultural_workshops.png`: porquinho com pincel, tintas ou materiais artísticos.
- `assets/pig_cultural_classes.png`: porquinho com livro ou aprendizado artístico/musical.

Entregar PNG com transparência, proporções, traço e paleta iguais aos originais. Conferir lado a lado com os seis `pig_*.png`, inclusive no tamanho final de 52/64 dp. Quando aprovados, incluir `require` estático desses arquivos nas chaves 7, 8 e 9 de `CATEGORY_ICONS` em MainLayout. Não há `require` para arquivos inexistentes nesta entrega, evitando quebrar o Metro. Atualizar o teste que hoje verifica seis imagens e três pendências.

## Supabase — leitura realizada, escrita não autorizada

Consulta REST em **13/11/2026 às 16:56:58, horário de Brasília**, somente `id_categoria,nome` de `categorias`, usando a configuração pública local, sem sessão de usuário ou credencial privilegiada. Foram retornadas as seis categorias existentes da tabela acima. As três novas **não aparecem na leitura pública**. Como RLS pode limitar a consulta, isto não prova ausência para um administrador.

Proposta em `supabase/proposals/20261113_ra09_home_categories.sql`:

1. Consultar catálogo completo e metadados das colunas com papel administrativo.
2. Após autorização, cadastrar somente nomes ausentes por comparação normalizada, deixando o banco gerar IDs. O administrador deve confirmar defaults/colunas obrigatórias antes de executar.
3. O arquivo termina em `ROLLBACK` como ensaio. Após autorização e revisão, substituir por `COMMIT` para persistir. Nenhum trecho foi executado nesta tarefa.

Não foram criados locais nem vínculos em `local_categorias`. Mesmo após o cadastro, uma categoria sem vínculos públicos deve mostrar **Nenhum local encontrado em …**. Enquanto não houver correspondência única no catálogo, a Home mostra **categoria indisponível no momento**, permite limpar/trocar seleção e não retorna todos os locais. Falhas de catálogo ou vínculos usam o erro/tentativa novamente da RA-03.

## Arquivos desta tarefa

- `src/utils/homeFilters.js`: nove definições na ordem solicitada, preservação das chaves e normalização de espaços.
- `src/utils/homeCategoryLayout.js`: largura dos itens por fonte e espaçamentos de celular/tablet.
- `src/components/MainLayout.js`: renderização compartilhada em carrossel horizontal em todos os dispositivos e pendências de arte.
- `test/helpers/render-screen.mjs`: resolução do novo módulo de layout no harness existente.
- `test/homeCategoryLayout.test.mjs`: ordem, imagens preservadas, linha única em todos os tamanhos, fontes, áreas seguras, redimensionamento, identidade estável ao selecionar e estados indisponíveis.
- `test/homeFilters.test.mjs`: adapta expectativas de ordem/quantidade, mantém regressões das seis antigas e testa as três novas na Home.
- `supabase/proposals/20261113_ra09_home_categories.sql`: proposta revisável, não executada.
- `docs/validacao-ra09.md`: este registro.

## Verificações

- `npm.cmd test`: **251 aprovados, zero falhas**, incluindo 25 testes novos. A fixture pública antiga não foi modificada para fingir que as novas categorias já existem. Catálogos/vínculos adicionais usados nos testes são mocks offline e não são importados pelo app nem enviados ao banco.
- Cobertura funcional das novas categorias: selecionar/trocar/desmarcar, ID resolvido diferente do visual, busca, preço, distância, filtros avançados, vazio, indisponibilidade, falhas de catálogo/vínculos e recuperação. Regressões existentes de autenticação, favoritos, perfil e demais funcionalidades continuam passando.
- Layout testado no harness: 320, 360, 390, 430, 800 e 1024 dp, fontes 100%/200%, insets e janela dividida. São testes de estrutura/cálculos/handlers, sem renderização nativa de pixels.
- `npx.cmd --yes expo-doctor`: **20/20 verificações aprovadas**. A primeira tentativa restrita falhou por acesso ao cache npm; a execução com acesso apropriado concluiu normalmente. Nenhuma dependência do projeto foi modificada.
- `npx.cmd expo export --platform android --output-dir android/audit-ra09-export`: **bundle Android/Hermes gerado**, aproximadamente 3,6 MB. Continua o aviso preexistente do import privado de `expo-auth-session/build/QueryParams`; não impediu a exportação.
- `git diff --check`: aprovado, com avisos preexistentes de normalização LF/CRLF.
- Logs locais: `.android-audit-ra09-tests.log`, `.android-audit-ra09-doctor-online.log`, `.android-audit-ra09-bundle.log` e `.android-audit-ra09-diff.log` (ignorados pelo Git).

Não foi recompilado/reinstalado o APK ou realizada validação visual autenticada nesta sessão. A exportação confirma a geração do bundle; não substitui o teste de execução no aparelho. As pendências de formulários/teclado da RA-05 permanecem fora desta tarefa.

## Conferência no Samsung SM-X210

1. Inicie `npx.cmd expo start --dev-client` e abra a Development Build existente. Para USB/localhost, use o procedimento já validado em `docs/build-android-sdk58.md`; não é necessário prebuild por estas alterações JavaScript.
2. Na Home em retrato e janela cheia (~800 dp), confira uma única linha e deslize horizontalmente até Aulas culturais. Ordem: Comidas, Cafés, Bares e pubs, Festas, Eventos, Cinemas, Parques, Oficinas culturais e Aulas culturais. Não deve existir segunda linha de itens.
3. Confira os seis porquinhos originais sem distorção e os três rótulos de arte pendente. Não aprove a identidade visual final até a entrega dos PNGs.
4. Amplie a fonte para 200%. Os nomes culturais devem quebrar linha dentro de cada item sem corte. Em janela dividida com largura segura <600 dp, confira o mesmo carrossel horizontal com espaçamento reduzido. Deslize até Oficinas/Aulas culturais, selecione, troque e desmarque: o carrossel não deve voltar ao início. Repita mantendo busca e filtros ativos. Confira também que Destaques continua com seu comportamento anterior.
5. Selecione Comidas, troque para Parques e toque novamente para desmarcar. Refaça com as novas categorias: no catálogo público atual, devem indicar indisponibilidade, com destaque de seleção e opção de limpar/trocar.
6. Após eventual cadastro **autorizado** no Supabase, recarregue a Home para atualizar o catálogo. Sem vínculos, as novas categorias devem mostrar vazio amigável. Só confira resultados reais quando existirem vínculos cadastrados pela equipe; não crie associações para viabilizar o teste.
7. Combine categoria com pesquisa, preço, distância e categorias avançadas. Apagar a busca não deve apagar o porquinho/filtros. Desligue a rede, troque categoria, confirme erro e tente novamente após reconectar. Confira favoritos/detalhes e retorno para a Home.

Validar também em celular Android e iOS; nenhum desses layouts foi conferido visualmente nesta sessão. Para concluir a entrega visual, faltam os três mascotes, a decisão sobre cadastro no banco e a conferência no dispositivo.

## Ajuste posterior — carrossel em tablets

Arquivos alterados somente neste ajuste: `src/components/MainLayout.js`, `src/utils/homeCategoryLayout.js`, `test/homeCategoryLayout.test.mjs` e este documento. Nenhum acesso ao Supabase ou execução do SQL; formulários, teclado, imagens, HomeScreen/Destaques, dependências e configuração Android preservados.

As verificações de 251 testes e bundle acima registram a implementação anterior da RA-09. Resultados deste ajuste:

- `npm.cmd test`: **252 testes aprovados, zero falhas**.
- `npx.cmd --yes expo-doctor`: **20/20 verificações aprovadas**.
- `git diff --check`: aprovado, com os avisos preexistentes de normalização LF/CRLF.
- Logs locais: `.android-audit-ra09-carousel-tests.log`, `.android-audit-ra09-carousel-doctor.log`, `.android-audit-ra09-carousel-diff.log`.

O teste de estabilidade verifica chave e ausência de offset/comando controlado; a confirmação da posição física de rolagem depende da conferência manual no SM-X210. Não foi solicitada nem executada nova exportação de bundle neste ajuste.
