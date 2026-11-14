import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { createProfileService } from '../services/profileService.js';
import { profileDisplayName } from '../utils/profile.js';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadUserAvatar, getContagemAvaliacoesUsuario } from '../services/userService.js';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase.js';
import { favoritosService } from '../services/favoritosService';
import { FORM_CONTENT } from '../utils/responsive';

const MAX_FILE_SIZE_MB = 5;
const profileService = createProfileService(supabase);

export function PerfilScreen({ navigation }) {
  const { user, logout, isAdmin, isPartner, profileError } = useAuth();
  
  const tabBarHeight = useBottomTabBarHeight();
  const [accountProfile, setAccountProfile] = useState(null);
  const [accountError, setAccountError] = useState(false);
  const [avatarUri, setAvatarUri] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [reviewsCount, setReviewsCount] = useState(null); // Estado para guardar a quantidade de avaliações
  const [saldo, setSaldo] = useState(0);
  const [modalSaldoVisible, setModalSaldoVisible] = useState(false);
  const [tipoOperacao, setTipoOperacao] = useState('adicionar');
  const [inputValorSaldo, setInputValorSaldo] = useState('');
  const [saldoVisivel, setSaldoVisivel] = useState(true);
  const [favorites, setFavorites] = useState({ owner: null, count: null, error: false });

  const userId = user?.id_usuario || user?.id;
  const favoritesCount = !userId ? 0 : favorites.owner === userId ? favorites.count : null;
  const favoritesError = favorites.owner === userId && favorites.error;

  useFocusEffect(useCallback(() => {
    let active = true;
    setAccountProfile(null);
    setAvatarUri(null);
    setReviewsCount(null);
    setAccountError(false);
    setSaldo(0);
    setModalSaldoVisible(false);
    setInputValorSaldo('');
    setFavorites({ owner: userId, count: null, error: false });
    if (userId) {
      profileService.getEditableProfile().then(data => {
        if (!active) return;
        setAccountProfile(data);
        setSaldo(Number(data?.saldo ?? 0));
        const photoUrl = data?.foto_url;
        setAvatarUri(photoUrl ? `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}t=${Date.now()}` : null);
        setImageError(false);
      }).catch(() => { if (active) setAccountError(true); });
      getContagemAvaliacoesUsuario(userId).then(count => {
        if (active) setReviewsCount(count);
      }).catch(() => { if (active) setReviewsCount(null); });
      favoritosService.getLocaisFavoritos(userId).then(locais => {
        if (active) setFavorites({ owner: userId, count: locais.length, error: false });
      }).catch(() => {
        if (active) setFavorites({ owner: userId, count: null, error: true });
      });
    }
    return () => { active = false; };
  }, [userId]));

  // Função para alterar o saldo (aumentar ou diminuir)
  const handleAlterarSaldo = async (valorDelta) => {
    if (!userId) return;

    const novoSaldo = Math.max(0, saldo + valorDelta); // Evita saldo negativo

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id_usuario', userId);

      if (error) throw error;

      setSaldo(novoSaldo);
    } catch (err) {
      console.error('Erro ao atualizar saldo:', err);
      Alert.alert('Erro', 'Não foi possível atualizar o saldo.');
    }
  };

  const confirmarAlteracaoSaldo = async () => {
    if (!userId) return;

    const valorNumerico = parseFloat(inputValorSaldo.replace(',', '.'));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      Alert.alert('Atenção', 'Informe um valor numérico válido maior que zero.');
      return;
    }

    const delta = tipoOperacao === 'adicionar' ? valorNumerico : -valorNumerico;
    
    const novoSaldo = saldo + delta;

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id_usuario', userId);

      if (error) throw error;

      setSaldo(novoSaldo);
      setModalSaldoVisible(false);
      setInputValorSaldo('');
      Alert.alert('Sucesso', 'Saldo atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar saldo:', err);
      Alert.alert('Erro', 'Não foi possível atualizar o saldo.');
    }
  };


  const handleSelectAvatar = () => {
    Alert.alert(
      'Alterar foto de perfil',
      'Escolha de onde deseja obter a imagem:',
      [
        { text: 'Tirar foto', onPress: () => selecionarImagem(true) },
        { text: 'Escolher da galeria', onPress: () => selecionarImagem(false) },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const selecionarImagem = async (camera) => {
    try {
      const { status } = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', camera
          ? 'Autorize o acesso à câmera para tirar uma foto.'
          : 'Autorize o acesso às fotos para escolher uma imagem.');
        return;
      }
      const options = { mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.[0]?.uri) {
        await processarEEnviarImagem(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Imagem indisponível', 'Não foi possível abrir a câmera ou a galeria. Tente novamente.');
    }
  };

  // Função auxiliar para validar o tamanho e enviar o arquivo
  const processarEEnviarImagem = async (imageUri) => {
    try {
      setLoadingImage(true);

      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists && fileInfo.size) {
        const fileSizeMB = fileInfo.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          Alert.alert(
            'Arquivo muito grande',
            `Limite máximo de ${MAX_FILE_SIZE_MB} MB excedido.`
          );
          setLoadingImage(false);
          return;
        }
      }

      if (!userId) {
        Alert.alert('Erro', 'Usuário não autenticado.');
        setLoadingImage(false);
        return;
      }

      const publicUrl = await uploadUserAvatar(userId, imageUri);
      const freshUrl = `${publicUrl}?t=${new Date().getTime()}`;

      setAvatarUri(freshUrl);
      setImageError(false);

      Alert.alert('Sucesso', 'Sua foto de perfil foi atualizada com sucesso!');
    } catch (error) {
      console.error('Erro no upload de avatar:', error);
      Alert.alert('Erro no Upload', error.message || 'Não foi possível salvar a imagem.');
    } finally {
      setLoadingImage(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient
        colors={['#1E1848', '#483AAE', '#FFFFFF']}
        locations={[0, 0.4, 0.8]}
        style={styles.topGradientBackground}
      />

      <View style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              accessibilityLabel="Alterar foto do perfil"
              onPress={handleSelectAvatar}
              activeOpacity={0.8}
              disabled={loadingImage}
            >
              <View style={styles.avatarContainer}>
                {loadingImage ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : avatarUri && !imageError ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarUserImage}
                    resizeMode="cover"
                    onError={(e) => {
                      console.warn('Falha ao carregar imagem:', e.nativeEvent.error);
                      setImageError(true);
                    }}
                  />
                ) : (
                  <Image
                    source={require('../../assets/brand_symbol.png')}
                    style={styles.avatarDefaultImage}
                    resizeMode="contain"
                  />
                )}
              </View>

              <View style={styles.editBadge}>
                <Feather name="camera" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <Text style={styles.userName}>{profileDisplayName(accountProfile, user)}</Text>
            <Text style={styles.userEmail}>{user?.email || 'E-mail não disponível'}</Text>
            {accountError && <Text>Não foi possível carregar seu nome e sua foto.</Text>}
          </View>

          <View style={styles.contentCard}>
            <View style={styles.topCardsRow}>
              <TouchableOpacity style={[styles.card, styles.wishlistCard]} onPress={() => navigation.navigate('Favoritos')}>
                <Image
                  source={require('../../assets/bookmark_symbol.png')}
                  style={styles.cardIcon}
                  resizeMode="contain"
                />
                <Text style={styles.wishlistLabel}>Rolês que quero visitar</Text>
                <Text style={styles.wishlistCount} accessibilityLiveRegion="polite"
                  accessibilityLabel={favoritesError ? 'Contagem de favoritos indisponível' : favoritesCount === null ? 'Carregando favoritos' : `${favoritesCount} ${favoritesCount === 1 ? 'local favorito' : 'locais favoritos'}`}>
                  {favoritesError ? 'Indisponível' : favoritesCount ?? '—'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.card, styles.visitedCard]} onPress={() => navigation.navigate('RolesScreen')}>
                <Ionicons name="map-outline" size={26} color="#4F159B" />
                <Text style={styles.cardLabel}>Meus rolês</Text>
              </TouchableOpacity>
            </View>

            {/* Card de Saldo Interativo */}
            <View style={styles.saldoCardContainer}>
              <View>
                <View style={styles.saldoHeaderRow}>
                  <Text style={styles.saldoLabel}>Seu Saldo</Text>
                  <TouchableOpacity 
                    onPress={() => setSaldoVisivel(!saldoVisivel)} 
                    style={styles.eyeButton}
                  >
                    <Feather 
                      name={saldoVisivel ? "eye" : "eye-off"} 
                      size={16} 
                      color="#64748B" 
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.saldoValue}>
                  {saldoVisivel ? `R$ ${saldo.toFixed(2).replace('.', ',')}` : 'R$ ••••••'}
                </Text>
              </View>

              <View style={styles.saldoAcoesRow}>
                <TouchableOpacity 
                  style={[styles.saldoActionBtn, { backgroundColor: '#EF4444' }]} 
                  onPress={() => {
                    setTipoOperacao('remover');
                    setInputValorSaldo('');
                    setModalSaldoVisible(true);
                  }}
                >
                  <Feather name="minus" size={16} color="#FFFFFF" />
                  <Text style={styles.saldoActionBtnText}>Remover</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.saldoActionBtn, { backgroundColor: '#10B981' }]} 
                  onPress={() => {
                    setTipoOperacao('adicionar');
                    setInputValorSaldo('');
                    setModalSaldoVisible(true);
                  }}
                >
                  <Feather name="plus" size={16} color="#FFFFFF" />
                  <Text style={styles.saldoActionBtnText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionPill} onPress={() => navigation.navigate('EditarPerfil')}>
                <Text style={styles.actionText}>Editar perfil</Text>
                <Feather name="edit-3" size={16} color="#1E293B" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionPill} onPress={() => navigation.navigate('MinhasAvaliacoes')}>
                <Text style={styles.actionText}>Avaliações Feitas</Text>
                <Text style={styles.actionBadge}>{reviewsCount ?? '—'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuList}>

