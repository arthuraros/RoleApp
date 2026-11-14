import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HOME_CATEGORIES, resolveHomeCategory, filterHomePlaces } from '../src/utils/homeFilters.js';
import { categoriasService } from '../src/services/categoriasService.js';
import { supabase } from '../src/services/supabase.js';
import { renderScreen } from './helpers/render-screen.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('./fixtures/homeCategories.real.json', import.meta.url), 'utf8'));
const homeFile = new URL('../src/screens/HomeScreen.js', import.meta.url);
const linksFor = ids => snapshot.links.filter(link => ids.map(String).includes(String(link.id_categoria))).map(link => link.id_local);
const idsOf = rows => Array.from(rows, row => row.id_local);
const walk = node => node && typeof node === 'object' ? [node, ...(node.children ?? []).flatMap(walk)] : [];

test('RA-03: seis nomes reais correspondem ao catálogo; IDs visuais não são IDs do banco', () => {
  for (const visual of HOME_CATEGORIES.filter(item => snapshot.categories.some(row => row.nome === item.name))) {
    const real = snapshot.categories.find(category => category.nome === visual.name);
    assert.equal(resolveHomeCategory(visual.id, snapshot.categories).databaseId, real.id_categoria);
    const changedIds = snapshot.categories.map(category => ({ ...category, id_categoria: `db-${category.id_categoria}` }));
    assert.equal(resolveHomeCategory(visual.id, changedIds).databaseId, `db-${real.id_categoria}`);
  }
  assert.equal(resolveHomeCategory('5', [{ id_categoria: 90, nome: '  CAFES ' }]).databaseId, 90);
  assert.equal(resolveHomeCategory('1', [{ id_categoria: 1, nome: 'Outra categoria' }]).status, 'missing');
  assert.equal(resolveHomeCategory('5', [...snapshot.categories, { id_categoria: 90, nome: 'Cafes' }]).status, 'ambiguous');
});

test('RA-03: dados reais respeitam vínculos e visibilidade, inclusive categorias sem locais públicos', () => {
  const expected = { '1': [4], '2': [], '3': [2], '4': [3], '5': [], '6': [] };
  for (const category of HOME_CATEGORIES.filter(item => item.id in expected)) {
    const mapped = resolveHomeCategory(category.id, snapshot.categories);
    assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { pigPlaceIds: linksFor([mapped.databaseId]) })), expected[category.id]);
  }
});

test('RA-03: busca, preço, distância e grupos de categorias são combinados por interseção', () => {
  const options = { pigPlaceIds: [4], advancedPlaceIds: [4, 3], search: '  cerrado ', price: 45,
    distance: 1, location: { lat: -15.835, lng: -48.056 } };
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, options)), [4]);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { ...options, search: 'hambúrguer' })), []);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { ...options, price: 44 })), []);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { ...options, location: { lat: -15.744, lng: -47.882 } })), []);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { ...options, advancedPlaceIds: [3] })), []);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { distance: 1, location: null })), []);
  assert.deepEqual(idsOf(filterHomePlaces(snapshot.places, { search: 'BRASILIA', price: 15 })), [2]);
});

