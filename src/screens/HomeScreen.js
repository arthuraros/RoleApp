import { KeyboardViewport, KeyboardAwareScrollView } from '../components/KeyboardForm';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput, Animated, Linking, useWindowDimensions, } from 'react-native';
import { locaisService } from '../services/locaisService';
import { parceiroService } from '../services/parceiroService';
import { categoriasService } from '../services/categoriasService';
import { MainLayout } from '../components/MainLayout';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { resolveHomeCategory, filterHomePlaces } from '../utils/homeFilters';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { responsiveMetrics } from '../utils/responsive';

const DESTAQUES_FALLBACK = [
  {
    id: '1',
    titulo: 'Cine R.U: A Sessão da Marmita',
    mensagem: 'Exibição de filmes cult no Restaurante Universitário após o horário do jantar',
    imagem: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
  },
  {
    id: '2',
    titulo: 'Brazl Burger: Rodada Dupla',
    mensagem: 'Combo burger artesanal + batata pequena por R$ 29,90',
    imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd',
  },
  {
    id: '3',
    titulo: 'Noite Cultural & Acústico',
    mensagem: 'Apresentações ao vivo e promoções especiais no bistrô',
    imagem: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
  },
];

export function HomeScreen({ navigation }) {
  const dimensions = useWindowDimensions();
  const layout = responsiveMetrics({ ...dimensions, insets: useSafeAreaInsets() });
  const tabBarHeight = useBottomTabBarHeight();
  const [locais, setLocais] = useState([]);
  const [locaisError, setLocaisError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [advancedFilters, setAdvancedFilters] = useState({ price: null, distance: null, categoryIds: [] });
  const [catalogStatus, setCatalogStatus] = useState('loading');
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [matches, setMatches] = useState({ key: '', pigIds: null, advancedIds: null, error: false });
  const [applyingFilters, setApplyingFilters] = useState(false);
  const applyVersion = useRef(0);
  const [destaques, setDestaques] = useState(DESTAQUES_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [favoritos, setFavoritos] = useState([]);
  const [destaqueAtivo, setDestaqueAtivo] = useState(0);
  useEffect(() => { setDestaqueAtivo(0); }, [layout.highlightInterval]);
  
  // Estados do Modal de Filtros
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [price, setPrice] = useState('');
  const [distance, setDistance] = useState('');
  const [showTipoRolde, setShowTipoRolde] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  
  const [tiposRolde, setTiposRolde] = useState([]);

  const slideAnim = useRef(new Animated.Value(-dimensions.height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleOpenFilter = () => {
    setIsFilterVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ]).start();
  };

  const handleCloseFilter = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -dimensions.height,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      })
    ]).start(() => {
      setIsFilterVisible(false);
    });
  };

  const locaisVistosRef = useRef(new Set());
  const destaquesVistosRef = useRef(new Set());

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 100,
    minimumViewTime: 300,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.id_local && !String(item.id_local).startsWith('demo-') && !locaisVistosRef.current.has(item.id_local)) {
        locaisVistosRef.current.add(item.id_local);
        parceiroService.registrarMetrica({ idLocal: item.id_local, views: 1 }).catch(() => {});
      }
    });
  }).current;

  const carregarDestaques = async () => {
    try {
      const data = await parceiroService.getDestaquesAtivos();
      if (Array.isArray(data) && data.length > 0) {
        const imagensFallback = [
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
          'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
          'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
        ];

        const mapeados = data.map((campanha, index) => ({
          id: campanha.id_campanha.toString(),
          id_local: campanha.id_local,
          titulo: campanha.titulo || campanha.locais?.nome || 'Destaque especial',
          mensagem: campanha.mensagem || '',
          imagem: campanha.locais?.imagem_url || imagensFallback[index % imagensFallback.length],
          local: campanha.locais || null,
        }));

        setDestaques(mapeados);
      } else {
        setDestaques(DESTAQUES_FALLBACK);
      }
    } catch (err) {
      console.warn('Erro ao carregar destaques de campanhas:', err.message);
      setDestaques(DESTAQUES_FALLBACK);
    }
  };

  useEffect(() => {
    let active = true;
    setCatalogStatus('loading');
    categoriasService.getCategorias().then(data => {
      if (!active) return;
      setTiposRolde(previous => (data ?? []).map(category => ({ ...category,
        selecionado: previous.some(item => item.id_categoria === category.id_categoria && item.selecionado) })));
      setCatalogStatus('ready');
    }).catch(() => { if (active) setCatalogStatus('error'); });
    return () => { active = false; };
  }, [categoryRetry]);

  const activeCategory = resolveHomeCategory(selectedCategory, tiposRolde);
  const categoryKey = JSON.stringify([selectedCategory, activeCategory?.databaseId, activeCategory?.status,
    advancedFilters.categoryIds, selectedCategory ? catalogStatus : null, categoryRetry]);
  const hasCategoryFilter = Boolean(selectedCategory || advancedFilters.categoryIds.length);

  useEffect(() => {
    let active = true;
    if (!hasCategoryFilter) {
      setMatches({ key: categoryKey, pigIds: null, advancedIds: null, error: false });
      return () => { active = false; };
    }
    if (selectedCategory && catalogStatus !== 'ready') return () => { active = false; };
    if (activeCategory && activeCategory.status !== 'matched') {
      setMatches({ key: categoryKey, pigIds: [], advancedIds: null, error: false });
      return () => { active = false; };
    }
    Promise.all([
      activeCategory ? categoriasService.getLocaisIdsPorCategorias([activeCategory.databaseId]) : null,
      advancedFilters.categoryIds.length ? categoriasService.getLocaisIdsPorCategorias(advancedFilters.categoryIds) : null,
    ]).then(([pigIds, advancedIds]) => {
      if (active) setMatches({ key: categoryKey, pigIds, advancedIds, error: false });
    }).catch(() => {
      if (active) setMatches({ key: categoryKey, pigIds: [], advancedIds: [], error: true });
    });
    return () => { active = false; };
  }, [categoryKey]);

  const categoryError = hasCategoryFilter && ((selectedCategory && catalogStatus === 'error')
    || (matches.key === categoryKey && matches.error));
  const categoryUnavailable = selectedCategory && catalogStatus === 'ready' && activeCategory?.status !== 'matched';
  const categoryLoading = hasCategoryFilter && !categoryError && !categoryUnavailable && matches.key !== categoryKey;
  const locaisFiltrados = categoryLoading || categoryError || categoryUnavailable ? [] : filterHomePlaces(locais, {
    search, price: advancedFilters.price, distance: advancedFilters.distance, location: userLocation,
    pigPlaceIds: hasCategoryFilter ? matches.pigIds : null,
    advancedPlaceIds: hasCategoryFilter ? matches.advancedIds : null,
  });

  const carregarFavoritos = async () => {
    if (!user?.id) {
      setFavoritos([]);
      return;
    }

    try {
      const data = await favoritosService.getFavoritos(user.id);
      setFavoritos(
        data.map((favorito) => favorito.id_local)
      );
    } catch (error) {
      console.error('Erro ao carregar favoritos:', error.message);
    }
  };

  const alternarFavorito = async (idLocal) => {
    if (!user?.id) {
      Alert.alert('Atenção', 'Faça login para favoritar locais.');
      return;
    }

    try {
      const jaFavoritado = favoritos.includes(idLocal);

      if (jaFavoritado) {
        await favoritosService.removerFavorito(user.id, idLocal);
      } else {
        await favoritosService.adicionarFavorito(user.id, idLocal);
      }

      await carregarFavoritos();
    } catch (error) {
      console.error('Erro ao alterar favorito:', error.message);
      Alert.alert('Erro', 'Não foi possível atualizar seus favoritos.');
    }
  };

  useEffect(() => {
    carregarLocais();
    carregarDestaques();
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (e) {}
    })();
  }, []);

  const aplicarFiltrosAvancados = async () => {
    if (applyingFilters) return;
    const version = ++applyVersion.current;
    setApplyingFilters(true);
    try {
      const priceLimit = price.trim() ? Number(price.replace(',', '.')) : null;
      const distanceLimit = distance.trim() ? Number(distance.replace(',', '.')) : null;
      if ((priceLimit !== null && (!Number.isFinite(priceLimit) || priceLimit < 0))
        || (distanceLimit !== null && (!Number.isFinite(distanceLimit) || distanceLimit < 0))) {
        Alert.alert('Filtros inválidos', 'Informe valores válidos de preço e distância.');
        return;
      }
      if (distanceLimit > 0 && !userLocation) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (version !== applyVersion.current) return;
        if (status !== 'granted') {
          Alert.alert('Permissão de Localização Negada', 'Autorize a localização para aplicar o filtro de distância.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings().catch(() => {}) },
          ]);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (version !== applyVersion.current) return;
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
      if (version !== applyVersion.current) return;
      setAdvancedFilters({ price: priceLimit, distance: distanceLimit,
        categoryIds: tiposRolde.filter(category => category.selecionado).map(category => category.id_categoria) });
      handleCloseFilter();
    } catch {
      if (version === applyVersion.current) Alert.alert('Erro', 'Não foi possível aplicar os filtros. Tente novamente.');
    } finally {
      if (version === applyVersion.current) setApplyingFilters(false);
    }
  };

  const limparFiltros = () => {
    applyVersion.current += 1;
    setApplyingFilters(false);
    setTiposRolde(prev => prev.map(category => ({ ...category, selecionado: false })));
    setPrice('');
    setDistance('');
    setSelectedCategory(null);
    setAdvancedFilters({ price: null, distance: null, categoryIds: [] });
    handleCloseFilter();
  };

  useEffect(() => {
    const destaqueAtual = destaques[destaqueAtivo];
    if (
      destaqueAtual?.id_local &&
      !String(destaqueAtual.id_local).startsWith('demo-') &&
      !destaquesVistosRef.current.has(destaqueAtual.id_local)
    ) {
      destaquesVistosRef.current.add(destaqueAtual.id_local);
      parceiroService.registrarMetrica({ idLocal: destaqueAtual.id_local, views: 1 }).catch(() => {});
    }
  }, [destaqueAtivo, destaques]);

  useFocusEffect(
    useCallback(() => {
      carregarFavoritos();
      carregarDestaques();
    }, [user?.id])
  );

  const carregarLocais = async () => {
    try {
      setLoading(true);
      const data = await locaisService.getLocais();
      setLocais(Array.isArray(data) ? data : []);
      setLocaisError(false);
    } catch (error) {
      setLocaisError(true);
      console.error('Erro ao carregar locais:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && locais.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1E1B4B" />
      </View>
    );
  }

  const handlePressDestaque = (destaque) => {
    if (destaque.id_local) {
      parceiroService.registrarMetrica({ idLocal: destaque.id_local, cliques: 1 }).catch(() => { });
      if (destaque.local) {
        navigation.navigate('DetalhesLocal', { idLocal: destaque.id_local, local: destaque.local });
      } else {
        navigation.navigate('DetalhesLocal', { idLocal: destaque.id_local });
      }
    } else {
      Alert.alert(destaque.titulo, destaque.mensagem || 'Destaque especial');
    }
  };

  const renderHighlightCard = (destaque, index) => {
    const isEven = index % 2 === 0;

    if (isEven) {
      return (
        <View key={destaque.id} style={[styles.highlightCardEven, { width: layout.highlightWidth, height: layout.compact ? undefined : layout.highlightHeight }]}>
          <View style={[styles.cardTopAreaEven, { height: layout.compact ? undefined : layout.highlightTopHeight }]}>
            <Image source={{ uri: destaque.imagem }} style={[styles.cardImageRight, { height: layout.compact ? '100%' : layout.highlightTopHeight }]} resizeMode="cover" />

            <View style={[styles.spikesContainer, { left: layout.highlightWidth * 0.46 }]} pointerEvents="none">
              <View style={[styles.spike, styles.spikeTop]} />
              <View style={[styles.spike, styles.spikeMid]} />
              <View style={[styles.spike, styles.spikeBot]} />
            </View>

            <View style={[styles.cardTextAreaLeft, { height: layout.compact ? undefined : layout.highlightTopHeight }, layout.compact && styles.highlightTextCompact]}>
              <Text style={styles.highlightTitle} numberOfLines={layout.compact ? undefined : 2}>
                {destaque.titulo}
              </Text>
              {Boolean(destaque.mensagem) && (
                <Text style={styles.highlightSubtitle} numberOfLines={layout.compact ? undefined : 3}>
                  {destaque.mensagem}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.highlightButtonBottom, layout.compact && styles.highlightButtonCompact]}
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => handlePressDestaque(destaque)}
          >
            <Text style={styles.highlightButtonText}>Ver detalhes</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View key={destaque.id} style={[styles.highlightCardOdd, { width: layout.highlightWidth, height: layout.compact ? undefined : layout.highlightHeight }]}>
        <Image source={{ uri: destaque.imagem }} style={styles.cardImageLeft} resizeMode="cover" />

        <View style={styles.slantDivider} pointerEvents="none" />

        <View style={[styles.cardTextAreaRight, { height: layout.compact ? undefined : layout.highlightTopHeight }, layout.compact && styles.highlightTextCompact]}>
          <Text style={styles.highlightTitle} numberOfLines={layout.compact ? undefined : 2}>
            {destaque.titulo}
          </Text>
          {Boolean(destaque.mensagem) && (
            <Text style={styles.highlightSubtitle} numberOfLines={layout.compact ? undefined : 3}>
              {destaque.mensagem}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.highlightButtonRight, layout.compact && styles.highlightButtonCompact]}
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => handlePressDestaque(destaque)}
        >
          <Text style={styles.highlightButtonText}>Ver detalhes</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHeader = () => (
    <>
      <Text style={styles.sectionTitle}>Destaques</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.highlightsContainer}
        contentContainerStyle={{ paddingRight: 4 }}
        key={`destaques-${layout.highlightInterval}`}
        snapToInterval={layout.highlightInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / layout.highlightInterval);
          setDestaqueAtivo(Math.max(0, Math.min(index, destaques.length - 1)));
        }}
      >
        {destaques.map((destaque, index) => renderHighlightCard(destaque, index))}
      </ScrollView>
      <View style={styles.destaquesIndicadores}>
        {destaques.map((destaque, index) => (
          <View key={destaque.id} style={[styles.destaqueBolinha, destaqueAtivo === index && styles.destaqueBolinhaAtiva]} />
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{activeCategory ? `Locais em ${activeCategory.name}` : 'Todos os Locais'}</Text>
    </>
  );

  return (
    <MainLayout
      activeTab="Inicio"
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={handleOpenFilter}
      selectedCategory={selectedCategory}
      onSelectCategory={id => setSelectedCategory(previous => previous === id ? null : id)}
    >
      {activeCategory ? (
        <View style={styles.activeCategory}>
          <Text style={styles.activeCategoryText}>Categoria: {activeCategory.name}</Text>
          <TouchableOpacity onPress={() => setSelectedCategory(null)} accessibilityRole="button"
            accessibilityLabel="Limpar filtro de categoria" style={styles.clearCategory}>
            <Text style={styles.clearCategoryText}>Limpar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {categoryError || locaisError ? (
        <View style={styles.filterFeedback}>
          <Text>{locaisError ? 'Não foi possível carregar os locais.' : 'Não foi possível carregar o filtro de categorias.'}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => {
            if (locaisError) carregarLocais();
            if (categoryError) setCategoryRetry(value => value + 1);
          }}><Text style={styles.clearCategoryText}>Tentar novamente</Text></TouchableOpacity>
        </View>
      ) : categoryUnavailable ? (
        <Text style={styles.filterFeedback}>A categoria {activeCategory?.name} está indisponível no momento. Escolha outra categoria ou limpe o filtro.</Text>
      ) : categoryLoading ? (
        <ActivityIndicator accessibilityLabel="Carregando categoria" style={styles.filterFeedback} color="#1E1B4B" />
      ) : null}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: tabBarHeight + 24,
        }}
        data={locaisFiltrados}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => item.id_local.toString()}
        ListHeaderComponent={
  search.trim()
    ? (
      <Text style={styles.sectionTitle}>
        Resultados para "{search.trim()}"
      </Text>
    )
    : renderHeader()
}
ListEmptyComponent={
  !loading && !categoryLoading && !categoryError && !categoryUnavailable && !locaisError ? (
    <Text style={{ textAlign: 'center', marginTop: 24, color: '#64748B' }}>
      {activeCategory ? `Nenhum local encontrado em ${activeCategory.name} com os filtros atuais.` : 'Nenhum estabelecimento encontrado com os filtros atuais.'}
    </Text>
  ) : null
}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: item.imagem_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' }}
                style={styles.placeImage}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={() => alternarFavorito(item.id_local)}
                accessibilityRole="button"
                accessibilityLabel={favoritos.includes(item.id_local) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                <MaterialCommunityIcons
                  name={favoritos.includes(item.id_local) ? 'heart' : 'heart-outline'}
                  size={24}
                  color="#DC2626"
                />
              </TouchableOpacity>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.nome}>{item.nome}</Text>
              <Text style={styles.endereco}>{item.endereco}</Text>
              <Text style={styles.preco}>
                {item.preco === 0 || item.preco_entrada === 0
                  ? 'Entrada gratuita'
                  : item.preco != null
                    ? `Preço: R$ ${item.preco}`
                    : item.preco_entrada != null
                      ? `Entrada: R$ ${item.preco_entrada}`
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

      {/* Modal de Filtros Avançados Corrigido */}
      <Modal visible={isFilterVisible} transparent={true} animationType="none" onRequestClose={handleCloseFilter}>
        <SafeAreaView style={{ flex: 1 }}>
        <KeyboardViewport style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.overlayTouchable} 
            activeOpacity={1} 
            onPress={handleCloseFilter}
          >
            <TouchableOpacity activeOpacity={1} style={styles.cardWrapperTouchable}>
              <Animated.View style={[styles.filterCard, { maxHeight: layout.modalMaxHeight, transform: [{ translateY: slideAnim }] }]}>
                <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  
                  {/* Bloco de Preço */}
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
                  <View style={styles.sliderBar}>
                    <View style={styles.sliderThumb} />
                  </View>
                  <View style={styles.sliderLabels}>
                    <Text style={styles.limitLabel}>MIN</Text>
                    <Text style={styles.limitLabel}>MAX</Text>
                  </View>

                  {/* Bloco de Distância */}
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
                  <View style={styles.sliderBar}>
                    <View style={styles.sliderThumb} />
                  </View>
                  <View style={styles.sliderLabels}>
                    <Text style={styles.limitLabel}>MIN</Text>
                    <Text style={styles.limitLabel}>MAX</Text>
                  </View>

                  {/* Dropdown: Tipo de Rolê */}
                  <TouchableOpacity 
                    style={styles.dropdownHeader} 
                    onPress={() => setShowTipoRolde(!showTipoRolde)}
                  >
                    <Text style={styles.dropdownTitle}>Tipo de Rolê</Text>
                    <Feather name={showTipoRolde ? "chevron-up" : "chevron-down"} size={22} color="#1E1848" />
                  </TouchableOpacity>

                  {showTipoRolde && (
                    <View style={styles.checkboxGrid}>
                      {catalogStatus === 'loading' ? <ActivityIndicator accessibilityLabel="Carregando categorias" color="#1E1848" /> : null}
                      {catalogStatus === 'error' ? <TouchableOpacity onPress={() => setCategoryRetry(value => value + 1)}>
                        <Text>Não foi possível carregar as categorias. Tentar novamente</Text>
                      </TouchableOpacity> : null}
                      {tiposRolde.map((cat) => (
                        <TouchableOpacity 
                          key={cat.id_categoria} 
                          style={[styles.checkboxItem, layout.compact && { width: '100%' }]}
                          onPress={() => {
                            setTiposRolde(prev => prev.map(item => 
                              item.id_categoria === cat.id_categoria 
                                ? { ...item, selecionado: !item.selecionado } 
                                : item
                            ));
                          }}
                        >
                          <View style={[styles.checkboxBox, cat.selecionado && styles.checkboxChecked]} />
                          <Text style={styles.checkboxText} numberOfLines={1}>
                            {cat.nome}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}


                  {/* Botões de Ação */}
                  <TouchableOpacity 
                    style={styles.applyButton} 
                    onPress={aplicarFiltrosAvancados}
                    disabled={applyingFilters}
                  >
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
  activeCategory: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: '#F0EFF8' },
  activeCategoryText: { color: '#1E1848', fontWeight: '700', flexShrink: 1 },
  clearCategory: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  clearCategoryText: { color: '#483AAE', fontWeight: '700' },
  filterFeedback: { padding: 16, gap: 8 },
  categoriesContainer: { marginBottom: 20 },
  categoryItem: { alignItems: 'center', marginRight: 16 },
  categoryIconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  categoryText: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#0F172A' },
  highlightsContainer: { marginBottom: 20 },
  highlightCardEven: {
    width: 315,
    height: 195,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 14,
    backgroundColor: '#1C1645',
    position: 'relative',
  },
  highlightCardOdd: {
    width: 315,
    height: 195,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 14,
    backgroundColor: '#382FA0',
    position: 'relative',
  },
  cardTopAreaEven: {
    height: 138,
    position: 'relative',
  },
  cardImageRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '52%',
    height: 138,
  },
  spikesContainer: {
    position: 'absolute',
    left: 146,
    top: 0,
    bottom: 0,
    width: 35,
    zIndex: 3,
  },
  spike: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#1C1645',
  },
  spikeTop: {
    top: 12,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 20,
  },
  spikeMid: {
    top: 48,
    borderTopWidth: 15,
    borderBottomWidth: 15,
    borderLeftWidth: 32,
  },
  spikeBot: {
    top: 92,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 22,
  },
  cardTextAreaLeft: {
    width: '50%',
    height: 138,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
  },
  cardImageLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '46%',
  },
  slantDivider: {
    position: 'absolute',
    left: '42%',
    top: -15,
    bottom: -15,
    width: 28,
    backgroundColor: '#382FA0',
    transform: [{ skewX: '-15deg' }],
    zIndex: 2,
  },
  cardTextAreaRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '56%',
    height: 138,
    paddingHorizontal: 12,
    paddingTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
  },
  highlightTextCompact: { position: 'relative', width: '100%', padding: 16, backgroundColor: 'rgba(28,22,69,0.88)' },
  highlightButtonCompact: { position: 'relative', left: undefined, right: undefined, bottom: undefined, width: undefined, margin: 12, paddingHorizontal: 12 },
  highlightTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 6,
  },
  highlightSubtitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 14.5,
  },
  highlightButtonBottom: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    minHeight: 44,
    paddingVertical: 8,
    backgroundColor: '#C81D25',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  highlightButtonRight: {
    position: 'absolute',
    bottom: 12,
    right: 14,
    width: '52%',
    minHeight: 44,
    paddingVertical: 8,
    backgroundColor: '#C81D25',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  highlightButtonText: {
    textAlign: 'center',
    flexShrink: 1,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  destaquesIndicadores: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 18 },
  destaqueBolinha: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  destaqueBolinhaAtiva: { width: 20, backgroundColor: '#1E1B4B' },
  placeCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, overflow: 'hidden' },
  placeImage: { width: '100%', height: 160 },
  placeInfo: { padding: 12 },
  placeName: { fontSize: 16, fontWeight: '700' },
  placePrice: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, marginVertical: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', elevation: 3 },
  cardContent: { padding: 16, gap: 6 },
  detailsButton: { backgroundColor: '#1E1B4B', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  detailsButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  nome: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginTop: 8,
  },
  endereco: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  preco: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 8,
  },
  imageContainer: {
    position: 'relative',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  // Estilos corrigidos para o Modal ocupar a largura ideal sem encolher
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayTouchable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardWrapperTouchable: { width: '90%', maxWidth: 440, alignItems: 'center', flexShrink: 1 },
  filterCard: { width: '100%', flexShrink: 1, backgroundColor: '#D9D9D9', borderRadius: 24, padding: 20, borderWidth: 4, borderColor: '#1E1848' },
  sectionHeaderModal: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitleModal: { fontSize: 18, fontWeight: '700', color: '#1E1848' },
  inputContainer: { flexDirection: 'row', alignItems: 'center'},
  currency: { fontSize: 14, fontWeight: '700', color: '#1E1848', marginRight: 4 },
  inputBox: { fontSize: 16, fontWeight: '700', color: '#1E1848', minWidth: 60, textAlign: 'right', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#483AAE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4  },
  sliderBar: { height: 6, backgroundColor: '#483AAE', borderRadius: 3, marginVertical: 8, position: 'relative', justifyContent: 'center' },
  sliderThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#C51212', position: 'absolute', alignSelf: 'center' },
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
