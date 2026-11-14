import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_CATEGORIES, resolveHomeCategory } from '../src/utils/homeFilters.js';
import { homeCategoryLayout } from '../src/utils/homeCategoryLayout.js';
import { renderScreen } from './helpers/render-screen.mjs';

const file = new URL('../src/components/MainLayout.js', import.meta.url);
const names = ['Comidas', 'Cafés', 'Bares e pubs', 'Festas', 'Eventos', 'Cinemas', 'Parques', 'Oficinas culturais', 'Aulas culturais'];
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const controls = ui => ui.nodes().filter(n => n.props.accessibilityLabel?.startsWith('Filtrar por '));
const rows = ui => ui.nodes().filter(n => n.type === 'View' && n.children.some(child => child?.props?.accessibilityLabel?.startsWith('Filtrar por ')));

test('RA-09: ordem de nove categorias e IDs visuais anteriores preservados', () => {
  assert.deepEqual(HOME_CATEGORIES.map(c => c.name), names);
  assert.deepEqual(HOME_CATEGORIES.map(c => c.id), ['1', '5', '7', '2', '6', '4', '3', '8', '9']);
  assert.equal(new Set(HOME_CATEGORIES.map(c => c.id)).size, 9);
});

for (const width of [320, 360, 390, 430, 800, 1024]) {
  for (const fontScale of [1, 2]) {
    test(`RA-09: categorias em ${width} dp e fonte ${fontScale}`, () => {
      const ui = renderScreen(file, 'MainLayout', { selectedCategory: '8' }, {
        '../utils/homeFilters': { HOME_CATEGORIES },
      }, { useWindowDimensions: () => ({ width, height: 1280, fontScale }) });
      assert.deepEqual(controls(ui).map(c => c.props.accessibilityLabel), names.map(n => `Filtrar por ${n}`));
      assert.equal(controls(ui).filter(c => c.props.accessibilityState.selected).length, 1);
      const scroll = ui.nodes().find(n => n.props.accessibilityLabel === 'Categorias de rolê');
      assert.equal(scroll.props.horizontal, true);
      assert.equal(scroll.children.length, 9);
      assert.equal(rows(ui).length, 0);
      assert.ok(controls(ui).every(c => flatten(c.props.style).width >= (width >= 600 ? 104 : 88)));
      assert.equal(flatten(scroll.props.contentContainerStyle).gap, width >= 600 ? 12 : 8);
      assert.ok(controls(ui).every(c => flatten(c.props.style).minHeight >= 44));
      const images = ui.nodes().filter(n => n.type === 'Image');
      assert.equal(images.length, 6);
      assert.ok(images.every(n => n.props.resizeMode === 'contain'));
      assert.ok(ui.nodes().filter(n => n.type === 'Text' && names.includes(n.children.join('')))
        .every(n => flatten(n.props.style).textAlign === 'center' && n.props.numberOfLines === undefined));
      assert.equal(controls(ui).filter(c => c.props.accessibilityHint === 'Ilustração do mascote pendente').length, 3);
    });
  }
}

test('RA-09: janela dividida e recortes laterais ajustam espaçamento sem remontar carrossel', () => {
  let width = 800;
  const ui = renderScreen(file, 'MainLayout', {}, {
    '../utils/homeFilters': { HOME_CATEGORIES },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 44, right: 44 }) },
  }, { useWindowDimensions: () => ({ width, height: 600 }) });
  const carousel = () => ui.nodes().find(n => n.props.accessibilityLabel === 'Categorias de rolê');
  const key = carousel().props.key;
  assert.equal(flatten(controls(ui)[0].props.style).width, 104);
  width = 650; ui.render();
  assert.equal(rows(ui).length, 0);
  assert.equal(ui.nodes().find(n => n.props.accessibilityLabel === 'Categorias de rolê').props.horizontal, true);
  assert.equal(carousel().props.key, key);
  assert.equal(flatten(controls(ui)[0].props.style).width, 88);
  assert.equal(homeCategoryLayout({ width: 800, fontScale: 2 }).itemWidth, 144);
});

test('RA-09: selecionar, trocar e desmarcar preservam identidade do carrossel e destaque', () => {
  const props = { selectedCategory: null, onSelectCategory: id => {
    props.selectedCategory = props.selectedCategory === id ? null : id;
  } };
  const ui = renderScreen(file, 'MainLayout', props, { '../utils/homeFilters': { HOME_CATEGORIES } }, {
    useWindowDimensions: () => ({ width: 800, height: 1280, fontScale: 1 }),
  });
  const carousel = () => ui.nodes().find(n => n.props.accessibilityLabel === 'Categorias de rolê');
  const key = carousel().props.key;
  for (const id of ['8', '9', '9']) {
    controls(ui).find(n => n.props.accessibilityLabel === `Filtrar por ${HOME_CATEGORIES.find(c => c.id === id).name}`).props.onPress();
    ui.render();
    assert.equal(carousel().props.key, key);
    assert.equal(carousel().props.horizontal, true);
    // Sem offset controlado, ref ou remontagem ao selecionar, o scroll permanece nativo.
    assert.equal(carousel().props.contentOffset, undefined);
    assert.equal(carousel().props.ref, undefined);
    const selected = controls(ui).filter(n => n.props.accessibilityState.selected);
    assert.equal(selected.length, props.selectedCategory ? 1 : 0);
    if (selected.length) {
      assert.equal(selected[0].props.accessibilityLabel, `Filtrar por ${HOME_CATEGORIES.find(c => c.id === props.selectedCategory).name}`);
      assert.ok(selected[0].children.some(n => flatten(n.props.style).borderWidth === 2));
    }
  }
});

test('RA-09: Favoritos pode ocultar categorias sem deixar grade vazia', () => {
  const ui = renderScreen(file, 'MainLayout', { hideCategories: true }, { '../utils/homeFilters': { HOME_CATEGORIES } });
  assert.equal(controls(ui).length, 0);
  assert.equal(ui.nodes().filter(n => n.props.accessibilityLabel === 'Categorias de rolê').length, 0);
});

test('RA-09: nomes normalizados aceitam caixa, acentos e espaços internos; ambiguidades falham fechadas', () => {
  for (const id of ['7', '8', '9']) {
    const category = HOME_CATEGORIES.find(c => c.id === id);
    const nome = `  ${category.name.toUpperCase().replaceAll(' ', '   ')}  `;
    assert.equal(resolveHomeCategory(id, [{ nome, id_categoria: `test-db-${id}` }]).databaseId, `test-db-${id}`);
    assert.equal(resolveHomeCategory(id, []).status, 'missing');
    assert.equal(resolveHomeCategory(id, [{ nome, id_categoria: 70 }, { nome: category.name, id_categoria: 71 }]).status, 'ambiguous');
  }
  assert.equal(resolveHomeCategory('8', [{ nome: 'Oficínas culturais', id_categoria: 99 }]).databaseId, 99);
});
