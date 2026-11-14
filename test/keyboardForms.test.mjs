import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardOverlap, focusedFieldScrollDelta } from '../src/utils/keyboardGeometry.js';
import { renderScreen } from './helpers/render-screen.mjs';

const file = new URL('../src/components/KeyboardForm.js', import.meta.url);
const keyboard = { screenX: 0, screenY: 600, width: 800, height: 400 };
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

test('RA-05 teclado: mede apenas sobreposição residual e considera safe area/cabeçalho', () => {
  assert.equal(keyboardOverlap({ x: 0, y: 30, width: 800, height: 920 }, keyboard), 350);
  assert.equal(keyboardOverlap({ x: 0, y: 100, width: 800, height: 500 }, keyboard), 0);
  assert.equal(keyboardOverlap({ x: 0, y: 100, width: 800, height: 450 }, keyboard), 0);
  assert.equal(keyboardOverlap({ x: 850, y: 100, width: 300, height: 800 }, keyboard), 0);
  assert.equal(keyboardOverlap({ x: 0, y: 100, width: 800, height: 800 }, { ...keyboard, height: 0 }), 0);
  assert.equal(keyboardOverlap({ x: 0, y: 100, width: 800, height: 800 }, null), 0);
});

for (const width of [320, 390, 430, 800]) {
  test(`RA-05 teclado: campo inferior em ${width} dp e campo acima da área visível`, () => {
    const viewport = { x: 0, y: 80, width, height: 700 };
    const ime = { screenX: 0, screenY: 500, width, height: 300 };
    assert.equal(focusedFieldScrollDelta(viewport, { y: 550, height: 44 }, ime), 106);
    assert.equal(focusedFieldScrollDelta(viewport, { y: 40, height: 44 }, ime), -52);
    assert.equal(focusedFieldScrollDelta(viewport, { y: 200, height: 44 }, ime), 0);
    assert.equal(focusedFieldScrollDelta(viewport, { y: 100, height: 600 }, ime), 8);
  });
}

function nativeKeyboard(os = 'android') {
  const listeners = new Map(); let metrics;
  return { listeners,
    emit(name, value) { metrics = name.includes('Hide') ? undefined : value; listeners.get(name)?.forEach(fn => fn({ endCoordinates: value })); },
    native: { Platform: { OS: os }, Keyboard: {
      metrics: () => metrics, scheduleLayoutAnimation() {},
      addListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return { remove: () => listeners.get(name).delete(fn) };
      },
    } },
  };
}

for (const os of ['android', 'ios']) {
  test(`RA-05 teclado ${os}: abrir, redimensionar e fechar restaura viewport sem altura inicial fixa`, () => {
    const k = nativeKeyboard(os); let height = 920;
    const ui = renderScreen(file, 'KeyboardViewport', { style: { flex: 1 }, children: 'Formulário' }, {}, k.native);
    const root = () => ui.nodes()[0];
    root().props.ref.current = { measureInWindow: fn => fn(0, 30, 800, height) };
    k.emit(os === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', keyboard); ui.render();
    assert.equal(flatten(root().props.style).paddingBottom, 350);
    height = 570; root().props.onLayout({}); ui.render();
    assert.equal(flatten(root().props.style).paddingBottom, 0); // resize nativo já cobriu tudo
    height = 920; root().props.onLayout({}); ui.render();
    assert.equal(flatten(root().props.style).paddingBottom, 350);
    k.emit(os === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'); ui.render();
    assert.equal(flatten(root().props.style).paddingBottom, 0);
    assert.equal(flatten(root().props.style).height, undefined);
    ui.unmount();
    assert.ok([...k.listeners.values()].every(set => set.size === 0));
  });
}

test('RA-05 teclado: medição atrasada não recoloca espaço após fechar', () => {
  const k = nativeKeyboard(); let finish;
  const ui = renderScreen(file, 'KeyboardViewport', {}, {}, k.native);
  ui.nodes()[0].props.ref.current = { measureInWindow: callback => { finish = callback; } };
  k.emit('keyboardDidShow', keyboard);
  k.emit('keyboardDidHide'); finish(0, 0, 800, 1000); ui.render();
  assert.equal(flatten(ui.nodes()[0].props.style).paddingBottom, 0);
});

test('RA-05 teclado: modal montado com teclado já aberto usa as métricas existentes', () => {
  const k = nativeKeyboard(); k.emit('keyboardDidShow', keyboard);
  const ui = renderScreen(file, 'KeyboardViewport', { style: { flex: 1 } }, {}, k.native);
  ui.nodes()[0].props.ref.current = { measureInWindow: fn => fn(0, 20, 800, 930) };
  ui.nodes()[0].props.onLayout({}); ui.render();
  assert.equal(flatten(ui.nodes()[0].props.style).paddingBottom, 350);
  assert.equal(ui.nodes()[0].props.collapsable, false);
});

test('RA-05 teclado: foco, troca de campo e relayout rolam apenas quando necessário e preservam ref', async () => {
  const k = nativeKeyboard(); const calls = [], ref = { current: null };
  let inputY = 720;
  const input = { measureInWindow: fn => fn(20, inputY, 240, 44) };
  let current = input;
  const ui = renderScreen(file, 'KeyboardAwareScrollView', { ref, children: 'Campos e salvar' }, {}, {
    ...k.native, TextInput: { State: { currentlyFocusedInput: () => current } },
  });
  const scroll = ui.nodes()[0];
  const controller = { measureInWindow: fn => fn(0, 100, 800, 800), scrollTo: options => calls.push(options) };
  scroll.props.ref(controller);
  assert.equal(ref.current, controller);
  scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 200 } } });
  scroll.props.onFocus({}); k.emit('keyboardDidShow', keyboard); await ui.settle();
  assert.equal(calls.at(-1).y, 376); // 200 + (720+44 - (600-12))
  inputY = 200; calls.length = 0;
  ui.nodes()[0].props.onFocus({}); await ui.settle();
  assert.equal(calls.length, 0);
  inputY = 550;
  ui.nodes()[0].props.onLayout({}); await ui.settle();
  assert.equal(calls.at(-1).y, 206);
  assert.equal(ui.nodes()[0].props.keyboardShouldPersistTaps, 'handled');
  assert.equal(ui.nodes()[0].props.keyboardDismissMode, 'none');
  assert.equal(ui.nodes()[0].props.automaticallyAdjustKeyboardInsets, false);
  current = null; calls.length = 0;
  ui.nodes()[0].props.onBlur({}); k.emit('keyboardDidShow', keyboard); await ui.settle();
  assert.equal(calls.length, 0);
  ui.unmount(); assert.ok([...k.listeners.values()].every(set => set.size === 0));
});

test('RA-05 teclado: outro formulário com foco não é rolado pelo listener desta tela', async () => {
  const k = nativeKeyboard(); const calls = [];
  const input = { measureInWindow: fn => fn(0, 900, 200, 44) };
  const ui = renderScreen(file, 'KeyboardAwareScrollView', {}, {}, {
    ...k.native, TextInput: { State: { currentlyFocusedInput: () => input } },
  });
  ui.nodes()[0].props.ref({ measureInWindow: fn => fn(0, 0, 800, 1000), scrollTo: options => calls.push(options) });
  k.emit('keyboardDidShow', keyboard); await ui.settle();
  assert.equal(calls.length, 0);
});
