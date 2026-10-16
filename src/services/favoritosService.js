
import { supabase } from './supabase.js';

export const favoritosService = {
  async getFavoritos(idUsuario) {
    const { data, error } = await supabase
      .from('favoritos')
      .select('id_favorito, id_local')
      .eq('id_usuario', idUsuario);

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getLocaisFavoritos(idUsuario) {
    const { data, error } = await supabase
      .from('favoritos')
      .select('id_favorito, id_local, locais(*)')
      .eq('id_usuario', idUsuario);

    if (error) throw new Error(error.message);

    return (data ?? [])
      .filter((favorito) => favorito.locais)
      .map((favorito) => ({
        ...favorito.locais,
        id_favorito: favorito.id_favorito,
      }));
  },

  async adicionarFavorito(idUsuario, idLocal) {
    const { data, error } = await supabase
      .from('favoritos')
      .insert({
        id_usuario: idUsuario,
        id_local: idLocal,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async removerFavorito(idUsuario, idLocal) {
    const { error } = await supabase
      .from('favoritos')
      .delete()
      .eq('id_usuario', idUsuario)
      .eq('id_local', idLocal);

    if (error) throw new Error(error.message);
    return true;
  },
};