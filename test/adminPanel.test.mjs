import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';

// Renderer offline de JSX/handlers. Nao comprova layout nativo nem RLS.
const sections = ['Solicitações', 'Locais', 'Campanhas', 'Administradores'];
const requests = [
  { id_solicitacao: 1, id_usuario: 'fixture-a', estabelecimento: 'Pedido em revisão', status: 'pendente' },
  { id_solicitacao: 2, id_usuario: 'fixture-b', estabelecimento: 'Pedido em análise', status: 'em_analise' },
  { id_solicitacao: 3, id_usuario: 'fixture-c', estabelecimento: 'Pedido aprovado', status: 'aprovado' },
];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : node?.children?.map(text).join('') || '';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(options = {}) {
  const calls = [], gates = [], back = [];
  const ui = renderScreen(new URL('../src/screens/PainelAdminScreen.js', import.meta.url), 'PainelAdminScreen', {
    navigation: { goBack: () => back.push(true) },
  }, {
    '../components/AdminPlacesPanel': { AdminPlacesPanel: 'AdminPlacesPanel' },
    '../components/AdminCampaignsPanel': { AdminCampaignsPanel: 'AdminCampaignsPanel' },
    '../components/AdminAccessPanel': { AdminAccessPanel: () => 'Funcionalidade em preparação' },
    '../components/AdminSupportDraftForm': { AdminSupportDraftForm: 'AdminSupportDraftForm' },
    '../components/AccessGate': { AccessGate: props => {
      gates.push(props.role);
      return { type: 'AccessGate', props, children: props.children };
    } },
    '../services/adminService': { adminService: {
      listarSolicitacoes: async () => { calls.push(['list']); if (options.failList) throw Error('Falha offline'); return options.listResult ?? requests; },
      encaminharParaDecisao: async (...args) => { calls.push(['forward', ...args]); return options.forward?.(); },
      decidirParceria: async payload => { calls.push(['decide', payload]); },
      obterDetalhesDecisao: async id => { calls.push(['detail', id]); return { justificativa: 'Decisão registrada na fixture' }; },
    } },
  });
  const tab = label => ui.nodes().find(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label);
  const clickTab = label => { assert.ok(tab(label), label); tab(label).props.onPress(); ui.render(); };
  const open = label => { const n = ui.nodes().find(n => n.type === 'TouchableOpacity' && text(n).includes(label)); assert.ok(n, label); n.props.onPress(); ui.render(); };
  return { ui, calls, gates, back, tab, clickTab, open };
}

test('RA-11: quatro seções, Solicitações inicial e três etapas existentes', async () => {
  const f = fixture(); await f.ui.settle();
  assert.deepEqual(f.ui.nodes().filter(n => n.props.accessibilityRole === 'tab').map(n => n.props.accessibilityLabel),
    [...sections, 'Revisão', 'Pendentes', 'Histórico']);
  assert.equal(f.tab('Solicitações').props.accessibilityState.selected, true);
  assert.equal(f.tab('Revisão').props.accessibilityState.selected, true);
  assert.ok(f.gates.every(role => role === 'admin'));
  assert.match(f.ui.text(), /Pedido em revisão/);
  f.clickTab('Pendentes'); assert.match(f.ui.text(), /Pedido em análise/);
  f.clickTab('Histórico'); assert.match(f.ui.text(), /Pedido aprovado/);
});

test('TF07: Solicitações exibe carregamento e recebe resultado sem bloquear a navegação', async () => {
  const pending = deferred();
  const f = fixture({ listResult: pending.promise });
  assert.ok(f.ui.nodes().some(n => n.type === 'ActivityIndicator'));
  f.clickTab('Locais'); f.clickTab('Campanhas'); f.clickTab('Administradores');
  pending.resolve(requests); await f.ui.settle();
  assert.equal(f.tab('Administradores').props.accessibilityState.selected, true);
  f.clickTab('Solicitações');
  assert.match(f.ui.text(), /Pedido em revisão/);
  assert.equal(f.ui.nodes().some(n => n.type === 'ActivityIndicator'), false);
  assert.deepEqual(f.calls, [['list']]);
});

