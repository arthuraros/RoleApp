import { supabase } from './supabase.js';

export const parceiroService = {
  /**
   * Envia uma nova solicitação de parceria
   */
  async enviarSolicitacaoParceria({ idUsuario, nome, email, estabelecimento, cidadeEstado }) {
    const { data, error } = await supabase
      .from('solicitacoes_parceria')
      .insert([
        {
          id_usuario: idUsuario || null,
          nome,
          email,
          estabelecimento,
          cidade_estado: cidadeEstado,
          status: 'pendente',
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Busca os estabelecimentos vinculados ao parceiro
   */
  async getLocaisDoParceiro(idUsuario) {
    if (!idUsuario) {
      // Fallback para exibir locais existentes caso não esteja autenticado
      const { data, error } = await supabase
        .from('locais')
        .select('*')
        .order('id_local', { ascending: true })
        .limit(5);

      if (error) throw new Error(error.message);
      return data || [];
    }

    // Busca locais associados ao id_proprietario
    const { data: parceiroLocais, error: pError } = await supabase
      .from('locais')
      .select('*')
      .eq('id_proprietario', idUsuario)
      .order('created_at', { ascending: false });

    if (pError) throw new Error(pError.message);

    // Se o usuário ainda não tiver locais associados com id_proprietario,
    // retorna os primeiros locais da base como fallback para edição
    if (!parceiroLocais || parceiroLocais.length === 0) {
      const { data: allLocais, error: allErr } = await supabase
        .from('locais')
        .select('*')
        .order('id_local', { ascending: true })
        .limit(5);

      if (allErr) throw new Error(allErr.message);
      return allLocais || [];
    }

    return parceiroLocais;
  },

  /**
   * Busca detalhes completos do local (incluindo horários e eventos)
   */
  async getLocalComDetalhes(idLocal) {
    if (!idLocal) return null;

    const { data: local, error: lError } = await supabase
      .from('locais')
      .select('*')
      .eq('id_local', idLocal)
      .single();

    if (lError) throw new Error(lError.message);

    const [{ data: horarios }, { data: eventos }] = await Promise.all([
      supabase
        .from('horarios_funcionamento')
        .select('*')
        .eq('id_local', idLocal)
        .order('dia_semana', { ascending: true }),
      supabase
        .from('eventos_locais')
        .select('*')
        .eq('id_local', idLocal)
        .order('created_at', { ascending: false }),
    ]);

    return {
      ...local,
      horarios: horarios || [],
      eventos: eventos || [],
    };
  },

  /**
   * Atualiza dados de um local
   */
  async updateLocal(idLocal, updateData) {
    const { data, error } = await supabase
      .from('locais')
      .update(updateData)
      .eq('id_local', idLocal)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(
        'Nenhum registro foi atualizado. Verifique se as permissões de UPDATE na tabela "locais" foram criadas no Supabase.'
      );
    }
    return data[0];
  },

  /**
   * Salva os horários de funcionamento do local
   */
  async salvarHorarios(idLocal, horariosArray) {
    if (!idLocal || !horariosArray?.length) return;

    // Remove horários existentes deste local
    const { error: delError } = await supabase
      .from('horarios_funcionamento')
      .delete()
      .eq('id_local', idLocal);

    if (delError) {
      throw new Error(`Erro de RLS nos horários (DELETE): ${delError.message}`);
    }

    // Insere os horários atualizados
    const toInsert = horariosArray.map((h, idx) => ({
      id_local: idLocal,
      dia_semana: h.dia_semana !== undefined ? h.dia_semana : idx,
      abre: h.active && h.open ? h.open : null,
      fecha: h.active && h.close ? h.close : null,
      fechado: !h.active,
    }));

    const { data, error: insError } = await supabase
      .from('horarios_funcionamento')
      .insert(toInsert)
      .select();

    if (insError) {
      throw new Error(`Erro de RLS nos horários (INSERT): ${insError.message}`);
    }
    return data;
  },

  /**
   * Busca eventos do local
   */
  async getEventos(idLocal) {
    if (!idLocal) return [];
    const { data, error } = await supabase
      .from('eventos_locais')
      .select('*')
      .eq('id_local', idLocal)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Cadastra novo evento
   */
  async criarEvento({ idLocal, titulo, dias, hora, detalhes }) {
    const { data, error } = await supabase
      .from('eventos_locais')
      .insert([
        {
          id_local: idLocal,
          titulo,
          dias,
          hora,
          detalhes,
          ativo: true,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Exclui um evento
   */
  async removerEvento(idEvento) {
    const { error } = await supabase
      .from('eventos_locais')
      .delete()
      .eq('id_evento', idEvento);

    if (error) throw new Error(error.message);
    return true;
  },

  /**
   * Busca métricas agregadas do local
   */
  async getMetricasDoLocal(idLocal) {
    if (!idLocal) return null;

    const { data, error } = await supabase
      .from('metricas_locais')
      .select('*')
      .eq('id_local', idLocal)
      .order('data', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Registra métricas diárias
   */
  async registrarMetrica({ idLocal, data = new Date().toISOString().split('T')[0], views = 1, cliques = 0, visitas = 0 }) {
    const { data: res, error } = await supabase
      .from('metricas_locais')
      .upsert(
        [
          {
            id_local: idLocal,
            data,
            views,
            cliques,
            visitas,
          },
        ],
        { onConflict: 'id_local,data' }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res;
  },

  /**
   * Busca campanhas do parceiro / local
   */
  async getCampanhas(idLocal) {
    let query = supabase
      .from('campanhas_impulsionamento')
      .select('*')
      .order('created_at', { ascending: false });

    if (idLocal) {
      query = query.eq('id_local', idLocal);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Cria uma nova campanha de impulsionamento
   */
  async criarCampanha({
    idLocal,
    idUsuario,
    tipo,
    titulo,
    mensagem,
    interesses,
    faixaEtaria,
    raioKm = 5,
    duracaoDias = 7,
    valorTotal,
  }) {
    const dataInicio = new Date();
    const dataFim = new Date();
    dataFim.setDate(dataFim.getDate() + duracaoDias);

    const { data, error } = await supabase
      .from('campanhas_impulsionamento')
      .insert([
        {
          id_local: idLocal,
          id_usuario: idUsuario,
          tipo,
          titulo: tipo === 'destaque' ? titulo : null,
          mensagem: tipo === 'destaque' ? mensagem : null,
          interesses: interesses || [],
          faixa_etaria: faixaEtaria || 'Todos',
          raio_km: raioKm,
          duracao_dias: duracaoDias,
          valor_total: valorTotal,
          status: 'ativa',
          alcance: 0,
          data_inicio: dataInicio.toISOString(),
          data_fim: dataFim.toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
};