test('RA-03: categoriasService consulta as tabelas corretas, deduplica vínculos e propaga erros', async () => {
  const original = supabase.from;
  const calls = [];
  try {
    supabase.from = table => ({ select: fields => {
      calls.push([table, fields]);
      return { order: async () => ({ data: snapshot.categories, error: null }),
        in: async (column, ids) => { calls.push([column, ids]); return { data: [{ id_local: 4 }, { id_local: 4 }], error: null }; } };
    } });
    assert.equal((await categoriasService.getCategorias()).length, 6);
    assert.deepEqual(await categoriasService.getLocaisIdsPorCategorias([1]), [4]);
    assert.deepEqual(calls, [['categorias', '*'], ['local_categorias', 'id_local'], ['id_categoria', [1]]]);
    supabase.from = () => { throw Error('Não deve consultar para seleção vazia'); };
    assert.deepEqual(await categoriasService.getLocaisIdsPorCategorias([]), []);
    supabase.from = () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'Sem acesso' } }),
      order: async () => ({ data: null, error: { message: 'Sem acesso' } }) }) });
    await assert.rejects(categoriasService.getCategorias(), /Sem acesso/);
    await assert.rejects(categoriasService.getLocaisIdsPorCategorias([1]), /Sem acesso/);
    supabase.from = () => ({ select: () => ({ in: async () => ({ data: null, error: null }), order: async () => ({ data: null, error: null }) }) });
    assert.deepEqual(await categoriasService.getCategorias(), []);
    assert.deepEqual(await categoriasService.getLocaisIdsPorCategorias([1]), []);
  } finally { supabase.from = original; }
});

function homeFixture(options = {}) {
  const calls = [], navigation = [], favorites = new Set();
  const animation = { start: callback => callback?.() };
  const ui = renderScreen(homeFile, 'HomeScreen', { navigation: { navigate: (...args) => navigation.push(args) } }, {
    '../utils/homeFilters': { resolveHomeCategory, filterHomePlaces },
    '../components/MainLayout': { MainLayout: 'MainLayout' },
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'test-user' } }) },
    '../services/locaisService': { locaisService: { getLocais: options.getPlaces ?? (async () => snapshot.places) } },
    '../services/categoriasService': { categoriasService: {
      getCategorias: options.getCategories ?? (async () => snapshot.categories),
      getLocaisIdsPorCategorias: async ids => { calls.push(Array.from(ids)); return (options.getLinks ?? linksFor)(ids); },
    } },
    '../services/parceiroService': { parceiroService: { getDestaquesAtivos: async () => [], registrarMetrica: async () => {} } },
    '../services/favoritosService': { favoritosService: {
      getFavoritos: async () => [...favorites].map(id_local => ({ id_local })),
      adicionarFavorito: async (user, id) => favorites.add(id), removerFavorito: async (user, id) => favorites.delete(id),
    } },
    'expo-location': {
      Accuracy: { Balanced: 3 }, getForegroundPermissionsAsync: async () => ({ status: options.gpsDenied ? 'denied' : 'granted' }),
      requestForegroundPermissionsAsync: async () => ({ status: options.gpsDenied ? 'denied' : 'granted' }),
      getCurrentPositionAsync: async () => ({ coords: { latitude: -15.835, longitude: -48.056 } }),
    },
  }, {
    Dimensions: { get: () => ({ width: 360, height: 800 }) },
    Animated: { Value: class { constructor(value) { this.value = value; } }, View: 'AnimatedView', timing: () => animation, parallel: () => animation },
  });
  const layout = () => ui.nodes().find(node => node.type === 'MainLayout');
  const list = () => ui.nodes().find(node => node.type === 'FlatList');
  const settle = async () => { for (let i = 0; i < 4; i++) await ui.settle(); };
  return { ui, calls, navigation, favorites, layout, list, settle, ids: () => idsOf(list().props.data),
    async select(id) { layout().props.onSelectCategory(id); ui.render(); await settle(); },
    async search(value) { layout().props.onSearchChange(value); ui.render(); await settle(); },
    field(placeholder, value) { ui.nodes().find(node => node.type === 'TextInput' && node.props.placeholder === placeholder).props.onChangeText(value); ui.render(); },
  };
}

test('RA-03 Home: selecionar, trocar, tocar novamente e limpar conservam dados reais', async () => {
  const f = homeFixture(); await f.settle();
  assert.deepEqual(f.ids(), [2, 3, 4, 8]);
  await f.select('1'); assert.deepEqual(f.ids(), [4]);
  assert.equal(f.layout().props.selectedCategory, '1'); assert.match(f.ui.text(), /Categoria: Comidas/);
  await f.select('3'); assert.deepEqual(f.ids(), [2]);
  await f.select('3'); assert.deepEqual(f.ids(), [2, 3, 4, 8]);
  await f.select('4');
  f.ui.nodes().find(node => node.props.accessibilityLabel === 'Limpar filtro de categoria').props.onPress();
  f.ui.render(); await f.settle(); assert.deepEqual(f.ids(), [2, 3, 4, 8]);
});

