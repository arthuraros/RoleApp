# Android Development Build — SDK 58

Auditoria local em 13/11/2026, branch `feature/validacao-seguranca-supabase`.

## Diagnóstico

A atualização de dependências não atualiza automaticamente uma pasta Android já existente e ignorada pelo Git. O commit `edd115e` migrou Expo 57/RN 0.86 para Expo 58/RN 0.88. O commit `b9bcd8a` atualizou Expo para 58.0.24; as mudanças locais anteriores a esta auditoria alinharam os módulos a 58.0.25 e adicionaram expo-dev-client. O teste alterado apenas passou a verificar o intervalo semver do Expo no lockfile: não participa da execução Gradle.

O backup `C:\Projetos\RoleApp-android-backup-20261113` contém um projeto nativo parcialmente adaptado: `android.newDsl=false` em gradle.properties, mas `android.builtInKotlin=false` somente no arquivo gradle/wrapper/gradle-wrapper.properties. Propriedades do Android nesse último arquivo não configuram os projetos Gradle. O Kotlin integrado do AGP 9 conflita com `org.jetbrains.kotlin.android`/`kotlin-android`, utilizados pelo app e react-native-maps. O novo DSL também desabilita APIs antigas como libraryVariants, usadas por módulos Expo. As duas opções devem estar em **android/gradle.properties**, como já determina o template do Expo instalado.

Os erros anteriores de wrapper mínimo e ProGuard são consistentes com arquivos nativos antigos: SDK 58 gera Gradle 9.4.1 e proguard-android-optimize.txt. O backup já recebeu essas correções; não há logs históricos suficientes para reconstruir cada estado intermediário. Não foram necessários patches individuais de bibliotecas nem downgrade de dependências.

A pasta atual foi regenerada pelo usuário antes da auditoria. build.gradle, settings.gradle e wrapper correspondem ao template `node_modules/expo/template.tgz` (considerando nome do app e finais de linha); gradle.properties contém as duas opções oficiais. A falha restante `SDK location not found` era local: local.properties ausente e ANDROID_HOME/ANDROID_SDK_ROOT não definidos. Restaurado sdk.dir após verificar SDK e ADB. O arquivo gradle-diagnostico.txt registra ainda uma execução feita na raiz JS, fora de android; esse erro de diretório não indica falha do projeto Gradle.

Depois de corrigir CMake, a compilação Java revelou também `com.roleapp.BuildConfig` inexistente. O arquivo `android/build/generated/autolinking/autolinking.json`, datado de 13h00 antes desta auditoria, ainda declarava com.roleapp; app/build.gradle e MainApplication.kt declaram com.thekaiiros.roleApp. O cache sobreviveu à regeneração anterior. Foi preservado em `android/audit-cache-before-cmake3316/root-autolinking` e regenerado pelo autolinking oficial. Não foi alterado o identificador do aplicativo nem o Java gerado manualmente. Em regenerações sobre diretório existente, confira esse cache caso haja erro de BuildConfig com namespace antigo.

