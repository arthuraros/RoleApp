import { supabase } from './supabase.js';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer'; // Se necessário ou usando o FileReader nativo

/**
 * Faz o upload da foto de perfil para o Supabase Storage
 * convertendo o arquivo para ArrayBuffer correto no React Native.
 */
export async function uploadUserAvatar(userId, imageUri) {
  if (!userId) {
    throw new Error('ID do usuário não fornecido.');
  }

  // 1. Identifica a extensão e o MIME type correto
  const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpeg';
  const mimeType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
  const filePath = `${userId}/avatar.${fileExt}`;

  // 2. Lê a imagem local como Base64 usando o FileSystem do Expo
  const base64Data = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 3. Converte Base64 para ArrayBuffer binário (compatível com Supabase Storage)
  const arrayBuffer = decode(base64Data);

  // 4. Faz o upload dos dados binários para o Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, arrayBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Erro ao enviar foto para o Storage: ${uploadError.message}`);
  }

  // 5. Obtém a URL pública do arquivo
  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl;

  // 6. Atualiza a coluna foto_url na tabela usuarios
  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ foto_url: publicUrl })
    .eq('id_usuario', userId);

  if (updateError) {
    throw new Error(`Erro ao atualizar perfil no banco: ${updateError.message}`);
  }

  return publicUrl;
}

/**
 * Retorna a quantidade de avaliações que uma pessoa já fez.
 * 
 * @param {string|number} userId - ID do usuário
 * @returns {Promise<number>} Quantidade de avaliações
 */
export async function getContagemAvaliacoesUsuario(userId) {
  if (!userId) {
    throw new Error('ID do usuário não fornecido.');
  }

  // Usamos { count: 'exact', head: true } para buscar apenas a contagem de forma otimizada,
  // sem precisar trafegar os dados das avaliações pela rede.
  const { count, error } = await supabase
    .from('avaliacoes_locais') // Substitua 'avaliacoes' pelo nome exato da sua tabela no banco se for diferente
    .select('*', { count: 'exact', head: true })
    .eq('id_usuario', userId); // Substitua 'id_usuario' pela coluna estrangeira da sua tabela de avaliações

  if (error) {
    throw new Error(`Erro ao buscar a quantidade de avaliações: ${error.message}`);
  }

  return count || 0;
}