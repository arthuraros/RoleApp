
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image,
  TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MainLayout } from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';

export function FavoritosScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [locais, setLocais] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let ativo = true;

      async function carregar() {
        if (!user?.id) {
          if (ativo) {
            setLocais([]);
            setLoading(false);
          }
          return;
        }

        try {
          setLoading(true);
          const data = await favoritosService.getLocaisFavoritos(user.id);
          if (ativo) setLocais(data);
        } catch (error) {
          console.error('Erro ao carregar favoritos:', error.message);
          if (ativo) {
            setLocais([]);
            Alert.alert('Erro', 'Não foi possível carregar seus favoritos.');
          }
        } finally {
          if (ativo) setLoading(false);
        }
      }

      carregar();
      return () => { ativo = false; };
    }, [user?.id])
  );

  const removerFavorito = async (idLocal) => {
    if (!user?.id) return;

    try {
      await favoritosService.removerFavorito(user.id, idLocal);
      setLocais((anteriores) =>
        anteriores.filter((local) => local.id_local !== idLocal)
      );
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível remover o favorito.');
      console.error('Erro ao remover favorito:', error.message);
    }
  };

  const locaisFiltrados = locais.filter((local) =>
    local.nome?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={() => console.log('Abrir filtros')}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1E1B4B" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={locaisFiltrados}
          keyExtractor={(item) => String(item.id_local)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nenhum local favorito encontrado.
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
              </View>
            </View>
          )}
        />
      )}
    </MainLayout>
  );
}

const styles = StyleSheet.create({
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
    width: 40,
    height: 40,
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
});
