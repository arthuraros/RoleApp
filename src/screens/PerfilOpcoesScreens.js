import { KeyboardViewport, KeyboardAwareScrollView } from '../components/KeyboardForm';
import { FORM_CONTENT } from '../utils/responsive';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, StyleSheet,
  Text, TextInput, TouchableOpacity, View, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { createProfileService } from '../services/profileService.js';
import { supabase } from '../services/supabase.js';
import { supportReport } from '../utils/profile.js';

const service = createProfileService(supabase);

function Page({ navigation, title, children }) {
  return <SafeAreaView style={styles.page}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Voltar" style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
    </View>
    <KeyboardViewport style={{ flex: 1 }}>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</KeyboardAwareScrollView>
    </KeyboardViewport>
  </SafeAreaView>;
}

function Button({ title, onPress, disabled }) {
  return <TouchableOpacity accessibilityRole="button" style={[styles.button, disabled && { opacity: 0.5 }]}
    onPress={onPress} disabled={disabled}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}

export function EditarPerfilScreen({ navigation }) {
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  useEffect(() => {
    let active = true;
    service.getEditableProfile().then(profile => {
      if (active) setNome(profile?.nome || '');
    }).catch(() => { if (active) setError('Não foi possível carregar seu perfil. Volte e tente novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);
  const save = async () => {
    if (loading || saving || error) return;
    setSaving(true);
    try {
      await service.updateName(nome);
      Alert.alert('Perfil atualizado', 'Seu nome foi salvo.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) { Alert.alert('Não foi possível salvar', err.message); }
    finally { setSaving(false); }
  };
  return <Page navigation={navigation} title="Editar perfil">
    {loading ? <ActivityIndicator color="#483AAE" /> : null}
    {error ? <Text style={styles.notice}>{error}</Text> : null}
    <Text style={styles.label}>Nome</Text>
    <TextInput accessibilityLabel="Nome" style={styles.input} value={nome} onChangeText={setNome}
      maxLength={120} editable={!loading && !saving && !error} autoCapitalize="words" />
    <Text style={styles.body}>E-mail: {user?.email || 'Não disponível'}</Text>
    <Text style={styles.body}>Para trocar sua foto, toque no avatar na tela Perfil.</Text>
    <Button title={saving ? 'Salvando…' : 'Salvar nome'} onPress={save} disabled={loading || saving || !!error || !nome.trim()} />
  </Page>;
}

export function ConfiguracoesScreen({ navigation }) {
  const { user, resetPassword } = useAuth();
  const [sending, setSending] = useState(false);
  const reset = async () => {
    if (sending || !user?.email) return;
    setSending(true);
    try {
      const result = await resetPassword(user.email);
      Alert.alert(result.success ? 'Verifique seu e-mail' : 'Não foi possível enviar', result.message || result.error);
    } catch { Alert.alert('Não foi possível enviar', 'Tente novamente mais tarde.'); }
    finally { setSending(false); }
  };
  return <Page navigation={navigation} title="Configurações">
    <Button title="Editar nome" onPress={() => navigation.navigate('EditarPerfil')} />
    <Button title={sending ? 'Enviando…' : 'Enviar link para redefinir senha'} onPress={reset} disabled={sending || !user?.email} />
    <Text style={styles.body}>O link será enviado ao e-mail da sua conta.</Text>
    <Button title="Permissões do dispositivo" onPress={async () => {
      try { await Linking.openSettings(); }
      catch { Alert.alert('Configurações indisponíveis', 'Abra as configurações do dispositivo e procure o RolêApp.'); }
    }} />
    <Text style={styles.body}>Consulte as permissões de localização e fotos nas configurações do sistema.</Text>
    <Button title="Ajuda e Suporte" onPress={() => navigation.navigate('AjudaSuporte')} />
  </Page>;
}

const FAQ = [
  ['Como criar uma conta?', 'Na tela de login, abra o cadastro e informe e-mail e senha. Se solicitado, confirme o e-mail antes de entrar.'],
  ['Não consigo entrar. O que fazer?', 'Confira seu e-mail e senha. Use a recuperação de senha na tela de login para solicitar um link.'],
  ['Onde encontro meus favoritos?', 'Abra a aba Favoritos. Você precisa estar conectado para guardar seus locais favoritos.'],
  ['Como encontro um estabelecimento?', 'Explore o Início ou o Mapa e abra os detalhes do local. A localização do dispositivo depende da sua permissão.'],
  ['Como solicitar uma parceria?', 'No Perfil, abra Seja parceiro e preencha os dados solicitados. O envio fica pendente de análise e não libera o painel automaticamente.'],
];
const CATEGORIES = ['Conta e acesso', 'Favoritos', 'Estabelecimentos', 'Parceria', 'Outro'];

export function AjudaSuporteScreen({ navigation }) {
  const [assunto, setAssunto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (sharing) return;
    try {
      const message = supportReport({ assunto, categoria, descricao });
      setSharing(true);
      await Share.share({ message });
    } catch (err) { Alert.alert('Não foi possível compartilhar', err.message || 'Tente novamente.'); }
    finally { setSharing(false); }
  };
  return <Page navigation={navigation} title="Ajuda e Suporte">
    <Text style={styles.heading}>Perguntas frequentes</Text>
    {FAQ.map(([question, answer]) => <View key={question} style={styles.card}>
      <Text style={styles.label}>{question}</Text><Text style={styles.body}>{answer}</Text>
    </View>)}
    <Text style={styles.heading}>Prepare seu relato</Text>
    <Text style={styles.notice}>Ainda não há um canal oficial de suporte definido. Compartilhar este relato não abre um chamado automaticamente. Escolha o destinatário no aplicativo de sua preferência.</Text>
    <Text style={styles.body}>Não inclua senhas, códigos de acesso ou outros dados sensíveis. O relato contém somente o que você preencher abaixo.</Text>
    <Text style={styles.label}>Assunto</Text>
    <TextInput accessibilityLabel="Assunto" style={styles.input} maxLength={120} value={assunto} onChangeText={setAssunto} />
    <Text style={styles.label}>Categoria do problema</Text>
    <View style={styles.categories}>{CATEGORIES.map(item => <TouchableOpacity key={item}
      accessibilityRole="radio" accessibilityState={{ checked: categoria === item }}
      style={[styles.category, categoria === item && styles.selected]} onPress={() => setCategoria(item)}>
      <Text style={{ color: categoria === item ? '#FFFFFF' : '#483AAE' }}>{item}</Text>
    </TouchableOpacity>)}</View>
    <Text style={styles.label}>Descrição</Text>
    <TextInput accessibilityLabel="Descrição" style={[styles.input, styles.multiline]} value={descricao}
      onChangeText={setDescricao} multiline maxLength={4000} textAlignVertical="top" />
    <Button title={sharing ? 'Compartilhando…' : 'Compartilhar relato'} onPress={share}
      disabled={sharing || !assunto.trim() || !categoria || !descricao.trim()} />
  </Page>;
}

export function MinhasAvaliacoesScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    service.getMyReviews().then(data => { if (active) setRows(data); })
      .catch(() => { if (active) setError('Não foi possível carregar suas avaliações.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <Page navigation={navigation} title="Minhas avaliações">
    {loading ? <ActivityIndicator color="#483AAE" /> : error ? <>
      <Text style={styles.notice}>{error}</Text><Button title="Tentar novamente" onPress={() => setAttempt(v => v + 1)} />
    </> : rows.length === 0 ? <Text style={styles.body}>Você ainda não tem avaliações cadastradas.</Text> :
      rows.map(row => <View key={row.id_avaliacao} style={styles.card}>
        <Text style={styles.label}>Nota: {row.nota}/5</Text>
        <Text style={styles.body}>{row.comentario || 'Avaliação sem comentário.'}</Text>
        <Button title="Ver estabelecimento" onPress={() => navigation.navigate('DetalhesLocal', { idLocal: row.id_local })} />
      </View>)}
  </Page>;
}

const DRAFT_NOTICE = 'RASCUNHO — conteúdo inicial, pendente de revisão e aprovação antes da publicação oficial. Não representa uma versão final aprovada.';

export function TermosUsoScreen({ navigation }) {
  return <Page navigation={navigation} title="Termos de uso">
    <Text style={styles.notice}>{DRAFT_NOTICE}</Text>
    <Text style={styles.heading}>Sobre o aplicativo</Text>
    <Text style={styles.body}>O RolêApp permite explorar estabelecimentos, consultar detalhes, salvar favoritos e publicar avaliações com uma conta. A parceria depende de análise administrativa.</Text>
    <Text style={styles.heading}>Acesso e informações</Text>
    <Text style={styles.body}>Alguns recursos dependem de autenticação e permissões da conta. Os dados dos estabelecimentos são apresentados no aplicativo e podem ser atualizados por seus responsáveis.</Text>
    <Text style={styles.heading}>Pontos pendentes de aprovação</Text>
    <Text style={styles.body}>Identificação do responsável pelo aplicativo, regras de uso e moderação, responsabilidades, condições aplicáveis às parcerias e canal oficial de contato ainda precisam ser definidos e revisados. Este rascunho não solicita aceite.</Text>
  </Page>;
}

export function PrivacidadeScreen({ navigation }) {
  return <Page navigation={navigation} title="Privacidade">
    <Text style={styles.notice}>{DRAFT_NOTICE}</Text>
    <Text style={styles.heading}>Conta e perfil</Text>
    <Text style={styles.body}>O projeto usa Supabase para autenticação, banco de dados e armazenamento de imagens. O cadastro usa e-mail e senha; há login com Google. O perfil permite salvar nome e foto. A sessão é persistida no dispositivo pelo cliente de autenticação.</Text>
    <Text style={styles.heading}>Uso dos recursos</Text>
    <Text style={styles.body}>Favoritos e avaliações são vinculados à conta. Solicitações de parceria incluem nome, e-mail, telefone e dados do estabelecimento. O código registra interações com locais para métricas dos parceiros.</Text>
    <Text style={styles.heading}>Localização e imagens</Text>
    <Text style={styles.body}>Os recursos de localização solicitam permissão para usar o GPS. Parceiros podem salvar as coordenadas de seus estabelecimentos. A troca de foto usa o seletor de imagens e envia o arquivo ao armazenamento do Supabase. Os mapas carregam recursos de Leaflet e mapas do OpenStreetMap pela internet.</Text>
    <Text style={styles.heading}>Relatos de suporte</Text>
    <Text style={styles.body}>O formulário prepara um texto com os campos preenchidos e abre o compartilhamento do dispositivo. Ele não cria um chamado nem salva o relato no Supabase. O destinatário é escolhido por você.</Text>
    <Text style={styles.heading}>Informações pendentes</Text>
    <Text style={styles.body}>A identificação do responsável, o canal de contato, os prazos de retenção, as bases legais e os procedimentos para pedidos relativos aos dados ainda precisam ser definidos e aprovados. Este texto descreve funcionalidades encontradas no código e não substitui a revisão das operações reais.</Text>
  </Page>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8F7FC' },
  header: { backgroundColor: '#483AAE', padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', flex: 1 },
  content: { ...FORM_CONTENT, padding: 20, paddingBottom: 32, gap: 14 },
  heading: { color: '#1E1848', fontSize: 19, fontWeight: '700' },
  label: { color: '#1E1848', fontSize: 16, fontWeight: '600' },
  body: { color: '#334155', fontSize: 15, lineHeight: 23 },
  notice: { backgroundColor: '#EDE9FE', color: '#342B76', padding: 14, borderRadius: 12, lineHeight: 22 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, gap: 8 },
  input: { borderWidth: 1, borderColor: '#8072BF', borderRadius: 12, padding: 14, backgroundColor: '#FFFFFF', color: '#1E1848', fontSize: 16 },
  multiline: { minHeight: 140 },
  button: { backgroundColor: '#483AAE', borderRadius: 12, padding: 15, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderWidth: 1, borderColor: '#483AAE', borderRadius: 20, padding: 10 },
  selected: { backgroundColor: '#483AAE' },
});
