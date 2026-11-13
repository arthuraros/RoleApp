import { normalizeRole, getPermissions } from '../utils/permissions.js';

// Cliente injetado permite testes sem inicializar Auth, Storage ou rede.
// Nenhuma operação deste serviço cria ou promove usuários.
export function createProfileService(client) {
  return {
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
