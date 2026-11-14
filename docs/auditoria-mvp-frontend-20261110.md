# Auditoria do MVP e entrega de frontend — 10/11/2026

Branch: `feature/validacao-seguranca-supabase`. Auditoria exclusivamente local, anterior às alterações desta rodada. Não foram feitas consultas ao Supabase. As evidências do banco são as fornecidas anteriormente pelo responsável.

| Prioridade | Código encontrado | Situação e dependência |
| --- | --- | --- |
| Perfis | AuthContext, profileService, permissions, AccessGate, navigation e CustomTabBar | Quatro abas básicas; quinta para parceiro; admin pelo Perfil. Papéis consultados em user_roles, sem promoção por metadata. A tabela/RLS de papéis depende da migração bloqueada; falhas mantêm acesso privilegiado fechado. Nome do Perfil ignorava metadata de exibição do Auth. |
| Solicitações | SejaParceiroScreen, parceiroService, partnerAccessService | INSERT próprio com status pendente; sem criação automática de local. Não havia histórico, acompanhamento nem prevenção de toque duplo. Marketing prometia prazos, métricas e vantagens não confirmadas. Os seis campos de leitura do histórico existem no schema conhecido. |
| Administração | PainelAdminScreen, adminService, validateDecision | Revisão explícita, candidatos, justificativa e confirmações já preparados. Depende das RPCs seguras propostas e da auditoria transacional; não existe evidência de implantação. Não haverá fallback de UPDATE nem aprovação simulada. |
| Parceiro | PainelParceiroScreen, EditarLocaisScreen, parceiroService | Listava locais por propriedade e oferecia edição sem confirmação individual. Painel tinha números e gráfico fictícios. Salvar local/horários não é transacional; eventos têm backend com RLS pendente. Consulta dos próprios vínculos pode ser somente leitura; gestão depende do backend aprovado. |
| Cardápio | GerenciarCardapioScreen, cardapioService, DetalhesLocalScreen | Tela de gestão apenas listava dados; serviço já possui CRUD. Leitura pública no detalhe funciona. Faltavam busca, filtros e separação entre erro/vazio. Escrita individual depende da proposta de Cardápio bloqueada. |
| Campanhas | ImpulsionarScreen, parceiroService, partnerAccessService | Interface e chamadas das RPCs de ofertas/rascunho preparadas. Ativação existe como método no adminService, sem fluxo completo de interface. RPCs, ofertas, transições e RLS não estão liberadas; não serão usados status/datas/preços forjados. |
| Imagens | Campos imagem_url/url_foto e propostas locais | Não existe upload de imagens-locais em src. Caminhos, prefixos, autorização e política do bucket público estão pendentes. Nenhum upload será introduzido com contrato inventado. Avatar é um fluxo separado, já existente. |

## Escopo escolhido após a auditoria

Priorizar acompanhamento próprio de solicitações, validação do formulário, identidade visual do perfil, consulta dos próprios estabelecimentos e busca/filtros no Cardápio. Administração, gestão com escrita, métricas privadas, campanhas e imagens recebem indisponibilidade explícita enquanto dependem do backend bloqueado. A interface não substitui RLS; nenhum bloqueio visual será apresentado como correção das permissões remotas.

## Resultado da implementação

Em preenchimento após as alterações e verificações locais desta rodada.
