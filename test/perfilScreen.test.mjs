import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderScreen } from './helpers/render-screen.mjs';
import { profileDisplayName, supportReport } from '../src/utils/profile.js';

const screen = new URL('../src/screens/PerfilScreen.js', import.meta.url);
const options = new URL('../src/screens/PerfilOpcoesScreens.js', import.meta.url);
const contextKey = '../contexts/AuthContext';
const serviceKey = '../services/profileService.js';
const user = { id: 'conta', email: 'pessoa@exemplo.com', user_metadata: { role: 'admin' } };

test('nome prioriza usuarios.nome, aceita metadados de apresentacao e tem fallback sem email ficticio', () => {
  assert.equal(profileDisplayName({ nome: ' Maria ' }, { user_metadata: { name: 'Outra' } }), 'Maria');
  assert.equal(profileDisplayName(null, { user_metadata: { full_name: ' Ana ' } }), 'Ana');
  assert.equal(profileDisplayName({ nome: ' ' }, { user_metadata: { name: ' João ' } }), 'João');
  assert.equal(profileDisplayName(null, { user_metadata: { role: 'admin', nome: 123 } }), 'Seu perfil');
});

for (const role of ['usuario', 'parceiro', 'admin']) {
  test(`Perfil ${role}: nome real, opcoes por papel e todos os botoes com acao`, async () => {
    const navigations = [], uploads = [], auth = { user, isPartner: role === 'parceiro', isAdmin: role === 'admin', logout: () => navigations.push('logout') };
    const ui = renderScreen(screen, 'PerfilScreen', { navigation: { navigate: name => navigations.push(name) } }, {
      [contextKey]: { useAuth: () => auth }, [serviceKey]: { createProfileService: () => ({ getEditableProfile: async () => ({ id_usuario: 'conta', nome: 'Maria', foto_url: 'https://exemplo.com/avatar.jpg' }) }) },
      '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { profileDisplayName },
      'expo-image-picker': { requestMediaLibraryPermissionsAsync: async () => ({ status: 'granted' }), launchImageLibraryAsync: async () => ({ assets: [{ uri: 'foto.jpg' }] }) },
      'expo-file-system/legacy': { getInfoAsync: async () => ({ exists: true, size: 100 }) },
      '../services/userService.js': { uploadUserAvatar: async (...args) => { uploads.push(args); return 'https://exemplo.com/avatar.jpg'; }, getContagemAvaliacoesUsuario: async () => 3 },
    });
    await ui.settle();
    assert.ok(ui.text().includes('Maria'));
    assert.ok(ui.text().includes(user.email));
    assert.match(ui.nodes().find(n => n.type === 'Image' && n.props.source?.uri).props.source.uri, /avatar\.jpg\?t=\d+/);
    assert.ok(!ui.text().includes('Atualizar permissões'));
    assert.ok(!ui.text().includes('Rolês Visitados'));
    assert.ok(!ui.text().includes('Termos e serviços'));
    assert.equal(!!ui.button('Painel Administrativo'), role === 'admin');
    const scroll = ui.nodes().find(n => n.type === 'ScrollView');
    assert.equal(scroll.props.contentContainerStyle[1].paddingBottom, 134);
    for (const n of ui.nodes().filter(n => n.type === 'TouchableOpacity')) assert.equal(typeof n.props.onPress, 'function');
    for (const [label, route] of [['Editar perfil', 'EditarPerfil'], ['Rolês que quero visitar', 'Favoritos'],
      ['Avaliações Feitas3', 'MinhasAvaliacoes'], ['Configurações', 'Configuracoes'], ['Ajuda e Suporte', 'AjudaSuporte'],
      ['Termos de uso', 'TermosUso'], ['Privacidade', 'Privacidade']]) {
      ui.button(label).props.onPress(); assert.equal(navigations.at(-1), route);
    }
    // Identifica o cartao pelo estilo, sem depender da frase auxiliar.
    const place = ui.nodes().find(n => n.type === 'TouchableOpacity' && n.props.style?.backgroundColor === '#4F159B');
    assert.ok(place);
    place.props.onPress();
    assert.equal(navigations.at(-1), role === 'parceiro' ? 'MeusLugares' : 'SejaParceiro');
    const avatar = ui.nodes().find(n => n.type === 'TouchableOpacity' && n.props.disabled === false);
    await avatar.props.onPress();
    await ui.alerts.at(-1)[2].find(option => option.text === 'Escolher da galeria').onPress();
    assert.deepEqual(uploads, [['conta', 'foto.jpg']]);
    ui.button('Sair').props.onPress(); assert.equal(navigations.at(-1), 'logout');
  });
}

