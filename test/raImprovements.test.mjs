import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';
import { profileDisplayName } from '../src/utils/profile.js';

const authInput = new URL('../src/components/AuthInput.js', import.meta.url);
const profile = new URL('../src/screens/PerfilScreen.js', import.meta.url);
const details = new URL('../src/screens/DetalhesLocalScreen.js', import.meta.url);

test('RA-01: senha começa oculta, alterna sem mudar valor ou disparar edição e volta a ocultar', () => {
  const changes = [];
  const ui = renderScreen(authInput, 'AuthInput', {
    label: 'Senha', secureTextEntry: true, value: 'Senha!123', onChangeText: value => changes.push(value),
  });
  const input = () => ui.nodes().find(n => n.type === 'TextInput');
  const toggle = () => ui.nodes().find(n => n.props.accessibilityRole === 'button');
  assert.equal(input().props.secureTextEntry, true);
  assert.equal(toggle().props.accessibilityLabel, 'Mostrar senha: Senha');
  toggle().props.onPress(); ui.render();
  assert.equal(input().props.secureTextEntry, false);
  assert.equal(input().props.value, 'Senha!123');
  assert.equal(toggle().props.accessibilityLabel, 'Ocultar senha: Senha');
  assert.equal(ui.nodes().find(n => n.type === 'Feather').props.name, 'eye-off');
  toggle().props.onPress(); ui.render();
  assert.equal(input().props.secureTextEntry, true);
  assert.deepEqual(changes, []);
});

test('RA-01: campo comum não ganha olho e confirmação mantém visibilidade independente', () => {
  const email = renderScreen(authInput, 'AuthInput', { label: 'Email', value: 'pessoa@exemplo.com' });
  assert.equal(email.nodes().filter(n => n.type === 'TouchableOpacity').length, 0);
  const password = renderScreen(authInput, 'AuthInput', { secureTextEntry: true });
  const confirmation = renderScreen(authInput, 'AuthInput', { label: 'Confirmar Nova Senha', secureTextEntry: true });
  password.nodes().find(n => n.type === 'TouchableOpacity').props.onPress(); password.render();
  assert.equal(password.nodes().find(n => n.type === 'TextInput').props.secureTextEntry, false);
  assert.equal(confirmation.nodes().find(n => n.type === 'TextInput').props.secureTextEntry, true);
});

for (const width of [360, 800]) {
  test(`RA-06: detalhes em ${width}px preservam cartão de localização e navegação, sem link redundante`, async () => {
    const links = [];
    const ui = renderScreen(details, 'DetalhesLocalScreen', {
      route: { params: { idLocal: 'demo-local', local: { id_local: 'demo-local', nome: 'Local', endereco: 'Rua A', bairro: 'Centro' } } },
      navigation: { goBack() {} },
    }, {
      '../contexts/AuthContext': { useAuth: () => ({ user: null }) },
      '../services/locaisService': { locaisService: {} },
      '../services/supabase': { supabase: {} },
      '../services/parceiroService': { parceiroService: {} },
    }, { useWindowDimensions: () => ({ width }), Linking: { openURL: async url => links.push(url) } });
    assert.doesNotMatch(ui.text(), /Abrir no Mapa/i);
    assert.match(ui.text(), /Localização/);
    const map = ui.nodes().find(n => n.props.accessibilityLabel === 'Visualizar localização no mapa');
    assert.ok(map);
    assert.ok(ui.nodes().some(n => n.type === 'Feather' && n.props.name === 'map-pin'));
    await map.props.onPress();
    assert.equal(links[0], 'https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%20Centro');
  });
}

function profileFixture(loader) {
  let user = { id: 'conta-a' }, focus, cleanup;
  const calls = [];
  const ui = renderScreen(profile, 'PerfilScreen', { navigation: { navigate: route => calls.push(route) } }, {
    '@react-navigation/native': { useFocusEffect: callback => { focus = callback; } },
    '../contexts/AuthContext': { useAuth: () => ({ user }) },
    '../services/profileService.js': { createProfileService: () => ({ getEditableProfile: async () => null }) },
    '../services/supabase.js': { supabase: {} },
    '../utils/profile.js': { profileDisplayName },
    '../services/userService.js': { getContagemAvaliacoesUsuario: async () => 0 },
    '../services/favoritosService': { favoritosService: { getLocaisFavoritos: async id => { calls.push(id); return loader(id); } } },
    'expo-image-picker': {}, 'expo-file-system/legacy': {},
  });
  return {
    ui, calls,
    focus() { cleanup?.(); cleanup = focus(); ui.render(); },
    blur() { cleanup?.(); cleanup = null; },
    user(next) { user = next; ui.render(); },
    counter() { return ui.nodes().find(n => n.props.accessibilityLiveRegion === 'polite'); },
  };
}

test('RA-08: quantidade real é recarregada ao voltar após adicionar/remover, inclusive zero', async () => {
  let rows = [{ id_local: 1 }, { id_local: 2 }];
  const f = profileFixture(() => rows);
  f.focus();
  assert.equal(f.counter().props.accessibilityLabel, 'Carregando favoritos');
  await f.ui.settle();
  assert.equal(f.counter().children.join(''), '2');
  f.ui.button('Rolês que quero visitar2').props.onPress();
  assert.equal(f.calls.at(-1), 'Favoritos');
  rows = [...rows, { id_local: 3 }]; f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '3');
  rows = []; f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '0');
  assert.ok(f.calls.filter(c => c === 'conta-a').length >= 3);
});

test('RA-08: falha não é mostrada como zero e novo foco recupera a contagem', async () => {
  let fail = true;
  const f = profileFixture(() => { if (fail) throw Error('Offline'); return []; });
  f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), 'Indisponível');
  fail = false; f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '0');
});

test('RA-08: resposta tardia de outro foco/usuário é ignorada, logout limpa a contagem', async () => {
  let finish;
  const f = profileFixture(id => id === 'conta-a' ? new Promise(resolve => { finish = resolve; }) : [{ id_local: 9 }]);
  f.focus(); f.blur(); f.user({ id: 'conta-b' });
  assert.equal(f.counter().props.accessibilityLabel, 'Carregando favoritos');
  f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '1');
  assert.equal(f.counter().props.accessibilityLabel, '1 local favorito');
  finish([{ id_local: 1 }, { id_local: 2 }]); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '1');
  f.blur(); f.user(null); f.focus(); await f.ui.settle();
  assert.equal(f.counter().children.join(''), '0');
});
