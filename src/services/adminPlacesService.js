// Ativar somente depois da aprovação, instalação e teste do contrato v1.
// Esta chave controla disponibilidade; a autorização pertence à RPC.
export function createAdminPlacesService(client, { contractApproved = false } = {}) {
  async function read({ search = '', visibility = null, cursor = null, id = null } = {}) {
    if (!contractApproved) {
      throw new Error('Consulta administrativa bloqueada: contrato do banco aguarda aprovação.');
    }
    const query = String(search).trim();
    if (query.length > 120 || ![null, true, false].includes(visibility) ||
        (cursor !== null && (typeof cursor !== 'string' || cursor.length > 200)) ||
        (id !== null && (!String(id).trim() || String(id).length > 200))) {
      throw new Error('Parâmetros de consulta inválidos.');
    }
    const { data, error } = await client.rpc('roleapp_admin_places_read_v1', {
      p_search: query, p_visible: visibility, p_after: cursor, p_limit: 20,
      p_id: id === null ? null : String(id),
    });
    if (error) throw new Error('Não foi possível consultar locais. Verifique acesso e conexão.');
    if (!data || !Array.isArray(data.items) ||
        (data.next_cursor !== null && typeof data.next_cursor !== 'string') ||
        data.items.length > 20 || data.items.some(item => !item ||
          typeof item.id_local !== 'string' || typeof item.nome !== 'string' ||
          ![null, true, false].includes(item.visivel))) {
      throw new Error('Resposta administrativa incompatível. Nenhum resultado foi exibido.');
    }
    return data;
  }
  return {
    available: contractApproved,
    list: read,
    async detail(id) {
      if (id === null || id === undefined || !String(id).trim()) throw new Error('ID inválido.');
      const page = await read({ id });
      return page.items[0] || null;
    },
  };
}