test('TF07: voltar permanece disponível em todas as seções sem novas consultas', async () => {
  const f = fixture(); await f.ui.settle();
  for (const section of sections) {
    f.clickTab(section);
    const backButton = f.ui.nodes().find(n => n.type === 'TouchableOpacity' &&
      n.children.some(child => child?.type === 'Ionicons' && child.props.name === 'arrow-back'));
    assert.ok(backButton, section);
    backButton.props.onPress();
  }
  assert.equal(f.back.length, sections.length);
  assert.deepEqual(f.calls, [['list']]);
});

test('RA-11: seções futuras são informativas, sem formulário, refresh ou mutação', async () => {
  const f = fixture(); await f.ui.settle();
  for (const name of ['Administradores']) {
    f.clickTab(name); await f.ui.settle();
    assert.match(f.ui.text(), /Funcionalidade em preparação/);
    assert.equal(f.tab(name).props.accessibilityState.selected, true);
    assert.equal(f.ui.nodes().filter(n => n.type === 'TextInput').length, 0);
    assert.equal(f.ui.nodes().filter(n => n.type === 'TouchableOpacity' && n.props.accessibilityRole !== 'tab').length, 1); // voltar
    assert.ok(f.ui.nodes().filter(n => n.type === 'ScrollView').every(n => !n.props.refreshControl));
    assert.equal(f.tab('Revisão'), undefined);
  }
  assert.deepEqual(f.calls, [['list']]);
});

test('suporte admin: seções usam consulta e preparação isoladas sem chamar serviços parceiros', async () => {
  const f = fixture(); await f.ui.settle();
  for (const [section, panel, resource] of [['Locais', 'AdminPlacesPanel', 'locais'], ['Campanhas', 'AdminCampaignsPanel', 'campanhas']]) {
    f.clickTab(section); await f.ui.settle();
    assert.ok(f.ui.nodes().some(n => n.type === panel));
    assert.equal(f.ui.nodes().find(n => n.type === 'AdminSupportDraftForm').props.resource, resource);
    assert.equal(f.tab('Revisão'), undefined);
  }
  assert.deepEqual(f.calls, [['list']]);
});

