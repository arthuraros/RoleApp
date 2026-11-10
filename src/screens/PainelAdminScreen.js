import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessGate } from '../components/AccessGate';
import { adminService } from '../services/adminService';

function Button({ label, onPress, disabled, selected }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, selected && styles.selected, disabled && { opacity: 0.5 }]}>
    <Text>{label}</Text>
  </TouchableOpacity>;
}

function AdminContent({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [review, setReview] = useState(null);
  const [action, setAction] = useState('bloquear');
  const [localId, setLocalId] = useState(null);
  const [reason, setReason] = useState('');
  const [identityChecked, setIdentityChecked] = useState(false);
  const [duplicatesChecked, setDuplicatesChecked] = useState(false);
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const load = useCallback(async () => {
    try { setRequests(await adminService.listarSolicitacoes()); }
    catch (error) { Alert.alert('Acesso administrativo', error.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const inspect = async id => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setReview(null);
    try {
      const result = await adminService.revisarSolicitacao(id);
      setReview(result); setAction('bloquear'); setLocalId(null); setReason('');
      setIdentityChecked(false); setDuplicatesChecked(false);
      setAddress(''); setPrice(''); setEntryPrice('');
    } catch (error) { Alert.alert('Revisão indisponível', error.message); }
    finally { pending.current = false; setBusy(false); }
  };

  const submit = async decision => {
    if (pending.current || !review) return;
    pending.current = true; setBusy(true);
    try {
      await adminService.decidirSolicitacao({
        reviewId: review.revisao_id, decisao: decision,
        acao: decision === 'rejeitado' ? 'nenhuma' : decision === 'em_analise' ? 'bloquear' : action,
        motivo: reason, identidadeValidada: identityChecked, duplicidadeRevisada: duplicatesChecked,
        idLocalExistente: decision === 'aprovado' && action === 'vincular_existente' ? localId : null,
        novoLocal: decision === 'aprovado' && action === 'criar_novo' ? {
          endereco: address, preco: Number(price.replace(',', '.')),
          preco_entrada: entryPrice.trim() ? Number(entryPrice.replace(',', '.')) : NaN,
        } : null,
      });
      setReview(null); await load(); Alert.alert('Decisão registrada', 'O resultado foi registrado com auditoria.');
    } catch (error) {
      Alert.alert('Decisão não confirmada', `${error.message} Reutilize a mesma revisão e decisão para consultar uma tentativa repetida. Se os dados mudaram, abra uma nova revisão.`);
    } finally { pending.current = false; setBusy(false); }
  };

  const candidates = review?.estado?.candidatos || [];
  const related = review?.estado?.solicitacoes_relacionadas || [];
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button label="Voltar" onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Painel Administrativo</Text>
      <Text>Aprovações exigem revisão de identidade e vínculo. Nenhum local é selecionado automaticamente.</Text>
      <Button label="Atualizar solicitações" onPress={load} disabled={busy} />
      {busy && <ActivityIndicator accessibilityLabel="Processando revisão" />}
      {requests.map(request => <View style={styles.card} key={request.id_solicitacao}>
        <Text style={styles.heading}>#{request.id_solicitacao} · {request.estabelecimento}</Text>
        <Text>{request.cidade_estado} · {request.status}</Text>
        <Text>{request.nome} · {request.email}</Text>
        {['pendente', 'em_analise'].includes(request.status) && <Button label="Revisar solicitação"
          disabled={busy} onPress={() => inspect(request.id_solicitacao)} />}
      </View>)}
      {!requests.length && <Text>Nenhuma solicitação disponível.</Text>}
      {review && <View style={styles.card}>
        <Text style={styles.heading}>Revisão #{review.estado.solicitacao.id_solicitacao}</Text>
        <Text>{review.estado.solicitacao.estabelecimento} · {review.estado.solicitacao.cidade_estado}</Text>
        <Text>Pedidos relacionados: {related.map(r => `#${r.id_solicitacao} (${r.status})`).join(', ') || 'nenhum'}</Text>
        <Text>Candidatos são indícios, não duplicações confirmadas. Pedidos ambíguos devem ficar em análise.</Text>
        {candidates.map(local => <Button key={local.id_local}
          label={`Vincular #${local.id_local}: ${local.nome} · ${local.id_proprietario ? 'com proprietário' : 'sem proprietário'}`}
          selected={action === 'vincular_existente' && localId === local.id_local} disabled={busy}
          onPress={() => { setLocalId(local.id_local); setAction('vincular_existente'); }} />)}
        <Button label="Criar novo após verificar ausência de vínculo" selected={action === 'criar_novo'}
          disabled={busy || candidates.length > 0 || related.some(r => ['pendente', 'em_analise', 'aprovado'].includes(r.status))}
          onPress={() => { setLocalId(null); setAction('criar_novo'); }} />
        {action === 'criar_novo' && <>
          <TextInput style={styles.input} placeholder="Endereço confirmado" value={address} onChangeText={setAddress} />
          <TextInput style={styles.input} placeholder="Gasto médio confirmado" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
          <TextInput style={styles.input} placeholder="Preço de entrada confirmado (0 se gratuita)" keyboardType="decimal-pad" value={entryPrice} onChangeText={setEntryPrice} />
        </>}
        <Button label="Bloquear para revisão manual" selected={action === 'bloquear'}
          disabled={busy} onPress={() => { setAction('bloquear'); setLocalId(null); }} />
        <Button label={`${identityChecked ? '✓' : '○'} Identidade e propriedade verificadas`}
          disabled={busy} onPress={() => setIdentityChecked(value => !value)} />
        <Button label={`${duplicatesChecked ? '✓' : '○'} Candidatos e pedidos relacionados revisados`}
          disabled={busy} onPress={() => setDuplicatesChecked(value => !value)} />
        <TextInput style={styles.input} placeholder="Justificativa e evidências (sem documentos sensíveis)"
          value={reason} onChangeText={setReason} multiline maxLength={2000} />
        <Button label="Aprovar seleção explícita" disabled={busy || action === 'bloquear'} onPress={() => submit('aprovado')} />
        <Button label="Manter em análise" disabled={busy} onPress={() => submit('em_analise')} />
        <Button label="Rejeitar solicitação" disabled={busy} onPress={() => submit('rejeitado')} />
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

export function PainelAdminScreen(props) {
  return <AccessGate role="admin"><AdminContent {...props} /></AccessGate>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6FB' }, content: { padding: 20, gap: 12 },
  title: { fontSize: 25, fontWeight: '700' }, heading: { fontSize: 17, fontWeight: '600' },
  card: { padding: 16, borderRadius: 12, backgroundColor: 'white', gap: 10 },
  button: { padding: 12, borderWidth: 1, borderColor: '#6B5DAA', borderRadius: 8, marginVertical: 3 },
  selected: { backgroundColor: '#E7E0FF' }, input: { borderWidth: 1, borderColor: '#aaa', borderRadius: 8, padding: 12 },
});
