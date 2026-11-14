# RA-05 — Teclado e formulários

Data: 13/11/2026. Escopo restrito à sobreposição do teclado e acesso por rolagem. Nenhuma dependência, configuração Android, regra de autenticação, serviço ou estrutura/política Supabase foi alterada. Sem commit/push. O trabalho local anterior foi preservado.

## Diagnóstico

Os formulários já usavam KeyboardAvoidingView e ScrollView. Isso não garantia que o campo focado seria reposicionado: não havia tratamento compartilhado de foco/rolagem após abrir o teclado, trocar campos ou mudar a área disponível. Vários formulários também dispensavam o teclado ao começar a rolar, impedindo conferir o botão com ele aberto.

O código instalado de React Native 0.88.1 calcula o modo `height` de KeyboardAvoidingView a partir de uma altura inicial guardada e da posição relativa da view. Os wrappers existentes usavam `keyboardVerticalOffset` implícito zero apesar de cabeçalhos, safe areas e modais diferentes. Isso torna a compensação sensível à posição do formulário e ao redimensionamento da janela. São fatores encontrados no código; não foi gravada uma reprodução anterior à correção para atribuir cada ocorrência histórica a um fator isolado.

No Android gerado, MainActivity já declara `windowSoftInputMode="adjustResize"`. A consulta ADB ao SM-X210 confirmou `ADJUST_RESIZE` na janela em execução. O projeto usa edge-to-edge; a declaração do modo, isoladamente, não comprova quanto espaço chegou ao layout React Native em cada formulário. Não há justificativa comprovada para trocar para adjustPan/adjustNothing, desativar edge-to-edge ou alterar Gradle/Manifest/app.json.

