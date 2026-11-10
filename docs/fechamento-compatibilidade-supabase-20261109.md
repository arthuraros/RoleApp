# Proposta após a última coleta — 09/11/2026

**NÃO LIBERADA PARA IMPLANTAÇÃO.** Revisão e arquivos locais apenas. Nenhum SQL executado, conexão ao Supabase, mudança de dados, commit ou push. As quatro migrações mantêm suas exceções incondicionais. Os resultados do banco são os informados pelo responsável; não foram coletados novamente pelo Codex.

Este documento atualiza os relatórios anteriores. Estão confirmados: duas tabelas independentes de avaliações, ambas com RLS e leitura pública; view ligada a locais/avaliacoes; datas TIMESTAMPTZ NOT NULL com defaults now()/sete dias; status padrão ativa; durações 3/7/14; ausência de triggers personalizados nos objetos investigados. Não voltar a tratar essas definições como desconhecidas. Os manifestos exatos de catálogo e a aprovação continuam pendentes por projeto.

## Avaliações e view

avaliacoes mantém nota inteira 1–5, comentário obrigatório/não vazio e FK para usuarios. avaliacoes_locais mantém smallint 0–5, comentário opcional/vazio com limite de 1.000 e FK para Auth. Não há união, cópia, backfill ou alteração dessas constraints/FKs.

O app continua lendo/escrevendo avaliacoes_locais em DetalhesLocalScreen e contando suas avaliações em userService. A view continua agregando exclusivamente avaliacoes. Não há consumidor direto da view no código src analisado. Médias da view e da tela podem diferir por usarem bases independentes; essa diferença é preservada, não corrigida com mistura automática.

A proposta 00175 mantém origem, nove colunas/ordem/tipos, LEFT JOIN, COALESCE e arredondamento existentes. Usa CREATE OR REPLACE, sem DROP/CASCADE, confere contrato/OID e adiciona security_invoker/security_barrier/filtro visivel. Concede somente SELECT na view e confere privilégios efetivos/herdados.

Para security_invoker funcionar com as fontes reais:

- Concede USAGE em public e SELECT nas colunas de locais necessárias à view, incluindo id_local/visivel; não concede escrita por causa da view.
- Na origem avaliacoes, substitui o SELECT de PUBLIC/anon/authenticated por SELECT apenas em id_local, nota e id_avaliacao. Não libera comentário/id_usuario. Heranças que ainda exponham outras colunas fazem o postflight falhar.
- Mantém as políticas de escrita existentes de avaliacoes e acrescenta política SELECT restritiva que exige local visível. A política de leitura pública existente fornece a permissiva; a restritiva limita o conjunto. Não troca as políticas por uma concessão ampla nova.
- Em locais, 00175 acrescenta SELECT restritivo visivel=true, fechando temporariamente o USING(true) também no acesso direto. Depois 00200 substitui integralmente as políticas revisadas de locais por SELECT de visíveis OU próprios do parceiro aprovado OU admin, eliminando a permissiva antiga ampla. Escritas de terceiros e alteração de proprietário continuam bloqueadas pelos grants/políticas/triggers da proposta.

A etapa intermediária 00175 restringe também a leitura privada de proprietários/admin pela tabela locais. Planejar corte coordenado/maintenance window até 00200; não disponibilizar esse estado intermediário ao aplicativo. A própria view pública sempre exclui invisíveis, mesmo para admin. Locais visíveis sem proprietário continuam públicos; nenhum proprietário/visibilidade é atribuído automaticamente.

As políticas RLS das fontes e seus grants devem ser testados como anon/authenticated no clone. Preservar a expressão agregadora não prova que todas as políticas restritivas preexistentes retornem o mesmo conjunto. A redução de SELECT em avaliacoes pode afetar consumidores externos de comentários/autores ou INSERT RETURNING; não há consumidor correspondente no app atual. Isso exige revisão antes de aprovação, sem reabrir dados pessoais como solução genérica.

## Campanhas: metadados sem regravação do legado

00150 agora propõe, em transação bloqueada:

1. Expandir somente o CHECK de status revisado para incluir rascunho e mudar seu default futuro para rascunho.
2. Conferir os dois tipos TIMESTAMPTZ, NOT NULL e expressões de defaults contra manifesto. Remover NOT NULL e defaults de data_inicio/data_fim, permitindo NULL explícito e por omissão em rascunhos.
3. Adicionar e validar CHECK: rascunho exige ambas as datas NULL; ativa/pausada/finalizada exigem ambas não NULL.

