# Validação — RA-01, RA-06 e RA-08

## Alterações

- RA-01: AuthInput oferece mostrar/ocultar para todos os campos já marcados como senha (login, cadastro e redefinição, incluindo confirmações). Cada campo começa oculto e tem estado independente. O botão tem rótulo acessível e alvo de toque de 44 pontos. Valores e handlers de autenticação permanecem os mesmos.
- RA-06: removido somente o link textual “Abrir no Mapa” e seus estilos sem uso em DetalhesLocalScreen. O cartão com alfinete, endereço e ação openMap continua disponível. Mantido espaçamento antes do cardápio.
- RA-08: PerfilScreen consulta getLocaisFavoritos, o mesmo serviço da lista Favoritos, e mostra sua quantidade. Recarrega a cada foco do perfil, incluindo o retorno após adicionar/remover em outras telas. Exibe zero para lista vazia, “—” durante carregamento e “Indisponível” se a consulta falhar. Respostas de um foco/usuário anterior são ignoradas. Não depende do filtro de busca da lista.

Os controles mantêm as cores e estilos existentes, usam dimensões flexíveis e altura mínima para acomodar celulares, tablets e texto ampliado. Não houve alteração em dependências, Android, autenticação, RLS ou banco. As mudanças locais anteriores da equipe foram preservadas; não houve commit ou push.

## Verificações automatizadas

- `npm.cmd test`: 186 testes aprovados, zero falhas. Inclui testes novos de alternância de senha, cartão de localização em larguras de 360 e 800 pontos, contador ao retornar após mudanças, vazio, erro, troca de conta e resposta tardia.
- Testes existentes de perfil e captura/upload de foto mantidos, com mock da nova leitura de favoritos. Preservada a alteração semver preexistente em mergeIntegration.test.mjs.
- `git diff --check`: sem erros.
- `npx.cmd expo export --platform android --output-dir android/audit-ra-export`: bundle Android/Hermes gerado com sucesso. Saída local na pasta Android ignorada pelo Git; nenhuma configuração nativa foi alterada.
- Os testes de componentes substituem APIs nativas e não comprovam layout real ou integração com Supabase.

## Validação manual em celular e Samsung SM-X210

Use a Development Build já instalada com Metro (`npx.cmd expo start --dev-client`). As alterações são JavaScript; não exigem regenerar a pasta Android ou reinstalar o APK. Se necessário, use o encaminhamento USB e o lançamento localhost documentados em build-android-sdk58.md.

1. Login: digite uma senha de teste, toque no olho duas vezes. Verifique que começa oculta, pode ser revelada e ocultada, e o conteúdo não muda. Repita com teclado aberto e com fonte ampliada; o botão deve continuar acessível.
2. Cadastro: alterne separadamente senha e confirmação. Revelar um campo não deve revelar o outro. Confira as validações existentes de tamanho e confirmação, sem concluir um cadastro desnecessário.
3. Redefinição: em uma sessão de recuperação de conta de teste, repita a alternância dos dois campos. Confirme que a submissão mantém a validação e o fluxo atual. Não use credenciais reais em capturas.
4. Favoritos > Ver detalhes: o texto “Abrir no Mapa” deve estar ausente. O cartão “Localização”, seu alfinete e o endereço devem continuar visíveis; toque nele e confira a abertura do mapa para o mesmo local. Voltar deve preservar a navegação.
5. Perfil: compare a quantidade em “Rolês que quero visitar” com a lista inteira de Favoritos. Favorite um local na Home e retorne ao Perfil; a contagem deve aumentar após a consulta. Remova um favorito na lista e retorne; deve diminuir. Remova o último e confira zero.
6. Digite uma busca na lista de Favoritos e volte ao Perfil: o contador deve continuar mostrando o total, não só os resultados filtrados. Troque de conta e confira que a contagem anterior não permanece.
7. Sem conexão, volte ao Perfil: uma falha deve aparecer como “Indisponível”, sem simular zero. Reconecte e saia/volte ao Perfil para recarregar.
8. Repita em celular e tablet, com fonte padrão e ampliada: olho e contador sem sobreposição, campos utilizáveis com teclado aberto e cartão de localização separado do cardápio.

Os fluxos autenticados e a validação visual nos dois tamanhos devem ser confirmados manualmente com conta de teste; os testes automatizados não fazem login nem escrevem no Supabase real.
