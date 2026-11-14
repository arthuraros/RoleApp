import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminSupportService } from '../src/services/adminSupportService.js';
import * as draft from '../src/utils/adminSupportDraft.js';
import * as campaigns from '../src/utils/campaigns.js';
import { createPartnerAccessService } from '../src/services/partnerAccessService.js';
import { renderScreen } from './helpers/render-screen.mjs';

const campaignForm = { motivo: 'Suporte solicitado pelo parceiro', id_local: '12', tipo: 'destaque',
  titulo: 'Happy hour', mensagem: 'Novidade', faixa_etaria: 'Todos', duracao_dias: 7 };
const placeForm = { motivo: campaignForm.motivo, proprietario: 'parceiro-a',
  ...Object.fromEntries(draft.ADMIN_PLACE_DRAFT_FIELDS.map(([key]) => [key, 'Dado do local'])) };

for (const resource of ['locais', 'campanhas']) for (const mode of ['cadastro', 'edição']) {
  test(`TF07: ${mode} de ${resource} renderiza e mantém envio bloqueado`, () => {
    const label = resource === 'locais' ? 'local' : 'campanha';
    const ui = renderScreen(new URL('../src/components/AdminSupportDraftForm.js', import.meta.url), 'AdminSupportDraftForm',
      { resource }, { '../utils/adminSupportDraft.js': draft, '../utils/campaigns.js': campaigns });
    ui.button(`Preparar ${mode} de ${label}`).props.onPress(); ui.render();
    assert.ok(ui.nodes().some(n => n.type === 'TextInput'));
    const save = ui.button('Salvar no Supabase — bloqueado');
    assert.equal(save.props.disabled, true);
    assert.equal(save.props.accessibilityState.disabled, true);
    assert.equal(save.props.onPress, undefined);
    assert.match(ui.text(), /apenas em memória/);
    ui.button('Descartar preparação').props.onPress(); ui.render();
    assert.equal(ui.nodes().some(n => n.type === 'TextInput'), false);
  });
}

test('suporte: contratos novos permanecem bloqueados inclusive chamadas diretas', async () => {
  assert.equal(adminSupportService.campanhas.available, false);
  for (const service of Object.values(adminSupportService)) {
    for (const operation of ['list', 'detail', 'create', 'update']) {
      if (service[operation]) await assert.rejects(service[operation]({}), /bloqueada.*auditoria/);
    }
  }
});

test('suporte: preparação não aceita propriedade/status/preço/ator como campos editáveis', () => {
  const result = draft.prepareAdminSupportDraft('campanhas', 'create', { ...campaignForm,
    id_usuario: 'admin', status: 'ativa', valor_total: 0, actor: 'forjado' });
  for (const key of ['id_usuario', 'status', 'valor_total', 'actor']) assert.equal(result.fields[key], undefined);
  const local = draft.prepareAdminSupportDraft('locais', 'create', { ...placeForm, visivel: true, id_proprietario: 'admin' });
  assert.equal(local.ownerReference, 'parceiro-a');
  assert.equal(local.fields.id_proprietario, undefined);
  assert.equal(local.fields.visivel, undefined);
  assert.equal(local.fields.cidade_uf, 'Dado do local');
});

test('suporte: justificativa, referência de proprietário, ID e versão são obrigatórios', () => {
  assert.throws(() => draft.prepareAdminSupportDraft('locais', 'create', { ...placeForm, proprietario: '' }), /responsável/);
  assert.throws(() => draft.prepareAdminSupportDraft('campanhas', 'create', { ...campaignForm, motivo: 'curto' }), /motivo/);
  assert.throws(() => draft.prepareAdminSupportDraft('campanhas', 'update', campaignForm), /ID e versão/);
  assert.throws(() => draft.prepareAdminSupportDraft('campanhas', 'create', { ...campaignForm, duracao_dias: 30 }), /duração/);
  assert.throws(() => draft.prepareAdminSupportDraft('campanhas', 'create', { ...campaignForm, titulo: '' }), /título/);
  const result = draft.prepareAdminSupportDraft('locais', 'update', { ...placeForm, id: '12', versao: 'v1' });
  assert.equal(result.ownerReference, null);
  assert.equal(result.expectedVersion, 'v1');
});

test('suporte: formulário confere e descarta preparação sem botão de envio habilitado', () => {
  const ui = renderScreen(new URL('../src/components/AdminSupportDraftForm.js', import.meta.url), 'AdminSupportDraftForm',
    { resource: 'campanhas' }, { '../utils/adminSupportDraft.js': draft, '../utils/campaigns.js': campaigns });
  ui.button('Preparar cadastro de campanha').props.onPress(); ui.render();
  const change = (label, value) => {
    ui.nodes().find(n => n.type === 'TextInput' && n.props.accessibilityLabel === label).props.onChangeText(value); ui.render();
  };
  change('ID do local da campanha', '12'); change('Título', 'Happy hour');
  change('Motivo do suporte', campaignForm.motivo);
  ui.button('Conferir preparação local').props.onPress(); ui.render();
  assert.match(ui.text(), /Nada foi cadastrado ou alterado/);
  assert.equal(ui.button('Salvar no Supabase — bloqueado').props.disabled, true);
  change('Título', 'Outro título'); assert.doesNotMatch(ui.text(), /Dados conferidos/);
  ui.button('Descartar preparação').props.onPress(); ui.render();
  assert.equal(ui.nodes().filter(n => n.type === 'TextInput').length, 0);
});