test('RA-11: alternar seções preserva aba, seleção e texto da solicitação', async () => {
  const f = fixture(); await f.ui.settle(); f.clickTab('Pendentes'); f.open('Pedido em análise');
  f.ui.nodes().find(n => n.type === 'TextInput' && n.props.multiline).props.onChangeText('Análise preservada ao alternar'); f.ui.render();
  for (const name of sections.slice(1)) f.clickTab(name);
  f.clickTab('Solicitações');
  assert.match(f.ui.text(), /SOLICITAÇÃO #2/);
  assert.equal(f.ui.nodes().find(n => n.type === 'TextInput' && n.props.multiline).props.value, 'Análise preservada ao alternar');
  f.ui.button('Voltar às solicitações').props.onPress(); f.ui.render();
  assert.equal(f.tab('Pendentes').props.accessibilityState.selected, true);
  assert.deepEqual(f.calls, [['list']]);
});

test('RA-11: encaminhamento existente permanece funcional e bloqueia troca durante mutação', async () => {
  const pending = deferred(); const f = fixture({ forward: () => pending.promise });
  await f.ui.settle(); f.open('Pedido em revisão');
  f.ui.nodes().find(n => n.type === 'TextInput').props.onChangeText('Contato e identidade verificados'); f.ui.render();
  const sending = f.ui.button('Encaminhar para decisão').props.onPress(); f.ui.render();
  assert.ok(sections.every(name => f.tab(name).props.disabled));
  pending.resolve(); await sending; f.ui.render();
  assert.equal(f.tab('Pendentes').props.accessibilityState.selected, true);
  assert.deepEqual(f.calls, [['list'], ['forward', 1, 'Contato e identidade verificados'], ['list']]);
  assert.ok(sections.every(name => !f.tab(name).props.disabled));
});

test('RA-11: decisão rejeitada conserva validações, confirmação e payload', async () => {
    const f = fixture(); await f.ui.settle(); f.clickTab('Pendentes'); f.open('Pedido em análise');
    const decide = () => f.ui.nodes().find(n => n.type === 'TouchableOpacity' && /^Reprovar/.test(text(n)));
    decide().props.onPress(); f.ui.render();
    assert.equal(f.calls.some(c => c[0] === 'decide'), false);
    assert.equal(f.ui.alerts.at(-1)[0], 'Justificativa obrigatória');
    f.ui.nodes().find(n => n.type === 'TextInput' && n.props.multiline).props.onChangeText('Justificativa da fixture offline');
    f.ui.render(); decide().props.onPress();
    assert.equal(f.calls.some(c => c[0] === 'decide'), false); // ainda aguarda confirmação
    assert.match(f.ui.alerts.at(-1)[0], /Confirmar/);
    await f.ui.alerts.at(-1)[2].find(b => b.text === 'Confirmar').onPress(); f.ui.render();
    const payload = f.calls.find(c => c[0] === 'decide')[1];
    assert.equal(payload.idSolicitacao, 2);
    assert.equal(payload.decisao, 'rejeitado');
    assert.equal(payload.idLocal, null);
    assert.equal(f.tab('Histórico').props.accessibilityState.selected, true);
});

test('RA-11: aprovação fica bloqueada na interface até validar a RPC de vínculo/auditoria', async () => {
  const f = fixture(); await f.ui.settle(); f.clickTab('Pendentes'); f.open('Pedido em análise');
  const button = f.ui.button('Aprovação bloqueada');
  assert.equal(button.props.disabled, true);
  assert.match(f.ui.text(), /não cria o vínculo comercial e a auditoria exigidos/);
  button.props.onPress();
  assert.equal(f.ui.alerts.at(-1)[0], 'Aprovação bloqueada');
  assert.equal(f.calls.some(c => c[0] === 'decide'), false);
});

test('RA-11: histórico continua consultando detalhes; erro de lista não bloqueia seções futuras', async () => {
  const f = fixture(); await f.ui.settle(); f.clickTab('Histórico'); f.open('Pedido aprovado'); await f.ui.settle();
  assert.match(f.ui.text(), /Decisão registrada na fixture/);
  assert.deepEqual(f.calls, [['list'], ['detail', 3]]);
  const failed = fixture({ failList: true }); await failed.ui.settle();
  assert.match(failed.ui.text(), /Falha offline/);
  failed.clickTab('Locais'); assert.ok(failed.ui.nodes().some(node => node.type === 'AdminPlacesPanel'));
  failed.clickTab('Solicitações'); assert.ok(failed.ui.button('Tentar novamente'));
});

test('RA-11: navegação horizontal e áreas de toque não impõem altura fixa ou redução de fonte', async () => {
  const f = fixture(); await f.ui.settle();
  const carousel = f.ui.nodes().find(n => n.type === 'ScrollView' && n.props.horizontal);
  assert.ok(carousel);
  assert.equal(carousel.props.contentContainerStyle.flexGrow, 1);
  for (const name of sections) {
    const tab = f.tab(name); const style = tab.props.style[0];
    assert.ok(style.minHeight >= 48);
    assert.equal(style.height, undefined);
    assert.equal(style.flex, 1);
    const label = tab.children.find(n => n.type === 'Text');
    assert.equal(label.props.numberOfLines, undefined);
    assert.equal(label.props.adjustsFontSizeToFit, undefined);
  }
});

for (const role of [null, 'usuario', 'parceiro', 'superadmin', 'admin']) {
  test(`RA-11: AccessGate conserva verificação exata do papel ${role}`, () => {
    const ui = renderScreen(new URL('../src/components/AccessGate.js', import.meta.url), 'AccessGate',
      { role: 'admin', children: 'CONTEÚDO PRIVADO' }, {
        '../contexts/AuthContext': { useAuth: () => ({ role, profileLoading: false }) },
      });
    if (role === 'admin') assert.equal(ui.text(), 'CONTEÚDO PRIVADO');
    else { assert.doesNotMatch(ui.text(), /CONTEÚDO PRIVADO/); assert.match(ui.text(), /Acesso indisponível/); }
  });
}

test('RA-11: AccessGate aguarda perfil e bloqueia conteúdo após revogação', () => {
  const auth = { role: 'admin', profileLoading: true };
  const ui = renderScreen(new URL('../src/components/AccessGate.js', import.meta.url), 'AccessGate',
    { role: 'admin', children: 'CONTEÚDO PRIVADO' }, {
      '../contexts/AuthContext': { useAuth: () => auth },
    });
  assert.ok(ui.nodes().some(n => n.props.accessibilityLabel === 'Verificando acesso'));
  auth.profileLoading = false; ui.render(); assert.equal(ui.text(), 'CONTEÚDO PRIVADO');
  auth.role = 'usuario'; ui.render(); assert.doesNotMatch(ui.text(), /CONTEÚDO PRIVADO/);
});
