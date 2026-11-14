import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminPlacesService } from '../src/services/adminPlacesService.js';
import { renderScreen } from './helpers/render-screen.mjs';

const place = (id, name = `Local ${id}`) => ({ id_local: id, nome: name, visivel: false });
const page = (items = [], next_cursor = null) => ({ items, next_cursor });
const nodeText = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : node?.children?.map(nodeText).join('') || '';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(service) {
  return renderScreen(new URL('../src/components/AdminPlacesPanel.js', import.meta.url), 'AdminPlacesPanel',
    { service }, { '../services/adminService': { adminService: { locais: service } } });
}

test('locais admin: bloqueado por padrao sem RPC nem consulta publica', async () => {
  let calls = 0;
  const service = createAdminPlacesService({ rpc() { calls++; } });
  const ui = fixture(service); await ui.settle();
  assert.match(ui.text(), /bloqueada.*aprovação/);
  assert.equal(ui.nodes().some(n => n.type === 'TextInput'), false);
  await assert.rejects(service.list(), /bloqueada/);
  assert.equal(calls, 0);
});

test('locais admin: contrato exclusivo envia filtros/cursor sem papel ou ator; detalhe por ID', async () => {
  const calls = [];
  const service = createAdminPlacesService({ async rpc(name, args) {
    calls.push([name, args]); return { data: page([place('12')]) };
  } }, { contractApproved: true });
  await service.list({ search: '  Café  ', visibility: false, cursor: '11' });
  assert.deepEqual(calls[0], ['roleapp_admin_places_read_v1', {
    p_search: 'Café', p_visible: false, p_after: '11', p_limit: 20, p_id: null,
  }]);
  assert.equal((await service.detail(12)).id_local, '12');
  assert.equal(calls[1][1].p_id, '12');
  await assert.rejects(service.detail(null), /ID inválido/);
  await assert.rejects(service.list({ visibility: 'false' }), /inválidos/);
  assert.equal(calls.length, 2);
});

test('locais admin: acesso negado/RPC ausente/resposta invalida nao produzem fallback', async () => {
  for (const response of [{ error: { code: '42501' } }, { error: { code: 'PGRST202' } },
    { data: page([{ id_local: 12, nome: 'Inválido', visivel: true }]) }]) {
    let calls = 0;
    const service = createAdminPlacesService({ async rpc() { calls++; return response; } }, { contractApproved: true });
    await assert.rejects(service.list()); assert.equal(calls, 1);
  }
});

test('locais admin: pesquisa nome/ID, visibilidade, paginacao sem duplicatas e atualizacao', async () => {
  const calls = [];
  const service = { available: true, async list(query) {
    calls.push(query);
    return query.cursor ? page([place('1'), place('2')]) : page([place('1')], '1');
  } };
  const ui = fixture(service); await ui.settle();
  assert.match(ui.text(), /Local 1/);
  await ui.button('Carregar mais locais').props.onPress(); ui.render();
  assert.equal(ui.nodes().filter(n => n.type === 'TouchableOpacity' && nodeText(n) === 'Ver detalhes: Local 1').length, 1);
  assert.match(ui.text(), /Local 2/);
  assert.equal(calls.at(-1).cursor, '1');
  ui.nodes().find(n => n.type === 'TextInput').props.onChangeText('123'); ui.render();
  ui.button('Pesquisar').props.onPress(); ui.render(); await ui.settle();
  assert.equal(calls.at(-1).search, '123'); assert.equal(calls.at(-1).cursor, null);
  ui.button('Ocultos').props.onPress(); ui.render(); await ui.settle();
  assert.equal(calls.at(-1).visibility, false);
  await ui.button('Atualizar locais').props.onPress(); ui.render();
  assert.equal(calls.at(-1).cursor, null);
  assert.doesNotMatch(ui.text(), /Local 2/);
});

test('locais admin: carregamento, vazio, erro e recuperacao limpam resultados antigos', async () => {
  const pending = deferred(); let response = pending.promise;
  const ui = fixture({ available: true, list: () => response }); ui.render();
  assert.ok(ui.nodes().some(n => n.props.accessibilityLabel === 'Carregando locais'));
  pending.resolve(page()); await ui.settle();
  assert.match(ui.text(), /Nenhum estabelecimento/);
  response = Promise.resolve(page([place('7')]));
  await ui.button('Atualizar locais').props.onPress(); ui.render(); assert.match(ui.text(), /Local 7/);
  response = { then: (_, reject) => reject(Error('Sem acesso')) };
  await ui.button('Atualizar locais').props.onPress(); ui.render();
  assert.match(ui.text(), /Sem acesso/); assert.doesNotMatch(ui.text(), /Local 7/);
  response = Promise.resolve(page([place('8')]));
  await ui.button('Atualizar locais').props.onPress(); ui.render(); assert.match(ui.text(), /Local 8/);
});

test('locais admin: detalhes autorizados e resposta tardia invalidada ao atualizar', async () => {
  const pending = deferred(); let detailResponse = Promise.resolve({ ...place('3'), endereco: 'Rua de teste',
    responsavel: { id_usuario: 'fixture', nome: 'Responsável de teste' } });
  const ui = fixture({ available: true, list: async () => page([place('3')]), detail: () => detailResponse });
  await ui.settle(); await ui.button('Ver detalhes: Local 3').props.onPress(); ui.render();
  assert.match(ui.text(), /Responsável de teste/); assert.match(ui.text(), /Rua de teste/);
  ui.button('Fechar detalhes').props.onPress(); ui.render();
  detailResponse = pending.promise;
  const opened = ui.button('Ver detalhes: Local 3').props.onPress(); ui.render();
  await ui.button('Atualizar locais').props.onPress(); ui.render();
  pending.resolve({ ...place('3'), nome: 'Resposta antiga' }); await opened; ui.render();
  assert.doesNotMatch(ui.text(), /Resposta antiga/);
});

test('locais admin: resposta de listagem antiga nao substitui refresh recente nem atualiza apos desmontar', async () => {
  const pending = deferred(); let calls = 0;
  const ui = fixture({ available: true, list: () => ++calls === 1 ? pending.promise : Promise.resolve(page([place('9')])) });
  await ui.button('Atualizar locais').props.onPress(); ui.render();
  pending.resolve(page([place('1')])); await ui.settle();
  assert.match(ui.text(), /Local 9/); assert.doesNotMatch(ui.text(), /Local 1/);
  ui.unmount();
});
