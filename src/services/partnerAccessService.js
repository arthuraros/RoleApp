// Operações compatíveis com 20261109000200_partner_access_hardening.sql.
// Cliente injetado: os testes não inicializam Supabase/Auth/Storage nem usam rede.
import { validateDecision } from '../utils/partnership.js';
export function createPartnerAccessService(client) {
  async function currentUserId() {
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user?.id) throw error;
      return data.user.id;
    } catch { throw new Error('Entre na sua conta para continuar.'); }
  }

  async function rpc(name, params) {
    try {
      const { data, error } = await client.rpc(name, params);
      if (error) throw error;
      return data;
    } catch {
      throw new Error('Operação indisponível ou não autorizada. Tente novamente após verificar seu acesso.');
    }
  }

  return {
    async enviarSolicitacaoParceria({ nome, email, estabelecimento, cidadeEstado }) {
      const idUsuario = await currentUserId();
      const fields = [nome, email, estabelecimento, cidadeEstado];
      if (fields.some(value => typeof value !== 'string' || !value.trim())) {
        throw new Error('Preencha todos os campos da solicitação.');
      }
      const { data, error } = await client.from('solicitacoes_parceria').insert({
        id_usuario: idUsuario,
        nome: nome.trim(), email: email.trim(), estabelecimento: estabelecimento.trim(),
        cidade_estado: cidadeEstado.trim(), status: 'pendente',
      }).select().single();
      if (error) throw new Error('Não foi possível enviar sua solicitação de parceria.');
      return data;
    },

    async registrarMetrica({ idLocal, views = 0, cliques = 0, visitas = 0 }) {
      if (!idLocal || String(idLocal).startsWith('demo-')) return null;
      const values = [views, cliques, visitas];
      if (values.some(value => value !== 0 && value !== 1) ||
          values.reduce((sum, value) => sum + value, 0) !== 1) {
        throw new Error('Registre apenas uma interação por chamada.');
      }
      // Sem data/totais/identidade fornecidos pelo cliente; sem fallback de escrita.
      const event = views ? 'view' : cliques ? 'clique' : 'visita';
      return rpc('registrar_interacao_segura', { p_id_local: String(idLocal), p_evento: event });
    },

    async criarCampanha({ idLocal, tipo, titulo, mensagem, interesses = [],
      faixaEtaria = 'Todos', raioKm = 5, duracaoDias = 7 }) {
      if (!idLocal || !['destaque', 'visibilidade'].includes(tipo) ||
          ![3, 7, 14].includes(duracaoDias)) {
        throw new Error('Informe local, tipo e duração válidos.');
      }
      return rpc('solicitar_campanha_segura', {
        p_id_local: String(idLocal), p_tipo: tipo,
        p_titulo: titulo?.trim() || '', p_mensagem: mensagem?.trim() || '',
        p_interesses: interesses, p_faixa_etaria: faixaEtaria,
        p_raio_km: raioKm, p_duracao_dias: duracaoDias,
      });
    },

    async getDestaquesAtivos() {
      const data = await rpc('listar_destaques_publicos', {});
      return (data || []).filter(c => c.locais?.visivel === true);
    },

    async listarOfertasCampanha() {
      return (await rpc('listar_ofertas_campanha', {})) || [];
    },

    async ativarCampanha({ idCampanha, motivo }) {
      if (!idCampanha || typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 2000) {
        throw new Error('Informe campanha e justificativa.');
      }
      return rpc('ativar_campanha_segura', { p_id_campanha: String(idCampanha), p_motivo: motivo.trim() });
    },

    async listarSolicitacoesAdmin() {
      return (await rpc('listar_solicitacoes_admin', {})) || [];
    },

    async revisarSolicitacao(idSolicitacao) {
      if (!idSolicitacao) throw new Error('Informe uma solicitação.');
      return rpc('revisar_parceria_segura', { p_id_solicitacao: String(idSolicitacao) });
    },

    async decidirSolicitacao(input) {
      validateDecision(input);
      const { reviewId, decisao, acao, motivo, idLocalExistente = null,
        identidadeValidada = false, duplicidadeRevisada = false, novoLocal = null } = input;
      // Identidade/papel do decisor são validados exclusivamente no banco.
      return rpc('decidir_parceria_segura', {
        p_revisao: reviewId, p_decisao: decisao, p_acao: acao,
        p_motivo: motivo.trim(), p_id_local_existente: idLocalExistente == null
          ? null : String(idLocalExistente),
        p_identidade_validada: identidadeValidada, p_duplicidade_revisada: duplicidadeRevisada,
        p_novo_local: novoLocal == null ? null : {
          endereco: novoLocal.endereco.trim(), preco: novoLocal.preco, preco_entrada: novoLocal.preco_entrada,
        },
      });
    },
  };
}
