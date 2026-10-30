import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet,
  Text, TouchableOpacity, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { locaisService } from '../services/locaisService';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4';
const MENU_CATEGORIES = ['Entradas', 'Pratos principais', 'Burguers', 'Sobremesas', 'Bebidas'];

function money(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
}

export function DetalhesLocalScreen({ route, navigation }) {
  const { idLocal, local: initialLocal } = route.params || {};
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const userId = user?.id_usuario || user?.id;
  const [local, setLocal] = useState(initialLocal || null);
  const [loading, setLoading] = useState(!initialLocal);
  const [error, setError] = useState('');
  const [activeMenu, setActiveMenu] = useState(0);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [avaliacoesErro, setAvaliacoesErro] = useState('');
  const [nota, setNota] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [filtroNota, setFiltroNota] = useState(null);
  const menuWidth = Math.min(width - 60, 352);

  useEffect(() => {
    let active = true;
    if (idLocal == null || String(idLocal).startsWith('demo-')) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    locaisService.getLocalById(idLocal)
      .then((data) => { if (active) { setLocal(data); setError(''); } })
      .catch((e) => { if (active) setError(e.message || 'Falha ao carregar o estabelecimento.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [idLocal]);

  useEffect(() => {
    if (!idLocal || String(idLocal).startsWith('demo-')) return;
    let ativo = true;
    const carregar = async () => {
      const { data, error: erroConsulta } = await supabase
        .from('avaliacoes_locais')
        .select('id_avaliacao, id_usuario, nota, comentario, created_at')
        .eq('id_local', idLocal)
        .order('created_at', { ascending: false });
      if (!ativo) return;
      if (erroConsulta) setAvaliacoesErro('Não foi possível consultar as avaliações. Verifique a tabela no Supabase.');
      else { setAvaliacoes(data || []); setAvaliacoesErro(''); }
    };
    carregar();
    return () => { ativo = false; };
  }, [idLocal]);

  const enviarAvaliacao = async () => {
    if (!userId) return Alert.alert('Login necessário', 'Entre na sua conta para avaliar este local.');
    if (!local?.id_local || String(local.id_local).startsWith('demo-')) return Alert.alert('Local indisponível', 'Só é possível avaliar locais cadastrados.');
    if (nota === null) return Alert.alert('Escolha uma nota', 'Selecione uma nota de 0 a 5.');
    if (comentario.trim().length > 1000) return Alert.alert('Comentário muito longo', 'Utilize até 1.000 caracteres.');
    try {
      setEnviando(true);
      const { error: erroEnvio } = await supabase.from('avaliacoes_locais').upsert(
        { id_local: local.id_local, id_usuario: userId, nota, comentario: comentario.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'id_local,id_usuario' }
      );
      if (erroEnvio) throw erroEnvio;
      const { data, error: erroLeitura } = await supabase.from('avaliacoes_locais')
        .select('id_avaliacao, id_usuario, nota, comentario, created_at')
        .eq('id_local', local.id_local).order('created_at', { ascending: false });
      if (erroLeitura) throw erroLeitura;
      setAvaliacoes(data || []);
      setComentario(''); setNota(null); setAvaliacoesErro('');
      Alert.alert('Avaliação enviada', 'Sua avaliação foi registrada com sucesso.');
    } catch (e) {
      Alert.alert('Erro ao avaliar', e?.message || 'Não foi possível salvar sua avaliação.');
    } finally { setEnviando(false); }
  };

  const openMap = async () => {
    const address = [local?.endereco, local?.bairro, local?.cidade_uf].filter(Boolean).join(', ');
    if (!address) return Alert.alert('Endereço indisponível', 'O estabelecimento não informou o endereço.');
    try { await Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)); }
    catch { Alert.alert('Mapa indisponível', 'Não foi possível abrir o mapa.'); }
  };

  const price = local?.preco != null ? money(local.preco) : money(local?.preco_entrada);
  const priceCaption = local?.preco != null ? 'por pessoa' : 'entrada';
  const ratingCount = avaliacoes.length;
  const rating = ratingCount ? avaliacoes.reduce((acc, r) => acc + Number(r.nota), 0) / ratingCount : null;
  const avaliacoesFiltradas = filtroNota === null ? avaliacoes : avaliacoes.filter(r => Number(r.nota) === filtroNota);
  const formatarData = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: local?.imagem_url || FALLBACK_IMAGE }} style={styles.hero} resizeMode="cover" />
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={23} color="#1E1848" />
          </TouchableOpacity>
        </View>
        {loading ? <ActivityIndicator style={styles.loader} color="#1E1848" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {local ? (
          <>
            <View style={styles.infoBlock}>
              <Text style={styles.title}>{local.nome || 'Estabelecimento'}</Text>
              <View style={styles.addressAndPrice}>
                <View style={styles.addressWrap}>
                  <Feather name="map-pin" color="#1E1848" size={16} />
                  <Text style={styles.address} numberOfLines={2}>
                    {[local.endereco, local.bairro].filter(Boolean).join(' - ') || 'Endereço não informado'}
                  </Text>
                </View>
                {price ? <View style={styles.priceWrap}><Text style={styles.price}>{price}</Text><Text style={styles.priceCaption}>{priceCaption}</Text></View> : null}
              </View>
              {rating != null ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={20} color="#E4AA20" />
                  <Text style={styles.ratingText}>{Number(rating).toFixed(1)}{ratingCount != null ? ' (' + ratingCount + ')' : ''}</Text>
                </View>
              ) : null}
              <Text style={styles.description}>{local.descricao || 'Este estabelecimento ainda não cadastrou uma descrição.'}</Text>
              <TouchableOpacity style={styles.mapPreview} onPress={openMap} accessibilityRole="button" accessibilityLabel="Visualizar localização no mapa">
                <View style={styles.mapPinCircle}><Feather name="map-pin" color="#FFFFFF" size={23} /></View>
                <View style={{ flex: 1 }}><Text style={styles.mapPreviewTitle}>Localização</Text>
                  <Text style={styles.mapPreviewAddress} numberOfLines={2}>{[local.endereco, local.bairro, local.cidade_uf].filter(Boolean).join(', ') || 'Endereço não cadastrado'}</Text></View>
                <Feather name="external-link" size={19} color="#1E1848" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapButton} onPress={openMap} accessibilityRole="link">
                <Text style={styles.mapText}>Abrir no Mapa</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.menuBox, { width: menuWidth }]}>
              <LinearGradient colors={['#1E1848', '#483AAE', '#C51212']} start={{x: 0,y: 0}} end={{x: 1,y: 0}} style={styles.menuHeader}>
                <Text style={styles.menuTitle}>Cardápio</Text>
              </LinearGradient>
              <View style={styles.menuBody}>
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => setActiveMenu(Math.max(0, Math.min(MENU_CATEGORIES.length-1, Math.round(e.nativeEvent.contentOffset.x / (menuWidth - 8)))))}
                  style={{ flexGrow: 0 }}>
                  {MENU_CATEGORIES.map((cat) => (
                    <View key={cat} style={{ width: menuWidth - 8, minHeight: 430, paddingHorizontal: 10, paddingTop: 10 }}>
                      <Text style={styles.categoryTitle}>{cat.toUpperCase()}</Text>
                      <Text style={styles.menuEmpty}>O cardápio desta categoria ainda não foi cadastrado.</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.pagination}>
              {MENU_CATEGORIES.map((c, i) => <View key={c} style={[styles.dot, activeMenu === i && styles.dotActive]} />)}
            </View>
            <Text style={styles.swipeHint}>Deslize o cardápio para ver outras categorias</Text>
            <View style={styles.avaliacoesSecao}>
              <Text style={styles.avaliacoesTitulo}>Avaliações</Text>
              <View style={styles.avaliacaoPainel}>
                <View style={styles.resumoLinha}>
                  <View><Text style={styles.mediaNumero}>{rating === null ? '—' : rating.toFixed(1)}</Text>
                    <Text style={styles.resumoLegenda}>média de {ratingCount} {ratingCount === 1 ? 'avaliação' : 'avaliações'}</Text></View>
                  <View style={styles.resumoEstrelas}>
                    <Text style={styles.estrelasDouradas}>★★★★★</Text>
                    <Text style={styles.resumoLegenda}>{rating === null ? 'Sem avaliações' : rating >= 4 ? 'Excelente' : rating >= 3 ? 'Bom' : 'Avaliações'}</Text>
                  </View>
                </View>
                <View style={styles.filtrosNotas}>
                  {[5, 4, 3, 2, 1].map(n => (
                    <TouchableOpacity key={n} onPress={() => setFiltroNota(filtroNota === n ? null : n)}
                      style={[styles.filtroBotao, filtroNota === n && styles.filtroAtivo]} accessibilityLabel={'Filtrar ' + n + ' estrelas'}>
                      <Text style={styles.filtroTexto}>{n}★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.resumoLegenda}>{ratingCount ? 'Veja abaixo o que os visitantes estão dizendo sobre este local.' : 'Este local ainda não recebeu avaliações. Seja a primeira pessoa a avaliar!'}</Text>
              </View>
              <View style={styles.avaliacaoPainel}>
                <Text style={styles.painelTitulo}>Adicionar sua avaliação</Text>
                <View style={styles.usuarioLinha}>
                  <View style={styles.avatarSimbolo}><Feather name="user" size={20} color="#1E1848" /></View>
                  <View><Text style={styles.usuarioNome}>Você</Text><Text style={styles.usuarioLegenda}>Selecione de 0 a 5 estrelas</Text></View>
                </View>
                <View style={styles.escolherNota}>
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} style={[styles.notaBotao, nota === n && styles.notaAtiva]}
                      onPress={() => setNota(n)} accessibilityLabel={'Nota ' + n}>
                      <Text style={[styles.notaTexto, nota === n && styles.notaTextoAtiva]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.comentarioInput} placeholder="Escreva seu comentário..."
                  placeholderTextColor="#6A7282" multiline maxLength={1000}
                  value={comentario} onChangeText={setComentario} textAlignVertical="top" />
                <TouchableOpacity onPress={enviarAvaliacao} disabled={enviando} accessibilityRole="button">
                  <LinearGradient colors={['#1E1848', '#483AAE', '#C51212']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.botaoEnviar}>
                    {enviando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.botaoEnviarTexto}>Enviar avaliação</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <View style={styles.avaliacaoPainel}>
                <Text style={styles.painelTitulo}>Avaliações de usuários</Text>
                {avaliacoesErro ? <Text style={styles.mensagemVazia}>{avaliacoesErro}</Text> : null}
                {!avaliacoesErro && !avaliacoesFiltradas.length ? <Text style={styles.mensagemVazia}>{filtroNota !== null ? 'Nenhuma avaliação com esta nota.' : 'Ainda não há comentários de visitantes.'}</Text> : null}
                {avaliacoesFiltradas.map(a => (
                  <View key={a.id_avaliacao} style={styles.comentarioCard}>
                    <View style={styles.usuarioLinha}>
                      <View style={styles.avatarSimbolo}><Feather name="user" size={20} color="#1E1848" /></View>
                      <View style={{ flex: 1 }}><Text style={styles.usuarioNome}>{String(a.id_usuario) === String(userId) ? 'Você' : 'Usuário do RolêApp'}</Text>
                        <Text style={styles.usuarioLegenda}>{formatarData(a.created_at)}</Text></View>
                      <Text style={styles.estrelasDouradas}>{'★'.repeat(Math.max(0, Number(a.nota))) + '☆'.repeat(Math.max(0, 5 - Number(a.nota)))}</Text>
                    </View>
                    {a.comentario ? <Text style={styles.comentarioTexto}>{a.comentario}</Text> : <Text style={styles.usuarioLegenda}>Avaliação sem comentário.</Text>}
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : !loading ? <Text style={styles.error}>Local não encontrado.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingBottom: 40 },
  heroWrap: { height: 225, backgroundColor: '#EAE8F4', position: 'relative' },
  hero: { width: '100%', height: '100%' },
  back: { position: 'absolute', left: 15, top: 12, width: 37, height: 37, borderRadius: 19, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 3 },
  loader: { marginVertical: 12 },
  error: { margin: 20, color: '#C1121F' },
  infoBlock: { paddingHorizontal: 9, paddingTop: 6 },
  title: { fontSize: 32, fontWeight: '800', color: '#080808', marginBottom: 6 },
  addressAndPrice: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 43, gap: 4 },
  addressWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 3, marginRight: 5 },
  address: { flex: 1, fontSize: 17, lineHeight: 22, color: '#676767' },
  priceWrap: { alignItems: 'flex-end', minWidth: 85 },
  price: { fontSize: 23, fontWeight: '700', color: '#00A63E' },
  priceCaption: { color: '#8D8D8D', fontSize: 15 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1, marginBottom: 14 },
  ratingText: { fontSize: 18, color: '#676767' },
  description: { fontSize: 15, lineHeight: 19, color: '#0A0A0A', paddingHorizontal: 9, marginTop: 22, minHeight: 130 },
  mapButton: { alignSelf: 'center', marginTop: 18, marginBottom: 22 },
  mapText: { color: '#1E1848', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  menuBox: { alignSelf: 'center', height: 529, borderRadius: 16, borderWidth: 3, borderColor: '#483AAE', overflow: 'hidden', backgroundColor: '#FFFFFF', elevation: 4 },
  menuHeader: { height: 61, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  menuBody: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 13, borderBottomRightRadius: 13, flex: 1, paddingTop: 10 },
  categoryTitle: { textAlign: 'center', fontSize: 23, color: '#1E2939', fontWeight: '800' },
  menuEmpty: { textAlign: 'center', fontSize: 14, color: '#6A7282', marginTop: 40, paddingHorizontal: 12, lineHeight: 21 },
  pagination: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  dot: { backgroundColor: '#D4D1E7', height: 7, width: 7, borderRadius: 4 },
  dotActive: { width: 19, backgroundColor: '#1E1848' },
  swipeHint: { textAlign: 'center', color: '#6A7282', fontSize: 11, marginTop: 8 },
  mapPreview: { marginHorizontal: 12, marginTop: 14, minHeight: 71, padding: 12, backgroundColor: '#F0EFF8', borderRadius: 12, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#D8D3EE' },
  mapPinCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#483AAE', justifyContent: 'center', alignItems: 'center' },
  mapPreviewTitle: { fontSize: 14, fontWeight: '700', color: '#1E1848' },
  mapPreviewAddress: { fontSize: 12, color: '#6A7282', marginTop: 3 },
  avaliacoesSecao: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, gap: 16 },
  avaliacoesTitulo: { textAlign: 'center', color: '#1E1848', fontSize: 32, fontWeight: '800', fontStyle: 'italic', marginBottom: 0 },
  avaliacaoPainel: { borderWidth: 3, borderColor: '#483AAE', borderRadius: 16, padding: 16, backgroundColor: '#FFFFFF', gap: 12, elevation: 3 },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mediaNumero: { fontSize: 30, fontWeight: '700', color: '#1E1848' },
  resumoLegenda: { fontSize: 13, color: '#6A7282', lineHeight: 20 },
  resumoEstrelas: { alignItems: 'flex-end' },
  estrelasDouradas: { color: '#E6AA20', fontSize: 16, letterSpacing: 1 },
  filtrosNotas: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  filtroBotao: { flex: 1, height: 28, borderRadius: 11, borderWidth: 1, borderColor: '#1E1848', backgroundColor: '#E6E6E6', justifyContent: 'center', alignItems: 'center' },
  filtroAtivo: { backgroundColor: '#D7D1F4' },
  filtroTexto: { fontSize: 12, fontWeight: '600', color: '#1E1848' },
  painelTitulo: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#1E1848' },
  usuarioLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarSimbolo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAE8F4', justifyContent: 'center', alignItems: 'center' },
  usuarioNome: { fontSize: 14, fontWeight: '600', color: '#1E2939' },
  usuarioLegenda: { fontSize: 12, color: '#6A7282', marginTop: 4 },
  escolherNota: { flexDirection: 'row', gap: 7 },
  notaBotao: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#1E1848', backgroundColor: '#E6E6E6', alignItems: 'center', justifyContent: 'center' },
  notaAtiva: { backgroundColor: '#483AAE' },
  notaTexto: { color: '#1E1848', fontSize: 14, fontWeight: '600' },
  notaTextoAtiva: { color: '#FFFFFF' },
  comentarioInput: { height: 96, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 14, color: '#1E2939' },
  botaoEnviar: { height: 44, borderRadius: 12, borderWidth: 2, borderColor: '#483AAE', alignItems: 'center', justifyContent: 'center' },
  botaoEnviarTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  mensagemVazia: { color: '#6A7282', fontSize: 14, paddingVertical: 12 },
  comentarioCard: { borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, gap: 10 },
  comentarioTexto: { fontSize: 14, color: '#1E2939', lineHeight: 20 },
});
