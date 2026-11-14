# Hardening incremental — propostas bloqueadas

Estas propostas respondem aos achados reais **resumidos pelo responsável** em 13/11/2026. Não são migrações liberadas. O JSON integral do catálogo e os corpos das RPCs não estão acessíveis nesta execução. Não executar os arquivos, remover travas ou selecionar trechos.

Relatório e matriz de testes: `docs/hardening-supabase-ativo-20261113.md`.

## Pré-requisitos comuns

1. Revisar/exportar catálogo completo, incluindo colunas, tipos, constraints, policies, grants de tabela/coluna, heranças, sequências, views, triggers e schemas expostos.
2. Auditar os corpos das três RPCs comerciais, seus auxiliares, `atualizar_localizacao_parceiro`, RPCs de campanhas/publicação/ofertas/interações e todo caminho privilegiado alternativo. Não basta o nome conter `segura`.
3. Confirmar a fonte `user_roles` protegida contra escrita direta pelo cliente e provisioning legítimo por caminho confiável. `roles`/`roles_etapas` não são assumidas como fonte de autorização.
4. Auditar `roleapp_admin_audit` instalada: nenhuma recriação/limpeza/backfill. Definir escrita confiável compatível com as funções atuais antes de fechar grants do cliente.
5. Escolher/revisar helpers equivalentes aos candidatos `roleapp_security.is_admin()`, `partner_owns(text)` e `local_public(text)`. **Instalação não confirmada**. Os arquivos não criam helpers. Se nomes/semântica diferirem, gerar novo SQL revisado, não mascarar a divergência.
6. Garantir que `partner_owns` prove papel atual e aprovação individual do local, com propriedade imutável para o cliente. `local_public` deve atender à regra de publicação aprovada. Conferir recursão de RLS, search_path, owner, EXECUTE e custo/índices; não presumir que casts para text sejam ideais.
7. Testar versões atuais do app, integrações externas e jobs em clone autorizado. A ausência de consumidor no repositório não autoriza revogação em produção.
8. Aprovar cada mudança, sua janela e sua reversão. Nenhuma proposta instala capacidades novas, cria usuários/admins, muda planos/preços ou configura Android.

## Etapas candidatas

| Arquivo | Alteração limitada | Compatibilidade obrigatória |
| --- | --- | --- |
| `01_auditoria_blocked.sql` | Restringe log instalado à leitura administrativa e escrita confiável | RPCs comerciais devem conseguir inserir auditoria sem grants diretos de cliente |
| `02_locais_entrada_blocked.sql` | Bloqueia INSERT/DELETE diretos e privilégios de DDL no alvo | Aprovação/criação/vínculo de parceria por backend revisado; leitura/UPDATE não mudam aqui |
| `03_locais_edicao_parceiro_blocked.sql` | Limita UPDATE a parceiro aprovado e campos atuais | Preserva `visivel` e formulários atuais; coordenadas continuam pelo RPC autorizado |
| `04_campanhas_blocked.sql` | RLS privada por parceiro/admin, sem DML cliente | Solicitar, ativar e publicar continuam por RPC revisada; sem alteração de vigência/valores |
| `05_metricas_blocked.sql` | Leitura privada de agregados e nenhuma escrita direta | Interação unitária pelo servidor, sem mudar semântica/deduplicação nesta etapa |
| `06_eventos_blocked.sql` | CRUD próprio aprovado e colunas limitadas | Criação com RETURNING, remoção por ID, sequências e classificação pública de campos |
| `07_usuarios_leitura_blocked.sql` | SELECT próprio de id/nome/foto, sem SELECT amplo | Perfil inicial, nome, avatar, cadastro e consumidores externos; não modifica UPDATE/Auth |
| `08_roles_legadas_blocked.sql` | Variante de isolamento completo do cliente | Só serve se classificação provar ausência de acesso cliente legítimo; caso contrário, elaborar variante por proprietário/compartilhamento real |

As etapas 01–05 são o caminho prioritário para locais/campanhas. 07 pode ser antecipada em trilha independente se a privacidade do perfil exigir, depois da mesma análise de dependências. Não considerar o hardening completo após só fechar INSERT de locais: conferir também UPDATE de identidade/proprietário e caminhos privilegiados.

## Composição de políticas e compatibilidade

