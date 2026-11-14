import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adminService } from '../services/adminService';

const filters = [['Todos', null], ['Visíveis', true], ['Ocultos', false]];

export function AdminPlacesPanel({ service = adminService.locais }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', visibility: null });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const request = useRef(0);
  const detailRequest = useRef(0);

  const load = useCallback(async (after = null) => {
    if (!service?.available) return;
    const ticket = ++request.current;
    ++detailRequest.current;
    setDetail(null); setDetailError(''); setDetailLoading(false);
    setLoading(true); setError('');
    if (!after) { setItems([]); setCursor(null); }
    try {
      const page = await service.list({ ...query, cursor: after });
      if (ticket !== request.current) return;
      setItems(previous => after ? [...previous, ...page.items.filter(item =>
        !previous.some(old => old.id_local === item.id_local))] : page.items);
      setCursor(page.next_cursor);
    } catch (failure) {
      if (ticket !== request.current) return;
      setItems([]); setCursor(null);
      setError(failure.message || 'Não foi possível carregar os locais.');
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  }, [service, query]);

  useEffect(() => {
    load();
    return () => { ++request.current; ++detailRequest.current; };
  }, [load]);

  async function open(id) {
    const ticket = ++detailRequest.current;
    setDetail(null); setDetailError(''); setDetailLoading(true);
    try {
      const value = await service.detail(id);
      if (ticket !== detailRequest.current) return;
      setDetail(value);
      if (!value) setDetailError('Estabelecimento não encontrado ou acesso indisponível.');
    } catch (failure) {
      if (ticket === detailRequest.current) setDetailError(failure.message || 'Falha ao consultar detalhes.');
    } finally {
      if (ticket === detailRequest.current) setDetailLoading(false);
    }
  }

  if (!service?.available) return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>Locais</Text>
      <Text accessibilityRole="alert">Consulta administrativa bloqueada: contrato do banco aguarda aprovação e validação.</Text>
    </View>
  );

  const button = (label, action, disabled = false, selected) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled, selected }}
      style={[styles.button, selected && styles.selected, disabled && styles.disabled]}
      disabled={disabled} onPress={action}>
      <Text style={selected ? styles.selectedText : styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>Locais</Text>
      <TextInput accessibilityLabel="Pesquisar locais por nome ou ID" placeholder="Nome ou ID do estabelecimento"
        maxLength={120} value={search} onChangeText={setSearch} style={styles.input}
        returnKeyType="search" onSubmitEditing={() => setQuery({ ...query, search: search.trim() })} />
      <View style={styles.row}>
        {button('Pesquisar', () => setQuery({ ...query, search: search.trim() }), loading)}
        {button('Atualizar locais', () => load(), loading)}
      </View>
      <View style={styles.row}>
        {filters.map(([label, value]) => <View key={label}>
          {button(label, () => setQuery({ search: search.trim(), visibility: value }), loading, query.visibility === value)}
        </View>)}
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Carregando locais" color="#6820C9" />}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {!loading && !error && items.length === 0 && <Text>Nenhum estabelecimento encontrado.</Text>}
      {items.map(item => <View key={item.id_local} style={styles.card}>
        <Text style={styles.name}>{item.nome}</Text>
        <Text>ID: {item.id_local} · {item.visivel === true ? 'Visível' : item.visivel === false ? 'Oculto' : 'Visibilidade não informada'}</Text>
        {button(`Ver detalhes: ${item.nome}`, () => open(item.id_local), loading)}
      </View>)}
      {!!cursor && button('Carregar mais locais', () => load(cursor), loading)}
      {detailLoading && <ActivityIndicator accessibilityLabel="Carregando detalhes do local" color="#6820C9" />}
      {!!detailError && <Text accessibilityRole="alert">{detailError}</Text>}
      {!!detail && <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.name}>Detalhes: {detail.nome}</Text>
        <Text>ID: {detail.id_local}</Text>
        <Text>Endereço: {detail.endereco || 'Não informado'}</Text>
        <Text>Cidade/estado: {detail.cidade_estado || 'Não informado'}</Text>
        <Text>Visibilidade: {detail.visivel === true ? 'Visível' : detail.visivel === false ? 'Oculto' : 'Não informada'}</Text>
        <Text>Responsável: {detail.responsavel?.nome || 'Não informado ou não autorizado'}</Text>
        {!!detail.responsavel?.id_usuario && <Text>ID do responsável: {detail.responsavel.id_usuario}</Text>}
        {button('Fechar detalhes', () => { ++detailRequest.current; setDetail(null); })}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 }, title: { color: '#1D173F', fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: '#D9CDEA', borderRadius: 12, padding: 12, minHeight: 48, color: '#1D173F' },
  button: { minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 12, backgroundColor: '#F0E7FF' },
  buttonText: { color: '#6820C9', textAlign: 'center', fontWeight: '600' },
  selected: { backgroundColor: '#6820C9' }, selectedText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '600' },
  disabled: { opacity: 0.5 }, card: { padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', gap: 8 },
  name: { color: '#1D173F', fontSize: 17, fontWeight: '700' },
});
