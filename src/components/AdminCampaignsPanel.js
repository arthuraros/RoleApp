import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adminService } from '../services/adminService';
import { AdminCampaignOperationForm } from './AdminCampaignOperationForm';

// Consulta preparada para o adaptador administrativo. O serviço real permanece
// bloqueado, sem fallback para tabelas públicas ou para o serviço do parceiro.
export function AdminCampaignsPanel({ service = adminService.campanhas }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '' });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState(null);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const detailRequest = useRef(0);
  const load = useCallback(async (after = null) => {
    if (!service?.available) return;
    const ticket = ++request.current;
    ++detailRequest.current; setDetail(null); setDetailLoading(false); setOperation(null);
    setError(''); setLoading(true);
    if (!after) { setItems([]); setCursor(null); }
    try {
      const page = await service.list({ ...query, cursor: after });
      if (ticket !== request.current) return;
      setItems(previous => after ? [...previous, ...page.items.filter(item =>
        !previous.some(old => old.id_campanha === item.id_campanha))] : page.items);
      setCursor(page.next_cursor);
    } catch (failure) {
      if (ticket === request.current) { setError(failure.message); setItems([]); setCursor(null); }
    } finally { if (ticket === request.current) setLoading(false); }
  }, [service, query]);
  useEffect(() => {
    load();
    return () => { ++request.current; ++detailRequest.current; };
  }, [load]);
  async function open(id) {
    const ticket = ++detailRequest.current;
    setDetail(null); setOperation(null); setNotice(''); setError(''); setDetailLoading(true);
    try {
      const value = await service.detail(id);
      if (ticket !== detailRequest.current) return;
      setDetail(value);
      if (!value) setError('Campanha não encontrada ou acesso indisponível.');
    } catch (failure) { if (ticket === detailRequest.current) setError(failure.message); }
    finally { if (ticket === detailRequest.current) setDetailLoading(false); }
  }
  const button = (label, action) => <TouchableOpacity accessibilityRole="button"
    accessibilityState={{ disabled: loading || detailLoading }} disabled={loading || detailLoading}
    style={styles.button} onPress={action}><Text>{label}</Text></TouchableOpacity>;
  if (!service?.available) return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Campanhas</Text>
    <Text accessibilityRole="alert">Listagem, busca e detalhes administrativos bloqueados: contrato do Supabase aguarda aprovação e validação.</Text>
  </View>;
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Campanhas</Text>
    <TextInput accessibilityLabel="Pesquisar campanhas por título, ID ou local" placeholder="Título, ID ou local"
      maxLength={120} style={styles.input} value={search} onChangeText={setSearch}
      returnKeyType="search" onSubmitEditing={() => setQuery({ search: search.trim() })} />
    {button('Pesquisar campanhas', () => setQuery({ search: search.trim() }))}
    {button('Atualizar campanhas', () => load())}
    {service.contracts?.create === true && button('Cadastrar campanha', () => { setDetail(null); setOperation('create'); setNotice(''); })}
    {loading && <ActivityIndicator accessibilityLabel="Carregando campanhas" />}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!!notice && <Text accessibilityRole="status">{notice}</Text>}
    {!loading && !error && items.length === 0 && <Text>Nenhuma campanha encontrada.</Text>}
    {items.map(item => <View key={item.id_campanha} style={styles.card}>
      <Text>{item.titulo || item.tipo}</Text>
      <Text>ID: {item.id_campanha} · Local: {item.id_local} · {item.status}</Text>
      {button(`Ver campanha ${item.id_campanha}`, () => open(item.id_campanha))}
    </View>)}
    {!!cursor && button('Carregar mais campanhas', () => load(cursor))}
    {detailLoading && <ActivityIndicator accessibilityLabel="Carregando detalhes da campanha" />}
    {detail && <View style={styles.card}>
      <Text accessibilityRole="header">Detalhes da campanha {detail.id_campanha}</Text>
      <Text>{detail.titulo || detail.tipo}</Text><Text>{detail.mensagem}</Text>
      <Text>Local: {detail.id_local} · Parceiro: {detail.id_usuario}</Text>
      <Text>Status: {detail.status} · Duração: {detail.duracao_dias} dias</Text>
      <Text>Início: {detail.data_inicio || 'Não iniciado'} · Fim: {detail.data_fim || 'Não definido'}</Text>
      {[
        ['update', 'Editar campanha', detail.status === 'rascunho'],
        ['approve', 'Aprovar campanha', detail.status === 'rascunho'],
        ['activate', 'Ativar campanha', ['rascunho', 'pausada'].includes(detail.status)],
        ['pause', 'Pausar campanha', detail.status === 'ativa'],
        ['end', 'Encerrar campanha', ['ativa', 'pausada'].includes(detail.status)],
      ].map(([action, label, allowed]) => service.contracts?.[action] === true && allowed
        ? <View key={action}>{button(label, () => setOperation(action))}</View> : null)}
      {button('Fechar campanha', () => { ++detailRequest.current; setDetail(null); })}
    </View>}
    {operation && <AdminCampaignOperationForm key={`${operation}:${detail?.id_campanha || 'new'}:${detail?.version || ''}`}
      operation={operation} campaign={detail} service={service} onCancel={() => setOperation(null)}
      onSuccess={receipt => { setNotice(`Operação confirmada. Registro de auditoria: ${receipt.audit_id}.`); load(); }} />}
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 }, title: { fontSize: 22, fontWeight: '700', color: '#1D173F' },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#D9CDEA', borderRadius: 12 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', backgroundColor: '#F0E7FF', borderRadius: 12 },
  card: { padding: 14, gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
