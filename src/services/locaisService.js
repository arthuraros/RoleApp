import { supabase } from './supabase.js';

export const locaisService = {
  /**
   * Buscar todos os locais
   */
  async getLocais() {
    const { data, error } = await supabase
      .from('locais')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Buscar um local específico por ID
   */
  async getLocalById(idLocal) {
    const { data, error } = await supabase
      .from('locais')
      .select('*')
      .eq('id_local', idLocal)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Pesquisar locais por nome ou endereço
   */
  async searchLocais(searchTerm) {
    const { data, error } = await supabase
      .from('locais')
      .select('*')
      .or(`nome.ilike.%${searchTerm}%,endereco.ilike.%${searchTerm}%`);

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Cadastrar um novo local
   * @param {Object} local - Ex: { nome, descricao, endereco, preco, latitude, longitude, preco_entrada }
   */
  async createLocal(localData) {
    const { data, error } = await supabase
      .from('locais')
      .insert([localData])
      .select();

    if (error) throw new Error(error.message);
    return data[0];
  },

  /**
   * Atualizar dados de um local
   */
  async updateLocal(idLocal, updateData) {
    const { data, error } = await supabase
      .from('locais')
      .update(updateData)
      .eq('id_local', idLocal)
      .select();

    if (error) throw new Error(error.message);
    return data[0];
  },

  /**
   * Deletar um local
   */
  async deleteLocal(idLocal) {
    const { error } = await supabase
      .from('locais')
      .delete()
      .eq('id_local', idLocal);

    if (error) throw new Error(error.message);
    return true;
  },
};