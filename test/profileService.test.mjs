import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../src/services/profileService.js';
import { getPermissions } from '../src/utils/permissions.js';

function mockClient({ role = 'usuario', id = 'user-a', error = null, authError = null,
  returnedId = id, metadata = {} } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({
      data: { user: id ? { id, user_metadata: metadata } : null }, error: authError,
    }) },
    from(table) {
      calls.push(table);
      return { select(columns) {
        return { eq(column, value) {
          assert.equal(value, id);
          assert.equal(column, table === 'usuarios' ? 'id_usuario' : 'user_id');
          assert.equal(columns, table === 'usuarios' ? 'id_usuario, foto_url, saldo' : 'user_id, role');
          return { maybeSingle: async () => ({ error, data: table === 'usuarios'
            ? { id_usuario: returnedId, foto_url: 'avatar.png' }
            : role === null ? null : { user_id: returnedId, role },
          }) };
        } };
      } };
    },
  };
}

for (const role of ['usuario', 'parceiro', 'admin']) {
  test(`consulta o próprio perfil e respeita o papel ${role}`, async () => {
    const profile = await createProfileService(mockClient({ role })).getCurrentProfile();
    assert.equal(profile.role, role);
    assert.equal(profile.permissions.canAccessAdminPanel, role === 'admin');
    assert.equal(profile.permissions.canAccessPartnerPanel, role === 'parceiro');
  });
}

for (const role of [null, 'superadmin', 'ADMIN', undefined]) {
  test(`papel ausente/desconhecido não concede privilégios: ${role}`, () => {
    assert.deepEqual(getPermissions(role), {
      isPartner: false, isAdmin: false,
      canAccessPartnerPanel: false, canAccessAdminPanel: false,
    });
  });
}

test('não usa metadados para promover usuário sem papel', async () => {
  const profile = await createProfileService(mockClient({
    role: null, metadata: { role: 'admin', is_admin: true },
  })).getCurrentProfile();
  assert.equal(profile.role, null);
  assert.equal(profile.permissions.isAdmin, false);
});

test('papel inválido retornado pelo banco é normalizado para null', async () => {
  const profile = await createProfileService(mockClient({ role: 'superadmin' })).getCurrentProfile();
  assert.equal(profile.role, null);
  assert.equal(profile.permissions.isAdmin, false);
});

test('sem identidade não consulta tabelas', async () => {
  const client = mockClient({ id: null });
  assert.equal(await createProfileService(client).getCurrentProfile(), null);
  assert.deepEqual(client.calls, []);
});

test('falha de autenticação impede consulta e não vaza erro sensível', async () => {
  const client = mockClient({ authError: new Error('access_token=segredo') });
  await assert.rejects(createProfileService(client).getCurrentProfile(),
    { message: 'Não foi possível validar o usuário autenticado.' });
  assert.deepEqual(client.calls, []);
});

test('tabela ausente ou RLS indisponível falha sem conceder papel', async () => {
  await assert.rejects(createProfileService(mockClient({
    error: { message: 'refresh_token=segredo' },
  })).getCurrentProfile(), { message: 'Perfil ou permissões indisponíveis. Verifique o esquema e as políticas de acesso.' });
});

test('rejeita resposta vinculada a outra conta', async () => {
  await assert.rejects(createProfileService(mockClient({
    returnedId: 'user-b', role: 'admin',
  })).getCurrentProfile(), { message: 'Resposta de perfil incompatível com o usuário autenticado.' });
});
