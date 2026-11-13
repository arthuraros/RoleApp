# Revisão de dependências — 13/11/2026

Branch: `feature/validacao-seguranca-supabase`. Base: merge `58080ab`.

## Correção aplicada

Somente `shell-quote` mudou: **1.10.0 → 1.11.0**. A versão, URL do tarball
e integridade SHA-512 em `package-lock.json` foram atualizadas usando os metadados
do registro npm. `npm install --ignore-scripts --no-audit --no-fund` sincronizou
a instalação e informou um pacote alterado. Nenhum script de instalação foi executado.

Cadeia: `react-native@0.88.1 → react-devtools-core@6.1.5 → shell-quote`.
O intervalo declarado por DevTools é `^1.6.1`, compatível com 1.11.0.
O aviso [GHSA-pqg4-j6r4-53mv / CVE-2026-102422](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv)
indica 1.11.0 como primeira versão corrigida. A falha permite injeção de comandos
quando `quote()` recebe uma string com terminador de linha após um token de comentário
e sua saída é executada por um shell. A auditoria npm classificou esse aviso como crítico.

Não foi necessário adotar 1.12.0 nem atualizar Expo para 58.0.25.
Expo **58.0.24**, React Native **0.88.1** e DevTools **6.1.5** foram preservados.
Uma comparação de todas as entradas do lockfile confirmou alteração exclusiva de
`node_modules/shell-quote`. `package.json` permaneceu intacto; não foi adicionado override
nem dependência direta. Instalações reproduzíveis devem usar o lockfile com `npm ci`.

## Aviso remanescente e risco

`minimatch@10.2.6` continua afetado por
[GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
O processamento de padrões glob controlados por um atacante com `optimizationLevel >= 2`
pode amplificar estruturas intermediárias e consumir CPU/memória, causando negação de serviço.
A versão corrigida publicada é **11.0.1**, fora da faixa principal 10 usada nesta cadeia.

O audit apresenta **três entradas moderadas**, relativas ao mesmo aviso e à sua propagação:
`minimatch → @expo/fingerprint@0.21.10 → expo@58.0.24`. Não são três falhas independentes.
Não há entradas altas ou críticas após a correção.

No código instalado, `@expo/fingerprint/build/utils/Path.js` cria os matchers com
`{ dot: true }`, mantendo o nível padrão 1; `build/Options.js` também documenta
que a configuração de fingerprint não expõe o nível vulnerável. Isso reduz a exposição
observada no caminho de fingerprinting, mas não remove o pacote vulnerável nem comprova
todos os consumidores possíveis. Não foram encontrados usos diretos de minimatch em `src`.

Risco residual: indisponibilidade de ferramentas/CI se padrões não confiáveis alcançarem
um consumidor com o nível vulnerável. Revisar alterações em configurações e padrões de
fingerprinting; acompanhar uma atualização compatível da cadeia Expo/fingerprint.
Não foi forçada a versão principal 11 de minimatch sem validação de compatibilidade.
A sugestão automática de Expo **52.0.49** foi recusada por sair do SDK 58.

## Verificações executadas

- `npm audit --json`, antes: 1 crítica e 3 moderadas; depois: 0 críticas, 0 altas e 3 moderadas.
  O código de saída após a correção continua **1** pelos avisos moderados restantes.
- `npm test`: **179 aprovados**, 0 falhas, 0 cancelados e 0 ignorados.
- Compatibilidade semver entre DevTools e shell-quote: aprovada.
- Verificação direta de `quote()`: rejeita `\n`, `\r`, U+2028 e U+2029 após comentário;
  preserva o ciclo normal de `quote()`/`parse()` para argumentos comuns. O teste não executou
  o texto gerado em um shell.
- `git diff --check`: aprovado.

Não houve `npm audit fix --force`, alteração de código do aplicativo, commit, push ou merge.