test('RA-03 Home: texto não remove preço, distância, porquinho ou categorias avançadas', async () => {
  const f = homeFixture(); await f.settle();
  f.ui.button('Tipo de Rolê').props.onPress(); f.ui.render();
  f.ui.button('Comidas').props.onPress(); f.ui.render();
  f.ui.button('Cinemas').props.onPress(); f.ui.render();
  f.field('00,00', '45'); f.field('000', '1');
  await f.ui.button('Aplicar Filtros').props.onPress(); f.ui.render(); await f.settle();
  assert.deepEqual(f.ids(), [4]);
  await f.select('1'); await f.search('cerrado'); assert.deepEqual(f.ids(), [4]);
  assert.equal(f.layout().props.selectedCategory, '1');
  await f.search('Cine'); assert.deepEqual(f.ids(), []);
  await f.search(''); assert.deepEqual(f.ids(), [4]);
  await f.select('4'); assert.deepEqual(f.ids(), []); // Cinema fora do raio de 1 km.
  f.ui.button('Limpar Filtros').props.onPress(); f.ui.render(); await f.settle();
  assert.deepEqual(f.ids(), [2, 3, 4, 8]);
});

test('RA-03 Home: interseção do porquinho com categorias avançadas não vira união', async () => {
  const f = homeFixture(); await f.settle();
  f.ui.button('Tipo de Rolê').props.onPress(); f.ui.render();
  f.ui.button('Cinemas').props.onPress(); f.ui.render();
  await f.ui.button('Aplicar Filtros').props.onPress(); f.ui.render(); await f.settle();
  assert.deepEqual(f.ids(), [3]);
  await f.select('1'); assert.deepEqual(f.ids(), []);
  await f.select('1'); assert.deepEqual(f.ids(), [3]);
});

test('RA-03 Home: categorias sem resultados reais mostram vazio amigável', async () => {
  const f = homeFixture(); await f.settle();
  for (const id of ['2', '5', '6']) {
    await f.select(id); assert.deepEqual(f.ids(), []);
    assert.match(f.list().props.ListEmptyComponent.children.join(''), /Nenhum local encontrado em/);
  }
});

test('RA-03 Home: seleção aguarda catálogo e consulta o ID real, mesmo diferente do visual', async () => {
  let finish;
  const f = homeFixture({ getCategories: () => new Promise(resolve => { finish = resolve; }),
    getLinks: ids => ids[0] === 'db-comidas' ? [4] : [] });
  await f.settle(); await f.select('1');
  assert.deepEqual(f.ids(), []); assert.equal(f.calls.length, 0);
  assert.ok(f.ui.nodes().some(node => node.props.accessibilityLabel === 'Carregando categoria'));
  finish(snapshot.categories.map(category => category.nome === 'Comidas' ? { ...category, id_categoria: 'db-comidas' } : category));
  await f.settle(); assert.deepEqual(f.ids(), [4]);
  assert.deepEqual(f.calls.at(-1), ['db-comidas']);
});

test('RA-03 Home: categoria ausente ou ambígua não usa ID visual nem mostra lista completa', async () => {
  for (const categories of [[], [...snapshot.categories, { id_categoria: 90, nome: 'Comidas' }]]) {
    const f = homeFixture({ getCategories: async () => categories }); await f.settle();
    await f.select('1'); assert.deepEqual(f.ids(), []);
    assert.match(f.ui.text(), /indisponível no momento/);
    assert.equal(f.calls.length, 0);
  }
});

