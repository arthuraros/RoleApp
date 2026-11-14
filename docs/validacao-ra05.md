# RA-05 — Responsividade

Data: 13/11/2026. Escopo: layout, dimensionamento, rolagem, áreas seguras e alvos de toque. Sem alteração de dependências, configuração nativa, serviços ou banco. Sem commit/push.

## Auditoria inicial (antes das edições)

O checkout já continha alterações extensas e não commitadas, inclusive `responsive.js`, largura máxima de páginas/formulários, `useWindowDimensions`, tratamento do teclado e reserva dinâmica da barra inferior. Essas mudanças foram preservadas. A tabela registra inspeção de código; não equivale a aprovação visual.

| Tela/componente | Diagnóstico inicial | Resultado nesta RA-05 |
|---|---|---|
| Login, cadastro, recuperação e redefinição | AuthLayout já tem SafeAreaView, largura limitada, KeyboardAvoidingView e ScrollView; AuthInput cresce verticalmente e mantém botão de senha | Base preservada; testes de redimensionamento, rolagem e comportamento Android/iOS |
| Home/destaques | Altura calculada e texto em meia largura com posição absoluta; risco de corte/sobreposição com fontes grandes | Mesmo componente alterna para texto e ação em fluxo natural abaixo de 380 dp ou fonte >= 115%; fotos, cores e carrossel preservados |
| Home/filtros | Rótulos em duas colunas e título/valor na mesma linha podiam exceder a largura | Uma coluna no modo compacto, rótulos flexíveis, cabeçalho com quebra e opções com mínimo de 44 dp |
| Pesquisa e porquinhos | Carrossel intencional; filtro com altura fixa de 38 dp | Filtro com mínimo de 44 dp e altura natural; pesquisa tem largura mínima e linha pode quebrar; callbacks de categoria preservados |
| Mapa | Cartão já tem altura máxima medida, rolagem interna, botão de centralizar acompanha sua altura; mapa já reserva a barra inferior | Cabeçalho empilha no modo compacto; controles de atualização e opções de raio crescem; texto da ação pode quebrar |
| Favoritos | Lista já rola e reserva altura real da barra; fotos com altura fixa apenas visual | Coração passa de 40 para 44 dp; fluxo e dados preservados |
| Detalhes | SafeAreaView protegia apenas topo/base; cardápio calculado sem recortes laterais | Proteção nas quatro bordas, cardápio usa largura segura e mantém repaginação ao redimensionar; voltar com 44 dp; nome de usuário flexível |
| Perfil | Largura máxima de formulário, ações com quebra, rolagem e reserva da barra já presentes | Itens do menu com mínimo de 44 dp |
| Editar perfil/configurações/avaliações/suporte/documentos | Page compartilhado já protege áreas seguras e usa teclado/rolagem; formulário limitado em tablets | Base preservada, sem alteração de conteúdo |
| Seja parceiro | Formulário já usa teclado/rolagem, texto dos botões flexível e largura máxima; ilustração de 215 dp cabe em 320 dp | Preservado; conferir fonte ampliada no banner de métricas |
| Editar locais | Horários já empilham no modo compacto; campos, rodapé e seletores já permitem quebra | Preservado (não houve mudança líquida neste arquivo) |
| Painel parceiro/estatísticas | Conteúdo limitado, cartões com flexibilidade e quebra, rótulos de gráficos limitados por coluna | Preservado; gráficos/tabelas exigem inspeção com fonte ampliada |
| Gerenciar cardápio | Modal já usa teclado e rolagem; botões de criação dividiam uma linha estreita | Botões podem empilhar com base de 150 dp; texto flexível, opções e ações com mínimo de 44 dp, rolagem do modal permite dispensar teclado |
| Painel administrativo | Formulários já usam KeyboardAvoidingView/ScrollView; linhas de ações com quebra | Preservado |
| Impulsionar | Formulário com teclado/rolagem e largura máxima já presente | Preservado; nenhum conteúdo de planos alterado |
| Barra inferior | Já mede sua altura e informa ao navegador; largura máxima 680 dp, insets laterais/inferiores e botões flexíveis | Preservada; verificar rótulos em 5 abas e fonte de 200% |
| BackendGate/AccessGate | Mensagem de indisponibilidade centralizada sem rolagem podia ficar inacessível em janela baixa | BackendGate com rolagem e largura máxima 680 dp; AccessGate simples preservado |
| LocalizacaoEstabelecimento/SocialButtons | Mapa de altura fixa 260 dp dentro do formulário rolável; botão Google já flexível e com altura mínima | Preservados; testar gestos do mapa dentro do formulário |

Dimensões fixas de ícones, avatares, fotos e marcadores foram mantidas quando não restringem texto/campos. Não foi desativado o escalonamento de fontes.

## Arquivos efetivamente alterados nesta sessão

