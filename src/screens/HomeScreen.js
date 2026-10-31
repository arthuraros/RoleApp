import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput, Animated, Dimensions } from 'react-native';
import { locaisService } from '../services/locaisService';
import { parceiroService } from '../services/parceiroService';
import { categoriasService } from '../services/categoriasService';
import { MainLayout } from '../components/MainLayout';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [locais, setLocais] = useState([]);
  const [locaisFiltrados, setLocaisFiltrados] = useState([]);
  const [destaques, setDestaques] = useState(DESTAQUES_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [favoritos, setFavoritos] = useState([]);
  const [destaqueAtivo, setDestaqueAtivo] = useState(0);
  
  // Estados do Modal de Filtros
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [price, setPrice] = useState('');
  const [distance, setDistance] = useState('');
  const [showTipoRolde, setShowTipoRolde] = useState(false);
  
  const [tiposRolde, setTiposRolde] = useState([]);

  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;
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
        toValue: -SCREEN_HEIGHT,
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

  const carregarCategorias = async () => {
    try {
      const data = await categoriasService.getCategorias();
      if (Array.isArray(data)) {
        const formatadas = data.map(cat => ({
          ...cat,
          selecionado: false
        }));
        setTiposRolde(formatadas);
      }
    } catch (error) {
      console.error('Erro ao carregar categorias:', error.message);
    }
  };

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
    carregarCategorias();
  }, []);

  useEffect(() => {
    let resultado = [...locais];

    if (search.trim()) {
      const termo = search.toLowerCase();
      resultado = resultado.filter((l) => 
        l.nome?.toLowerCase().includes(termo) || 
        l.endereco?.toLowerCase().includes(termo)
      );
    }

    setLocaisFiltrados(resultado);
  }, [search, locais]);

  const aplicarFiltrosAvancados = async () => {
    try {
      setLoading(true);
      let locaisBase = [...locais];

      if (price.trim() !== '') {
        const precoMaximo = parseFloat(price.replace(',', '.'));
        
        if (!isNaN(precoMaximo)) {
          locaisBase = locaisBase.filter((l) => {
            const valorLocal = l.preco ?? l.preco_entrada;
            return valorLocal != null && Number(valorLocal) <= precoMaximo;
          });
        }
      }

      const categoriasSelecionadas = tiposRolde
        .filter(c => c.selecionado)
        .map(c => c.id_categoria);

      if (categoriasSelecionadas.length > 0) {
        const locaisIdsPermitidos = await categoriasService.getLocaisIdsPorCategorias(categoriasSelecionadas);
        locaisBase = locaisBase.filter(l => locaisIdsPermitidos.includes(l.id_local));
      }

      setLocaisFiltrados(locaisBase);
      handleCloseFilter();
    } catch (error) {
      console.error('Erro ao aplicar filtros:', error);
      Alert.alert('Erro', 'Não foi possível aplicar os filtros.');
    } finally {
      setLoading(false);
    }
  };

  const limparFiltros = () => {
    setTiposRolde(prev => prev.map(c => ({ ...c, selecionado: false })));
    setPrice('');
    setDistance('');
    setLocaisFiltrados(locais);
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
      console.log('LOCAIS RECEBIDOS DO SUPABASE:', data);

      const listaLocais = Array.isArray(data) && data.length > 0
        ? data
        : [
            {
              id_local: 'demo-1',
              nome: 'Bistrô do Centro',
              endereco: 'Asa Sul, Brasília - DF',
              preco: 25,
            },
            {
              id_local: 'demo-2',
              nome: 'Parque da Cidade',
              endereco: 'Asa Sul, Brasília - DF',
              preco: 0,
            },
            {
              id_local: 'demo-3',
              nome: 'Café do Rolê',
              endereco: 'Asa Norte, Brasília - DF',
              preco: 15,
            },
          ];

      setLocais(listaLocais);
      setLocaisFiltrados(listaLocais);
    } catch (error) {
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
        <View key={destaque.id} style={styles.highlightCardEven}>
          <View style={styles.cardTopAreaEven}>
            <Image source={{ uri: destaque.imagem }} style={styles.cardImageRight} resizeMode="cover" />

            <View style={styles.spikesContainer} pointerEvents="none">
              <View style={[styles.spike, styles.spikeTop]} />
              <View style={[styles.spike, styles.spikeMid]} />
              <View style={[styles.spike, styles.spikeBot]} />
            </View>

            <View style={styles.cardTextAreaLeft}>
              <Text style={styles.highlightTitle} numberOfLines={2}>
                {destaque.titulo}
              </Text>
              {Boolean(destaque.mensagem) && (
                <Text style={styles.highlightSubtitle} numberOfLines={3}>
                  {destaque.mensagem}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.highlightButtonBottom}
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
      <View key={destaque.id} style={styles.highlightCardOdd}>
        <Image source={{ uri: destaque.imagem }} style={styles.cardImageLeft} resizeMode="cover" />

        <View style={styles.slantDivider} pointerEvents="none" />

        <View style={styles.cardTextAreaRight}>
          <Text style={styles.highlightTitle} numberOfLines={2}>
            {destaque.titulo}
          </Text>
          {Boolean(destaque.mensagem) && (
            <Text style={styles.highlightSubtitle} numberOfLines={3}>
              {destaque.mensagem}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.highlightButtonRight}
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
        snapToInterval={329}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / 329);
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

      <View style={styles.placeCard}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' }}
          style={styles.placeImage}
        />
        <View style={styles.placeInfo}>
          <Text style={styles.placeName}>Bistrô do Centro</Text>
          <Text style={styles.placePrice}>R$ 25,00 por pessoa</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Todos os Locais</Text>
    </>
  );

  return (
    <MainLayout
      activeTab="Inicio"
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={handleOpenFilter}
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 110,
        }}
        data={locaisFiltrados}
        keyExtractor={(item) => item.id_local.toString()}
        ListHeaderComponent={renderHeader()}
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
      <Modal visible={isFilterVisible} transparent={true} animationType="none">
        <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.overlayTouchable} 
            activeOpacity={1} 
            onPress={handleCloseFilter}
          >
            <TouchableOpacity activeOpacity={1} style={styles.cardWrapperTouchable}>
              <Animated.View style={[styles.filterCard, { transform: [{ translateY: slideAnim }] }]}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  
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
                      {tiposRolde.map((cat) => (
                        <TouchableOpacity 
                          key={cat.id_categoria} 
                          style={styles.checkboxItem}
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
                  >
                    <Text style={styles.applyButtonText}>Aplicar Filtros</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.closeButtonModal} onPress={limparFiltros}>
                    <Text style={styles.closeButtonText}>Limpar Filtros</Text>
                  </TouchableOpacity>

                </ScrollView>
              </Animated.View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
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
    height: 34,
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
    height: 34,
    backgroundColor: '#C81D25',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  highlightButtonText: {
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  // Estilos corrigidos para o Modal ocupar a largura ideal sem encolher
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayTouchable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardWrapperTouchable: { width: '90%', maxWidth: 400, alignItems: 'center' },
  filterCard: { width: '100%', maxHeight: SCREEN_HEIGHT * 0.8, backgroundColor: '#D9D9D9', borderRadius: 24, padding: 20, borderWidth: 4, borderColor: '#1E1848' },
  sectionHeaderModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
  checkboxItem: { width: '48%', flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkboxBox: { width: 16, height: 16, borderWidth: 1, borderColor: 'transparent', borderRadius: 4, marginRight: 8, elevation: 1, shadowColor: '#1E1848', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 3},
  checkboxChecked: { backgroundColor: '#C51212' },
  checkboxText: { fontSize: 13, color: '#1E1848', fontWeight: '500' },
  applyButton: { backgroundColor: '#483AAE', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  applyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  closeButtonModal: { paddingVertical: 10, alignItems: 'center', marginTop: 5 },
  closeButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 14 }
});