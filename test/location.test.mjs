import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as responsive from '../src/utils/responsive.js';
import { createRequire } from 'node:module';
import { supabase } from '../src/services/supabase.js';
import { parceiroService } from '../src/services/parceiroService.js';
import { localEditPayload } from '../src/utils/partnership.js';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

test('localizacao: valida entradas antes da RPC e preserva whitelist', async () => {
  supabase.rpc = () => { throw Error('RPC indevida'); };
  for (const pair of [[null, 0], ['', 0], [false, 0], [91, 0], [0, -181], [NaN, 0], [Infinity, 0]]) {
    await assert.rejects(parceiroService.atualizarCoordenadasLocal(1, ...pair));
  }
  for (const id of [null, '', false, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(parceiroService.atualizarCoordenadasLocal(id, 0, 0));
  }
  assert.throws(() => localEditPayload({ latitude: 1, longitude: 2 }));
  assert.throws(() => localEditPayload({ id_proprietario: 'terceiro' }));
});

test('localizacao: contrato numerico, resposta objeto/lista e falhas sem fallback', async () => {
  for (const asArray of [false, true]) {
    supabase.rpc = async (name, params) => {
      assert.equal(name, 'atualizar_localizacao_parceiro');
      assert.deepEqual(params, { p_id_local: 10, p_latitude: 0, p_longitude: -47.9 });
      const row = { id_local: 10, latitude: '0', longitude: '-47.9' };
      return { data: asArray ? [row] : row, error: null };
    };
    assert.equal((await parceiroService.atualizarCoordenadasLocal('10', '0', '-47.9')).latitude, 0);
  }
  supabase.rpc = async () => ({ error: { message: 'Acesso negado' } });
  await assert.rejects(parceiroService.atualizarCoordenadasLocal(10, 0, 0), /Acesso negado/);
  for (const data of [null, [], {}, { id_local: 11, latitude: 0, longitude: 0 }, { id_local: 10, latitude: null, longitude: 0 }]) {
    supabase.rpc = async () => ({ data, error: null });
    await assert.rejects(parceiroService.atualizarCoordenadasLocal(10, 0, 0), /confirmou/);
  }
});

// Harness de hooks e elementos para executar handlers sem runtime nativo.
// Nao substitui a verificacao de WebView/GPS no dispositivo.
function mount(file, name, props, overrides = {}) {
  const slots = [], alerts = [];
  let index = 0, effects = [], tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const native = new Proxy({ useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }), StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } }, { get: (o, k) => o[k] || k });
  const modules = { '../components/KeyboardForm': { KeyboardViewport: 'KeyboardViewport', KeyboardAwareScrollView: 'ScrollView' }, '../utils/responsive': responsive, react: React, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@expo/vector-icons': { Ionicons: 'Ionicons', Feather: 'Feather' }, 'react-native-webview': { WebView: 'WebView' }, ...overrides };
  const code = babel.transformSync(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => { if (!(key in modules)) throw Error(`Import inesperado: ${key}`); return modules[key]; }, console });
  function render() { index = 0; tree = exports[name](props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; }
  function walk(node) { return node && typeof node === 'object' ? [node, ...node.children.flatMap(n => walk(n))] : []; }
  render();
  return { render, nodes: () => walk(tree), alerts, async settle() { await new Promise(resolve => setImmediate(resolve)); render(); } };
}

test('tela: renderiza, seleciona somente local proprio e executa handlers no escopo correto', async () => {
  const saved = [];
  const service = {
    getLocaisDoParceiro: async () => [{ id_local: 1, nome: 'Meu local' }],
    getLocalComDetalhes: async id => ({ id_local: id, nome: 'Meu local', horarios: [], eventos: [{ id_evento: 3 }] }),
    atualizarCoordenadasLocal: async (...args) => { saved.push(args); return { latitude: -15, longitude: -47 }; },
    removerEvento: async () => {}, updateLocal: async () => {}, salvarHorarios: async () => {},
  };
  const ui = mount('../src/screens/EditarLocaisScreen.js', 'EditarLocaisScreen', { route: { params: { local: { id_local: 999 } } } }, {
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'parceiro' } }) },
    '../services/parceiroService': { parceiroService: service },
    '../components/LocalizacaoEstabelecimento': { LocalizacaoEstabelecimento: 'Localizacao' },
  });
  await ui.settle();
  let location = ui.nodes().find(n => n.type === 'Localizacao');
  assert.equal(location.props.local.id_local, 1);
  await location.props.onSalvar(-15, -47);
  ui.render();
  location = ui.nodes().find(n => n.type === 'Localizacao');
  assert.equal(location.props.local.latitude, -15);
  assert.deepEqual(saved, [[1, -15, -47]]);
  const buttons = ui.nodes().filter(n => n.type === 'TouchableOpacity');
  assert.ok(buttons.every(n => !n.props.onPress || typeof n.props.onPress === 'function'));
});