test('RA-03 Home: falha no catálogo e nos vínculos bloqueia resultados incorretos e permite tentar novamente', async () => {
  for (const stage of ['catalog', 'links']) {
    let fail = true;
    const f = homeFixture({ getCategories: async () => { if (stage === 'catalog' && fail) throw Error('Offline'); return snapshot.categories; },
      getLinks: ids => { if (stage === 'links' && fail) throw Error('Offline'); return linksFor(ids); } });
    await f.settle(); await f.select('1');
    assert.deepEqual(f.ids(), []); assert.match(f.ui.text(), /Não foi possível carregar o filtro/);
    fail = false; f.ui.button('Tentar novamente').props.onPress(); f.ui.render(); await f.settle();
    assert.deepEqual(f.ids(), [4]);
  }
});

test('RA-03 Home: resposta antiga é ignorada ao trocar ou limpar rapidamente', async () => {
  let finish;
  const f = homeFixture({ getLinks: ids => ids[0] === 1 ? new Promise(resolve => { finish = resolve; }) : linksFor(ids) });
  await f.settle(); await f.select('1'); assert.deepEqual(f.ids(), []);
  await f.select('3'); assert.deepEqual(f.ids(), [2]);
  finish([4]); await f.settle(); assert.deepEqual(f.ids(), [2]);
  await f.select('1'); await f.select('1');
  finish([4]); await f.settle(); assert.deepEqual(f.ids(), [2, 3, 4, 8]);
});

test('RA-03 Home: falha/vazio em locais não cria estabelecimentos fictícios', async () => {
  const empty = homeFixture({ getPlaces: async () => [] }); await empty.settle(); assert.deepEqual(empty.ids(), []);
  const failure = homeFixture({ getPlaces: async () => { throw Error('Falha de teste'); } }); await failure.settle();
  assert.deepEqual(failure.ids(), []); assert.match(failure.ui.text(), /Não foi possível carregar os locais/);
});

test('RA-03 Home: GPS negado não aplica silenciosamente um filtro incompleto', async () => {
  const f = homeFixture({ gpsDenied: true }); await f.settle(); await f.select('1');
  f.field('000', '1'); await f.ui.button('Aplicar Filtros').props.onPress(); f.ui.render(); await f.settle();
  assert.equal(f.ui.alerts.at(-1)[0], 'Permissão de Localização Negada');
  assert.deepEqual(f.ids(), [4]);
});

test('RA-03 Home: favoritar e navegar nos detalhes preservam filtro selecionado', async () => {
  const f = homeFixture(); await f.settle(); await f.select('1');
  let card = walk(f.list().props.renderItem({ item: snapshot.places[2] }));
  await card.find(node => node.props.accessibilityLabel === 'Adicionar aos favoritos').props.onPress();
  await f.settle(); assert.ok(f.favorites.has(4)); assert.deepEqual(f.ids(), [4]);
  card = walk(f.list().props.renderItem({ item: snapshot.places[2] }));
  card.find(node => node.type === 'TouchableOpacity' && walk(node).some(child => child.children?.includes('Ver detalhes'))).props.onPress();
  assert.equal(f.navigation.at(-1)[0], 'DetalhesLocal'); assert.equal(f.navigation.at(-1)[1].idLocal, 4);
});

test('RA-03/09 MainLayout: seis imagens originais, nove controles acessíveis e destaque do selecionado', () => {
  const calls = [];
  const ui = renderScreen(new URL('../src/components/MainLayout.js', import.meta.url), 'MainLayout',
    { selectedCategory: '5', onSelectCategory: id => calls.push(id) }, { '../utils/homeFilters': { HOME_CATEGORIES } });
  const pigs = ui.nodes().filter(node => node.props.accessibilityLabel?.startsWith('Filtrar por '));
  assert.equal(pigs.length, 9);
  assert.equal(pigs.filter(node => node.props.accessibilityState.selected).length, 1);
  assert.equal(pigs[1].props.accessibilityState.selected, true);
  assert.deepEqual(ui.nodes().filter(node => node.type === 'Image').map(node => node.props.source),
    ['pig_food.png', 'pig_coffe.png', 'pig_party.png', 'pig_events.png', 'pig_cinema.png', 'pig_parks.png'].map(name => `../../assets/${name}`));
  pigs[0].props.onPress(); assert.deepEqual(calls, ['1']);
});

