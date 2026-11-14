import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';
import { profileDisplayName } from '../src/utils/profile.js';

// Integracao offline dos commits da equipe com os fluxos locais preservados.
test('sync: Perfil conserva favoritos, saldo e entrada para os novos roles', async () => {
  const opened = [], updates = [];
  const ui = renderScreen(new URL('../src/screens/PerfilScreen.js', import.meta.url), 'PerfilScreen',
    { navigation: { navigate: route => opened.push(route) } }, {
      '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'fixture' } }) },
      '../services/profileService.js': { createProfileService: () => ({
        getEditableProfile: async () => ({ id_usuario: 'fixture', nome: 'Conta de teste', saldo: 125.5 }),
      }) },
      '../services/favoritosService': { favoritosService: { getLocaisFavoritos: async () => [{}, {}] } },
      '../services/userService.js': { getContagemAvaliacoesUsuario: async () => 3 },
      '../utils/profile.js': { profileDisplayName },
      '../services/supabase.js': { supabase: { from(table) {
        assert.equal(table, 'usuarios');
        return { update(payload) { return { eq: async (key, id) => {
          assert.equal(key, 'id_usuario'); assert.equal(id, 'fixture'); updates.push(payload); return {};
        } }; } };
      } } },
      'expo-image-picker': {}, 'expo-file-system/legacy': {},
    });
  await ui.settle();
  assert.match(ui.text(), /R\$ 125,50/);
  assert.ok(ui.nodes().some(n => n.props.accessibilityLabel === '2 locais favoritos'));
  ui.button('Meus rolês').props.onPress(); assert.equal(opened.at(-1), 'RolesScreen');
  ui.nodes().find(n => n.type === 'TouchableOpacity' && n.children.some(child => child?.children?.includes('Rolês que quero visitar')))
    .props.onPress(); assert.equal(opened.at(-1), 'Favoritos');
  ui.button('Adicionar').props.onPress(); ui.render();
  ui.nodes().find(n => n.type === 'TextInput' && n.props.keyboardType === 'numeric').props.onChangeText('10,50'); ui.render();
  await ui.button('Confirmar').props.onPress(); ui.render();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].saldo, 136);
  assert.match(ui.text(), /R\$ 136,00/);
});

async function campaignFixture(visible) {
  const calls = [], place = { id_local: 8, nome: 'Fixture offline', visivel: visible };
  const ui = renderScreen(new URL('../src/screens/ImpulsionarScreen.js', import.meta.url), 'ImpulsionarScreen',
    { navigation: {}, route: { params: { local: place } } }, {
      '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'fixture' } }) },
      '../services/parceiroService': { parceiroService: {
        getLocaisDoParceiro: async () => [place], getCampanhas: async () => [],
        listarOfertasCampanha: async () => [{ tipo: 'destaque', duracao_dias: 7, valor_total: 0 }],
        criarCampanha: async payload => { calls.push(payload); return payload; },
      } },
    });
  await ui.settle(); await ui.settle();
  return { ui, calls };
}

test('sync: local oculto continua bloqueado para impulsionamento, inclusive no handler', async () => {
  const { ui, calls } = await campaignFixture(false);
  const button = ui.button('Local indisponível para campanha');
  assert.equal(button.props.disabled, true);
  await button.props.onPress();
  assert.equal(calls.length, 0);
  assert.equal(ui.alerts.at(-1)[0], 'Local oculto');
});

test('sync: local visivel valida titulo vazio e permite enviar o formulario preenchido', async () => {
  const { ui, calls } = await campaignFixture(true);
  await ui.button('Solicitar campanha').props.onPress();
  assert.equal(calls.length, 0);
  assert.equal(ui.alerts.at(-1)[0], 'Atenção');
  const fields = ui.nodes().filter(n => n.type === 'TextInput');
  fields[0].props.onChangeText('Campanha de teste'); fields[1].props.onChangeText('Mensagem de teste'); ui.render();
  await ui.button('Solicitar campanha').props.onPress();
  assert.equal(calls.length, 1); assert.equal(calls[0].idLocal, 8);
});

test('sync: nova aba de roles usa rotulo legivel e navega mantendo o menu existente', () => {
  const opened = [];
  const routes = ['Home', 'Favoritos', 'RolesScreen', 'Mapa', 'Perfil', 'MeusLugares']
    .map(name => ({ name, key: name }));
  const ui = renderScreen(new URL('../src/components/CustomTabBar.js', import.meta.url), 'CustomTabBar', {
    state: { index: 0, routes }, descriptors: {},
    navigation: { emit: () => ({}), navigate: name => opened.push(name) },
  }, {
    '../utils/theme': { colors: { white: '#fff', primary: '#211C4D' }, spacing: { md: 12 }, radius: { pill: 999 } },
    'expo-blur': { BlurView: 'BlurView' },
    '@react-navigation/bottom-tabs': { BottomTabBarHeightCallbackContext: { value: null } },
  });
  const roleTab = ui.button('Rolês'); assert.ok(roleTab);
  roleTab.props.onPress(); assert.equal(opened.at(-1), 'RolesScreen');
  for (const name of ['Início', 'Favoritos', 'Mapa', 'Perfil', 'Lugares']) assert.ok(ui.button(name));
});
