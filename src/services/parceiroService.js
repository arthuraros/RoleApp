import { supabase } from './supabase.js';
import { createPartnerAccessService } from './partnerAccessService.js';
import { localEditPayload } from '../utils/partnership.js';

const accessService = createPartnerAccessService(supabase);

export const parceiroService = {
  // Cadastro retorna uma solicitacao pendente; nunca cria local ou concede acesso.
  enviarSolicitacaoParceria: accessService.enviarSolicitacaoParceria,
  cadastrarNovoParceiro: accessService.enviarSolicitacaoParceria,
  listarMinhasSolicitacoes: accessService.listarMinhasSolicitacoes,
  listarMeusLocais: accessService.listarMeusLocais,


  async atualizarCoordenadasLocal(idLocal, latitude, longitude) {
    const numericInput = value => (typeof value === 'number' ||
      (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
    if (![idLocal, latitude, longitude].every(numericInput)) {
      throw new Error('Estabelecimento ou localização inválida.');
    }
    const id = Number(idLocal);
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Estabelecimento inválido.');
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new Error('Localização inválida.');
    }

    const { data, error } = await supabase.rpc(
      'atualizar_localizacao_parceiro',
      {
        p_id_local: id,
        p_latitude: lat,
        p_longitude: lng,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
    if (!row || !numericInput(row.latitude) || !numericInput(row.longitude) ||
        Math.abs(Number(row.latitude)) > 90 || Math.abs(Number(row.longitude)) > 180 ||
        String(row.id_local) !== String(id)) {
      throw new Error('O servidor não confirmou a localização salva. Recarregue o local antes de tentar novamente.');
    }
    return { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) };
  },

  /**
   * Busca os estabelecimentos vinculados ao parceiro
   */
  async getLocaisDoParceiro(idUsuario) {
  if (!idUsuario) {
    return [];
  }

  const { data, error } = await supabase
    .from('locais')
    .select('*')
    .eq('id_proprietario', idUsuario)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
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

    const [horariosResult, eventosResult] = await Promise.all([
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

    if (horariosResult.error) throw new Error(horariosResult.error.message);
    if (eventosResult.error) throw new Error(eventosResult.error.message);
    return {
      ...local,
      horarios: horariosResult.data || [],
      eventos: eventosResult.data || [],
    };
  },

  /**
   * Atualiza dados de um local
   */
  async updateLocal(idLocal, updateData) {
    const { data, error } = await supabase
      .from('locais')
      .update(localEditPayload(updateData))
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

  registrarMetrica: accessService.registrarMetrica,

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

  criarCampanha: accessService.criarCampanha,
  getDestaquesAtivos: accessService.getDestaquesAtivos,
  listarOfertasCampanha: accessService.listarOfertasCampanha,
};
