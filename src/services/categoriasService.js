import { supabase } from './supabase.js';

export const categoriasService = {
  /**
   * Busca todas as categorias cadastradas na tabela 'categorias'
   */
  async getCategorias() {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('nome', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Busca os IDs dos locais pertencentes a um conjunto de IDs de categorias selecionadas
   */
  async getLocaisIdsPorCategorias(categoriasIds) {
    if (!categoriasIds || categoriasIds.length === 0) return [];

    const { data, error } = await supabase
      .from('local_categorias')
      .select('id_local')
      .in('id_categoria', categoriasIds);

    if (error) throw new Error(error.message);
    
    // Retorna um array único com os IDs dos locais correspondentes
    return [...new Set(data.map(item => item.id_local))];
  }
};