import { supabase } from "./supabase.js";
import { createPartnerAccessService } from "./partnerAccessService.js";

// Serviço administrativo do RolêApp.
// As operações são autorizadas pelas funções RPC do Supabase.
const access = createPartnerAccessService(supabase);

export const adminService = {
  // Listar solicitações administrativas
  listarSolicitacoes: access.listarSolicitacoesAdmin,

  // Encaminhar solicitação da Revisão para Pendentes
  async encaminharParaDecisao(idSolicitacao, observacao) {
    const texto = String(observacao || "").trim();

    if (!idSolicitacao || texto.length < 10 || texto.length > 2000) {
      throw new Error("Informe uma observação de 10 a 2000 caracteres.");
    }

    const { data, error } = await supabase.rpc(
      "encaminhar_solicitacao_decisao",
      {
        p_id_solicitacao: Number(idSolicitacao),
        p_observacao: texto,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  // Aprovar ou reprovar uma parceria
  async decidirParceria({
    idSolicitacao,
    decisao,
    justificativa,
    idLocal = null,
    identidadeConfirmada = false,
    duplicidadeRevisada = false,
  }) {
    const motivo = String(justificativa || "").trim();

    if (!["aprovado", "rejeitado"].includes(decisao)) {
      throw new Error("Decisão inválida.");
    }

    if (motivo.length < 10 || motivo.length > 2000) {
      throw new Error("A justificativa deve ter entre 10 e 2000 caracteres.");
    }

    if (
      !Number.isSafeInteger(Number(idSolicitacao)) ||
      Number(idSolicitacao) <= 0
    ) {
      throw new Error("Solicitação inválida.");
    }

    if (decisao === "aprovado") {
      if (!Number.isSafeInteger(Number(idLocal)) || Number(idLocal) <= 0) {
        throw new Error("Informe um ID de estabelecimento válido.");
      }

      if (!identidadeConfirmada || !duplicidadeRevisada) {
        throw new Error("Confirme a identidade e a revisão de duplicidades.");
      }
    }

    const { data, error } = await supabase.rpc(
      "decidir_solicitacao_comercial",
      {
        p_id_solicitacao: Number(idSolicitacao),
        p_decisao: decisao,
        p_justificativa: motivo,
        p_id_local: decisao === "aprovado" ? Number(idLocal) : null,
        p_identidade_confirmada: decisao === "aprovado" && identidadeConfirmada,
        p_duplicidade_revisada: decisao === "aprovado" && duplicidadeRevisada,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },


  // Consultar justificativa, data e administrador da decisão
  async obterDetalhesDecisao(idSolicitacao) {
    const id = Number(idSolicitacao);

    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('ID da solicitação inválido.');
    }

    const { data, error } = await supabase.rpc(
      'obter_detalhe_decisao_admin',
      {
        p_id_solicitacao: id,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  // Funções administrativas já existentes
  revisarSolicitacao: access.revisarSolicitacao,
  decidirSolicitacao: access.decidirSolicitacao,
  ativarCampanha: access.ativarCampanha,
};