Referências: [Expo SDK 58](https://expo.dev/changelog/sdk-58), [migração AGP 9](https://github.com/android/skills/blob/main/build-system/agp/agp-9-upgrade/references/android/build/releases/agp-9-0-0-release-notes.md). O template e os catálogos instalados são a referência exata para as versões deste lockfile.

## Versões verificadas

| Componente | Versão |
| --- | --- |
| Expo / React / React Native | 58.0.25 / 19.3.0 / 0.88.1 |
| expo-dev-client / expo-constants / expo-modules-core | 58.0.20 / 58.0.16 / 58.1.0 |
| react-native-maps | 1.29.11 |
| Gradle / AGP | 9.4.1 / 9.2.1 |
| Kotlin efetivo / KSP | 2.2.10 / 2.2.10-2.0.2 |
| compileSdk / targetSdk / minSdk | 37 / 36 / 24 |
| Build Tools / NDK | 37.0.0 / 27.1.12297006 |
| CMake / Ninja neste Windows | 3.31.6 / 1.12.1 |
| Node / npm locais | 24.21.0 / 11.19.0 |
| JAVA_HOME local | Eclipse Adoptium JDK 25.0.4.7-hotspot |

O catálogo RN declara Kotlin 2.2.0, mas o Gradle resolve KGP 2.2.10 e o plugin Expo reconhece essa versão efetiva explicitamente. Não foi imposto override. `npm ls` não mostrou duplicatas de React/RN/Expo nos módulos inspecionados. Todas as dependências presentes no catálogo bundledNativeModules correspondem aos intervalos recomendados.

## Reprodução no PowerShell

### Preparação obrigatória neste Windows

A primeira build revelou uma segunda causa independente: Ninja 1.10.2 (CMake 3.22.1) falhou em mkdir para um diretório com **261 caracteres**, durante `:app:buildCMakeDebug[arm64-v8a]`. O plugin Expo define CMAKE_OBJECT_PATH_MAX=1024, permitindo gerar caminhos que esse Ninja antigo não consegue criar. LongPathsEnabled já estava em 1; não foi alterado o registro. A solução oficial é CMake 3.31.6, que inclui Ninja 1.12.1. Consulte [Expo: caminhos longos no Windows](https://docs.expo.dev/troubleshooting/windows-long-paths/).

Instale `cmake;3.31.6` com o sdkmanager ou pelo Android Studio (SDK Tools, Show Package Details). Configure em `%USERPROFILE%\.gradle\gradle.properties`, preservando outras opções:

```properties
android.cmakeVersion=3.31.6
org.gradle.workers.max=2
```

São opções locais, lidas oficialmente pelo plugin Expo para todos os módulos CMake. Não exigem expo-build-properties ou mudanças em node_modules. Não fixe CMake 3.31.6 globalmente no app.json: o EAS Linux não precisa dessa solução e pode não ter essa versão instalada. Após trocar CMake, preserve ou remova apenas os caches gerados android/app/.cxx e android/app/build antes de recompilar; não remova fontes nem use prebuild --clean para corrigir esse problema.

Instale JDK compatível com Gradle 9.4.1, Android SDK, Build Tools e NDK das versões acima; configure JAVA_HOME e o SDK de cada máquina. Use `.cmd` para npm/npx caso a política do PowerShell bloqueie os wrappers `.ps1`.

```powershell
cd C:\Projetos\RoleApp
npm.cmd ci
npx.cmd expo install --check
npx.cmd expo-doctor
npm.cmd test
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx.cmd expo prebuild --platform android --no-install
# Se ANDROID_HOME não for definido para o processo Gradle, crie local.properties:
$sdkPath = $env:ANDROID_HOME.Replace('\', '/')
Set-Content android/local.properties "sdk.dir=$sdkPath" -Encoding ascii
Push-Location android
.\gradlew.bat help --console=plain
Pop-Location
npx.cmd expo run:android --device
```

Não execute prebuild --clean sobre mudanças nativas sem backup. Em checkout novo, o prebuild usa o template do Expo fixado pelo package-lock; não copie Gradle de SDK anterior. Para esta geração, confira as duas opções Android em gradle.properties e o wrapper 9.4.1.

Para desenvolver por USB sem depender da rede Wi-Fi, em um terminal execute `npx.cmd expo start --dev-client --localhost`; em outro, `& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:8081 tcp:8081`. Abra o endereço do development client apontando para http://localhost:8081.

Se `expo run:android --no-bundler` escolher o IP LAN apesar do Metro estar em localhost, use este lançamento explícito do SDK 58:

```powershell
$adbPath = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adbPath reverse tcp:8081 tcp:8081
& $adbPath shell am force-stop com.thekaiiros.roleApp
& $adbPath shell am start -W -a android.intent.action.VIEW -d 'exp+roleapp://?__expo_url=http%3A%2F%2Flocalhost%3A8081' com.thekaiiros.roleApp
```

## Expo Go e download remoto

`Failed to download remote update` acontece no carregamento do manifesto/bundle pelo cliente, antes do JS do app, e não é causado pelo compilador Kotlin ou ProGuard. Não há registro histórico suficiente para atribuir a ocorrência a firewall, endereço LAN, Metro indisponível ou incompatibilidade do cliente. Expo Go e development client são aplicativos distintos. Não foram alteradas credenciais, configurações de updates ou Supabase. O caminho USB/localhost permite testar o carregamento sem depender da acessibilidade LAN; não prova qual era a causa da ocorrência antiga.

Nesta validação, a abertura automática pela CLI usou o IP LAN enquanto o Metro estava limitado a localhost, resultando em `java.net.ConnectException: Failed to connect to /192.168.15.167:8081`. A abertura explícita por localhost/ADB reverse resolveu esse caso e o app chegou ao login. É evidência concreta de uma falha de transporte separada da build; não estabelece retroativamente a causa exata da mensagem antiga no Expo Go.

## Versionamento

Versionar package.json e package-lock.json em conjunto (alinhamento SDK 58 e expo-dev-client já presentes antes da auditoria), a alteração existente do teste semver após revisão, este guia e a regra de logs em .gitignore. Nenhuma dependência foi alterada nesta auditoria. Preservar o restante do trabalho local para revisão independente.

Manter locais: android/, local.properties, .env, APKs, caches, logs `.android-audit-*.log` e backup Android. Não versionar caminhos pessoais de SDK/JDK, credenciais nem saídas Gradle. Não houve commit, push ou mudanças no banco.

Mudanças realizadas nesta auditoria: android/local.properties (SDK validado); instalação paralela do CMake no SDK local; criação de `%USERPROFILE%\.gradle\gradle.properties` (arquivo não existia) com seleção CMake e limite de workers; preservação/regeneração dos caches mencionados; este guia e .gitignore. package.json, lockfile, teste semver e demais arquivos locais foram preservados como encontrados.

## Validação

- Expo Doctor: 20/20 verificações aprovadas.
- Expo install --check: dependências atualizadas, sem desalinhamentos.
- npm test: 179 testes aprovados, zero falhas.
- Gradle help executado dentro de android: BUILD SUCCESSFUL.
- Metro: bundle Android gerado (1247 módulos), HTTP 200, 7.981.521 bytes; encaminhamento USB 8081 configurado.
- Build final: **BUILD SUCCESSFUL em 5m23s**, 420 tarefas (35 executadas, 3 do cache, 382 atualizadas).
- `expo run:android --device R9XY400YCXB --no-bundler`: concluído, APK instalado no Samsung SM-X210 via USB.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 77.014.630 bytes, build debug arm64-v8a.
- Inicialização: tela de login observada via UI Automator; textos “Bem-vindo de volta”, “Entrar” e “Cadastre-se”. Log ReactNativeJS confirmou `Running "main"` com `fabric:true`; sem erro fatal no processo durante a abertura verificada.
- Evidência local: android/audit-screen.png, android/audit-window.xml e .android-audit-runtime-final.log. Metro mantido em execução na porta 8081; encaminhamento USB ativo.
- `git diff --check`: aprovado.

Tentativas intermediárias: a primeira build falhou após 13m41s no Ninja antigo/caminho longo; a segunda, após 1m23s, no namespace de autolinking em cache. Esses resultados não foram tratados como sucesso.

Escopo restante: login/autenticação, operações de banco, mapa, permissões e navegação interna não foram exercitados. Não houve login nem mutações no Supabase. A causa histórica específica do erro do Expo Go permanece indeterminada. A primeira carga real do bundle demorou cerca de dois minutos sob pressão de memória; a tela de login foi confirmada depois de concluir esse carregamento.

O Metro emite um aviso de importação de `expo-auth-session/build/QueryParams` fora dos exports públicos; houve fallback e o bundle foi gerado. Esse aviso preexistente não explica as falhas Gradle e merece revisão separada do fluxo de autenticação. O log histórico do Expo Go não foi localizado entre as últimas mensagens disponíveis do dispositivo.

Avisos de APIs antigas/opt-outs são emitidos pelas dependências e pelo template oficial. Implicam nova migração para AGP 10, não justificam remover os opt-outs no AGP 9.

Durante a primeira compilação, a máquina de 16 GB chegou a menos de 1 GB livre, com vários daemons Java e compilação C++/DEX concorrentes. Em máquinas com pouca memória, configure `org.gradle.workers.max=2` no gradle.properties **do usuário** (preservando suas outras opções), ou compile com `./gradlew.bat app:assembleDebug --max-workers=2 -PreactNativeArchitectures=arm64-v8a` dentro de android. Esse limite é ajuste local de recursos, não correção de compatibilidade. O primeiro download do react-android debug tem aproximadamente 274 MB.