// Catálogo e vínculos abaixo são exclusivamente mocks de testes, nunca enviados ao banco.
for (const visualId of ['7', '8', '9']) {
  const visual = HOME_CATEGORIES.find(c => c.id === visualId);
  const databaseId = `test-db-${visualId}`;
  const categories = [...snapshot.categories, { id_categoria: databaseId, nome: visual.name }];

  test(`RA-09 Home: ${visual.name} seleciona, troca, desmarca e usa ID resolvido`, async () => {
    const f = homeFixture({ getCategories: async () => categories, getLinks: () => [] });
    await f.settle(); await f.select(visualId);
    assert.equal(f.layout().props.selectedCategory, visualId);
    assert.deepEqual(f.calls.at(-1), [databaseId]);
    assert.deepEqual(f.ids(), []);
    assert.match(f.list().props.ListEmptyComponent.children.join(''), new RegExp(`Nenhum local encontrado em ${visual.name}`));
    await f.select('1');
    assert.equal(f.layout().props.selectedCategory, '1');
    await f.select(visualId); await f.select(visualId);
    assert.equal(f.layout().props.selectedCategory, null);
    assert.deepEqual(f.ids(), [2, 3, 4, 8]);
  });

  test(`RA-09 Home: ${visual.name} compõe busca, preço e categorias avançadas`, async () => {
    const f = homeFixture({ getCategories: async () => categories, getLinks: () => [4] });
    await f.settle(); await f.select(visualId);
    await f.search('cerrado'); assert.deepEqual(f.ids(), [4]);
    await f.search('não corresponde'); assert.deepEqual(f.ids(), []);
    await f.search(''); assert.deepEqual(f.ids(), [4]);
    f.ui.button('Tipo de Rolê').props.onPress(); f.ui.render();
    f.ui.button(visual.name).props.onPress(); f.ui.render();
    f.field('00,00', '44');
    await f.ui.button('Aplicar Filtros').props.onPress(); f.ui.render(); await f.settle();
    assert.deepEqual(f.ids(), []);
    assert.equal(f.layout().props.selectedCategory, visualId);
    assert.ok(f.calls.some(ids => ids.includes(databaseId)));
    f.field('00,00', '45'); f.field('000', '1');
    await f.ui.button('Aplicar Filtros').props.onPress(); f.ui.render(); await f.settle();
    assert.deepEqual(f.ids(), [4]);
    await f.search(''); assert.deepEqual(f.ids(), [4]);
    assert.equal(f.layout().props.selectedCategory, visualId);
  });

  test(`RA-09 Home: ${visual.name} ausente e falhas de rede não exibem locais indevidos`, async () => {
    const missing = homeFixture(); await missing.settle(); await missing.select(visualId);
    assert.deepEqual(missing.ids(), []);
    assert.match(missing.ui.text(), /indisponível no momento/);
    assert.equal(missing.calls.length, 0);
    for (const stage of ['catalog', 'links']) {
      let fail = true;
      const f = homeFixture({ getCategories: async () => {
        if (stage === 'catalog' && fail) throw Error('Offline'); return categories;
      }, getLinks: () => { if (stage === 'links' && fail) throw Error('Offline'); return []; } });
      await f.settle(); await f.select(visualId);
      assert.deepEqual(f.ids(), []);
      assert.match(f.ui.text(), /Não foi possível carregar o filtro/);
      fail = false; f.ui.button('Tentar novamente').props.onPress(); f.ui.render(); await f.settle();
      assert.match(f.list().props.ListEmptyComponent.children.join(''), /Nenhum local encontrado em/);
    }
  });
}
