import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../src/services/profileService.js';
import { getPermissions } from '../src/utils/permissions.js';

test('edicao pessoal usa identidade autenticada e altera somente nome', async () => {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'real', user_metadata: { role: 'admin' } } } }) },
    from(table) {
      assert.equal(table, 'usuarios');
      return { update(payload) {
        calls.push(payload);
        return { eq(key, id) {
          assert.equal(key, 'id_usuario'); assert.equal(id, 'real');
          return { select(columns) {
            assert.equal(columns, 'id_usuario, nome');
            return { single: async () => ({ data: { id_usuario: 'real', ...payload } }) };
          } };
        } };
      } };
    },
  };
  const service = createProfileService(client);
  assert.deepEqual(await service.updateName(' Maria '), { id_usuario: 'real', nome: 'Maria' });
  assert.deepEqual(calls, [{ nome: 'Maria' }]);
  for (const name of [null, '', ' ', { nome: 'A', role: 'admin' }, 'A'.repeat(121)]) {
    await assert.rejects(service.updateName(name), /nome/);
  }
  assert.equal(calls.length, 1);
});

test('edicao pessoal sem autenticacao nao consulta nem escreve', async () => {
  const service = createProfileService({ auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => assert.fail('Consulta indevida') });
  await assert.rejects(service.updateName('Maria'), /Entre/);
  await assert.rejects(service.getEditableProfile(), /Entre/);
  await assert.rejects(service.getMyReviews(), /Entre/);
});

test('leitura de nome e avaliacoes filtra conta atual e rejeita dados de terceiros', async () => {
  let wrongAccount = false;
  const service = createProfileService({
    auth: { getUser: async () => ({ data: { user: { id: 'real' } } }) },
    from(table) { return { select(columns) {
      assert.equal(columns, table === 'usuarios' ? 'id_usuario, nome, foto_url' : 'id_avaliacao, id_usuario, id_local, nota, comentario');
      return { eq(key, id) {
        assert.equal(key, 'id_usuario'); assert.equal(id, 'real');
        const row = { id_usuario: wrongAccount ? 'outra' : 'real', nome: 'Ana' };
        return { maybeSingle: async () => ({ data: row }), order: async () => ({ data: [row] }) };
      } };
    } }; },
  });
  assert.equal((await service.getEditableProfile()).nome, 'Ana');
  assert.equal((await service.getMyReviews()).length, 1);
  wrongAccount = true;
  await assert.rejects(service.getEditableProfile(), /carregar/);
  await assert.rejects(service.getMyReviews(), /carregar/);
});

test('UPDATE bloqueado ou sem linha confirmada nao informa sucesso', async () => {
  for (const result of [{ data: null }, { error: { message: 'segredo' } }, { data: { id_usuario: 'outra' } }]) {
    const service = createProfileService({ auth: { getUser: async () => ({ data: { user: { id: 'real' } } }) },
      from: () => ({ update: () => ({ eq: () => ({ select: () => ({ single: async () => result }) }) }) }) });
    await assert.rejects(service.updateName('Maria'), { message: 'Não foi possível salvar seu nome. Tente novamente.' });
  }
});

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
          assert.equal(columns, table === 'usuarios' ? 'id_usuario, foto_url' : 'user_id, role');
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