Referências consultadas: [KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview), [ScrollView](https://reactnative.dev/docs/scrollview) e [Keyboard](https://reactnative.dev/docs/keyboard), além do código da versão instalada em node_modules. A documentação distingue os eventos Android/iOS e exige uma altura limitada para a região rolável.

## Solução compartilhada

- `KeyboardViewport`: mede a view em coordenadas da janela e reserva **somente a sobreposição real** com o teclado. Se o Android já reduziu a área até acima do teclado, a reserva é zero. Não guarda altura inicial nem soma a altura inteira do teclado indiscriminadamente. `collapsable={false}` garante uma view nativa para a medição Android.
- Ao fechar o teclado, a reserva volta a zero. Medições antigas não podem recolocar espaço após fechar ou desmontar. No iOS, acompanha mudança de frame e fechamento; no Android, acompanha os eventos didShow/didHide e o relayout da view.
- `KeyboardAwareScrollView`: acompanha foco propagado pelos TextInputs, mudança de área e tamanho do conteúdo; mede o campo atual e rola apenas o deslocamento necessário para deixá-lo visível. Usa uma margem de 12 dp, não um grande espaçamento fixo no final.
- Não executa rolagem de outro formulário montado: exige que o foco tenha passado por sua árvore e que aquele input continue sendo o campo atual.
- Preserva refs, callbacks, estilos e conteúdo existentes. O botão que rola até o cadastro de parceiro continua usando sua ref original.
- Rolagem manual dos formulários mantém o teclado aberto (`keyboardDismissMode="none"`). Botões continuam recebendo toque com `keyboardShouldPersistTaps="handled"`. O usuário pode fechar pelo teclado/voltar do sistema. As listas e carrosséis que não são formulários mantêm seu comportamento anterior.
- A compensação automática adicional de teclado do ScrollView no iOS fica desativada para não duplicar a reserva medida pelo wrapper. Não há KeyboardAvoidingView aninhado nas regiões migradas.

## Formulários abrangidos

| Tela/componente | Alteração |
|---|---|
| AuthLayout | Wrapper e rolagem compartilhados para login, cadastro, recuperação e redefinição de senha; cartão, cores e mascotes preservados |
| PerfilOpcoesScreens/Page | Edição de nome e suporte/relato de problema; cabeçalho e safe area preservados |
| SejaParceiroScreen | Cadastro de parceiro, campos inferiores e botão final; ref de rolar até o formulário preservada |
| EditarLocaisScreen | Campos do estabelecimento, telefone, endereço, descrição, horários e botões finais |
| GerenciarCardapioScreen | Apenas formulários do modal de categoria/produto/edição; listagem externa preservada |
| HomeScreen | Apenas modal de preço/distância; pesquisa, lista, categorias e Destaques preservados |
| MapaScreen | Apenas modal de distância; mapa e cartão de prévia preservados |
| DetalhesLocalScreen | Campo de comentário/avaliação na rolagem externa; carrossel do cardápio preservado |
| PainelAdminScreen | Formulários existentes na rolagem da tela; handlers, permissões e refresh preservados |
| ImpulsionarScreen | Apenas wrapper/rolagem dos campos existentes; sem alteração de planos, valores ou comportamento comercial |

Os campos de pesquisa do MainLayout estão no cabeçalho e não são formulários inferiores; não foram alterados. LocalizacaoEstabelecimento não contém TextInput nem formulário HTML de texto. AuthInput, os validadores e os handlers de envio permaneceram intactos.

## Arquivos alterados nesta sessão

- Novos: `src/components/KeyboardForm.js`, `src/utils/keyboardGeometry.js`, `test/keyboardForms.test.mjs` e este documento.
- Integração: `src/components/AuthLayout.js`; `src/screens/PerfilOpcoesScreens.js`, `SejaParceiroScreen.js`, `EditarLocaisScreen.js`, `GerenciarCardapioScreen.js`, `HomeScreen.js`, `MapaScreen.js`, `DetalhesLocalScreen.js`, `PainelAdminScreen.js`, `ImpulsionarScreen.js`.
- Harness/regressões: `test/helpers/render-screen.mjs`, `test/location.test.mjs`, `test/responsive.test.mjs`. Os mocks foram adaptados à nova importação; as verificações funcionais anteriores foram mantidas.

## Conferência realizada no SM-X210

Development Build existente, 1200 x 1920 px, ~800 x 1280 dp, teclado Samsung, sessão já autenticada. O Metro existente foi reutilizado; não houve reinstalação de APK, logout ou alteração da resolução/densidade.

- Edição de perfil: foco no campo de nome; campo e Salvar nome visíveis acima do teclado.
- Cadastro de parceiro: o botão existente rolou até o formulário. Ao focar Cidade/Estado, o último campo ficou acima do teclado; sua borda inferior foi observada em ~1283 px e o teclado iniciou em ~1302 px.
- Com o teclado **ainda aberto**, foi possível rolar até Enviar cadastro, observado em ~971–1023 px. O ADB confirmou `mInputShown=true`. O botão não foi pressionado.
- Ao fechar o teclado, o formulário voltou a ocupar a área normal, sem reserva de teclado restante.
- Modal de filtros da Home: campo numérico de distância e botões Aplicar/Limpar visíveis acima do teclado numérico; modal fechado sem aplicar mudanças.
- Não foram digitados, salvos ou enviados valores. Não houve escrita de perfil, solicitação de parceria, favorito ou avaliação. A navegação normal da sessão pode realizar leituras dos serviços existentes.
- A consulta recente de logs ReactNativeJS/AndroidRuntime não apresentou erro durante a conferência.

Evidências locais, ignoradas pelo Git, em `android/ra05-keyboard-*.png` e `android/ra05-keyboard-window.xml`. Capturas de perfil podem conter dados da sessão e não foram incluídas na documentação versionável.

## Testes e verificações

- Testes novos: sobreposição residual versus janela já reduzida; cabeçalhos/safe areas; larguras 320/390/430/800 dp; campo inferior e campo acima da área visível; campos altos; eventos Android/iOS; abrir/fechar; mudança de área; medição atrasada; montagem de modal com teclado já aberto; foco/relayout; preservação de ref; isolamento entre formulários e limpeza de listeners.
- Os testes com mocks não substituem renderização nativa, composição do IME ou animações do iOS. Duas regressões antigas precisaram apenas reconhecer o novo import do wrapper no harness; não houve falha funcional detectada nesses handlers.
- Expo Doctor: **20/20 verificações aprovadas**.
- Bundle Android/Hermes: gerado em `android/audit-keyboard-export`, aproximadamente 3,6 MB. Mantido o aviso preexistente de import privado de `expo-auth-session/build/QueryParams`, sem impedir a exportação.
- `npm.cmd test`: **289 testes aprovados, zero falhas**, incluindo 11 novos da correção do teclado e todas as regressões existentes.
- `git diff --check`: **aprovado**, com avisos preexistentes de normalização LF/CRLF; arquivos novos também conferidos quanto a whitespace final.
- Logs locais: `.android-audit-keyboard-tests.log`, `.android-audit-keyboard-doctor.log`, `.android-audit-keyboard-bundle.log`, `.android-audit-keyboard-diff.log`.

## Roteiro de validação restante

1. Abra a Development Build com o Metro. No SM-X210, celular pequeno (320–360 dp), convencional (390 dp), grande (430 dp) e iOS, teste com fonte normal e ampliada.
2. Em login/cadastro/recuperação/redefinição, foque o primeiro e o último campo; percorra os campos com o teclado aberto, role até Entrar/Cadastrar/Enviar e feche/reabra o teclado. O botão deve ficar alcançável sem perder valores.
3. Em editar perfil e suporte, teste campo comum e descrição multilinha, rolando até a ação final. Em conta autorizada de parceiro, repita em descrição, endereço, telefone e horários de editar locais, sem salvar dados reais para conferir layout.
4. Nos modais de filtros e cardápio, abra teclados alfanumérico/numérico, troque campos, role até a ação final e feche o modal. Confira abrir modal quando já houver teclado na tela.
5. Em detalhes, escreva um comentário de teste sem publicar e confira nota/botão de envio. Confira também os campos existentes das telas administrativas/impulsionamento apenas com acesso autorizado.
6. Role manualmente com teclado aberto: ele deve permanecer aberto. Feche por Voltar/tecla do IME; a reserva deve desaparecer e o layout voltar ao normal.
7. No tablet, use janela dividida e altere a altura disponível; repita abertura/fechamento para detectar altura antiga retida, espaços duplos ou campo oculto. Confira também teclado flutuante/dividido, cuja geometria/eventos variam por sistema/IME.

Pendentes de conferência visual: os quatro fluxos de autenticação (a sessão existente foi preservada), edição de locais/cardápio com permissões de parceiro, administração, suporte/avaliação, celulares e iOS. O comportamento com teclado Samsung acoplado foi verificado no perfil, cadastro de parceiro e modal da Home; não significa aprovação de todos os IMEs e tamanhos.
