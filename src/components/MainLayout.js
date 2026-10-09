import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';

// Exemplo de categorias com os mascotes
const CATEGORIES = [
  { id: '1', name: 'Comidas', icon: require('../../assets/pig_food.png') },
  { id: '2', name: 'Festas', icon: require('../../assets/pig_party.png') },
  { id: '3', name: 'Parques', icon: require('../../assets/pig_parks.png') },
  { id: '4', name: 'Cinemas', icon: require('../../assets/pig_cinema.png') },
  { id: '5', name: 'Cafés', icon: require('../../assets/pig_coffe.png') },
  { id: '6', name: 'Eventos', icon: require('../../assets/pig_events.png') },
];

export function MainLayout({
  searchValue,
  onSearchChange,
  onFilterPress,
  selectedCategory,
  onSelectCategory,
  economyValue = 'R$ 450',
  discountValue = '40%',
  children,
}) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header Roxo */}
      <View style={styles.header}>
        {/* Barra de Pesquisa */}
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar"
            placeholderTextColor="#64748B"
            value={searchValue}
            onChangeText={onSearchChange}
          />
        </View>

        {/* Linha com Economia, Desconto e Filtros */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>Economia</Text>
            <Text style={styles.statValueGreen}>{economyValue}</Text>
          </View>

          <View style={styles.statPill}>
            <Text style={styles.statLabel}>Desconto</Text>
            <Text style={styles.statValueOrange}>{discountValue}</Text>
          </View>

          <TouchableOpacity style={styles.filterButton} onPress={onFilterPress}>
            <MaterialIcons name="filter-list" size={18} color="#FFFFFF" />
            <Text style={styles.filterText}>Filtros</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Conteúdo com Fundo Branco */}
      <View style={styles.body}>
        <View
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Carrossel de Mascotes / Categorias */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScroll}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryItem}
                  onPress={() => onSelectCategory && onSelectCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pigBadge, isSelected && styles.pigBadgeSelected]}>
                    <Image source={cat.icon} style={styles.pigImage} resizeMode="contain" />
                  </View>
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Children da Tela (HomeScreen, FavoritosScreen, etc.) */}
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1B4B', // Roxo escuro do header
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  statLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  statValueGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
  },
  statValueOrange: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1A66',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    gap: 4,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
  },
  categoryItem: {
    alignItems: 'center',
  },
  pigBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pigBadgeSelected: {
    borderWidth: 2,
    borderColor: '#3B1A66',
  },
  pigImage: {
    width: 64,
    height: 64,
  },
  categoryText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
    marginTop: 4,
  },
  categoryTextSelected: {
    color: '#1E1B4B',
    fontWeight: '700',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  activeNavItem: {
    backgroundColor: '#1E1B4B',
  },
  navLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  activeNavLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});