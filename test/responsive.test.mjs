import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responsiveMetrics } from '../src/utils/responsive.js';
import { renderScreen } from './helpers/render-screen.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
for (const width of [320, 360, 390, 430, 800, 1024]) {
  for (const fontScale of [1, 1.3, 2]) {
    test(`RA-05: limites em ${width} dp, fonte ${fontScale}`, () => {
      const insets = { left: 24, right: 24, top: 24, bottom: 34 };
      const m = responsiveMetrics({ width, height: 600, fontScale, insets });
      assert.ok(m.authWidth + 32 <= width - 48);
      assert.ok(m.logoWidth <= m.authWidth - 44);
      assert.ok(m.highlightWidth + 32 <= m.contentWidth);
      assert.ok(m.menuWidth + 32 <= m.contentWidth);
      assert.equal(m.highlightInterval, m.highlightWidth + 14);
      assert.ok(m.modalMaxHeight <= 600 - 58);
      if (fontScale >= 1.3) assert.equal(m.compact, true);
    });
  }
}
test('RA-05: layout recalcula largura e altura ao redimensionar a janela', () => {
  const portrait = responsiveMetrics({ width: 320, height: 800 });
  const landscape = responsiveMetrics({ width: 800, height: 320, insets: { left: 44, right: 44 } });
  assert.equal(portrait.compact, true);
  assert.equal(landscape.compact, false);
  assert.ok(landscape.authWidth > portrait.authWidth);
  assert.ok(landscape.modalMaxHeight < portrait.modalMaxHeight);
});
for (const os of ['android', 'ios']) {
  test(`RA-05: autenticação mantém rolagem e teclado em ${os} após redimensionamento`, () => {
    let width = 320;
    const ui = renderScreen(new URL('../src/components/AuthLayout.js', import.meta.url), 'AuthLayout', {
      title: 'Entrar', children: 'Formulário',
    }, {}, { Platform: { OS: os }, useWindowDimensions: () => ({ width, height: 600, fontScale: 2 }) });
    assert.ok(ui.nodes().some(n => n.type === 'KeyboardViewport'));
    const scroll = ui.nodes().find(n => n.type === 'ScrollView');
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
    assert.equal(scroll.props.keyboardDismissMode, undefined); // default 'none' do componente compartilhado
    const card = () => ui.nodes().find(n => flatten(n.props.style).borderRadius === 36);
    assert.equal(flatten(card().props.style).width, 288);
    width = 800; ui.render();
    assert.equal(flatten(card().props.style).width, 480);
  });
}
test('RA-05: detalhes usa largura segura e repagina cardápio após redimensionamento', () => {
  let width = 800;
  const ui = renderScreen(new URL('../src/screens/DetalhesLocalScreen.js', import.meta.url), 'DetalhesLocalScreen', {
    route: { params: { idLocal: 'demo-local', local: { nome: 'Local' } } }, navigation: { goBack() {} },
  }, {
    '../contexts/AuthContext': { useAuth: () => ({ user: null }) },
    '../services/locaisService': { locaisService: {} }, '../services/supabase': { supabase: {} },
    '../services/parceiroService': { parceiroService: {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 44, right: 44 }) },
  }, { useWindowDimensions: () => ({ width, height: 600, fontScale: 1 }) });
  const safe = ui.nodes().find(n => n.type === 'SafeAreaView');
  assert.ok(safe.props.edges.includes('left') && safe.props.edges.includes('right'));
  const menu = () => ui.nodes().find(n => flatten(n.props.style).minHeight === 529);
  assert.equal(flatten(menu().props.style).width, 352);
  width = 320; ui.render();
  assert.equal(flatten(menu().props.style).width, 200);
  const carousel = ui.nodes().find(n => n.type === 'ScrollView' && n.props.horizontal);
  assert.ok(carousel.props.pagingEnabled);
  assert.match(carousel.props.key, /200$/);
});

test('RA-05: destaques com fonte ampliada usam fluxo natural e preservam o carrossel', async () => {
  const { resolveHomeCategory, filterHomePlaces } = await import('../src/utils/homeFilters.js');
  const ui = renderScreen(new URL('../src/screens/HomeScreen.js', import.meta.url), 'HomeScreen', {
    navigation: { navigate() {} },
  }, {
    '../utils/homeFilters': { resolveHomeCategory, filterHomePlaces },
    '../components/MainLayout': { MainLayout: 'MainLayout' },
    '../contexts/AuthContext': { useAuth: () => ({ user: null }) },
    '../services/locaisService': { locaisService: { getLocais: async () => [] } },
    '../services/categoriasService': { categoriasService: { getCategorias: async () => [] } },
    '../services/parceiroService': { parceiroService: { getDestaquesAtivos: async () => [] } },
    '../services/favoritosService': { favoritosService: {} },
    'expo-location': { getForegroundPermissionsAsync: async () => ({ status: 'denied' }), requestForegroundPermissionsAsync: async () => ({ status: 'denied' }) },
  }, {
    useWindowDimensions: () => ({ width: 320, height: 568, fontScale: 2 }),
    Animated: { Value: class {}, View: 'AnimatedView', timing: () => ({ start() {} }), parallel: () => ({ start() {} }) },
  });
  await ui.settle();
  const list = ui.nodes().find(n => n.type === 'FlatList');
  // FlatList headers are render callbacks; execute the same callback used by the native list.
  const header = typeof list.props.ListHeaderComponent === 'function' ? list.props.ListHeaderComponent() : list.props.ListHeaderComponent;
  const walk = n => n && typeof n === 'object' ? [n, ...(n.children || []).flatMap(walk)] : [];
  const nodes = walk(header);
  const carousel = nodes.find(n => n.type === 'ScrollView' && n.props.horizontal);
  assert.equal(carousel.props.snapToInterval, 302);
  const buttons = nodes.filter(n => n.type === 'TouchableOpacity' && n.children.some(c => c?.children?.includes('Ver detalhes')));
  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.equal(flatten(button.props.style).position, 'relative');
    assert.equal(flatten(button.props.style).bottom, undefined);
  }
  const titles = nodes.filter(n => n.type === 'Text' && flatten(n.props.style).fontSize === 15);
  assert.ok(titles.length > 0);
  assert.ok(titles.every(n => n.props.numberOfLines === undefined));
});

test('RA-05: pesquisa e filtros podem quebrar linha, mantendo categorias horizontais', async () => {
  const { HOME_CATEGORIES } = await import('../src/utils/homeFilters.js');
  let selected;
  const ui = renderScreen(new URL('../src/components/MainLayout.js', import.meta.url), 'MainLayout', {
    selectedCategory: '1', onSelectCategory: id => { selected = id; },
  }, { '../utils/homeFilters': { HOME_CATEGORIES } }, {
    useWindowDimensions: () => ({ width: 320, height: 568, fontScale: 2 }),
  });
  const search = ui.nodes().find(n => flatten(n.props.style).gap === 10 && flatten(n.props.style).maxWidth === 960);
  assert.equal(flatten(search.props.style).flexWrap, 'wrap');
  const filter = ui.button('Filtros');
  assert.ok(flatten(filter.props.style).minHeight >= 44);
  assert.ok(ui.nodes().some(n => n.type === 'ScrollView' && n.props.horizontal));
  const category = ui.nodes().find(n => n.props.accessibilityLabel === `Filtrar por ${HOME_CATEGORIES[0].name}`);
  category.props.onPress();
  assert.equal(selected, HOME_CATEGORIES[0].id);
});
