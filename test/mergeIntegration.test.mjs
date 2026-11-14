import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import semver from 'semver';
import { renderScreen } from './helpers/render-screen.mjs';
import { profileDisplayName } from '../src/utils/profile.js';

const details = {
  id_local: 8, nome: 'Local', descricao: 'Descricao', telefone: '61999990000',
  faixa_preco: '$', endereco: 'Rua A', bairro: 'Centro', cidade_uf: 'Brasilia DF', visivel: true,
  horarios: [{ dia_semana: 1, abre: '08:00', fecha: '18:00', fechado: false }],
  eventos: [{ id_evento: 5, titulo: 'Evento' }],
};
async function localScreen(overrides = {}, local = details) {
  const calls = [];
  const service = {
    getLocaisDoParceiro: async () => [{ id_local: 8, nome: 'Local' }, { id_local: 9, nome: 'Outro' }],
    getLocalComDetalhes: async id => { calls.push(['load', id]); return { ...local, id_local: id }; },
    updateLocal: async (id, payload) => { calls.push(['update', id, payload]); return { id_local: id, ...payload }; },
    atualizarCoordenadasLocal: async (...args) => { calls.push(['coords', ...args]); return { latitude: -15, longitude: -47 }; },
    salvarHorarios: async (...args) => calls.push(['hours', ...args]),
    removerEvento: async id => calls.push(['event', id]),
    ...overrides,
  };
  const ui = renderScreen(new URL('../src/screens/EditarLocaisScreen.js', import.meta.url), 'EditarLocaisScreen',
    { navigation: {} }, {
      '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'parceiro' } }) },
      '../services/parceiroService': { parceiroService: service },
      '../components/LocalizacaoEstabelecimento': { LocalizacaoEstabelecimento: 'Location' },
    });
  await ui.settle();
  return { ui, calls, location: () => ui.nodes().find(n => n.type === 'Location'),
    visibility: () => ui.nodes().find(n => n.type === 'Switch') };
}

test('merge: formulario incompleto bloqueia publicacao mas permite coordenadas e eventos', async () => {
  const { ui, calls, location, visibility } = await localScreen({}, { ...details, descricao: '' });
  assert.equal(ui.button('Tudo publicado').props.disabled, true);
  await ui.button('Tudo publicado').props.onPress();
  await visibility().props.onValueChange(true);
  assert.equal(calls.filter(c => c[0] === 'update' || c[0] === 'hours').length, 0);
  await location().props.onSalvar(-15, -47);
  assert.equal(calls.filter(c => c[0] === 'coords').length, 1);
  const remove = ui.nodes().find(n => n.type === 'TouchableOpacity' && n.props.style?.padding === 6);
  await remove.props.onPress(); ui.render();
  assert.ok(calls.some(c => c[0] === 'event' && c[1] === 5));
  assert.ok(!ui.nodes().some(n => n.type === 'Text' && n.children.includes('Evento')));
});

test('merge: dados gerais, visibilidade e coordenadas usam payloads independentes', async () => {
  const { ui, calls, location, visibility } = await localScreen();
  await ui.button('Tudo publicado').props.onPress();
  const payload = calls.find(c => c[0] === 'update')[2];
  assert.deepEqual(Object.keys(payload).sort(), ['bairro', 'cidade_uf', 'descricao', 'endereco', 'faixa_preco', 'nome', 'telefone']);
  assert.ok(calls.some(c => c[0] === 'hours'));
  assert.ok(!calls.some(c => c[0] === 'coords'));
  await visibility().props.onValueChange(false); ui.render();
  assert.equal(JSON.stringify(calls.filter(c => c[0] === 'update').at(-1)[2]), '{"visivel":false}');
  assert.equal(location().props.local.visivel, false);
  await location().props.onSalvar(-15, -47); ui.render();
  assert.equal(location().props.local.latitude, -15);
  assert.equal(calls.filter(c => c[0] === 'update').length, 2);
});

test('merge: validacao exige os campos e horarios ativos definidos na main', async () => {
  for (const placeholder of ['Nome do estabelecimento', 'Descrição do estabelecimento', 'Ex: Bar, Lanchonete', '(00) 00000-0000', 'Rua, número', 'Nome do bairro', 'Cidade, UF']) {
    const { ui, calls } = await localScreen();
    const field = ui.nodes().find(n => n.type === 'TextInput' && n.props.placeholder === placeholder);
    field.props.onChangeText(''); ui.render();
    await ui.button('Tudo publicado').props.onPress();
    assert.equal(calls.filter(c => c[0] === 'update').length, 0, placeholder);
  }
  const { ui, calls } = await localScreen({}, { ...details, horarios: Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, fechado: true })) });
  await ui.button('Tudo publicado').props.onPress();
  assert.equal(calls.filter(c => c[0] === 'update').length, 0);
});

