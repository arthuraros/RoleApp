import { registerHooks } from 'node:module';

// Preload APENAS para testes de unidade. Nunca usado pelo app/Expo.
// Impede que imports do cliente real inicializem Auth/Storage ou façam rede.
globalThis.fetch = async () => { throw new Error('NETWORK_DISABLED_FOR_TESTS'); };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-auth-session/build/QueryParams.js') {
      // O teste antigo usa subpath privado não exportado. Resolver o arquivo real
      // instalado, sem simular o parser de URL nem carregar o runtime nativo Expo.
      const root = nextResolve('expo-auth-session', context);
      return { url: new URL('./QueryParams.js', root.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/src/services/supabase.js')) {
      return { format: 'module', shortCircuit: true, source: `
        const unexpected = () => { throw new Error('Supabase operation must be mocked'); };
        export const isSupabaseConfigured = false;
        export const supabase = {
          from: unexpected, rpc: unexpected,
          auth: { getUser: unexpected, storage: {}, _stopAutoRefreshToken() {} }
        };
        export default supabase;
      ` };
    }
    return nextLoad(url, context);
  },
});
