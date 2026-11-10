# Diagnóstico de segurança Supabase — 09/11/2026

## Origem e limites

Resultados fornecidos pelo responsável pelo projeto, não coletados novamente pelo Codex:

| Verificação | Resultado informado |
| --- | --- |
| Tabelas analisadas | 15 |
| RLS habilitada | 11 |
| RLS desabilitada | 4 |
| usuarios sem correspondência em Auth | 0 |
| locais sem id_proprietario | 3 |
| locais com proprietário sem conta Auth | 0 |

RLS desabilitada em solicitacoes_parceria, eventos_locais, campanhas_impulsionamento e metricas_locais. Políticas amplas foram informadas anteriormente, inclusive em locais/horários; usuarios possui leitura geral. Nomes e expressões completas dessas políticas ainda não foram recebidos.

As contagens são um retrato informado, não uma garantia permanente. Ausência de órfãos não comprova UUID, unicidade, NOT NULL, FK ou criação automática de usuarios no cadastro por senha/Google. IDs e nomes dos três locais sem proprietário não foram fornecidos; não foram inventados.

## Impacto

Com RLS desligada, as políticas definidas na tabela não filtram linhas. A exposição real depende também de grants, herança, donos, funções, views e papéis de conexão. Não é possível afirmar acesso público total sem esses dados.

Ativar RLS sem revisar as políticas pode manter acessos excessivos; ativá-la sem políticas de leitura necessárias pode quebrar telas. Políticas permissivas aplicáveis se combinam por OR, portanto adicionar uma política permissiva mais limitada em paralelo a uma política permissiva ampla não resolve por si só. Políticas declaradas AS RESTRICTIVE têm semântica distinta (AND), também a revisar no inventário. FORCE RLS não é solução para superusuários/BYPASSRLS.

## Revisão da migração de papéis

Arquivo revisado: supabase/migrations/20261109000100_user_roles_foundation.sql. Mantido integralmente, incluindo BEGIN, exceção incondicional antes do CREATE TABLE e COMMIT. Não foi executado nem desbloqueado.

- A tabela separada user_roles é compatível com usuarios sem coluna papel e com o profileService atual.
- CHECK dos três papéis, FK para Auth, RLS e leitura própria são uma fundação coerente.
- Falta confirmar o nome livre da tabela, tipos, privilégios herdados, donos e caminhos alternativos de escrita.
- A migração não provisiona usuários existentes/novos, não aprova parcerias, não protege tabelas existentes e não oferece auditoria.
- Futuro preenchimento deve criar apenas usuario onde não houver papel, após confirmar identidades. Nenhum dono de local ou solicitante será promovido automaticamente.
- O CASCADE de user_roles representa apenas autorização atual. Não replicar exclusão em cascata para a auditoria histórica.
- Nenhum admin será provisionado pela migração. O primeiro admin dependerá de procedimento privilegiado, explícito e auditado, separado do aplicativo.

## Inventário preparado, sem execução

Arquivo: supabase/diagnostics/20261109_security_inventory_readonly.sql. Está fora de migrations e não cria objetos.

O script contém apenas consultas a catálogos/dados e delimitadores de transação READ ONLY com ROLLBACK. Não chama funções de negócio, RPCs, dblink, HTTP ou comandos de escrita. A transação usa snapshot repetível para os conjuntos de resultados.

| Bloco | Evidência solicitada |
| --- | --- |
| 01 | Versão, papel de inspeção, atributos de papéis e heranças |
| 02 | Tabelas public, Auth/Storage relacionados, donos, RLS e FORCE RLS |
| 03 | Colunas, tipos, nulabilidade, defaults, identidade e grants de coluna brutos |
| 04 | Constraints completas, validação, FKs de entrada/saída e índices |
| 05 | Políticas public/Storage com papéis, comando, permissividade, USING e WITH CHECK |
| 06 | ACLs de tabelas/views/sequências, colunas, schemas, default privileges e privilégios efetivos de tabela |
| 07 | Funções/procedimentos não sistêmicos: definição, dono, SECURITY DEFINER, search_path/configuração e EXECUTE |
| 08 | Triggers inclusive internos/estado, funções associadas e event triggers |
| 09 | Views/materialized views, opções de segurança e regras |
| 10 | Contagens de integridade, estados, duplicações e lista dos locais para regularização |

Não executar nesta etapa. Para uma coleta futura autorizada: usar sessão dedicada, papel de inspeção com visibilidade suficiente e exportar todos os result sets identificados por bloco. Alguns editores exibem somente o último resultado; nesse caso selecionar o SELECT desejado, sob uma transação READ ONLY na mesma conexão. Consultas sem permissão devem ser reportadas, não substituídas por inferências. Falha de um bloco aborta a transação; finalizar com ROLLBACK na sessão dedicada antes de outra coleta autorizada.

O bloco 10 depende dos nomes de tabela/coluna já informados. Casts para texto permitem conferir ausência de correspondência sem presumir igualdade de tipos; o bloco 03 é que confirma compatibilidade de tipos. A contagem de 15 considera o escopo informado: inventário de todas as tabelas public pode retornar outro total e deve ser reconciliado.

Funções/views/defaults podem conter URLs, credenciais legadas ou dados sensíveis em seus corpos. Revisar/redigir segredos antes de compartilhar os relatórios. Não exportar auth.users completo, e-mails, senhas, tokens ou preferencias. A consulta de regularização contém apenas ID/nome/visibilidade do estabelecimento.

Escopo SQL: catálogos e objetos do banco. Configuração de schemas expostos da Data API, Edge Functions, código externo, secrets, pagamentos, jobs e políticas de plataforma fora do catálogo ainda precisam de inspeção autorizada separada. Grants efetivos de tabela não comprovam acesso a linhas ou colunas; reconciliar ACLs por coluna, schema e herança. Revisar helpers chamados por outras funções e SQL dinâmico nos corpos, não apenas nomes/SECURITY DEFINER.

## Três estabelecimentos para regularização

O inventário apenas retorna uma coluna calculada diagnostic_flag = regularizacao_administrativa_pendente. Nenhuma flag é gravada e nenhum proprietário é atribuído.

Preservar IDs, visibilidade, categorias, favoritos, avaliações, horários, eventos, cardápio e campanhas vinculados. Locais públicos legados continuam consultáveis com visivel = true; não exigir papel do proprietário na leitura pública, pois isso ocultaria os três locais e outros legados antes de regularização.

Operações de parceiro exigirão propriedade não nula e igual ao usuário autenticado, negando edição desses locais. Somente fluxo administrativo dedicado poderá vincular proprietário, com verificação de conta, justificativa, bloqueio concorrente do local, auditoria e tratamento explícito da parceria. Não permitir “assumir local sem dono” pelo aplicativo. Não vincular por nome/e-mail ou ordem de criação.

## Evidência local e próxima decisão

Nenhum arquivo de aplicação, serviço ou teste foi alterado nesta preparação. Os arquivos locais de Gestão de Cardápio, navegação e serviços foram preservados. SQL não foi executado nem conectado a banco local/remoto.

A próxima implementação depende do inventário completo e da revisão de grants/políticas reais. Plano detalhado e critérios de aceitação: proposta-usuarios-admin-proxima-etapa.md.

Referências: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/functions .