<TouchableOpacity
  style={styles.meusLugaresButton}
  activeOpacity={0.8}
  onPress={() => {
    if (isPartner) {
      navigation.navigate('MeusLugares');
    } else {
      navigation.navigate('SejaParceiro');
    }
  }}
>
  <View style={styles.meusLugaresIcon}>
    <Ionicons
      name="storefront-outline"
      size={24}
      color="#FFFFFF"
    />
  </View>

  <View style={{ flex: 1 }}>
    <Text style={styles.meusLugaresTitle}>
      Meus Lugares
    </Text>

    <Text style={styles.meusLugaresSubtitle}>
      {isPartner
        ? 'Gerencie seus estabelecimentos'
        : 'Torne-se parceiro do RolêApp'}
    </Text>
  </View>

  <Ionicons
    name="chevron-forward"
    size={22}
    color="#FFFFFF"
  />
</TouchableOpacity>

              {isAdmin && <TouchableOpacity style={styles.menuItem}
                onPress={() => navigation.navigate('PainelAdmin')}>
                <Text style={styles.menuText}>Painel Administrativo</Text>
              </TouchableOpacity>}
              {profileError && <Text>{profileError}</Text>}
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Configuracoes')}>
                <Text style={styles.menuText}>Configurações</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AjudaSuporte')}>
                <Text style={styles.menuText}>Ajuda e Suporte</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => navigation.navigate('SejaParceiro')}
              >
                <Text style={styles.menuText}>Seja parceiro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('TermosUso')}>
                <Text style={styles.menuText}>Termos de uso</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Privacidade')}>
                <Text style={styles.menuText}>Privacidade</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutText}>Sair</Text>
            </TouchableOpacity>
          </View>

          <Modal visible={modalSaldoVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {tipoOperacao === 'adicionar' ? 'Adicionar Saldo' : 'Remover Saldo'}
            </Text>
            <Text style={styles.sectionSubTitle}>Digite o valor em R$:</Text>

            <TextInput
              style={styles.inputSaldoModal}
              placeholder="Ex: 50.00"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={inputValorSaldo}
              onChangeText={setInputValorSaldo}
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setModalSaldoVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalBtn, 
                  styles.saveBtn, 
                  { backgroundColor: tipoOperacao === 'adicionar' ? '#10B981' : '#EF4444' }
                ]} 
                onPress={confirmarAlteracaoSaldo}
              >
                <Text style={styles.saveBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <View style={{height:100}}></View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topGradientBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  safeArea: { flex: 1 },
  scrollContent: { ...FORM_CONTENT, paddingBottom: 16 },
  header: { alignItems: 'center', paddingBottom: 20, position: 'relative' },
  avatarWrapper: { position: 'relative', marginBottom: 8 },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#342B76',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  avatarDefaultImage: { width: 60, height: 60 },
  avatarUserImage: { width: '100%', height: '100%', borderRadius: 45 },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#483AAE',
    borderRadius: 12,
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  userName: { fontSize: 20, fontWeight: '700', color: '#0A0A0A', textAlign: 'center', paddingHorizontal: 16 },
  userEmail: { fontSize: 13, color: '#0A0A0A', marginTop: 2, textAlign: 'center', paddingHorizontal: 16 },
  contentCard: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  topCardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  card: { width: '48%', borderWidth: 1, borderColor: '#1E1848', borderRadius: 16, padding: 12, minHeight: 90 },
  wishlistCard: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 40, height: 40, marginRight: 8 },
  wishlistLabel: { fontSize: 12, fontWeight: '600', color: '#0F172A', flex: 1 },
  wishlistCount: { fontSize: 14, fontWeight: '700', color: '#483AAE', marginLeft: 8, flexShrink: 1 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 16 },
  actionPill: {
    flexBasis: 160,
    flexGrow: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#3B1A66',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#0F172A', flexShrink: 1 },
  actionBadge: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  menuList: { gap: 10, marginBottom: 20 },
  menuItem: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#3B1A66', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  menuText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  logoutButton: { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  logoutText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },


meusLugaresButton: {
  backgroundColor: '#4F159B',
  borderRadius: 16,
  padding: 16,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  marginBottom: 8,
  elevation: 3,
},

meusLugaresIcon: {
  width: 46,
  height: 46,
  borderRadius: 12,
  backgroundColor: '#7131C3',
  alignItems: 'center',
  justifyContent: 'center',
},

meusLugaresTitle: {
  fontSize: 16,
  fontWeight: '800',
  color: '#FFFFFF',
},

meusLugaresSubtitle: {
  fontSize: 12,
  color: '#E9DCFF',
  marginTop: 3,
},

  saldoCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saldoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  saldoValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginTop: 4,
  },
  saldoAcoesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saldoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saldoActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionSubTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  inputSaldoModal: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    color: '#1E293B',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
  },
  saveBtn: {
    marginLeft: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  saldoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeButton: {
    padding: 2,
  },
});
