import { normalizeRole, getPermissions } from '../utils/permissions.js';

// Cliente injetado permite testes sem inicializar Auth, Storage ou rede.
// Nenhuma operação deste serviço cria ou promove usuários.
export function createProfileService(client) {
  return {
    async getEditableProfile() {
      const { data, error } = await client.auth.getUser();
      const id = data?.user?.id;
      if (error || !id) throw new Error('Entre na sua conta para continuar.');
      const result = await client.from('usuarios').select('id_usuario, nome, foto_url, saldo')
        .eq('id_usuario', id).maybeSingle();
      if (result.error || (result.data && result.data.id_usuario !== id)) {
        throw new Error('Não foi possível carregar seu perfil.');
      }
      return result.data;
    },

    async updateName(nome) {
      if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 120) {
        throw new Error('Informe um nome com até 120 caracteres.');
      }
      const { data, error } = await client.auth.getUser();
      const id = data?.user?.id;
      if (error || !id) throw new Error('Entre na sua conta para continuar.');
      const result = await client.from('usuarios').update({ nome: nome.trim() })
        .eq('id_usuario', id).select('id_usuario, nome').single();
      if (result.error || result.data?.id_usuario !== id) {
        throw new Error('Não foi possível salvar seu nome. Tente novamente.');
      }
      return result.data;
    },

    async getMyReviews() {
      const { data, error } = await client.auth.getUser();
      const id = data?.user?.id;
      if (error || !id) throw new Error('Entre na sua conta para continuar.');
      const result = await client.from('avaliacoes_locais')
        .select('id_avaliacao, id_usuario, id_local, nota, comentario')
        .eq('id_usuario', id).order('id_avaliacao', { ascending: false });
      if (result.error || result.data?.some(row => row.id_usuario !== id)) {
        throw new Error('Não foi possível carregar suas avaliações.');
      }
      return result.data || [];
    },

    async getCurrentProfile() {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw new Error('Não foi possível validar o usuário autenticado.');
      const userId = authData?.user?.id;
      if (!userId) return null;

      const [profileResult, roleResult] = await Promise.all([
        // Adicionado 'saldo' na consulta
        client.from('usuarios').select('id_usuario, foto_url, saldo')
          .eq('id_usuario', userId).maybeSingle(),
        client.from('user_roles').select('user_id, role')
          .eq('user_id', userId).maybeSingle(),
      ]);

      if (profileResult.error || roleResult.error) {
        throw new Error('Perfil ou permissões indisponíveis. Verifique o esquema e as políticas de acesso.');
      }
      if ((profileResult.data && profileResult.data.id_usuario !== userId) ||
          (roleResult.data && roleResult.data.user_id !== userId)) {
        throw new Error('Resposta de perfil incompatível com o usuário autenticado.');
      }

      const role = normalizeRole(roleResult.data?.role);
      return {
        id_usuario: userId,
        foto_url: profileResult.data?.foto_url ?? null,
        saldo: profileResult.data?.saldo ?? 0, // Retorna o saldo atual ou 0
        role,
        permissions: getPermissions(role),
      };
    },

    // Nova função para atualizar o saldo no banco de dados
    async atualizarSaldo(userId, novoSaldo) {
      const { error } = await client
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id_usuario', userId);

      if (error) {
        throw new Error('Não foi possível atualizar o saldo.');
      }
      return novoSaldo;
    }
  };
}