- `src/utils/responsive.js`: critério compartilhado de modo compacto passa a considerar fonte >= 115%.
- `src/components/MainLayout.js`: pesquisa/filtros adaptáveis e alvo de toque.
- `src/components/BackendGate.js`: conteúdo rolável e largura limitada.
- `src/screens/HomeScreen.js`: destaques em fluxo natural no modo compacto, filtros e coração.
- `src/screens/DetalhesLocalScreen.js`: insets laterais, cardápio e botão voltar.
- `src/screens/MapaScreen.js`: cabeçalho e controles.
- `src/screens/GerenciarCardapioScreen.js`: botões, textos, ações e modal.
- `src/screens/FavoritosScreen.js`: alvo de toque do coração.
- `src/screens/PerfilScreen.js`: alvos de toque do menu.
- `test/responsive.test.mjs`: regressões específicas da RA-05.
- `docs/validacao-ra05.md`: este diagnóstico e guia.

Reutilização: modificados MainLayout, BackendGate e a política responsiveMetrics. AuthLayout e CustomTabBar existentes foram reaproveitados. Nenhuma tela duplicada e nenhuma dependência nova.

## Validação automatizada

- `npm.cmd test`: 226 testes aprovados, zero falhas (24 novos da RA-05).
- Testes novos: larguras 320, 360, 390, 430, 800 e 1024 dp; fontes 100%, 130% e 200%; insets laterais; janela larga/baixa; redimensionamento; estrutura de teclado Android/iOS; largura segura e repaginação do cardápio; destaques com fluxo natural; carrossel e callback de categoria.
- O harness substitui APIs nativas. Estes testes verificam cálculos, estrutura e handlers; não medem pixels, oclusão real pelo teclado ou renderização nativa.
- `npx.cmd expo export --platform android --output-dir .ra05-android-export`: bundle Hermes Android gerado. Reexportação final registrada no log local `.ra05-bundle.log`.
- `git diff --check`: sem erros de whitespace (avisos locais de conversão LF/CRLF).
- Não foi recompilado/reinstalado APK nem alterado Gradle/Android. A exportação não substitui o teste de execução da Development Build.

## Pendências visuais e guia manual

ADB identificou o Samsung SM-X210 conectado: 1200 x 1920 px, densidade 240 dpi (~800 x 1280 dp). Não foram capturadas telas nem exercitados fluxos autenticados nesta sessão. Todos os tamanhos ainda precisam de validação visual, inclusive o tablet. Não havia iOS nem celulares/emuladores confirmados. Nenhuma resolução do dispositivo foi alterada.

1. Abra a Development Build existente com o Metro (`npx.cmd expo start --dev-client`) e confirme que carrega sem erro. Use o procedimento USB já documentado em `docs/build-android-sdk58.md` se necessário.
2. Confira 320–360, 390, 430 e >=800 dp em dispositivos/emuladores. Registre largura lógica, fonte do sistema e plataforma; resolução em pixels não equivale à largura em dp.
3. Em cada tamanho, repita com fonte padrão, 130% e 200%, além de tamanho de exibição ampliado. Teste janela dividida no tablet. O app permanece configurado para retrato: cálculos aceitam janela larga/baixa, mas rotação física livre não foi habilitada nem validada.
4. No login/cadastro/recuperação/redefinição, foque o primeiro e o último campo, abra teclado, role até o botão principal, alterne visibilidade da senha e dispense teclado. Campos/botões devem permanecer alcançáveis; mensagens longas devem expandir o formulário.
5. Na Home, percorra todos os porquinhos, destaques e lista até o último item. Combine pesquisa, categoria, preço e distância. Abra filtros com teclado e confirme acesso a Aplicar/Limpar/fechar. Apenas carrosséis devem rolar horizontalmente.
6. No mapa, abra filtros, use raio personalizado, selecione local com endereço longo, role o cartão e centralize/feche. Confirme acesso aos controles e espaço útil para arrastar o mapa, inclusive em janela baixa.
7. Abra favoritos e detalhes com nomes/endereço/preços longos. Percorra categorias do cardápio, itens e avaliações; digite comentário com teclado aberto. Confirme ausência de cortes laterais e sobreposição com a barra inferior.
8. No perfil, teste nome/e-mail longos e contagem indisponível; abra edição/configurações e role até a última ação. Confira barra inferior com quatro e cinco abas e navegação por gestos/botões do Android; no iOS, confira recortes e indicador inferior.
9. Com conta de teste autorizada, confira cadastro/edição de local, horários, endereço, mapa interno, descrição longa e botões finais; abra modais de categoria/produto, teclado decimal e descrições multilinha. Não é necessário salvar dados reais para conferir layout.
10. Confira painéis, gráficos/tabelas, mensagens de erro/estado vazio e telas de indisponibilidade com fontes grandes. Registre qualquer truncamento que esconda informação necessária e reteste autenticação, favoritos e filtros no aparelho.

Critério de aprovação: sem rolagem horizontal involuntária, ações alcançáveis por rolagem com teclado aberto, texto funcional legível, áreas seguras respeitadas e navegação/filtros/autenticação preservados. Esta entrega conclui as correções de código e testes; a aprovação visual permanece pendente.
