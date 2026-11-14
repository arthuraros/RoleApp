import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// Limpa dados no refresh e ignora respostas de outra conta/foco ou de uma consulta antiga.
export function useAccountResource(loader, userId, enabled = true) {
  const request = useRef(0);
  const focused = useRef(false);
  const [state, setState] = useState({ owner: null, data: [], loading: false, error: '' });
  const reload = useCallback(async () => {
    if (!focused.current) return null;
    const version = ++request.current;
    setState({ owner: userId, data: [], loading: Boolean(enabled && userId), error: '' });
    if (!enabled || !userId) return null;
    try {
      const data = await loader({ expectedUserId: userId });
      if (!focused.current || request.current !== version) return null;
      setState({ owner: userId, data, loading: false, error: '' });
      return data;
    } catch {
      if (focused.current && request.current === version) {
        setState({ owner: userId, data: [], loading: false, error: 'Não foi possível carregar os dados. Tente novamente.' });
      }
      return null;
    }
  }, [loader, userId, enabled]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    reload();
    return () => { focused.current = false; request.current += 1; };
  }, [reload]));
  if (state.owner !== userId || !enabled) {
    return { data: [], loading: Boolean(enabled && userId), error: '', reload };
  }
  return { data: state.data, loading: state.loading, error: state.error, reload };
}
