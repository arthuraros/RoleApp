import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { locaisService } from '../services/locaisService';
import { MainLayout } from '../components/MainLayout';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { favoritosService } from '../services/favoritosService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const DESTAQUES = [
  { id: '1', titulo: 'Cine R.U: A Sessão da Marmita', imagem: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba' },
  { id: '2', titulo: 'Experiências gastronômicas', imagem: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' },
  { id: '3', titulo: 'Eventos e diversão', imagem: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30' },
];

export function HomeScreen({ navigation }) {
  const [locais, setLocais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [favoritos, setFavoritos] = useState([]);
  const [destaqueAtivo, setDestaqueAtivo] = useState(0);

  const carregarFavoritos = async () => {
  if (!user?.id) {
    setFavoritos([]);
    return;
  }

  try {
    const data = await favoritosService.getFavoritos(user.id);
    console.log('FAVORITOS RECEBIDOS:', data);
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
  }, []);

  useFocusEffect(
  useCallback(() => {
    carregarFavoritos();
  }, [user?.id])
);

  const carregarLocais = async () => {
    try {
      setLoading(true);
    const data = await locaisService.getLocais();
    console.log('LOCAIS RECEBIDOS DO SUPABASE:', data);

setLocais(
  Array.isArray(data) && data.length > 0
    ? data
    : [
        {
          id_local: 'demo-1',
          nome: 'Bistrô do Centro',
          endereco: 'Asa Sul, Brasília - DF',
          preco_entrada: 25,
        },
        {
          id_local: 'demo-2',
          nome: 'Parque da Cidade',
          endereco: 'Asa Sul, Brasília - DF',
          preco_entrada: 0,
        },
        {
          id_local: 'demo-3',
          nome: 'Café do Rolê',
          endereco: 'Asa Norte, Brasília - DF',
          preco_entrada: 15,
        },
      ]
);
    } catch (error) {
      console.error('Erro ao carregar locais:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1E1B4B" />
      </View>
    );
  }

  // Componente contendo os elementos fixos do topo
  const renderHeader = () => (
    <>
      {/* Seção Destaques */}
      <Text style={styles.sectionTitle}>Destaques</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.highlightsContainer}
        snapToInterval={322}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / 322);
          setDestaqueAtivo(Math.max(0, Math.min(index, DESTAQUES.length - 1)));
        }}
      >
        {DESTAQUES.map((destaque) => (
          <View key={destaque.id} style={styles.highlightCard}>
            <Image source={{ uri: destaque.imagem }} style={styles.highlightImage} resizeMode="cover" />
            <View style={styles.highlightOverlay}>
              <Text style={styles.highlightTitle}>{destaque.titulo}</Text>
              <TouchableOpacity
                style={styles.highlightButton}
                accessibilityRole="button"
                onPress={() => Alert.alert('Em breve', 'Detalhes deste destaque estarão disponíveis em breve.')}
              >
                <Text style={styles.highlightButtonText}>Ver detalhes</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.destaquesIndicadores}>
        {DESTAQUES.map((destaque, index) => (
          <View key={destaque.id} style={[styles.destaqueBolinha, destaqueAtivo === index && styles.destaqueBolinhaAtiva]} />
        ))}
      </View>

      {/* Card do Bistrô */}
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
      onFilterPress={() => console.log('Abrir filtros')}
    >
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 110,
    }}
    data={locais}
        keyExtractor={(item) => item.id_local.toString()}
        ListHeaderComponent={renderHeader()}
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
                {item.preco_entrada === 0
                  ? 'Entrada gratuita'
                  : item.preco_entrada != null
                    ? `Entrada: R$ ${item.preco_entrada}`
                    : item.preco != null
                      ? `Preço informado: R$ ${item.preco}`
                      : 'Preço não informado'}
              </Text>
              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() => navigation.navigate('DetalhesLocal', { idLocal: item.id_local, local: item })}
              >
                <Text style={styles.detailsButtonText}>Ver detalhes</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
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
  highlightCard: { width: 310, height: 185, borderRadius: 16, overflow: 'hidden', marginRight: 12, backgroundColor: '#1E1B4B' },
  highlightImage: { width: '100%', height: '100%', position: 'absolute' },
  highlightOverlay: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  highlightTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12 },
  highlightButton: { backgroundColor: '#1E1B4B', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignSelf: 'flex-start' },
  highlightButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  destaquesIndicadores: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: -10, marginBottom: 18 },
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
});