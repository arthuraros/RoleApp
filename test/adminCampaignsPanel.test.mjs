import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';

const uuid = 'b1a2f902-0010-4000-8000-000000000001';
const campaign = (id, version = '2') => ({
  id_campanha: id, id_local: '30', id_usuario: uuid, version, status: 'rascunho',
  titulo: `Campanha ${id}`, mensagem: 'Descrição', tipo: 'destaque', duracao_dias: 7,
  data_inicio: null, data_fim: null,
});
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : node?.children?.map(text).join('') || '';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixture(service) {
  return renderScreen(new URL('../src/components/AdminCampaignsPanel.js', import.meta.url),
    'AdminCampaignsPanel', { service }, {
      '../services/adminService': { adminService: { campanhas: service } },
      './AdminCampaignOperationForm': { AdminCampaignOperationForm: 'AdminCampaignOperationForm' },
    });
}

test('campanhas UI: bloqueio padrão não consulta dados nem mostra busca', async () => {
  let calls = 0;
  const ui = fixture({ available: false, async list() { calls++; } });
  await ui.settle();
  assert.match(ui.text(), /bloqueados.*aprovação e validação/);
  assert.equal(ui.nodes().some(node => node.type === 'TextInput'), false);
  assert.equal(calls, 0);
});

test('campanhas UI: pesquisa por teclado, paginação e deduplicação integram serviço', async () => {
  const calls = [];
  const service = { available: true, contracts: {}, async list(query) {
    calls.push(query);
    return query.cursor
      ? { items: [campaign('1'), campaign('2')], next_cursor: null }
      : { items: [campaign('1')], next_cursor: 'cursor-1' };
  } };
  const ui = fixture(service);
  await ui.settle();
  assert.match(ui.text(), /Campanha 1/);

  const input = ui.nodes().find(node => node.type === 'TextInput');
  input.props.onChangeText('  festa  ');
  ui.render();
  ui.nodes().find(node => node.type === 'TextInput').props.onSubmitEditing();
  ui.render();
  await ui.settle();
  assert.equal(calls.at(-1).search, 'festa');

  await ui.button('Carregar mais campanhas').props.onPress();
  ui.render();
  assert.equal(ui.nodes().filter(node => node.type === 'TouchableOpacity' &&
    text(node) === 'Ver campanha 1').length, 1);
  assert.match(ui.text(), /Campanha 2/);
  assert.equal(calls.at(-1).cursor, 'cursor-1');
});

test('campanhas UI: detalhe e ações usam contratos explicitamente liberados', async () => {
  const calls = [];
  const service = {
    available: true,
    contracts: { update: true, pause: true },
    async list() { return { items: [campaign('7')], next_cursor: null }; },
    async detail(id) { calls.push(['detail', id]); return campaign(id, '4'); },
  };
  const ui = fixture(service);
  await ui.settle();
  await ui.button('Ver campanha 7').props.onPress();
  ui.render();
  assert.match(ui.text(), /Parceiro/);
  assert.ok(ui.button('Editar campanha'));
  assert.equal(ui.button('Aprovar campanha'), undefined);

  ui.button('Editar campanha').props.onPress();
  ui.render();
  const form = ui.nodes().find(node => node.type === 'AdminCampaignOperationForm');
  assert.equal(form.props.operation, 'update');
  assert.equal(form.props.campaign.version, '4');
  assert.deepEqual(calls, [['detail', '7']]);
});

test('campanhas UI: atualização invalida respostas antigas de listagem', async () => {
  const pending = deferred();
  let call = 0;
  const service = { available: true, contracts: {}, list() {
    return ++call === 1 ? pending.promise
      : Promise.resolve({ items: [campaign('9')], next_cursor: null });
  } };
  const ui = fixture(service);
  await ui.button('Atualizar campanhas').props.onPress();
  ui.render();
  pending.resolve({ items: [campaign('1')], next_cursor: null });
  await ui.settle();
  assert.match(ui.text(), /Campanha 9/);
  assert.doesNotMatch(ui.text(), /Campanha 1/);
});
