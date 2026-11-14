import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ADMIN_PLACE_DRAFT_FIELDS, prepareAdminSupportDraft } from '../utils/adminSupportDraft.js';
import { CAMPAIGN_TYPES, CAMPAIGN_DURATIONS, CAMPAIGN_AGE_RANGES } from '../utils/campaigns.js';

// Formulário independente dos fluxos parceiros. Nunca grava ou chama RPC.
export function AdminSupportDraftForm({ resource }) {
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState('');
  const label = resource === 'locais' ? 'local' : 'campanha';
  const change = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  function start(value) {
    setMode(value); setMessage('');
    setForm({ tipo: 'destaque', duracao_dias: 7, faixa_etaria: 'Todos' });
  }
  const button = (title, action, selected = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }}
      style={[styles.button, selected && styles.selected]} onPress={action}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
  const input = (key, title, maxLength = 200, multiline = false) => (
    <View key={key} style={styles.field}>
      <Text>{title}</Text>
      <TextInput accessibilityLabel={title} value={form[key] || ''} maxLength={maxLength}
        multiline={multiline} onChangeText={value => change(key, value)} style={styles.input} />
    </View>
  );
  const choices = (key, values, title) => <View style={styles.field}>
    <Text>{title}</Text>
    <View style={styles.row}>{values.map(value => <View key={value}>
      {button(String(value), () => change(key, value), form[key] === value)}
    </View>)}</View>
  </View>;
  function check() {
    try {
      prepareAdminSupportDraft(resource, mode, form);
      setMessage('Dados conferidos apenas neste dispositivo. Nada foi cadastrado ou alterado. O envio permanece bloqueado.');
    } catch (failure) { setMessage(failure.message); }
  }
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Suporte ao parceiro</Text>
    <Text>Cadastro e edição bloqueados para envio. Você pode preparar os dados abaixo; eles ficam apenas em memória e são descartados ao sair desta seção.</Text>
    <View style={styles.row}>
      {button(`Preparar cadastro de ${label}`, () => start('create'), mode === 'create')}
      {button(`Preparar edição de ${label}`, () => start('update'), mode === 'update')}
    </View>
    {mode && <View style={styles.field}>
      <Text accessibilityRole="header" style={styles.title}>{mode === 'create' ? 'Cadastro' : 'Edição'} de {label} — preparação local</Text>
      {mode === 'update' && <>
        {input('id', resource === 'locais' ? 'ID do local' : 'ID da campanha')}
        {input('versao', 'Versão confirmada pelo servidor')}
        <Text>Dados não carregados do banco. A versão e os vínculos precisarão ser revalidados no envio futuro.</Text>
      </>}
      {resource === 'locais' ? <>
        {mode === 'create' && input('proprietario', 'ID do parceiro responsável')}
        {ADMIN_PLACE_DRAFT_FIELDS.map(([key, title]) => input(key, title, key === 'descricao' ? 2000 : 200, key === 'descricao'))}
        <Text>Proprietário de local existente, visibilidade, horários, eventos e localização não são alterados por este formulário.</Text>
      </> : <>
        {input('id_local', 'ID do local da campanha')}
        <Text>O servidor deverá confirmar o parceiro proprietário do local. O administrador atua como suporte e não se torna dono da campanha. Na edição, o vínculo com o local permanece fixo.</Text>
        {choices('tipo', CAMPAIGN_TYPES, 'Tipo de campanha')}
        {input('titulo', 'Título')}
        {input('mensagem', 'Mensagem', 2000, true)}
        {choices('duracao_dias', CAMPAIGN_DURATIONS, 'Duração desejada em dias')}
        {choices('faixa_etaria', CAMPAIGN_AGE_RANGES, 'Faixa etária')}
        <Text>Raio: 5 km. Plano, limites, orçamento e oferta dependem do servidor. Esta preparação não ativa campanhas nem altera preço, status ou datas.</Text>
      </>}
      {input('motivo', 'Motivo do suporte', 2000, true)}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
      {button('Conferir preparação local', check)}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabled}>
        <Text>Salvar no Supabase — bloqueado</Text>
      </TouchableOpacity>
      {button('Descartar preparação', () => { setMode(null); setForm({}); setMessage(''); })}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 }, field: { gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { color: '#1D173F', fontSize: 18, fontWeight: '700' },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#D9CDEA', borderRadius: 12, color: '#1D173F' },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: '#F0E7FF' },
  selected: { borderWidth: 2, borderColor: '#6820C9' }, buttonText: { color: '#6820C9', fontWeight: '600' },
  disabled: { minHeight: 48, padding: 12, opacity: 0.6 },
});