As propostas não apagam policies existentes. Acrescentam permissivas limitadas quando necessário e guardas **AS RESTRICTIVE**, para que permissivas antigas `true` não ampliem o conjunto permitido. Restritivas antigas continuam podendo negar um fluxo legítimo: devem ser revisadas/testadas, não ignoradas. RLS não protege TRUNCATE nem sequências; os grants correspondentes exigem inspeção própria.

Revogam-se grants somente nos alvos da etapa, incluindo concessões por coluna, após o gate de dependências. SELECT completo permanece para a consulta própria de campanhas/métricas, conforme o cliente atual; RLS deve limitar linhas. Em eventos, SELECT completo autenticado de ativos só é aceitável se **todas** as colunas forem publicáveis. Se houver campo privado, preparar projeção/RPC antes de liberar esse candidato. Não há consumidor anônimo de eventos localizado no `src`; integrações externas podem exigir variante própria.

`usuarios` permanece com leitura própria das colunas consumidas pelo cliente. Não se pressupõe necessidade de acesso direto administrativo amplo: consultas de responsáveis devem usar RPC com projeção mínima. O arquivo não certifica nem corrige todas as regras de UPDATE de perfis existentes.

O toggle `visivel` do parceiro é preservado. Ele não deve ser usado como bloqueio definitivo de moderação. Moderação/arquivamento e edição administrativa com motivo/versão precisam de contrato posterior, separado e aprovado, incluindo efeitos em todos os leitores públicos.

## Gates técnicos e fingerprint

Cada arquivo contém exceção incondicional antes de DDL, fingerprint esperado nulo, booleans de revisão falsos e `ROLLBACK` final. Nada é liberado por existir no repositório. Não basta preencher flags: um artefato final de implantação deve ser revisado com as evidências correspondentes e aprovação explícita.

`supabase/diagnostics/20261113_hardening_manifest_readonly.sql` especifica uma coleta futura de digest do catálogo sob `search_path=pg_catalog`. A mesma consulta está no preflight de cada proposta. Detecta divergências em relações, policies, colunas, constraints, índices, tipos, rotinas conhecidas, grants, papéis, heranças e configurações relevantes.

O fingerprint é detector de drift, não assinatura de aprovação ou prova de segurança. Não cobre valores de negócio, código externo ou toda dependência dinâmica entre schemas. Corpos auxiliares externos exigem revisão adicional. Não copiar cegamente hashes entre clone e produção: owners/versões/configuração podem diferir legitimamente. Para cada etapa, revisar o estado **após a etapa anterior** e registrar o digest aprovado daquele ambiente. O hash anterior deixa de ser válido depois de mudar o catálogo.

O preflight requer alvos/helpers existentes, recusa bypass/propriedade herdada de clientes e escrita direta em `user_roles`, e adquire locks curtos nos alvos. O postflight confere RLS e grants efetivos, incluindo colunas. Grant herdado inesperado causa falha; não revogar uma role inteira como contorno. Outras alterações privilegiadas de catálogo devem estar suspensas na janela: lock de tabela não serializa todo DDL de funções/papéis externos.

Não há concessão automática de USAGE em sequências nem mudança de schema exposto. Se o fluxo de eventos precisa de sequência, preservar/ajustar somente a sequência identificada e revisada no artefato final. `setval`/TRUNCATE/BYPASSRLS precisam ser verificados mesmo quando testes de RLS passam.

## Reversão

- Antes de commit de uma migração futura: qualquer falha aborta; `ROLLBACK` mantém o estado anterior. Estes rascunhos já abortam na primeira trava e jamais devem ser usados como artefato de produção.
- Após commit: suspender novas ações afetadas, diagnosticar e preferir correção adiante. Não reabrir `WITH CHECK(true)`, desligar RLS ou restaurar CRUD amplo como recuperação automática.
- Gerar previamente, a partir do catálogo revisado, DDL de restauração **das únicas policies/ACLs tocadas**, com fingerprint do estado esperado e aprovação específica. Não escrever agora nomes antigos de policies que não foram fornecidos.
- Não apagar auditoria nem restaurar backup integral sobre decisões novas. Se houver corrupção de dados, recuperação/PITR deve preservar e reconciliar alterações posteriores, com autorização própria.

Nenhuma proposta, diagnóstico ou teste SQL deste pacote foi executado no Supabase. O relatório discrimina verificações offline e pendências reais.
