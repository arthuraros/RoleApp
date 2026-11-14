import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminCampaignsService } from '../src/services/adminCampaignsService.js';
import { createAdminAccessManagementService } from '../src/services/adminAccessManagementService.js';
import { adminService } from '../src/services/adminService.js';
import { supabase } from '../src/services/supabase.js';
const uuid = 'b1a2f902-0010-4000-8000-000000000001';
const input = { id: '12', userId: uuid, expectedVersion: '7', localId: '30', ownerId: uuid,
  fields: { tipo: 'destaque', duracao_dias: 7, titulo: 'Campanha' },
  capabilities: ['locais.ler'], reason: 'Suporte solicitado pelo parceiro', idempotencyKey: uuid };
function fixture(factory, contracts = {}, data = { id_campanha: '12', version: '8', audit_id: '1' }) {
  const calls = [];
  const service = factory({ async rpc(name, args) { calls.push([name, args]); return { data }; },
    from() { assert.fail('Direct table access'); } }, { contracts });
  return { service, calls };
}
test('integração: serviço exportado mantém todas as novas operações indisponíveis', async () => {
  let calls = 0;
  supabase.rpc = async () => { calls++; assert.fail('Backend not validated'); };
  supabase.from = () => { calls++; assert.fail('Direct table access'); };
  for (const [module, operations] of [
    ['locais', ['editDetail', 'update', 'setVisibility']],
    ['campanhas', ['list', 'detail', 'create', 'update', 'approve', 'activate', 'pause', 'end']],
    ['administradores', ['list', 'detail', 'grant', 'suspend', 'revoke']],
  ]) {
    for (const operation of operations) {
      await assert.rejects(adminService[module][operation](input), { code: 'ADMIN_CONTRACT_BLOCKED' });
    }
  }
  assert.equal(calls, 0);
});
test('campanhas: todas as operações bloqueadas por padrão sem acessar a rede', async () => {
  const f = fixture(createAdminCampaignsService);
  assert.equal(f.service.available, false);
  for (const op of ['list', 'detail', 'create', 'update', 'approve', 'activate', 'pause', 'end']) {
    await assert.rejects(f.service[op](input), { code: 'ADMIN_CONTRACT_BLOCKED' });
  }
  assert.deepEqual(f.calls, []);
});
test('campanhas: cadastro vincula local e proprietário sem preço, status ou ator fornecidos pelo cliente', async () => {
  const f = fixture(createAdminCampaignsService, { create: true }, { id_campanha: '12', version: '1', audit_id: '1' });
  await f.service.create({ ...input, role: 'admin', price: 0, status: 'ativa' });
  assert.deepEqual(f.calls[0], ['roleapp_admin_campaign_mutate_v2', {
    p_action: 'create', p_reason: input.reason, p_idempotency_key: uuid,
    p_id: null, p_expected_version: null, p_local_id: '30', p_owner_id: uuid, p_patch: input.fields,
  }]);
});
test('campanhas: alterações comerciais e mudança de propriedade não são aceitas como edição', async () => {
  const f = fixture(createAdminCampaignsService, { update: true });
  for (const fields of [{ valor: 0 }, { status: 'ativa' }, { id_usuario: uuid }, { id_local: '31' },
    { data_inicio: '2026-11-14' }, { duracao_dias: 99 }, { tipo: 'gratis' }, { raio_km: 100 },
    { interesses: ['fake'] }, { faixa_etaria: 'fake' }, {}]) {
    await assert.rejects(f.service.update({ ...input, fields }));
  }
  assert.equal(f.calls.length, 0);
});
test('campanhas: cada transição exige liberação própria e envia versão/motivo/chave sem status arbitrário', async () => {
  for (const op of ['approve', 'activate', 'pause', 'end']) {
    const f = fixture(createAdminCampaignsService, { [op]: true });
    await f.service[op]({ ...input, status: 'forged', fields: { valor: 0 } });
    assert.equal(f.calls[0][1].p_action, op);
    assert.equal(f.calls[0][1].p_expected_version, '7');
    assert.deepEqual(f.calls[0][1].p_patch, {});
    await assert.rejects(f.service.update(input), { code: 'ADMIN_CONTRACT_BLOCKED' });
  }
});
test('campanhas: paginação e detalhes verificam identidade, proprietário e versão do contrato', async () => {
  const item = { id_campanha: '12', id_local: '30', id_usuario: uuid, version: '7', status: 'ativa',
    titulo: 'Campanha', tipo: 'destaque', duracao_dias: 7 };
  const f = fixture(createAdminCampaignsService, { list: true, detail: true }, { items: [item], next_cursor: null });
  assert.deepEqual((await f.service.list({ ownerId: uuid })).items, [item]);
  assert.equal(f.calls[0][1].p_owner_id, uuid);
  const d = fixture(createAdminCampaignsService, { detail: true }, item);
  assert.deepEqual(await d.service.detail('12'), item);
  await assert.rejects(d.service.detail('13'), { code: 'ADMIN_CONTRACT_MISMATCH' });
  const bad = fixture(createAdminCampaignsService, { list: true }, { items: [{ ...item, id_usuario: null }], next_cursor: null });
  await assert.rejects(bad.service.list(), { code: 'ADMIN_CONTRACT_MISMATCH' });
});
test('administradores: consultas e mutações permanecem bloqueadas sem acesso direto a papéis', async () => {
  const f = fixture(createAdminAccessManagementService);
  for (const op of ['list', 'detail', 'grant', 'suspend', 'revoke']) {
    await assert.rejects(f.service[op](input), { code: 'ADMIN_CONTRACT_BLOCKED' });
  }
  assert.equal(f.calls.length, 0);
});
test('administradores: concessão envia somente capacidades válidas e não aceita indicação de principal/ator', async () => {
  const f = fixture(createAdminAccessManagementService, { grant: true }, { user_id: uuid, version: '1', audit_id: '2' });
  await f.service.grant({ ...input, expectedVersion: null, principal: true, actor: uuid });
  assert.deepEqual(f.calls[0], ['roleapp_admin_access_mutate_v2', {
    p_action: 'grant', p_user_id: uuid, p_expected_version: null, p_capabilities: ['locais.ler'],
    p_reason: input.reason, p_idempotency_key: uuid,
  }]);
  for (const capabilities of [['superuser'], ['locais.ler', 'locais.ler'], null]) {
    await assert.rejects(f.service.grant({ ...input, expectedVersion: null, capabilities }));
  }
  assert.equal(f.calls.length, 1);
});
test('administradores: suspensão/revogação independentes, versionadas e auditáveis', async () => {
  for (const op of ['suspend', 'revoke']) {
    const f = fixture(createAdminAccessManagementService, { [op]: true }, { user_id: uuid, version: '8', audit_id: '2' });
    await f.service[op](input);
    assert.equal(f.calls[0][1].p_action, op);
    assert.equal(f.calls[0][1].p_expected_version, '7');
    assert.deepEqual(f.calls[0][1].p_capabilities, []);
    await assert.rejects(f.service.grant(input), { code: 'ADMIN_CONTRACT_BLOCKED' });
  }
});
test('administradores: detalhe inconsistente e confirmação sem auditoria são rejeitados', async () => {
  const item = { user_id: uuid, version: '7', capabilities: ['locais.ler'], active: true, principal: false };
  const f = fixture(createAdminAccessManagementService, { detail: true }, item);
  assert.deepEqual(await f.service.detail(uuid), item);
  for (const data of [{ ...item, capabilities: ['root'] }, { ...item, active: 'true' }]) {
    await assert.rejects(fixture(createAdminAccessManagementService, { detail: true }, data).service.detail(uuid), { code: 'ADMIN_CONTRACT_MISMATCH' });
  }
  for (const data of [{ user_id: uuid, version: '7', audit_id: '2' }, { user_id: uuid, version: '8' }]) {
    await assert.rejects(fixture(createAdminAccessManagementService, { revoke: true }, data).service.revoke(input), { code: 'ADMIN_CONTRACT_MISMATCH' });
  }
});
