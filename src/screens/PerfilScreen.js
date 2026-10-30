import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadUserAvatar, getContagemAvaliacoesUsuario } from '../services/userService.js'; // Importado getUserReviewsCount
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase.js';

const MAX_FILE_SIZE_MB = 5;

export function PerfilScreen({ navigation }) {
  const { user, logout, updateUserAvatar } = useAuth();
  
  const [avatarUri, setAvatarUri] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [reviewsCount, setReviewsCount] = useState(0); // Estado para guardar a quantidade de avaliações

  const userId = user?.id_usuario || user?.id;

  // Busca do avatar na tabela 'usuarios'
  const fetchUserProfile = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('foto_url')
        .eq('id_usuario', userId)
        .single();

      if (error) {
        console.error('Erro ao buscar foto do usuário:', error.message);
        return;
      }

      if (data?.foto_url) {
        const urlWithTimestamp = `${data.foto_url}?t=${new Date().getTime()}`;
        setAvatarUri(urlWithTimestamp);
        setImageError(false);
      }
    } catch (err) {
      console.error('Erro na requisição do perfil:', err);
    }
  }, [userId]);

  // Busca da quantidade de avaliações feitas pelo usuário
  const fetchReviewsCount = useCallback(async () => {
    if (!userId) return;

    try {
      const count = await getContagemAvaliacoesUsuario(userId);
      setReviewsCount(count);
    } catch (err) {
      console.error('Erro ao buscar quantidade de avaliações:', err);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserProfile();
    fetchReviewsCount();
  }, [fetchUserProfile, fetchReviewsCount]);

  const handleSelectAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const selectedAsset = result.assets[0];
      setLoadingImage(true);

      const fileInfo = await FileSystem.getInfoAsync(selectedAsset.uri);
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

      // Faz o upload correto com ArrayBuffer
      const publicUrl = await uploadUserAvatar(userId, selectedAsset.uri);
      const freshUrl = `${publicUrl}?t=${new Date().getTime()}`;

      setAvatarUri(freshUrl);
      setImageError(false);

      if (typeof updateUserAvatar === 'function') {
        await updateUserAvatar(freshUrl);
      }

      Alert.alert('Sucesso', 'Sua foto de perfil foi atualizada com sucesso!');
    } catch (error) {
      console.error('Erro no upload de avatar:', error);
      Alert.alert('Erro no Upload', error.message || 'Não foi possível salvar a imagem.');
    } finally {
      setLoadingImage(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#1E1848', '#483AAE', '#FFFFFF']}
        locations={[0, 0.4, 0.8]}
        style={styles.topGradientBackground}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.notificationButton}>
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarWrapper}
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

            <Text style={styles.userName}>{user?.nome || user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'usuario@email.com'}</Text>
          </View>

          <View style={styles.contentCard}>
            <View style={styles.topCardsRow}>
              <View style={[styles.card, styles.visitedCard]}>
                <Text style={styles.visitedCount}>24</Text>
                <Text style={styles.cardLabel}>Rolês Visitados</Text>
              </View>

              <TouchableOpacity style={[styles.card, styles.wishlistCard]}>
                <Image
                  source={require('../../assets/bookmark_symbol.png')}
                  style={styles.cardIcon}
                  resizeMode="contain"
                />
                <Text style={styles.wishlistLabel}>Rolês que quero visitar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionPill} onPress={handleSelectAvatar}>
                <Text style={styles.actionText}>Editar perfil</Text>
                <Feather name="edit-3" size={16} color="#1E293B" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionPill}>
                <Text style={styles.actionText}>Avaliações Feitas</Text>
                <Text style={styles.actionBadge}>{reviewsCount}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuList}>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Configurações</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Ajuda e Suporte</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => navigation.navigate('SejaParceiro')}
              >
                <Text style={styles.menuText}>Seja parceiro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Contate-nos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Termos e serviços</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Privacidade</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutText}>Sair</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topGradientBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  header: { alignItems: 'center', paddingBottom: 20, position: 'relative' },
  notificationButton: { position: 'absolute', top: 10, right: 20, backgroundColor: '#DC2626', borderRadius: 20, padding: 8 },
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
  userName: { fontSize: 20, fontWeight: '700', color: '#0A0A0A' },
  userEmail: { fontSize: 13, color: '#0A0A0A', marginTop: 2 },
  contentCard: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  topCardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  card: { width: '48%', borderWidth: 1, borderColor: '#1E1848', borderRadius: 16, padding: 12, height: 90 },
  visitedCard: { justifyContent: 'center' },
  visitedCount: { fontSize: 32, fontWeight: '700', color: '#0F172A' },
  cardLabel: { fontSize: 12, color: '#334155', fontWeight: '500' },
  wishlistCard: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 40, height: 40, marginRight: 8 },
  wishlistLabel: { fontSize: 12, fontWeight: '600', color: '#0F172A', flexShrink: 1 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  actionPill: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#3B1A66',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  actionBadge: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  menuList: { gap: 10, marginBottom: 20 },
  menuItem: { borderWidth: 1, borderColor: '#3B1A66', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  menuText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  logoutButton: { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  logoutText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});