Não há UPDATE de linhas. Campanhas antigas continuam com status, datas, duração, valor e IDs originais. Não se impõe retroativamente fim=início+duração, pois o antigo default de sete dias pode divergir de campanhas de três/quatorze dias. Nenhuma correção dessas datas antigas é feita automaticamente. CHECKs existentes de duração/valor/tipo, índices, FKs e constraints não relacionadas são preservados. Colisões de nomes/definições devem abortar, não ser ignoradas.

Novas solicitações continuam sendo criadas pela RPC como rascunho com datas NULL, sem cobrança. A RPC confere o registro persistido após triggers. Ofertas/duração continuam sob controle do servidor; cliente não envia status/valor/datas/ator.

## Ativação autorizada e consistente

00200 acrescenta ativar_campanha_segura(id,texto_da_justificativa), SECURITY DEFINER com search_path vazio, nomes qualificados e EXECUTE revogado de PUBLIC/anon. Authenticated pode chamar a função, mas ela exige admin confiável em user_roles no banco. Não usa metadata/plano/parâmetro de papel.

A função bloqueia a linha da campanha, aceita somente rascunho sem datas, verifica parceiro aprovado e proprietário de local visível, calcula um único instante do servidor e fim=início + 24 horas × duração (3/7/14). Isso define dias como períodos de 24 horas, evitando depender do fuso da sessão; confirmar essa semântica comercial antes de liberação. Não é agendamento por dias de calendário local.

Auditoria e UPDATE de status/datas fazem parte da mesma transação. A função verifica escrita/auditoria/estado final; falha reverte tudo. Índice único de auditoria garante uma ativação por campanha. Retry com mesmo admin/justificativa de ativação já auditada retorna as datas existentes, sem reiniciar vigência. Chamada sobre campanha legada ativa sem essa auditoria é recusada, assim como outra decisão sobre campanha já ativada.

O novo trigger de ciclo de vida admite INSERT somente em rascunho sem datas. Mudanças de status/datas só admitem rascunho -> ativa, com admin e auditoria correspondente e intervalo correto. Identidade/local/proprietário/tipo/duração/valor ficam imutáveis nesse fluxo. O cliente continua sem UPDATE direto de campanhas.

Pausa, retomada, finalização e edição comercial não ganharam endpoints nesta etapa. Transições correspondentes são recusadas pelo novo fluxo, sem reescrever estados antigos já pausados/finalizados. Jobs/integrações que façam essas escritas precisam de revisão e fluxo confiável específico antes do corte; não desabilitar o trigger para contorná-lo. Pagamento não é verificado por integração nesta tarefa: o admin atesta condições pela justificativa. A ativação não deve ser publicada como cobrança automática.

adminService ganhou o contrato de ativação, sem novo botão na UI e sem concessão de admin. O serviço envia só ID e justificativa. A autorização real está na RPC. Destaques públicos continuam exigindo campanha ativa/vigente, local visível e propriedade autorizada; rascunho não é publicado.

## Dependências de locais e preservação de políticas

No código local, locais é raiz de favoritos, mapa/detalhes, filtros/local_categorias, horários, eventos, métricas, campanhas, cardápio e avaliações. O inventário somente de leitura foi ampliado para inspecionar dependências de catálogo, FKs de entrada/saída, definições de views, triggers, grants, políticas e metadados de Storage/Cardápio. Não foi executado pelo Codex. Não se pode certificar consumidores externos ou SQL dinâmico com uma busca no repositório ou ausência de outra view no catálogo.

categorias_cardapio e itens_cardapio foram retiradas do loop de DROP/CREATE POLICY em 00200; as políticas existentes ficam intactas. O helper novo que só serviria às políticas substitutas foi removido. O preflight/postflight confere hash das políticas dessas duas tabelas e de todas as tabelas de Storage, abortando se houver diferença durante o corte. Não há DDL nem alteração de políticas/grants do schema storage. Telas/serviços de Cardápio não foram editados.