test('relato compartilha apenas campos digitados e exige campos obrigatorios', async () => {
  assert.throws(() => supportReport({ assunto: ' ', categoria: 'Outro', descricao: 'Texto' }), /Preencha/);
  const shared = [];
  const ui = renderScreen(options, 'AjudaSuporteScreen', { navigation: {} }, {
    [contextKey]: { useAuth: () => ({}) }, [serviceKey]: { createProfileService: () => ({}) },
    '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { supportReport },
  }, { Share: { share: async payload => { shared.push(payload); return { action: 'dismissedAction' }; } } });
  assert.ok(ui.text().includes('não abre um chamado automaticamente'));
  assert.equal(ui.button('Compartilhar relato').props.disabled, true);
  ui.nodes().find(n => n.props.accessibilityLabel === 'Assunto').props.onChangeText('Erro nos favoritos');
  ui.button('Favoritos').props.onPress();
  ui.nodes().find(n => n.props.accessibilityLabel === 'Descrição').props.onChangeText('Não consigo salvar um local.');
  ui.render();
  await ui.button('Compartilhar relato').props.onPress();
  assert.equal(shared.length, 1);
  assert.equal(shared[0].message, supportReport({ assunto: 'Erro nos favoritos', categoria: 'Favoritos', descricao: 'Não consigo salvar um local.' }));
  assert.deepEqual(Object.keys(shared[0]), ['message']);
  assert.equal(ui.alerts.length, 0); // Nao informa envio/chamado ao cancelar compartilhamento.
});

test('configuracoes: redefinicao de senha, permissoes do sistema e navegacao', async () => {
  const calls = [];
  const ui = renderScreen(options, 'ConfiguracoesScreen', { navigation: { navigate: route => calls.push(route) } }, {
    [contextKey]: { useAuth: () => ({ user, resetPassword: async email => { calls.push(email); return { success: true, message: 'Confira a caixa de entrada.' }; } }) },
    [serviceKey]: { createProfileService: () => ({}) }, '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { supportReport },
  }, { Linking: { openSettings: async () => calls.push('settings') } });
  ui.button('Editar nome').props.onPress();
  assert.equal(calls.at(-1), 'EditarPerfil');
  await ui.button('Enviar link para redefinir senha').props.onPress();
  assert.equal(calls.at(-1), user.email);
  assert.equal(ui.alerts.at(-1)[0], 'Verifique seu e-mail');
  await ui.button('Permissões do dispositivo').props.onPress();
  assert.equal(calls.at(-1), 'settings');
  ui.button('Ajuda e Suporte').props.onPress(); assert.equal(calls.at(-1), 'AjudaSuporte');
});

test('editar perfil carrega e salva nome sem substituir upload de foto', async () => {
  const saved = [];
  const ui = renderScreen(options, 'EditarPerfilScreen', { navigation: { goBack: () => saved.push('back') } }, {
    [contextKey]: { useAuth: () => ({ user }) }, [serviceKey]: { createProfileService: () => ({
      getEditableProfile: async () => ({ nome: 'Maria' }), updateName: async nome => saved.push(nome),
    }) }, '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { supportReport },
  });
  await ui.settle();
  assert.equal(ui.nodes().find(n => n.type === 'TextInput').props.value, 'Maria');
  ui.nodes().find(n => n.type === 'TextInput').props.onChangeText('Maria Silva'); ui.render();
  await ui.button('Salvar nome').props.onPress();
  assert.deepEqual(saved, ['Maria Silva']);
  ui.alerts.at(-1)[2][0].onPress(); assert.equal(saved.at(-1), 'back');
});

test('avaliacoes tem estado vazio, dados reais e acesso aos detalhes', async () => {
  let rows = [];
  const open = [];
  const dependencies = { [contextKey]: { useAuth: () => ({ user }) },
    [serviceKey]: { createProfileService: () => ({ getMyReviews: async () => rows }) },
    '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { supportReport } };
  const empty = renderScreen(options, 'MinhasAvaliacoesScreen', { navigation: {} }, dependencies);
  await empty.settle(); assert.ok(empty.text().includes('ainda não tem avaliações'));
  rows = [{ id_avaliacao: 1, id_local: 8, nota: 5, comentario: 'Bom local' }];
  const ui = renderScreen(options, 'MinhasAvaliacoesScreen', { navigation: { navigate: (...args) => open.push(args) } }, dependencies);
  await ui.settle(); assert.ok(ui.text().includes('Bom local'));
  ui.button('Ver estabelecimento').props.onPress();
  assert.equal(open[0][0], 'DetalhesLocal'); assert.equal(open[0][1].idLocal, 8);
});

test('termos e privacidade sao rascunhos sem aceite; rotas estao registradas', () => {
  for (const name of ['TermosUsoScreen', 'PrivacidadeScreen']) {
    const ui = renderScreen(options, name, { navigation: {} }, {
      [contextKey]: {}, [serviceKey]: { createProfileService: () => ({}) }, '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { supportReport },
    });
    assert.ok(ui.text().includes('RASCUNHO'));
    assert.ok(ui.text().includes('pendente de revisão e aprovação'));
  }
  const source = fs.readFileSync(new URL('../src/utils/navigation.js', import.meta.url), 'utf8');
  for (const route of ['EditarPerfil', 'Configuracoes', 'AjudaSuporte', 'MinhasAvaliacoes', 'TermosUso', 'Privacidade']) {
    assert.ok(source.includes(`name="${route}"`));
  }
});
