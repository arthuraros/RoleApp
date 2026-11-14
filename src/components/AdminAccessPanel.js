import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { adminService } from '../services/adminService';
import { ADMIN_CAPABILITIES } from '../services/adminAccessManagementService.js';

export function AdminAccessPanel({ service = adminService.administradores, newKey = randomUUID }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const pending = useRef(null);
  const appliedSearch = useRef('');
  const writing = useRef(false);
  const load = useCallback(async (after = null, query = '') => {
    if (!service?.available) return;
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try {
      const page = await service.list({ search: query, cursor: after });
      if (ticket !== generation.current) return;
      setItems(old => after ? [...old, ...page.items.filter(item => !old.some(x => x.user_id === item.user_id))] : page.items);
      setCursor(page.next_cursor);
      if (!after) appliedSearch.current = query;
    } catch (failure) { if (ticket === generation.current) { setError(failure.message); setItems([]); setCursor(null); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }, [service]);
  useEffect(() => { load(); return () => { ++generation.current; }; }, [load]);
  async function open(userId) {
    const ticket = ++generation.current;
    setSelected(null); setForm(null); setError(''); setNotice(''); setBusy(true); pending.current = null;
    try {
      const value = await service.detail(userId);
      if (ticket !== generation.current) return;
      setSelected(value);
      if (!value) setError('Acesso administrativo não encontrado.');
    } catch (failure) { if (ticket === generation.current) setError(failure.message); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  function searchAdministrators() {
    setSelected(null); setForm(null); pending.current = null;
    load(null, search.trim());
  }
  function edit(operation) {
    pending.current = null; setError(''); setNotice('');
    setForm({ operation, userId: selected?.user_id || '', expectedVersion: selected?.version ?? null,
      capabilities: selected?.capabilities || [], reason: '' });
  }
  function change(key, value) { pending.current = null; setForm(old => ({ ...old, [key]: value })); }
  async function save() {
    if (writing.current || !form || service?.contracts?.[form.operation] !== true) return;
    writing.current = true; setBusy(true); setError(''); setNotice('');
    const ticket = ++generation.current;
    try {
      const input = { userId: form.userId.trim(), expectedVersion: form.expectedVersion,
        capabilities: form.capabilities, reason: form.reason.trim() };
      const fingerprint = JSON.stringify({ operation: form.operation, ...input });
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newKey() };
      const result = await service[form.operation]({ ...input, idempotencyKey: pending.current.key });
      if (ticket !== generation.current) return;
      pending.current = null; setForm(null); setSelected(null);
      setNotice(`Operação confirmada. Registro de auditoria: ${result.audit_id}.`);
      await load(null, search.trim());
    } catch (failure) { if (ticket === generation.current) setError(failure.message); }
    finally { writing.current = false; if (ticket === generation.current) setBusy(false); }
  }
  const button = (label, action, disabled = false) => <TouchableOpacity accessibilityRole="button"
    disabled={busy || disabled} accessibilityState={{ disabled: busy || disabled }} onPress={action} style={styles.button}><Text>{label}</Text></TouchableOpacity>;
  if (!service?.available) return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Administradores</Text>
    <Text>Interface administrativa integrada</Text>
    <Text accessibilityRole="alert">Gestão de acessos bloqueada até instalação e validação das RPCs no Supabase.</Text>
  </View>;
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Administradores</Text>
    <TextInput accessibilityLabel="Pesquisar administradores" value={search} editable={!busy} maxLength={120}
      onChangeText={setSearch} style={styles.input} returnKeyType="search" onSubmitEditing={searchAdministrators} />
    {button('Pesquisar administradores', searchAdministrators)}
    {service.contracts?.grant && button('Conceder acesso', () => { setSelected(null); pending.current = null;
      setForm({ operation: 'grant', userId: '', expectedVersion: null, capabilities: [], reason: '' }); })}
    {busy && <ActivityIndicator accessibilityLabel="Carregando administradores" />}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!!notice && <Text accessibilityRole="status">{notice}</Text>}
    {!busy && !error && items.length === 0 && <Text>Nenhum administrador encontrado.</Text>}
    {items.map(item => <View key={item.user_id} style={styles.card}>
      <Text>{item.nome || item.user_id} · {item.active ? 'Ativo' : 'Inativo'}{item.principal ? ' · Principal' : ''}</Text>
      {button(`Ver administrador ${item.user_id}`, () => open(item.user_id))}
    </View>)}
    {!!cursor && button('Carregar mais administradores', () => load(cursor, appliedSearch.current))}
    {selected && <View style={styles.card}>
      <Text accessibilityRole="header">Permissões administrativas</Text>
      <Text>{selected.user_id} · {selected.active ? 'Ativo' : 'Inativo'}{selected.principal ? ' · Principal' : ''}</Text>
      {selected.capabilities.map(cap => <Text key={cap}>{cap}</Text>)}
      {service.contracts?.grant && button('Alterar capacidades ou reativar', () => edit('grant'))}
      {service.contracts?.suspend && button('Suspender acesso', () => edit('suspend'), !selected.active)}
      {service.contracts?.revoke && button('Revogar acesso', () => edit('revoke'))}
    </View>}
    {form && <View style={styles.card}>
      <Text accessibilityRole="header">{form.operation === 'grant' ? 'Conceder ou alterar acesso' : form.operation === 'suspend' ? 'Confirmar suspensão' : 'Confirmar revogação'}</Text>
      <TextInput accessibilityLabel="UUID do usuário existente" value={form.userId} editable={!busy && form.expectedVersion === null}
        onChangeText={value => change('userId', value)} style={styles.input} autoCapitalize="none" />
      {form.operation === 'grant' && ADMIN_CAPABILITIES.map(cap => <TouchableOpacity key={cap} accessibilityRole="checkbox"
        accessibilityLabel={cap} accessibilityState={{ checked: form.capabilities.includes(cap), disabled: busy }} disabled={busy}
        onPress={() => change('capabilities', form.capabilities.includes(cap) ? form.capabilities.filter(x => x !== cap) : [...form.capabilities, cap])}>
        <Text>{form.capabilities.includes(cap) ? '☑' : '☐'} {cap}</Text>
      </TouchableOpacity>)}
      <TextInput accessibilityLabel="Motivo da alteração de acesso" value={form.reason} editable={!busy} multiline maxLength={2000}
        onChangeText={value => change('reason', value)} style={styles.input} />
      <Text>O servidor valida suas capacidades, o acesso do alvo e a proteção do último principal.</Text>
      {button('Confirmar alteração de acesso', save, service.contracts?.[form.operation] !== true)}
      {button('Cancelar alteração', () => { setForm(null); pending.current = null; })}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 }, title: { fontSize: 22, fontWeight: '700' },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#D9CDEA', borderRadius: 12 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', backgroundColor: '#F0E7FF', borderRadius: 12 },
  card: { padding: 14, gap: 10, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