A revogação anterior de privilégios administrativos TRUNCATE/REFERENCES/TRIGGER em public e de UPDATE em sequências continua proposta, inclusive nas tabelas de Cardápio; USAGE de sequência é mantido onde necessário. Isso preserva políticas, mas ainda exige teste das operações reais/IDs/grants. Preservar uma política existente não certifica que ela seja segura: se a revisão revelar escrita de terceiros no Cardápio, preparar correção separada para sua aprovação, sem alteração silenciosa nesta etapa.

## Implantação futura e recuperação

Ordem ainda bloqueada: 00100 -> 00150 -> 00175 -> 00200 -> testes SQL/HTTP com JWTs reais -> regressões Expo -> distribuição do app. Tratar o corte como uma mudança coordenada em janela controlada, com rollback/backup antes de disponibilizar tráfego. Todas as travas dos rascunhos ficam nos arquivos de revisão; qualquer artefato de execução exige aprovação separada.

O manifesto de políticas de locais esperado por 00200 deve representar o estado **após 00175** (que adiciona a restritiva), não reutilizar cegamente o hash da coleta original. Derivar e conferir o manifesto no clone autorizado. Outros hashes/expressões de catálogo também devem corresponder à etapa correta. Não ignorar preflight que detecte diferença.

Antes/depois do corte no clone, comparar integralmente as campanhas antigas e os locais/proprietários/visibilidade, índices, constraints não alteradas e políticas de Storage/Cardápio. Preparar fixtures nos três estados antigos antes da aplicação dos scripts no clone para testar preservação e recusa de ativação dessas linhas; não desabilitar triggers nem fazer seed direto desses estados depois do hardening.

Recuperação: ROLLBACK em falha antes de commit; após corte, suspender novas ativações/distribuição e preferir correção revisada. Não restaurar CRUD amplo, USING(true), bypass da view, defaults de ativação automática ou função antiga de métricas para contornar erro. Preservar auditoria e reconciliar quaisquer decisões posteriores ao backup. Roteiro anterior de clone/recuperação continua aplicável com estas atualizações.

## Verificação realizada e preparada

- npm.cmd test: **123 testes offline passaram, zero falhas**. Novos casos validam payload mínimo da ativação, justificativa obrigatória e ausência de fallback em erro de autorização. Cliente simulado, fetch bloqueado; não comprovam execução SQL nem cálculo de intervalos pelo PostgreSQL.
- Parser Babel: **47 arquivos JS/JSX/MJS** sem erro. git diff --check passou. Aviso Node MODULE_TYPELESS_PACKAGE_JSON permanece sem falha.
- Checagens estáticas: 18 funções/29 referências de assinaturas EXECUTE, quatro travas incondicionais, Cardápio fora da substituição de políticas e ausência de DDL de Storage. Não constituem parsing/validação PostgreSQL.
- Testes SQL preparados, **não executados**: ofertas/rascunhos/ativação em 3/7/14; datas NULL antes da ativação e não NULL com vigência exata depois; retry sem reinício e uma auditoria; anônimo/parceiro sem ativação; transições inválidas; active com datas NULL recusado; falha da auditoria reverte ativação; snapshot das campanhas antigas preservado. Fixture com nota 5 em avaliacoes e 0 em avaliacoes_locais demonstra a origem esperada da view como anon, além de negar comentário legado.

Permanecem pendentes testes reais no clone: parser/DDL/PLpgSQL, grants/RLS efetivos, média/contagem, todas as dependências e assinaturas via API, concorrência entre administradores/revogação/alteração de proprietário, trigger de falha, Storage/fotos/Cardápio e regressão no dispositivo. Nenhum teste de banco ou de interface foi realizado nesta etapa.

## Arquivos desta revisão

- supabase/migrations/20261109000150_campaign_draft_status.sql
- supabase/migrations/20261109000175_public_places_view_guarded.sql
- supabase/migrations/20261109000200_partner_access_hardening.sql
- supabase/diagnostics/20261109_review_sources_campaign_lifecycle_readonly.sql
- supabase/tests/20261109_partner_access_authorization.sql
- src/services/partnerAccessService.js; src/services/adminService.js
- test/partnerAccessService.test.mjs
- docs/fechamento-compatibilidade-supabase-20261109.md (novo), compatibilidade-view-campanhas-20261109.md e roteiro-clone-seguranca-20261109.md (avisos de atualização).

Dados legados, fundação 00100, políticas de Storage/Cardápio, arquivos de Cardápio, autenticação, mapa, filtros e favoritos não foram modificados remotamente. Nenhuma implantação está liberada.
