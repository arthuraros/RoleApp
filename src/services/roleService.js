import { supabase } from './supabase';

export const roleService = {
  /**
   * Cria 1 row em 'roles' e N rows em 'roles_etapas' (1 row por ação/item consumido na etapa).
   */
  async criarRoleCompleto(userId, nomeRole, etapasData) {
    if (!userId) throw new Error('Usuário não autenticado.');
    if (!nomeRole?.trim() || !etapasData || etapasData.length === 0) {
      throw new Error('Informe o nome do rolê e adicione pelo menos um local.');
    }

    // Validação: cada número de etapa só pode estar associado a um único id_local
    const mapaEtapaLocal = new Map();
    for (const etapaObj of etapasData) {
      if (mapaEtapaLocal.has(etapaObj.etapa)) {
        if (mapaEtapaLocal.get(etapaObj.etapa) !== etapaObj.id_local) {
          throw new Error(`A etapa ${etapaObj.etapa} não pode ter mais de um local diferente.`);
        }
      } else {
        mapaEtapaLocal.set(etapaObj.etapa, etapaObj.id_local);
      }
    }

    // Monta as múltiplas rows de roles_etapas e soma o custo total
    let precoFinalTotal = 0;
    const rowsEtapas = [];

    etapasData.forEach((etapaObj) => {
      const temItens = etapaObj.itens && etapaObj.itens.length > 0;

      if (temItens) {
        // Cria 1 row na roles_etapas para CADA item/ação naquela etapa e local
        etapaObj.itens.forEach((item) => {
          const custoItem = Number(item.precoUnitario || 0) * Number(item.quantidade_item || 1);
          precoFinalTotal += custoItem;

          rowsEtapas.push({
            id_local: etapaObj.id_local,
            etapa: etapaObj.etapa,
            item_cardapio: item.nomeItem,
            quantidade_item: item.quantidade_item,
            custo_acao: custoItem,
          });
        });
      } else {
        // Cria 1 row na roles_etapas apenas representando a visita ao local (sem consumo)
        rowsEtapas.push({
          id_local: etapaObj.id_local,
          etapa: etapaObj.etapa,
          item_cardapio: null,
          quantidade_item: null,
          custo_acao: 0,
        });
      }
    });

    // 1. Insere ÚNICA row na tabela 'roles'
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

    // 2. Vincula o id_role gerado a todas as rows de etapas e insere em lote
    const rowsComIdRole = rowsEtapas.map((row) => ({
      ...row,
      id_role: roleCriado.id_role,
    }));

    const { error: etapasError } = await supabase
      .from('roles_etapas')
      .insert(rowsComIdRole);

    if (etapasError) {
      // Rollback manual caso falhe ao inserir as etapas, evitando rolê órfão
      await supabase.from('roles').delete().eq('id_role', roleCriado.id_role);
      throw etapasError;
    }

    return roleCriado;
  },

  /**
   * Atualiza a row única em 'roles' e substitui as rows em 'roles_etapas'.
   */
  async atualizarRoleCompleto(idRole, userId, nomeRole, etapasData) {
    if (!idRole || !userId) throw new Error('Dados inválidos para edição.');

    let precoFinalTotal = 0;
    const rowsEtapas = [];

    etapasData.forEach((etapaObj) => {
      const temItens = etapaObj.itens && etapaObj.itens.length > 0;

      if (temItens) {
        etapaObj.itens.forEach((item) => {
          const custoItem = Number(item.precoUnitario || 0) * Number(item.quantidade_item || 1);
          precoFinalTotal += custoItem;

          rowsEtapas.push({
            id_role: idRole,
            id_local: etapaObj.id_local,
            etapa: etapaObj.etapa,
            item_cardapio: item.nomeItem,
            quantidade_item: item.quantidade_item,
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

    // 1. Atualiza a row única na tabela 'roles'
    const { error: updateError } = await supabase
      .from('roles')
      .update({
        nome_role: nomeRole.trim(),
        preco_final: precoFinalTotal,
      })
      .eq('id_role', idRole)
      .eq('id_usuario', userId);

    if (updateError) throw updateError;

    // 2. Deleta as rows antigas deste rolê em 'roles_etapas'
    const { error: deleteError } = await supabase
      .from('roles_etapas')
      .delete()
      .eq('id_role', idRole);

    if (deleteError) throw deleteError;

    // 3. Insere as novas rows atualizadas
    const { error: insertError } = await supabase
      .from('roles_etapas')
      .insert(rowsEtapas);

    if (insertError) throw insertError;

    return { success: true };
  },

  /**
   * Busca os rolês do usuário com suas etapas ordenadas.
   */
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
          locais (id_local, nome, endereco, imagem_url)
        )
      `)
      .eq('id_usuario', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Ordena as etapas de cada rolê em ordem crescente (1, 2, 3...)
    return (data || []).map((role) => ({
      ...role,
      roles_etapas: (role.roles_etapas || []).sort((a, b) => a.etapa - b.etapa),
    }));
  },

  // Adicione esta função dentro do objeto roleService:
  async deletarRole(idRole, userId) {
    if (!idRole || !userId) throw new Error('Identificação inválida para exclusão.');

    // Como as chaves estrangeiras podem estar com CASCADE ou dependem da ordem, 
    // deletar as etapas primeiro (ou deixar o banco gerenciar via CASCADE) garante a limpeza:
    await supabase.from('roles_etapas').delete().eq('id_role', idRole);

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id_role', idRole)
      .eq('id_usuario', userId);

    if (error) throw error;
    return { success: true };
  },

  async atualizarStatusEPrecoRole(idRole, userId, novoStatus, novoPrecoFinal) {
    if (!idRole || !userId) throw new Error('Dados insuficientes.');

    const { error } = await supabase
      .from('roles')
      .update({
        status: novoStatus,
        preco_final: novoPrecoFinal
      })
      .eq('id_role', idRole)
      .eq('id_usuario', userId);

    if (error) throw error;
    return { success: true };
  },
};