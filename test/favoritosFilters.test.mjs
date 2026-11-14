import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_CATEGORIES, resolveHomeCategory, filterHomePlaces } from '../src/utils/homeFilters.js';
import { renderScreen } from './helpers/render-screen.mjs';

// Dados exclusivamente offline. Não representam nem alteram cadastros/vínculos reais.
const categories = HOME_CATEGORIES.map(c => ({ id_categoria: `db-${c.id}`, nome: c.name }));
const places = [
  { id_local: 10, nome: 'Café favorito', endereco: 'Rua A' },
  { id_local: 20, nome: 'Comida favorita', endereco: 'Café na rua' },
];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const walk = n => n && typeof n === 'object' ? [n, ...(n.children ?? []).flatMap(walk)] : [];

function fixture(options = {}) {
  let user = { id: 'conta-a' }, focusCallback, cleanup;
  const reads = [], links = [], deletes = [], opened = [], metrics = [];
  const ui = renderScreen(new URL('../src/screens/FavoritosScreen.js', import.meta.url), 'FavoritosScreen', {
    navigation: { navigate: (...args) => opened.push(args) },
  }, {
    '@react-navigation/native': { useFocusEffect: callback => { focusCallback = callback; } },
    '../contexts/AuthContext': { useAuth: () => ({ user }) },
    '../components/MainLayout': { MainLayout: 'MainLayout' },
    '../utils/homeFilters': { resolveHomeCategory, filterHomePlaces },
    '../services/favoritosService': { favoritosService: {
      getLocaisFavoritos: async id => { reads.push(id); return options.getFavorites ? options.getFavorites(id) : places; },
      removerFavorito: async (id, local) => { deletes.push([id, local]); return options.remove?.(id, local); },
    } },
    '../services/categoriasService': { categoriasService: {
      getCategorias: async () => options.getCatalog ? options.getCatalog() : categories,
      getLocaisIdsPorCategorias: async ids => {
        links.push(Array.from(ids)); return options.getLinks ? options.getLinks(ids) : [10, 999];
      },
    } },
    '../services/parceiroService': { parceiroService: { registrarMetrica: async data => {
      metrics.push(data); if (options.metricError) throw Error('Offline');
    } } },
  });
  const layout = () => ui.nodes().find(n => n.type === 'MainLayout');
  const list = () => ui.nodes().find(n => n.type === 'FlatList');
  const settle = async () => { for (let i = 0; i < 6; i++) await ui.settle(); };
  const focus = () => { cleanup?.(); cleanup = focusCallback(); ui.render(); };
  const blur = () => { cleanup?.(); cleanup = null; };
  if (options.autoFocus !== false) focus();
  return { ui, reads, links, deletes, opened, metrics, layout, list, settle, focus, blur,
    ids: () => Array.from(list()?.props.data ?? [], item => item.id_local),
    user(next) { user = next; ui.render(); },
    async select(id) { layout().props.onSelectCategory(id); ui.render(); await settle(); },
    async search(text) { layout().props.onSearchChange(text); ui.render(); await settle(); },
    card(id) { return walk(list().props.renderItem({ item: list().props.data.find(p => p.id_local === id) })); },
  };
}

for (const category of HOME_CATEGORIES) {
  test(`RA-10: ${category.name} usa ID resolvido e intersecta somente favoritos da conta`, async () => {
    const f = fixture(); await f.settle();
    assert.deepEqual(f.ids(), [10, 20]);
    await f.select(category.id);
    assert.equal(f.layout().props.selectedCategory, category.id);
    assert.deepEqual(f.links.at(-1), [`db-${category.id}`]);
    assert.deepEqual(f.ids(), [10]); // 999 pertence à categoria, mas não é favorito.
    await f.select(category.id);
    assert.equal(f.layout().props.selectedCategory, null);
    assert.deepEqual(f.ids(), [10, 20]);
    assert.ok(f.reads.every(id => id === 'conta-a'));
  });
}

test('RA-10: troca e pesquisa por nome se combinam sem apagar seleção', async () => {
  const f = fixture({ getLinks: ids => ids[0] === 'db-1' ? [10, 20, 999] : [20, 999] });
  await f.settle(); await f.select('1'); await f.search('café');
  assert.deepEqual(f.ids(), [10]); // Endereço do 20 não deve interferir na pesquisa por nome.
  await f.select('7'); assert.deepEqual(f.ids(), []);
  assert.equal(f.layout().props.selectedCategory, '7');
  await f.search('COMIDA'); assert.deepEqual(f.ids(), [20]);
  await f.select('7'); assert.deepEqual(f.ids(), [20]);
});