test('suporte: formulário de local usa cidade_uf e edição não oferece troca de proprietário', () => {
  const ui = renderScreen(new URL('../src/components/AdminSupportDraftForm.js', import.meta.url), 'AdminSupportDraftForm',
    { resource: 'locais' }, { '../utils/adminSupportDraft.js': draft, '../utils/campaigns.js': campaigns });
  ui.button('Preparar edição de local').props.onPress(); ui.render();
  const labels = ui.nodes().filter(n => n.type === 'TextInput').map(n => n.props.accessibilityLabel);
  assert.ok(labels.includes('Cidade/UF')); assert.ok(labels.includes('Versão confirmada pelo servidor'));
  assert.equal(labels.includes('ID do parceiro responsável'), false);
});

function panel(service) {
  return renderScreen(new URL('../src/components/AdminCampaignsPanel.js', import.meta.url), 'AdminCampaignsPanel',
    { service }, { '../services/adminService': { adminService: { campanhas: service } },
      './AdminCampaignOperationForm': { AdminCampaignOperationForm: 'AdminCampaignOperationForm' } });
}
const row = id => ({ id_campanha: id, id_local: '12', titulo: `Campanha ${id}`, tipo: 'destaque', status: 'rascunho' });
test('campanhas admin: serviço real bloqueado não oferece consulta nem dados de demonstração', async () => {
  const ui = panel(adminSupportService.campanhas); await ui.settle();
  assert.match(ui.text(), /bloqueados/);
  assert.equal(ui.nodes().some(n => n.type === 'TextInput'), false);
  assert.equal(ui.nodes().some(n => n.props.accessibilityLabel === 'Carregando campanhas'), false);
});

test('campanhas admin: adaptador futuro suporta busca, paginação e detalhes sem duplicação', async () => {
  const calls = [];
  const ui = panel({ available: true, async list(q) {
    calls.push(q); return { items: q.cursor ? [row('1'), row('2')] : [row('1')], next_cursor: q.cursor ? null : '1' };
  }, async detail(id) { return { ...row(id), id_usuario: 'parceiro-a', mensagem: 'Detalhe restrito' }; } });
  await ui.settle();
  await ui.button('Carregar mais campanhas').props.onPress(); ui.render();
  assert.equal(ui.nodes().filter(n => n.type === 'Text' && n.children.join('') === 'Ver campanha 1').length, 1);
  assert.ok(ui.button('Ver campanha 2'));
  await ui.button('Ver campanha 2').props.onPress(); ui.render();
  assert.match(ui.text(), /Detalhe restrito/); assert.match(ui.text(), /parceiro-a/);
  ui.nodes().find(n => n.type === 'TextInput').props.onChangeText('  Café  '); ui.render();
  ui.button('Pesquisar campanhas').props.onPress(); ui.render(); await ui.settle();
  assert.equal(calls.at(-1).search, 'Café'); assert.equal(calls.at(-1).cursor, null);
  assert.doesNotMatch(ui.text(), /Detalhe restrito/);
});

test('campanhas admin: atualização invalida detalhe pendente e erro limpa a listagem', async () => {
  let resolve, fail = false;
  const pending = new Promise(r => { resolve = r; });
  const ui = panel({ available: true, async list() {
    if (fail) throw Error('Acesso revogado');
    return { items: [row('1')], next_cursor: null };
  }, detail: () => pending });
  await ui.settle();
  const detail = ui.button('Ver campanha 1').props.onPress(); ui.render();
  // Simula refresh disparado antes do detalhe, mesmo com controle visual desabilitado.
  await ui.button('Atualizar campanhas').props.onPress(); ui.render();
  resolve({ ...row('1'), mensagem: 'Resposta antiga' }); await detail; ui.render();
  assert.doesNotMatch(ui.text(), /Resposta antiga/);
  fail = true; await ui.button('Atualizar campanhas').props.onPress(); ui.render();
  assert.match(ui.text(), /Acesso revogado/); assert.equal(ui.button('Ver campanha 1'), undefined);
});

test('parceiro: validação compartilhada preserva RPC, payload e autoria derivada no servidor', async () => {
  const calls = [];
  const service = createPartnerAccessService({ async rpc(...args) { calls.push(args); return { data: { status: 'rascunho' } }; } });
  for (const tipo of campaigns.CAMPAIGN_TYPES) for (const duracaoDias of campaigns.CAMPAIGN_DURATIONS) {
    await service.criarCampanha({ idLocal: 12, tipo, duracaoDias, titulo: ' Café ', idUsuario: 'outro' });
  }
  assert.equal(calls.length, 6);
  for (const [name, payload] of calls) {
    assert.equal(name, 'solicitar_campanha_segura'); assert.equal(payload.p_id_local, '12');
    assert.equal(payload.p_titulo, 'Café'); assert.equal(payload.p_raio_km, 5);
    assert.equal(payload.p_id_usuario, undefined);
  }
  await assert.rejects(service.criarCampanha({ idLocal: 12, tipo: 'destaque', duracaoDias: 30 }));
  assert.equal(calls.length, 6);
});
