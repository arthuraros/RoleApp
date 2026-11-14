import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image,
  TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
  Modal, TextInput, Animated, Linking, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { MainLayout } from '../components/MainLayout';
import { KeyboardViewport, KeyboardAwareScrollView } from '../components/KeyboardForm';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';
import { parceiroService } from '../services/parceiroService';
import { categoriasService } from '../services/categoriasService';
import { resolveHomeCategory, filterHomePlaces } from '../utils/homeFilters';
import { responsiveMetrics } from '../utils/responsive';

export function FavoritosScreen({ navigation }) {
  const dimensions = useWindowDimensions();
  const layout = responsiveMetrics({ ...dimensions, insets: useSafeAreaInsets() });
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const userId = user?.id_usuario || user?.id;

  const identity = useRef(null);
  if (identity.current?.userId !== userId || !identity.current) {
    identity.current = { userId, mutations: 0, removing: new Set() };
  }
  const account = identity.current;
  const focused = useRef(false);
  const generation = useRef(0);

  const [filters, setFilters] = useState({ account, search: '', category: null });
  const search = filters.account === account ? filters.search : '';
  const selectedCategory = filters.account === account ? filters.category : null;
  const changeFilters = patch => setFilters(previous => ({
    ...(previous.account === account ? previous : { account, search: '', category: null }), ...patch,
  }));

  const [favorites, setFavorites] = useState({ account: null, data: [], status: 'loading' });
  const [catalog, setCatalog] = useState({ account: null, data: [], status: 'loading', version: 0 });
  const [matches, setMatches] = useState({ key: '', pigIds: null, advancedIds: null, status: 'loading' });
  const [, updateRemoving] = useState(0);

  // Estados do Modal de Filtros Avançados e Sliders
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [price, setPrice] = useState('');
  const [distance, setDistance] = useState('');
  const [showTipoRolde, setShowTipoRolde] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedAdvCategories, setSelectedAdvCategories] = useState([]);
  const [advancedFilters, setAdvancedFilters] = useState({ price: null, distance: null, categoryIds: [] });
  const [applyingFilters, setApplyingFilters] = useState(false);
  const applyVersion = useRef(0);

  const [priceBarWidth, setPriceBarWidth] = useState(0);
  const [distanceBarWidth, setDistanceBarWidth] = useState(0);
  const priceProgress = Math.min(1, Math.max(0, (Number(price) || 0) / 200));
  const distanceProgress = Math.min(1, Math.max(0, (Number(distance) || 0) / 50));

  const slideAnim = useRef(new Animated.Value(-dimensions.height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleOpenFilter = () => {
    setIsFilterVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  };

  const handleCloseFilter = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -dimensions.height, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setIsFilterVisible(false));
  };

  const handlePriceSliderTouch = (evt) => {
    if (!priceBarWidth) return;
    const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / priceBarWidth));
    const val = Math.round(pct * 200);
    setPrice(val > 0 ? val.toString() : '');
  };

  const handleDistanceSliderTouch = (evt) => {
    if (!distanceBarWidth) return;
    const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / distanceBarWidth));
    const val = Math.round(pct * 50);
    setDistance(val > 0 ? val.toString() : '');
  };

  const aplicarFiltrosAvancados = async () => {
    if (applyingFilters) return;
    const version = ++applyVersion.current;
    setApplyingFilters(true);
    try {
      const priceLimit = price.trim() ? Number(price.replace(',', '.')) : null;
      const distanceLimit = distance.trim() ? Number(distance.replace(',', '.')) : null;

      if ((priceLimit !== null && (!Number.isFinite(priceLimit) || priceLimit < 0)) ||
          (distanceLimit !== null && (!Number.isFinite(distanceLimit) || distanceLimit < 0))) {
        Alert.alert('Filtros inválidos', 'Informe valores válidos de preço e distância.');
        return;
      }

      if (distanceLimit > 0 && !userLocation) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (version !== applyVersion.current) return;
        if (status !== 'granted') {
          Alert.alert('Permissão Negada', 'Autorize a localização para filtrar por distância.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configurações', onPress: () => Linking.openSettings().catch(() => {}) },
          ]);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (version !== applyVersion.current) return;
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }

      if (version !== applyVersion.current) return;
      setAdvancedFilters({ price: priceLimit, distance: distanceLimit, categoryIds: selectedAdvCategories });
      handleCloseFilter();
    } catch {
      if (version === applyVersion.current) Alert.alert('Erro', 'Não foi possível aplicar os filtros.');
    } finally {
      if (version === applyVersion.current) setApplyingFilters(false);
    }
  };

  const limparFiltros = () => {
    applyVersion.current += 1;
    setApplyingFilters(false);
    setSelectedAdvCategories([]);
    setPrice('');
    setDistance('');
    changeFilters({ category: null });
    setAdvancedFilters({ price: null, distance: null, categoryIds: [] });
    handleCloseFilter();
  };

  const reload = useCallback(() => {
    if (!focused.current || identity.current.userId !== userId) return;
    const owner = identity.current;
    const version = ++generation.current;
    const current = () => focused.current && identity.current === owner && generation.current === version;
    setFavorites({ account: owner, data: [], status: userId ? 'loading' : 'ready' });
    setCatalog({ account: owner, data: [], status: userId ? 'loading' : 'ready', version });
    if (!userId) return;

    (async () => {
      while (current()) {
        const mutations = owner.mutations;
        try {
          const data = await favoritosService.getLocaisFavoritos(userId);
          if (!current()) return;
          if (mutations !== owner.mutations) continue;
          setFavorites({ account: owner, data: data ?? [], status: 'ready' });
        } catch {
          if (current()) setFavorites({ account: owner, data: [], status: 'error' });
        }
        return;
      }
    })();
    categoriasService.getCategorias().then(data => {
      if (current()) setCatalog({ account: owner, data: data ?? [], status: 'ready', version });
    }).catch(() => {
      if (current()) setCatalog({ account: owner, data: [], status: 'error', version });
    });
  }, [userId]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    reload();
    return () => { focused.current = false; generation.current += 1; };
  }, [reload]));

  const catalogReady = catalog.account === account && catalog.status === 'ready';
  const activeCategory = resolveHomeCategory(selectedCategory, catalogReady ? catalog.data : []);
  const hasAnyCategory = Boolean(selectedCategory || advancedFilters.categoryIds.length > 0);
  const categoryKey = JSON.stringify([
    userId, catalog.version, selectedCategory, activeCategory?.databaseId,
    activeCategory?.status, advancedFilters.categoryIds,
  ]);

  useEffect(() => {
    if (!userId || !focused.current || !hasAnyCategory) {
      setMatches({ key: categoryKey, pigIds: null, advancedIds: null, status: 'ready' });
      return;
    }
    if (selectedCategory && (!catalogReady || activeCategory?.status !== 'matched')) return;

    let active = true;
    const version = generation.current;
    const current = () => active && focused.current && identity.current === account && generation.current === version;
    setMatches({ key: categoryKey, pigIds: [], advancedIds: [], status: 'loading' });

    Promise.all([
      activeCategory ? categoriasService.getLocaisIdsPorCategorias([activeCategory.databaseId]) : null,
      advancedFilters.categoryIds.length ? categoriasService.getLocaisIdsPorCategorias(advancedFilters.categoryIds) : null,
    ]).then(([pigIds, advancedIds]) => {
      if (current()) setMatches({ key: categoryKey, pigIds, advancedIds, status: 'ready' });
    }).catch(() => {
      if (current()) setMatches({ key: categoryKey, pigIds: [], advancedIds: [], status: 'error' });
    });

    return () => { active = false; };
  }, [categoryKey, account, catalogReady]);

  const removerFavorito = async (idLocal) => {
    if (!userId || identity.current !== account || !focused.current || account.removing.has(String(idLocal))) return;
    account.removing.add(String(idLocal));
    updateRemoving(value => value + 1);
    try {
      await favoritosService.removerFavorito(userId, idLocal);
      if (identity.current !== account) return;
      account.mutations += 1;
      setFavorites(previous => previous.account !== account ? previous : {
        ...previous, data: previous.data.filter(local => String(local.id_local) !== String(idLocal)),
      });
    } catch {
      if (identity.current === account && focused.current) Alert.alert('Erro', 'Não foi possível remover o favorito.');
    } finally {
      account.removing.delete(String(idLocal));
      if (identity.current === account) updateRemoving(value => value + 1);
    }
  };

  const favoritesReady = favorites.account === account && favorites.status === 'ready';
  const favoritesError = favorites.account === account && favorites.status === 'error';
  const categoryError = hasAnyCategory && ((catalog.account === account && catalog.status === 'error')
    || (matches.key === categoryKey && matches.status === 'error'));
  const categoryUnavailable = selectedCategory && catalogReady && activeCategory?.status !== 'matched';
  const categoryLoading = hasAnyCategory && !categoryError && !categoryUnavailable
    && (!catalogReady || matches.key !== categoryKey || matches.status === 'loading');
  const loading = Boolean(userId && (!favoritesReady || categoryLoading));

  const locaisFiltrados = !userId || !favoritesReady || categoryError || categoryUnavailable || categoryLoading
    ? []
    : filterHomePlaces(favorites.data, {
        search,
        price: advancedFilters.price,
        distance: advancedFilters.distance,
        location: userLocation,
        pigPlaceIds: selectedCategory ? matches.pigIds : null,
        advancedPlaceIds: advancedFilters.categoryIds.length ? matches.advancedIds : null,
      });

  return (
    <MainLayout
      searchValue={search}
      onSearchChange={value => changeFilters({ search: value })}
      selectedCategory={selectedCategory}
      onSelectCategory={id => changeFilters({ category: selectedCategory === id ? null : id })}
      onFilterPress={handleOpenFilter}
    >
      {favoritesError || categoryError ? (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert">{favoritesError ? 'Não foi possível carregar seus favoritos.' : 'Não foi possível carregar o filtro de categoria.'}</Text>
          <TouchableOpacity style={styles.detailsButton} accessibilityRole="button" onPress={reload}>
            <Text style={styles.detailsButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : categoryUnavailable && userId ? (
        <View style={styles.feedback}>
          <Text>A categoria {activeCategory?.name || ''} está indisponível no momento.</Text>
          <TouchableOpacity style={styles.detailsButton} accessibilityRole="button" onPress={() => changeFilters({ category: null })}>
            <Text style={styles.detailsButtonText}>Limpar categoria</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel="Carregando favoritos e filtros" size="large" color="#1E1B4B" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={locaisFiltrados}
          keyExtractor={(item) => String(item.id_local)}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {selectedCategory ? `Nenhum favorito encontrado em ${activeCategory.name}${search ? ' para esta pesquisa' : ''}.` : 'Nenhum local favorito encontrado.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: item.imagem_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' }}
                  style={styles.image}
                />
                <TouchableOpacity
                  style={styles.heartButton}
                  onPress={() => removerFavorito(item.id_local)}
                  accessibilityLabel="Remover dos favoritos"
                  disabled={account.removing.has(String(item.id_local))}
                  accessibilityState={{ disabled: account.removing.has(String(item.id_local)) }}
                >
                  <MaterialCommunityIcons
                    name="heart"
                    size={24}
                    color="#DC2626"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.info}>
                <Text style={styles.name}>{item.nome}</Text>
                <Text style={styles.address}>{item.endereco}</Text>
                <Text style={styles.price}>
                  {item.preco_entrada === 0
                    ? 'Entrada gratuita'
                    : item.preco_entrada != null
                      ? `Entrada: R$ ${item.preco_entrada}`
                      : item.preco != null
                        ? `Preço médio: R$ ${item.preco}`
                        : 'Preço não informado'}
                </Text>
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => {
                    if (item.id_local && !String(item.id_local).startsWith('demo-')) {
                      parceiroService.registrarMetrica({ idLocal: item.id_local, cliques: 1 }).catch(() => {});
                    }
                    navigation.navigate('DetalhesLocal', { idLocal: item.id_local, local: item });
                  }}
                >
                  <Text style={styles.detailsButtonText}>Ver detalhes</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Modal de Filtros Avançados */}
      <Modal visible={isFilterVisible} transparent={true} animationType="none" onRequestClose={handleCloseFilter}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardViewport style={{ flex: 1 }}>
            <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
              <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={handleCloseFilter}>
                <TouchableOpacity activeOpacity={1} style={styles.cardWrapperTouchable}>
                  <Animated.View style={[styles.filterCard, { maxHeight: layout.modalMaxHeight, transform: [{ translateY: slideAnim }] }]}>
                    <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      
                      {/* Preço */}
                      <View style={styles.sectionHeaderModal}>
                        <Text style={styles.sectionTitleModal}>Preço</Text>
                        <View style={styles.inputContainer}>
                          <Text style={styles.currency}>R$</Text>
                          <TextInput
                            style={styles.inputBox}
                            value={price}
                            onChangeText={setPrice}
                            placeholder="00,00"
                            placeholderTextColor="#A0A0A0"
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        activeOpacity={1}
                        style={styles.sliderBar}
                        onLayout={(e) => setPriceBarWidth(e.nativeEvent.layout.width)}
                        onPress={handlePriceSliderTouch}
                      >
                        <View style={[styles.sliderProgressActive, { width: `${priceProgress * 100}%` }]} />
                        <View style={[styles.sliderThumb, { left: `${priceProgress * 100}%` }]} />
                      </TouchableOpacity>
                      <View style={styles.sliderLabels}>
                        <Text style={styles.limitLabel}>R$ 0</Text>
                        <Text style={styles.limitLabel}>R$ 200</Text>
                      </View>

                      {/* Distância */}
                      <View style={[styles.sectionHeaderModal, { marginTop: 20 }]}>
                        <Text style={styles.sectionTitleModal}>Distância</Text>
                        <View style={styles.inputContainer}>
                          <Text style={styles.currency}>KM</Text>
                          <TextInput
                            style={styles.inputBox}
                            value={distance}
                            onChangeText={setDistance}
                            placeholder="000"
                            placeholderTextColor="#A0A0A0"
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        activeOpacity={1}
                        style={styles.sliderBar}
                        onLayout={(e) => setDistanceBarWidth(e.nativeEvent.layout.width)}
                        onPress={handleDistanceSliderTouch}
                      >
                        <View style={[styles.sliderProgressActive, { width: `${distanceProgress * 100}%` }]} />
                        <View style={[styles.sliderThumb, { left: `${distanceProgress * 100}%` }]} />
                      </TouchableOpacity>
                      <View style={styles.sliderLabels}>
                        <Text style={styles.limitLabel}>0 KM</Text>
                        <Text style={styles.limitLabel}>50 KM</Text>
                      </View>

                      {/* Tipo de Rolê */}
                      <TouchableOpacity style={styles.dropdownHeader} onPress={() => setShowTipoRolde(!showTipoRolde)}>
                        <Text style={styles.dropdownTitle}>Tipo de Rolê</Text>
                        <Feather name={showTipoRolde ? 'chevron-up' : 'chevron-down'} size={22} color="#1E1848" />
                      </TouchableOpacity>

                      {showTipoRolde && (
                        <View style={styles.checkboxGrid}>
                          {catalog.status === 'loading' ? <ActivityIndicator color="#1E1848" /> : null}
                          {catalog.data.map((cat) => {
                            const selecionado = selectedAdvCategories.includes(cat.id_categoria);
                            return (
                              <TouchableOpacity
                                key={cat.id_categoria}
                                style={[styles.checkboxItem, layout.compact && { width: '100%' }]}
                                onPress={() => {
                                  setSelectedAdvCategories((prev) =>
                                    prev.includes(cat.id_categoria)
                                      ? prev.filter((id) => id !== cat.id_categoria)
                                      : [...prev, cat.id_categoria]
                                  );
                                }}
                              >
                                <View style={[styles.checkboxBox, selecionado && styles.checkboxChecked]} />
                                <Text style={styles.checkboxText} numberOfLines={1}>{cat.nome}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Botões */}
                      <TouchableOpacity style={styles.applyButton} onPress={aplicarFiltrosAvancados} disabled={applyingFilters}>
                        <Text style={styles.applyButtonText}>Aplicar Filtros</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.closeButtonModal} onPress={limparFiltros}>
                        <Text style={styles.closeButtonText}>Limpar Filtros</Text>
                      </TouchableOpacity>

                    </KeyboardAwareScrollView>
                  </Animated.View>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          </KeyboardViewport>
        </SafeAreaView>
      </Modal>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedback: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    color: '#64748B',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  heartButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
    elevation: 2,
  },
  info: {
    padding: 16,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  address: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  price: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 12,
  },
  detailsButton: {
    backgroundColor: '#1E1B4B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayTouchable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardWrapperTouchable: { width: '90%', maxWidth: 440, alignItems: 'center', flexShrink: 1 },
  filterCard: { width: '100%', flexShrink: 1, backgroundColor: '#D9D9D9', borderRadius: 24, padding: 20, borderWidth: 4, borderColor: '#1E1848' },
  sectionHeaderModal: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitleModal: { fontSize: 18, fontWeight: '700', color: '#1E1848' },
  inputContainer: { flexDirection: 'row', alignItems: 'center'},
  currency: { fontSize: 14, fontWeight: '700', color: '#1E1848', marginRight: 4 },
  inputBox: { fontSize: 16, fontWeight: '700', color: '#1E1848', minWidth: 60, textAlign: 'right', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#483AAE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4  },
  sliderBar: { height: 16, backgroundColor: '#483AAE', borderRadius: 3, marginVertical: 8, position: 'relative', justifyContent: 'center' },
  sliderThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#C51212', position: 'absolute', alignSelf: 'center' },
  sliderProgressActive: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#1E1B4B',
    borderRadius: 2,
    top: 0,
    left: 0,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  limitLabel: { fontSize: 12, fontWeight: '700', color: '#1E1848' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  dropdownTitle: { fontSize: 15, fontWeight: '600', color: '#1E1848' },
  checkboxGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10, borderRadius: 12, marginTop: 5 },
  checkboxItem: { minHeight: 44, width: '48%', flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkboxBox: { width: 16, height: 16, borderWidth: 1, borderColor: 'transparent', borderRadius: 4, marginRight: 8, elevation: 1, shadowColor: '#1E1848', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 3},
  checkboxChecked: { backgroundColor: '#C51212' },
  checkboxText: { flexShrink: 1, fontSize: 13, color: '#1E1848', fontWeight: '500' },
  applyButton: { backgroundColor: '#483AAE', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  applyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  closeButtonModal: { paddingVertical: 10, alignItems: 'center', marginTop: 5 },
  closeButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 14 }
});