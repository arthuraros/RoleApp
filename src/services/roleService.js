
import { supabase } from './supabase';

export const roleService = {

  // ==========================================
  // CRIAR ROLÊ COMPLETO
  // ==========================================

  async criarRoleCompleto(userId, nomeRole, etapasData) {
    return this.criarRoleCompletoComEtapas(
      userId,
      nomeRole,
      etapasData
    );
  },

  async criarRoleCompletoComEtapas(userId, nomeRole, etapasData) {
    if (!userId) {
      throw new Error('Usuário não autenticado.');
    }

    if (!nomeRole?.trim()) {
      throw new Error('Dê um nome para o rolê.');
    }

    if (!etapasData || etapasData.length === 0) {
      throw new Error('Adicione pelo menos um local/etapa.');
    }

    let precoFinalTotal = 0;
    const rowsEtapas = [];

    etapasData.forEach(etapaObj => {
      const temItens =
        etapaObj.itens && etapaObj.itens.length > 0;

      if (temItens) {
        etapaObj.itens.forEach(item => {
          const qtd = Number(item.quantidade_item || 1);

          const custoItem =
            Number(item.precoUnitario || 0) * qtd;

          precoFinalTotal += custoItem;

          rowsEtapas.push({
            id_local: etapaObj.id_local,
            etapa: etapaObj.etapa,
            item_cardapio: item.nomeItem,
            quantidade_item: qtd,
            custo_acao: custoItem,
          });
        });
      } else {
        rowsEtapas.push({
          id_local: etapaObj.id_local,
          etapa: etapaObj.etapa,
          item_cardapio: null,
          quantidade_item: null,
          custo_acao: 0,
        });
      }
    });

    // Primeiro cria o rolê.
    const { data: roleCriado, error: roleError } = await supabase
      .from('roles')
      .insert([
        {
          nome_role: nomeRole.trim(),
          id_usuario: userId,
          status: 'planejado',
          preco_final: precoFinalTotal,
        },
      ])
      .select()
      .single();

    if (roleError) throw roleError;

    // Adiciona o ID do rolê em todas as etapas.
    const rowsComIdRole = rowsEtapas.map(row => ({
      ...row,
      id_role: roleCriado.id_role,
    }));

    const { error: etapasError } = await supabase
      .from('roles_etapas')
      .insert(rowsComIdRole);

    if (etapasError) {
      // Se falhar ao salvar as etapas, tenta remover o rolê criado.
      await supabase
        .from('roles')
        .delete()
        .eq('id_role', roleCriado.id_role)
        .eq('id_usuario', userId);

      throw etapasError;
    }

    return roleCriado;
  },

  // ==========================================
  // ATUALIZAR ROLÊ EXISTENTE
  // ==========================================

  async atualizarRoleCompleto(
    idRole,
    userId,
    nomeRole,
    etapasData
  ) {
    if (!idRole || !userId) {
      throw new Error('Dados inválidos para edição.');
    }

    if (!nomeRole?.trim()) {
      throw new Error('Informe o nome do rolê.');
    }

    if (!etapasData || etapasData.length === 0) {
      throw new Error('Adicione pelo menos uma etapa.');
    }

    let precoFinalTotal = 0;
    const rowsEtapas = [];

    // Recalcula os custos e prepara as etapas.
    etapasData.forEach(etapaObj => {
      const temItens =
        etapaObj.itens && etapaObj.itens.length > 0;

      if (temItens) {
        etapaObj.itens.forEach(item => {
          const qtd = Number(item.quantidade_item || 1);

          const custoItem =
            Number(item.precoUnitario || 0) * qtd;

          precoFinalTotal += custoItem;

          rowsEtapas.push({
            id_role: idRole,
            id_local: etapaObj.id_local,
            etapa: etapaObj.etapa,
            item_cardapio: item.nomeItem,
            quantidade_item: qtd,
            custo_acao: custoItem,
          });
        });
      } else {
        rowsEtapas.push({
          id_role: idRole,
          id_local: etapaObj.id_local,
          etapa: etapaObj.etapa,
          item_cardapio: null,
          quantidade_item: null,
          custo_acao: 0,
        });
      }
    });

    // Atualiza o registro principal.
    const { data: roleAtualizado, error: updateError } = await supabase
      .from('roles')
      .update({
        nome_role: nomeRole.trim(),
        preco_final: precoFinalTotal,
      })
      .eq('id_role', idRole)
      .eq('id_usuario', userId)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    if (!roleAtualizado) {
      throw new Error('Rolê não encontrado ou sem permissão para editar.');
    }

    // Remove as etapas antigas.
    const { error: deleteError } = await supabase
      .from('roles_etapas')
      .delete()
      .eq('id_role', idRole);

    if (deleteError) throw deleteError;

    // Insere as etapas atualizadas.
    const { error: insertError } = await supabase
      .from('roles_etapas')
      .insert(rowsEtapas);

    if (insertError) throw insertError;

    return {
      success: true,
      role: roleAtualizado,
    };
  },

  // ==========================================
  // BUSCAR ROLÊS DO USUÁRIO
  // ==========================================

  async getRolesDoUsuario(userId) {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('roles')
      .select(`
        *,
        roles_etapas (
          id_role,
          id_local,
          etapa,
          item_cardapio,
          quantidade_item,
          custo_acao,
          locais (
            id_local,
            nome,
            endereco,
            imagem_url
          )
        )
      `)
      .eq('id_usuario', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(role => ({
      ...role,

      roles_etapas: (role.roles_etapas || []).sort(
        (a, b) => a.etapa - b.etapa
      ),
    }));
  },

  // ==========================================
  // EXCLUIR ROLÊ
  // ==========================================

  async deletarRole(idRole, userId) {
    if (!idRole || !userId) {
      throw new Error('Identificação inválida para exclusão.');
    }

    // Exclui primeiro as etapas.
    const { error: etapasError } = await supabase
      .from('roles_etapas')
      .delete()
      .eq('id_role', idRole);

    if (etapasError) throw etapasError;

    // Depois exclui o rolê.
    const { data, error } = await supabase
      .from('roles')
      .delete()
      .eq('id_role', idRole)
      .eq('id_usuario', userId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error('Rolê não encontrado ou sem permissão para excluir.');
    }

    return {
      success: true,
    };
  },

  // ==========================================
  // ATUALIZAR STATUS E PREÇO
  // ==========================================

  async atualizarStatusEPrecoRole(
    idRole,
    userId,
    novoStatus,
    novoPrecoFinal
  ) {
    if (!idRole || !userId) {
      throw new Error('Dados insuficientes.');
    }

    const { error } = await supabase
      .from('roles')
      .update({
        status: novoStatus,
        preco_final: novoPrecoFinal,
      })
      .eq('id_role', idRole)
      .eq('id_usuario', userId);

    if (error) throw error;

    return {
      success: true,
    };
  },
};
