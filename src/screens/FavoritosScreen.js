
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image,
  TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MainLayout } from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';
import { parceiroService } from '../services/parceiroService';
import { categoriasService } from '../services/categoriasService';
import { resolveHomeCategory, filterHomePlaces } from '../utils/homeFilters';

export function FavoritosScreen({ navigation }) {
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
  const [matches, setMatches] = useState({ key: '', ids: [], status: 'loading' });
  const [, updateRemoving] = useState(0);

  const reload = useCallback(() => {
    if (!focused.current || identity.current.userId !== userId) return;
    const owner = identity.current;
    const version = ++generation.current;
    const current = () => focused.current && identity.current === owner && generation.current === version;
    setFavorites({ account: owner, data: [], status: userId ? 'loading' : 'ready' });
    setCatalog({ account: owner, data: [], status: userId ? 'loading' : 'ready', version });
    if (!userId) return;

    // Uma leitura iniciada antes de uma remoção concluída não pode reintroduzir o local.
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
  const categoryKey = JSON.stringify([userId, catalog.version, selectedCategory, activeCategory?.databaseId, activeCategory?.status]);
  useEffect(() => {
    if (!userId || !focused.current || !selectedCategory || !catalogReady || activeCategory?.status !== 'matched') return;
    let active = true;
    const version = generation.current;
    const current = () => active && focused.current && identity.current === account && generation.current === version;
    setMatches({ key: categoryKey, ids: [], status: 'loading' });
    categoriasService.getLocaisIdsPorCategorias([activeCategory.databaseId]).then(ids => {
      if (current()) setMatches({ key: categoryKey, ids, status: 'ready' });
    }).catch(() => {
      if (current()) setMatches({ key: categoryKey, ids: [], status: 'error' });
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
  const categoryError = selectedCategory && ((catalog.account === account && catalog.status === 'error')
    || (matches.key === categoryKey && matches.status === 'error'));
  const categoryUnavailable = selectedCategory && catalogReady && activeCategory?.status !== 'matched';
  const categoryLoading = selectedCategory && !categoryError && !categoryUnavailable
    && (!catalogReady || matches.key !== categoryKey || matches.status === 'loading');
  const loading = Boolean(userId && (!favoritesReady || categoryLoading));
  // A fonte é sempre a consulta de favoritos do usuário. Vínculos apenas restringem essa lista.
  const locaisFiltrados = !userId || !favoritesReady || categoryError || categoryUnavailable || categoryLoading ? []
    : filterHomePlaces(favorites.data, { pigPlaceIds: selectedCategory ? matches.ids : null }).filter(local =>
    local.nome?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout
      searchValue={search}
      onSearchChange={value => changeFilters({ search: value })}
      selectedCategory={selectedCategory}
      onSelectCategory={id => changeFilters({ category: selectedCategory === id ? null : id })}
      onFilterPress={() => console.log('Abrir filtros')}
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
                  source={{
                    uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
                  }}
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
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  feedback: { padding: 20, gap: 12 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    flexGrow: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 160,
  },
  heartButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: 14,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  address: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 8,
  },
  detailsButton: { backgroundColor: '#1E1B4B', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  detailsButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  nome: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginTop: 8,
  },
});
