import { supabase } from './supabase.js';
import { createPartnerAccessService } from './partnerAccessService.js';

// Não contém concessão de admin nem decisões por UPDATE direto.
const access = createPartnerAccessService(supabase);
export const adminService = {
  listarSolicitacoes: access.listarSolicitacoesAdmin,
  revisarSolicitacao: access.revisarSolicitacao,
  decidirSolicitacao: access.decidirSolicitacao,
  ativarCampanha: access.ativarCampanha,
};
