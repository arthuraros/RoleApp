import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminPlacesMutationsService } from '../src/services/adminPlacesMutationsService.js';
const key = 'b1a2f902-0010-4000-8000-000000000001';
const input = { id: '12', expectedVersion: '7', fields: { nome: ' Café ' },
  reason: 'Suporte solicitado pelo parceiro', idempotencyKey: key };
function fixture(contracts, response = { data: { id_local: '12', version: '8', audit_id: '90' } }) {
  const calls = [];
  return { calls, service: createAdminPlacesMutationsService({ async rpc(name, args) {
    calls.push([name, args]); return response;
  }, from() { throw Error('Direct access forbidden'); } }, { contracts }) };
}
test('locais escrita: todos os contratos bloqueados por padrão, inclusive chamada direta', async () => {
  const f = fixture({});
  for (const operation of ['update', 'setVisibility', 'editDetail']) await assert.rejects(f.service[operation](input), /bloqueada/);
  assert.equal(f.calls.length, 0);
});
test('locais escrita: liberação de uma operação não libera as demais', async () => {
  const contracts = { update: true };
  const f = fixture(contracts); contracts.visibility = true;
  await f.service.update(input);
  await assert.rejects(f.service.setVisibility({ ...input, visible: true }), /bloqueada/);
  assert.equal(f.calls.length, 1);
});
test('locais escrita: RPC existente proposta recebe somente campos, versão, motivo e chave', async () => {
  const f = fixture({ update: true });
  await f.service.update({ ...input, actor: 'forged', role: 'admin', owner: 'forged' });
  assert.deepEqual(f.calls, [['roleapp_admin_place_mutate_v2', {
    p_action: 'editar', p_id: '12', p_expected_version: '7', p_patch: { nome: 'Café' },
    p_reason: input.reason, p_idempotency_key: key,
  }]]);
});
test('locais escrita: visibilidade não se transforma em bloqueio administrativo', async () => {
  const f = fixture({ visibility: true });
  await f.service.setVisibility({ ...input, visible: false, blocked: true });
  assert.deepEqual(f.calls[0][1].p_patch, { visivel: false });
  assert.equal(f.calls[0][1].p_action, 'visibilidade');
});
test('locais escrita: proprietário, preço, versão e campos desconhecidos rejeitados antes da rede', async () => {
  const f = fixture({ update: true });
  for (const fields of [{ id_proprietario: key }, { preco: 5 }, { admin_version: 8 }, { visivel: false },
    { nome: null }, { nome: '' }, { faixa_preco: 'free' }, {}, { telefone: 123 }]) {
    await assert.rejects(f.service.update({ ...input, fields }));
  }
  assert.equal(f.calls.length, 0);
});
test('locais escrita: bigint é serializado sem arredondamento e IDs numéricos inseguros são negados', async () => {
  const f = fixture({ update: true }, { data: { id_local: '9007199254740993', version: '9007199254740994', audit_id: '91' } });
  await f.service.update({ ...input, id: '9007199254740993', expectedVersion: '9007199254740993' });
  assert.equal(f.calls[0][1].p_id, '9007199254740993');
  for (const id of [9007199254740993, '9223372036854775808', '0', '1;delete', null]) {
    await assert.rejects(f.service.update({ ...input, id }));
  }
  assert.equal(f.calls.length, 1);
});
test('locais escrita: erro, RPC ausente e recibo inconsistente nunca confirmam gravação', async () => {
  for (const response of [{ error: { code: '42501', message: 'secret' } }, { error: { code: 'PGRST202' } },
    { error: { code: '40001' } }, { data: { id_local: '99', version: '8', audit_id: '90' } },
    { data: { id_local: '12', version: '7', audit_id: '90' } }, { data: { id_local: '12', version: '8' } }]) {
    const f = fixture({ update: true }, response);
    await assert.rejects(f.service.update(input), error => !error.message.includes('secret'));
    assert.equal(f.calls.length, 1);
  }
});
test('locais escrita: tentativa repetida preserva a mesma chave, sem retry automático', async () => {
  const f = fixture({ update: true });
  await f.service.update(input); await f.service.update(input);
  assert.deepEqual(f.calls[0], f.calls[1]);
});
test('locais escrita: detalhe exige contrato próprio e confirma identidade e versão do alvo', async () => {
  const row = { id_local: '12', version: '7', nome: 'Café', endereco: 'Rua', visivel: false, id_proprietario: null };
  const f = fixture({ editDetail: true }, { data: row });
  assert.equal((await f.service.editDetail('12')).version, '7');
  await assert.rejects(f.service.editDetail('13'), /incompatível/);
  const empty = fixture({ editDetail: true }, { data: null });
  assert.equal(await empty.service.editDetail('12'), null);
});
