import React, { useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { CAMPAIGN_TYPES, CAMPAIGN_DURATIONS, CAMPAIGN_AGE_RANGES } from '../utils/campaigns.js';

export function AdminCampaignOperationForm({ operation, campaign = null, service, onSuccess, onCancel, newKey = randomUUID }) {
  const [form, setForm] = useState({ localId: campaign?.id_local || '', ownerId: campaign?.id_usuario || '',
    tipo: campaign?.tipo || 'destaque', titulo: campaign?.titulo || '', mensagem: campaign?.mensagem || '',
    duracao_dias: campaign?.duracao_dias || 7, faixa_etaria: campaign?.faixa_etaria || 'Todos', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  const writing = useRef(false);
  const creating = operation === 'create';
  const editing = creating || operation === 'update';
  const enabled = service?.contracts?.[operation] === true;
  function change(key, value) { pending.current = null; setForm(old => ({ ...old, [key]: value })); }
  async function submit() {
    if (!enabled || writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try {
      const input = { reason: form.reason, ...(creating ? { localId: form.localId.trim(), ownerId: form.ownerId.trim() }
        : { id: campaign.id_campanha, expectedVersion: campaign.version }),
      ...(editing ? { fields: { tipo: form.tipo, titulo: form.titulo, mensagem: form.mensagem, duracao_dias: form.duracao_dias,
        faixa_etaria: form.faixa_etaria, raio_km: 5 } } : {}) };
      const fingerprint = JSON.stringify(input);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newKey() };
      const receipt = await service[operation]({ ...input, idempotencyKey: pending.current.key });
      pending.current = null;
      onSuccess(receipt);
    } catch (failure) { setError(failure.message); }
    finally { writing.current = false; setBusy(false); }
  }
  const button = (label, action, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled}
    accessibilityState={{ disabled: busy || disabled }} onPress={action} style={{ minHeight: 48, justifyContent: 'center' }}><Text>{label}</Text></TouchableOpacity>;
  const field = (key, label, limit = 200) => <TextInput accessibilityLabel={label} placeholder={label} value={form[key]}
    editable={!busy} maxLength={limit} onChangeText={value => change(key, value)} style={{ minHeight: 48, borderWidth: 1, padding: 12 }} />;
  return <View style={{ gap: 10, padding: 14 }}>
    <Text accessibilityRole="header">{creating ? 'Cadastrar campanha administrativa' : operation === 'update' ? 'Editar rascunho da campanha' : 'Confirmar alteração de status'}</Text>
    {creating && <>{field('localId', 'ID do local')}{field('ownerId', 'UUID do proprietário do local')}</>}
    {editing && <>
      {CAMPAIGN_TYPES.map(tipo => <View key={tipo}>{button(`${form.tipo === tipo ? 'Selecionado: ' : ''}${tipo}`, () => change('tipo', tipo))}</View>)}
      {field('titulo', 'Título da campanha')}{field('mensagem', 'Mensagem da campanha', 2000)}
      {CAMPAIGN_DURATIONS.map(days => <View key={days}>{button(`${form.duracao_dias === days ? 'Selecionado: ' : ''}${days} dias`, () => change('duracao_dias', days))}</View>)}
      {CAMPAIGN_AGE_RANGES.map(age => <View key={age}>{button(`${form.faixa_etaria === age ? 'Selecionado: ' : ''}Público ${age}`, () => change('faixa_etaria', age))}</View>)}
      <Text>O servidor confirma propriedade, regras comerciais e valor da oferta. O cadastro não ativa nem cobra a campanha.</Text>
    </>}
    {field('reason', 'Motivo da operação na campanha', 2000)}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!enabled && <Text accessibilityRole="alert">Operação bloqueada até validação do contrato no Supabase.</Text>}
    {button('Confirmar operação na campanha', submit, !enabled)}
    {button('Cancelar operação na campanha', onCancel)}
  </View>;
}
