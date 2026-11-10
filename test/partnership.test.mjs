import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPermissions, normalizeRole } from '../src/utils/permissions.js';
import { localEditPayload, validateDecision, REQUEST_STATUS } from '../src/utils/partnership.js';

for (const role of [null, 'usuario', 'pendente', 'em_analise']) {
  test(`solicitação/perfil ${role} não concede gestão`, () => {
    const access = getPermissions(normalizeRole(role));
    assert.equal(access.canAccessPartnerPanel, false); assert.equal(access.canAccessAdminPanel, false);
  });
}
test('perfis parceiro e admin têm interfaces distintas', () => {
  assert.equal(getPermissions('parceiro').canAccessPartnerPanel, true);
  assert.equal(getPermissions('parceiro').canAccessAdminPanel, false);
  assert.equal(getPermissions('admin').canAccessAdminPanel, true);
});
test('estados correspondem ao banco informado', () => {
  assert.deepEqual(Object.values(REQUEST_STATUS), ['pendente', 'em_analise', 'aprovado', 'rejeitado']);
});
for (const campo of ['id_proprietario', 'id_local', 'papel', 'plano']) {
  test(`edição de local rejeita ${campo}`, () => assert.throws(() => localEditPayload({ [campo]: 'forjado' })));
}
test('edição legítima conserva campos da tela existente', () => {
  const input = { nome: 'Local', visivel: false, endereco: 'Rua A' };
  assert.deepEqual(localEditPayload(input), input);
});
test('não existe aprovação automática a partir de local nulo', () => {
  assert.throws(() => validateDecision({ reviewId: 'r', decisao: 'aprovado', motivo: 'Teste',
    identidadeValidada: true, duplicidadeRevisada: true, idLocalExistente: null }));
});
