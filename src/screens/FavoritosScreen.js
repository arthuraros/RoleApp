import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { MainLayout } from '../components/MainLayout';
import { Feather } from '@expo/vector-icons';

export function FavoritosScreen() {
  const [search, setSearch] = useState('');

  return (
    <MainLayout
      activeTab="Favoritos"
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={() => console.log('Abrir filtros')}
    >
      {/* Lista de Favoritos */}
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7' }}
            style={styles.cardImage}
          />
          <TouchableOpacity style={styles.favoriteBadge}>
            <Feather name="heart" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>CCBB Brasília</Text>
            <Text style={styles.freeBadge}>Gratuito</Text>
          </View>
          <Text style={styles.cardAddress}>📍 Centro cultural em Brasília</Text>

          <TouchableOpacity style={styles.detailsButton}>
            <Text style={styles.detailsButtonText}>Ver Detalhes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  imageContainer: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 180,
  },
  favoriteBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 6,
  },
  cardBody: {
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  freeBadge: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 14,
  },
  cardAddress: {
    fontSize: 12,
    color: '#64748B',
    marginVertical: 6,
  },
  detailsButton: {
    backgroundColor: '#1E1B4B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});