import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');

// Executa JSX/hooks/handlers com dependencias nativas substituidas.
// Nao valida layout ou APIs nativas reais; estes exigem teste no dispositivo.
export function renderScreen(file, name, props = {}, dependencies = {}, nativeOverrides = {}) {
  const slots = [], alerts = [];
  let index = 0, effects = [], tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createElement(type, props, ...children) {
      const p = { ...props, children: children.flat(Infinity) };
      return typeof type === 'function' ? type(p) : { type, props: p, children: p.children };
    },
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useContext(context) { return context.value; },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const native = new Proxy({ StyleSheet: { create: x => x }, Platform: { OS: 'android' },
    Alert: { alert: (...args) => alerts.push(args) }, ...nativeOverrides }, { get: (o, k) => o[k] || k });
  const modules = {
    react: React, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 32 }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons', Feather: 'Feather' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '@react-navigation/native': { useFocusEffect: fn => React.useEffect(fn, [fn]) },
    '@react-navigation/bottom-tabs': { useBottomTabBarHeight: () => 110 },
    ...dependencies,
  };
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: key => {
    if (key.endsWith('.png')) return key;
    if (!(key in modules)) throw Error(`Import nao simulado: ${key}`);
    return modules[key];
  } });
  function render() {
    index = 0; tree = exports[name](props);
    const pending = effects; effects = []; pending.forEach(fn => fn());
  }
  function nodes(node) { return node && typeof node === 'object' ? [node, ...node.children.flatMap(n => nodes(n))] : []; }
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.children?.map(text).join('') || '';
  render();
  return { render, alerts, nodes: () => nodes(tree), text: () => text(tree),
    button: label => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n) === label),
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}