test('componente: restaura ponto salvo, exige confirmacao e invalida ao mover marcador', async () => {
  const saved = [];
  const ui = mount('../src/components/LocalizacaoEstabelecimento.js', 'LocalizacaoEstabelecimento', {
    local: { id_local: 1, latitude: '-15', longitude: '-47' }, onSalvar: async (...args) => saved.push(args),
  }, { 'expo-location': {} });
  ui.render();
  const save = () => ui.nodes().filter(n => n.type === 'TouchableOpacity').at(-1);
  assert.equal(save().props.disabled, true);
  ui.nodes().filter(n => n.type === 'TouchableOpacity').at(-2).props.onPress();
  ui.render();
  assert.equal(save().props.disabled, false);
  await save().props.onPress();
  assert.deepEqual(saved, [[-15, -47]]);
  const web = ui.nodes().find(n => n.type === 'WebView');
  web.props.onMessage({ nativeEvent: { data: JSON.stringify({ tipo: 'POSICAO_SELECIONADA', latitude: -16, longitude: -48 }) } });
  ui.render();
  assert.equal(save().props.disabled, true);
  assert.ok(web.props.source.html.includes("map.on('click'"));
  assert.ok(web.props.source.html.includes("marcador.on('dragend'"));
  for (const [, script] of web.props.source.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
});

test('componente: permissao negada e endereco nao encontrado nao salvam ponto', async () => {
  let gps = 0, found = [], status = 'denied';
  const location = { requestForegroundPermissionsAsync: async () => ({ status }), getCurrentPositionAsync: async () => { gps++; }, geocodeAsync: async () => found };
  const ui = mount('../src/components/LocalizacaoEstabelecimento.js', 'LocalizacaoEstabelecimento', {
    local: { id_local: 1 }, endereco: 'Rua A', cidadeUf: 'Brasilia DF', onSalvar: async () => assert.fail('Salvamento indevido'),
  }, { 'expo-location': location });
  const buttons = () => ui.nodes().filter(n => n.type === 'TouchableOpacity');
  await buttons()[1].props.onPress();
  assert.equal(gps, 0);
  assert.equal(ui.alerts.at(-1)[0], 'Permissão necessária');
  status = 'granted';
  await buttons()[0].props.onPress();
  assert.equal(ui.alerts.at(-1)[0], 'Endereço não encontrado');
  found = [{ latitude: -15, longitude: -47 }];
  await buttons()[0].props.onPress();
  ui.render();
  assert.equal(buttons().at(-1).props.disabled, true);
});

test('componente: GPS retorna ponto, conexao falha e erro do servidor mantem fluxo recuperavel', async () => {
  let failGps = false, failSave = true;
  const ui = mount('../src/components/LocalizacaoEstabelecimento.js', 'LocalizacaoEstabelecimento', {
    local: { id_local: 1 }, onSalvar: async () => { if (failSave) throw Error('Servidor indisponivel'); },
  }, { 'expo-location': {
    Accuracy: { High: 4 }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getCurrentPositionAsync: async () => { if (failGps) throw Error('Offline'); return { coords: { latitude: 0, longitude: 0 } }; },
  } });
  const buttons = () => ui.nodes().filter(n => n.type === 'TouchableOpacity');
  await buttons()[1].props.onPress();
  ui.render();
  buttons().at(-2).props.onPress();
  ui.render();
  assert.equal(buttons().at(-1).props.disabled, false);
  await buttons().at(-1).props.onPress();
  assert.equal(ui.alerts.at(-1)[0], 'Erro ao salvar localização');
  failSave = false;
  await buttons().at(-1).props.onPress();
  assert.equal(ui.alerts.at(-1)[0], 'Localização salva!');
  failGps = true;
  await buttons()[1].props.onPress();
  assert.equal(ui.alerts.at(-1)[0], 'GPS indisponível');
  ui.render();
  assert.equal(buttons()[1].props.disabled, false);
});

test('tela: respostas antigas de detalhes nao sobrescrevem selecao recente', async () => {
  let resolveOld;
  const service = {
    getLocaisDoParceiro: async () => [{ id_local: 1 }, { id_local: 2 }, { id_local: 3 }],
    getLocalComDetalhes: id => id === 2 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ id_local: id }),
  };
  const ui = mount('../src/screens/EditarLocaisScreen.js', 'EditarLocaisScreen', {}, {
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'parceiro' } }) },
    '../services/parceiroService': { parceiroService: service },
    '../components/LocalizacaoEstabelecimento': { LocalizacaoEstabelecimento: 'Localizacao' },
  });
  await ui.settle();
  const selectors = ui.nodes().filter(n => n.type === 'TouchableOpacity').slice(1, 4);
  selectors[1].props.onPress();
  selectors[2].props.onPress();
  await ui.settle();
  resolveOld({ id_local: 2 });
  await ui.settle();
  assert.equal(ui.nodes().find(n => n.type === 'Localizacao').props.local.id_local, 3);
});
