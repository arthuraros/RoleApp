import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { locaisService } from '../services/locaisService';
import { MainLayout } from '../components/MainLayout';

export function HomeScreen() {
  const [locais, setLocais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    carregarLocais();
  }, []);

  const carregarLocais = async () => {
    try {
      setLoading(true);
      const data = await locaisService.getLocais();
      setLocais(data);
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.highlightsContainer}>
        <View style={styles.highlightCard}>
          <Text style={styles.highlightTitle}>Cine R.U: A Sessão da Marmita</Text>
          <TouchableOpacity style={styles.highlightButton}>
            <Text style={styles.highlightButtonText}>Ver detalhes</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
        data={locais}
        keyExtractor={(item) => item.id_local.toString()}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' }}
              style={styles.placeImage}
            />
            <Text style={styles.nome}>{item.nome}</Text>
            <Text style={styles.endereco}>{item.endereco}</Text>
            <Text style={styles.preco}>
              {item.preco_entrada === 0 ? 'Gratuito' : `Entrada: R$ ${item.preco_entrada}`}
            </Text>
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
  highlightCard: { width: 220, backgroundColor: '#1E1B4B', borderRadius: 16, padding: 16, marginRight: 12 },
  highlightTitle: { color: '#FFFFFF', fontWeight: '700', marginBottom: 12 },
  highlightButton: { backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  highlightButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12 },
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
  card: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginVertical: 8,
    elevation: 2,
  },
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
});