test('RA-10: categoria válida vazia mostra mensagem apropriada', async () => {
  const f = fixture({ getLinks: () => [] }); await f.settle(); await f.select('8');
  assert.deepEqual(f.ids(), []);
  assert.match(f.list().props.ListEmptyComponent.children.join(''), /Nenhum favorito encontrado em Oficinas culturais/);
});

test('RA-10: remover favorito atualiza imediatamente a lista mantendo filtro e busca', async () => {
  const deletion = deferred();
  const f = fixture({ remove: () => deletion.promise }); await f.settle();
  await f.select('5'); await f.search('café');
  const button = () => f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos');
  const pending = button().props.onPress(); f.ui.render();
  assert.equal(button().props.disabled, true);
  deletion.resolve(); await pending; f.ui.render();
  assert.deepEqual(f.ids(), []);
  assert.deepEqual(f.deletes, [['conta-a', 10]]);
  assert.equal(f.layout().props.selectedCategory, '5');
  assert.equal(f.layout().props.searchValue, 'café');
});

test('RA-10: falha ao remover mantém favorito e permite tentar novamente', async () => {
  const f = fixture({ remove: () => { throw Error('Offline'); } }); await f.settle(); await f.select('1');
  await f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos').props.onPress();
  f.ui.render();
  assert.deepEqual(f.ids(), [10]);
  assert.match(f.ui.alerts.at(-1)[1], /Não foi possível remover/);
  assert.equal(f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos').props.disabled, false);
});

test('RA-10: voltar à tela recarrega favoritos e vínculos sem perder categoria/pesquisa', async () => {
  let data = places;
  const f = fixture({ getFavorites: () => data, getLinks: () => [10, 20, 999] });
  await f.settle(); await f.select('9'); await f.search('favorit');
  f.blur(); data = [places[1]]; f.focus();
  assert.deepEqual(f.ids(), []); // Sem exibir a leitura antiga durante refresh.
  await f.settle();
  assert.deepEqual(f.ids(), [20]);
  assert.equal(f.layout().props.selectedCategory, '9');
  assert.equal(f.layout().props.searchValue, 'favorit');
  assert.equal(f.reads.length, 2);
  assert.equal(f.links.length, 2);
});

test('RA-10: categoria ausente ou ambígua falha fechada e permite limpar', async () => {
  for (const catalog of [[], [...categories, { id_categoria: 'duplicate', nome: 'Comidas' }]]) {
    const f = fixture({ getCatalog: () => catalog }); await f.settle(); await f.select('1');
    assert.deepEqual(f.ids(), []); assert.equal(f.links.length, 0);
    assert.match(f.ui.text(), /indisponível no momento/);
    f.ui.button('Limpar categoria').props.onPress(); f.ui.render(); await f.settle();
    assert.deepEqual(f.ids(), [10, 20]);
  }
});

test('RA-10: falhas de favoritos, catálogo e vínculos não viram resultados e têm retry', async () => {
  for (const stage of ['favorites', 'catalog', 'links']) {
    let fail = true;
    const f = fixture({
      getFavorites: () => { if (stage === 'favorites' && fail) throw Error('Offline'); return places; },
      getCatalog: () => { if (stage === 'catalog' && fail) throw Error('Offline'); return categories; },
      getLinks: () => { if (stage === 'links' && fail) throw Error('Offline'); return [10, 999]; },
    });
    await f.settle(); await f.select('1');
    assert.deepEqual(f.ids(), []); assert.match(f.ui.text(), /Não foi possível carregar/);
    fail = false; f.ui.button('Tentar novamente').props.onPress(); f.ui.render(); await f.settle();
    assert.deepEqual(f.ids(), [10]);
    assert.equal(f.layout().props.selectedCategory, '1');
  }
});

test('RA-10: sem filtro de categoria, falha no catálogo não oculta favoritos válidos', async () => {
  const f = fixture({ getCatalog: () => { throw Error('Offline'); } }); await f.settle();
  assert.deepEqual(f.ids(), [10, 20]);
});

test('RA-10: respostas antigas são ignoradas ao trocar/desmarcar categoria', async () => {
  const old = deferred();
  const f = fixture({ getLinks: ids => ids[0] === 'db-1' ? old.promise : [20] });
  await f.settle(); await f.select('1'); assert.deepEqual(f.ids(), []);
  await f.select('7'); assert.deepEqual(f.ids(), [20]);
  old.resolve([10, 999]); await f.settle(); assert.deepEqual(f.ids(), [20]);
  await f.select('7'); assert.deepEqual(f.ids(), [10, 20]);
});

test('RA-10: troca de conta/logout oculta dados anteriores antes de qualquer nova resposta', async () => {
  const late = deferred();
  const f = fixture({ getFavorites: id => id === 'conta-a' ? late.promise : [places[1]], getLinks: () => [10, 20] });
  await f.settle(); await f.select('1');
  f.blur(); f.user({ id: 'conta-b' });
  assert.deepEqual(f.ids(), []);
  assert.equal(f.layout().props.selectedCategory, null);
  f.focus(); await f.settle(); assert.deepEqual(f.ids(), [20]);
  late.resolve(places); await f.settle(); assert.deepEqual(f.ids(), [20]);
  f.blur(); f.user(null); f.focus(); await f.settle(); assert.deepEqual(f.ids(), []);
  assert.deepEqual(f.reads, ['conta-a', 'conta-b']);
});

test('RA-10: leitura antiga do foco anterior não sobrescreve a atualização ao retornar', async () => {
  const old = deferred(); let calls = 0;
  const f = fixture({ getFavorites: () => ++calls === 1 ? old.promise : [places[1]] });
  f.blur(); f.focus(); await f.settle(); assert.deepEqual(f.ids(), [20]);
  old.resolve(places); await f.settle(); assert.deepEqual(f.ids(), [20]);
});

test('RA-10: remoção concluída durante refresh invalida a leitura que ainda contém o favorito', async () => {
  const deletion = deferred(), stale = deferred(); let reads = 0;
  const f = fixture({ getFavorites: () => ++reads === 1 ? places : reads === 2 ? stale.promise : [places[1]], remove: () => deletion.promise });
  await f.settle();
  const pending = f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos').props.onPress();
  f.blur(); f.focus();
  deletion.resolve(); await pending;
  stale.resolve(places); await f.settle();
  assert.deepEqual(f.ids(), [20]);
  assert.equal(reads, 3);
});

test('RA-10: remoção atrasada de outra conta não afeta a lista atual', async () => {
  const deletion = deferred();
  const f = fixture({ remove: () => deletion.promise }); await f.settle();
  const pending = f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos').props.onPress();
  f.blur(); f.user({ id: 'conta-b' }); f.focus(); await f.settle();
  deletion.resolve(); await pending; await f.settle();
  assert.deepEqual(f.ids(), [10, 20]);
});

test('RA-10: detalhes e métricas continuam funcionando sob filtro ativo', async () => {
  const f = fixture({ metricError: true }); await f.settle(); await f.select('1');
  f.card(10).find(n => n.type === 'TouchableOpacity' && n.children.some(c => c?.children?.includes('Ver detalhes'))).props.onPress();
  assert.equal(f.opened[0][0], 'DetalhesLocal');
  assert.equal(f.opened[0][1].idLocal, 10);
  assert.equal(f.metrics[0].idLocal, 10);
  await f.settle(); assert.equal(f.layout().props.selectedCategory, '1');
});

test('RA-10: selecionar durante leitura do catálogo não exibe favoritos sem verificar categoria', async () => {
  const catalog = deferred();
  const f = fixture({ getCatalog: () => catalog.promise }); await f.settle();
  assert.deepEqual(f.ids(), [10, 20]);
  await f.select('1'); assert.deepEqual(f.ids(), []);
  assert.equal(f.links.length, 0);
  assert.ok(f.ui.nodes().some(n => n.props.accessibilityLabel === 'Carregando favoritos e filtros'));
  catalog.resolve(categories); await f.settle();
  assert.deepEqual(f.ids(), [10]);
});

test('RA-10: troca de conta já carregada não mostra seus dados enquanto a próxima conta aguarda', async () => {
  const next = deferred();
  const f = fixture({ getFavorites: id => id === 'conta-a' ? places : next.promise });
  await f.settle(); await f.select('1'); await f.search('café');
  const staleRemove = f.card(10).find(n => n.props.accessibilityLabel === 'Remover dos favoritos').props.onPress;
  f.user({ id: 'conta-b' });
  assert.deepEqual(f.ids(), []);
  assert.equal(f.layout().props.selectedCategory, null);
  assert.equal(f.layout().props.searchValue, '');
  await staleRemove(); assert.equal(f.deletes.length, 0);
  f.focus(); await f.settle(); assert.deepEqual(f.ids(), []);
  next.resolve([places[1]]); await f.settle(); assert.deepEqual(f.ids(), [20]);
});

test('RA-10: falha no refresh não mantém lista antiga e retry preserva o filtro', async () => {
  let fail = false;
  const f = fixture({ getFavorites: () => { if (fail) throw Error('Offline'); return places; } });
  await f.settle(); await f.select('1'); assert.deepEqual(f.ids(), [10]);
  f.blur(); fail = true; f.focus(); await f.settle();
  assert.deepEqual(f.ids(), []); assert.match(f.ui.text(), /Não foi possível carregar seus favoritos/);
  fail = false; f.ui.button('Tentar novamente').props.onPress(); f.ui.render(); await f.settle();
  assert.deepEqual(f.ids(), [10]); assert.equal(f.layout().props.selectedCategory, '1');
});