test('merge: coordenadas em andamento bloqueiam troca de local e outras escritas; erro de visibilidade reverte estado', async () => {
  let finish;
  const { ui, calls, location, visibility } = await localScreen({
    atualizarCoordenadasLocal: () => new Promise(resolve => { finish = resolve; }),
    updateLocal: async () => { throw Error('Falha de teste'); },
  });
  const pending = location().props.onSalvar(-15, -47);
  ui.button('Outro').props.onPress();
  await ui.button('Tudo publicado').props.onPress();
  await visibility().props.onValueChange(false);
  assert.equal(calls.filter(c => c[0] === 'load').length, 1);
  assert.equal(ui.alerts.length, 0);
  finish({ latitude: -15, longitude: -47 }); await pending; ui.render();
  await visibility().props.onValueChange(false); ui.render();
  assert.equal(visibility().props.value, true);
  assert.equal(location().props.local.id_local, 8);
  assert.equal(ui.alerts.at(-1)[0], 'Erro');
});

for (const mode of ['success', 'denied', 'cancelled', 'error']) {
  test(`merge: captura de foto pela camera preserva upload e trata ${mode}`, async () => {
    const uploads = [];
    const ui = renderScreen(new URL('../src/screens/PerfilScreen.js', import.meta.url), 'PerfilScreen', {}, {
      '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'conta' } }) },
      '../services/profileService.js': { createProfileService: () => ({ getEditableProfile: async () => null }) },
      '../services/supabase.js': { supabase: {} }, '../utils/profile.js': { profileDisplayName },
      '../services/favoritosService': { favoritosService: { getLocaisFavoritos: async () => [] } },
      '../services/userService.js': { getContagemAvaliacoesUsuario: async () => 0, uploadUserAvatar: async (...args) => { uploads.push(args); return 'https://exemplo.com/avatar.jpg'; } },
      'expo-file-system/legacy': { getInfoAsync: async () => ({ exists: true, size: 100 }) },
      'expo-image-picker': {
        requestCameraPermissionsAsync: async () => ({ status: mode === 'denied' ? 'denied' : 'granted' }),
        launchCameraAsync: async () => { if (mode === 'error') throw Error('Camera indisponivel'); return { canceled: mode === 'cancelled', assets: [{ uri: 'camera.jpg' }] }; },
      },
    });
    await ui.settle();
    ui.nodes().find(n => n.props.accessibilityLabel === 'Alterar foto do perfil').props.onPress();
    await ui.alerts.at(-1)[2].find(option => option.text === 'Tirar foto').onPress();
    assert.equal(uploads.length, mode === 'success' ? 1 : 0);
    if (mode === 'success') assert.deepEqual(uploads[0], ['conta', 'camera.jpg']);
    if (mode === 'denied') assert.equal(ui.alerts.at(-1)[0], 'Permissão necessária');
    if (mode === 'error') assert.equal(ui.alerts.at(-1)[0], 'Imagem indisponível');
  });
}

test('merge: favoritos abrem detalhes e metrica nao bloqueia navegacao', async () => {
  const opened = [];
  const ui = renderScreen(new URL('../src/screens/FavoritosScreen.js', import.meta.url), 'FavoritosScreen',
    { navigation: { navigate: (...args) => opened.push(args) } }, {
      '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'conta' } }) },
      '../components/MainLayout': { MainLayout: 'MainLayout' },
      '../services/favoritosService': { favoritosService: { getLocaisFavoritos: async () => [details] } },
      '../services/categoriasService': { categoriasService: { getCategorias: async () => [] } },
      '../utils/homeFilters': await import('../src/utils/homeFilters.js'),
      '../services/parceiroService': { parceiroService: { registrarMetrica: async () => { throw Error('Sem rede'); } } },
    });
  await ui.settle();
  const list = ui.nodes().find(n => n.type === 'FlatList');
  const item = list.props.renderItem({ item: details });
  function find(node) { return node?.type === 'TouchableOpacity' && node.props.style?.backgroundColor === '#1E1B4B' ? node : node?.children?.map(find).find(Boolean); }
  find(item).props.onPress();
  assert.equal(opened[0][0], 'DetalhesLocal'); assert.equal(opened[0][1].idLocal, 8);
});

test('merge: configuracoes JSON e lockfile concordam; mapa mantem coordenadas e atribuicao', () => {
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const app = JSON.parse(read('app.json')).expo;
  const eas = JSON.parse(read('eas.json'));
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  const expoVersion = lock.packages['node_modules/expo'].version;
  assert.ok(semver.satisfies(expoVersion, pkg.dependencies.expo),
    `Expo ${expoVersion} no lockfile deve satisfazer ${pkg.dependencies.expo} do package.json`);
  assert.equal(app.scheme, 'roleapp'); assert.ok(app.plugins.some(p => Array.isArray(p) && p[0] === 'expo-location'));
  assert.equal(eas.build.preview.distribution, 'internal'); assert.equal(eas.build.production.autoIncrement, true);
  const map = read('src/screens/MapaScreen.js');
  assert.ok(map.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(map.includes('OpenStreetMap contributors'));
  assert.ok(map.includes('L.marker(')); assert.ok(map.includes('l.latitude')); assert.ok(map.includes('l.longitude'));
});
