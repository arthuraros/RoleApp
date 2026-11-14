import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { HOME_CATEGORIES } from '../utils/homeFilters';
import { PAGE_CONTENT, responsiveMetrics } from '../utils/responsive';
import { homeCategoryLayout } from '../utils/homeCategoryLayout';

// Mesmos mascotes; IDs abaixo são apenas chaves da interface.
const CATEGORY_ICONS = {
  '1': require('../../assets/pig_food.png'),
  '2': require('../../assets/pig_party.png'),
  '3': require('../../assets/pig_parks.png'),
  '4': require('../../assets/pig_cinema.png'),
  '5': require('../../assets/pig_coffe.png'),
  '6': require('../../assets/pig_events.png'),
};
const CATEGORIES = HOME_CATEGORIES.map(category => ({ ...category, icon: CATEGORY_ICONS[category.id] }));

export function MainLayout({
  searchValue,
  onSearchChange,
  onFilterPress,
  selectedCategory,
  onSelectCategory,
  economyValue = 'R$ 450',
  discountValue = '40%',
  hideCategories = false,
  children,
  
}) {
  const dimensions = useWindowDimensions();
  const layout = responsiveMetrics(dimensions);
  const categoriesLayout = homeCategoryLayout({ ...dimensions, insets: useSafeAreaInsets() });

  const renderCategory = cat => {
    const isSelected = selectedCategory === cat.id;
    return (
      <TouchableOpacity
        key={cat.id}
        style={[
          styles.categoryItem,
          { width: categoriesLayout.itemWidth },
        ]}
        onPress={() => onSelectCategory?.(cat.id)}
        accessibilityRole="button"
        accessibilityLabel={`Filtrar por ${cat.name}`}
        accessibilityHint={cat.icon ? undefined : 'Ilustração do mascote pendente'}
        accessibilityState={{ selected: isSelected }}
        activeOpacity={0.7}
      >
        <View style={[
          styles.pigBadge,
          categoriesLayout.tablet && styles.pigBadgeTablet,
          isSelected && styles.pigBadgeSelected,
        ]}>
          {cat.icon ? (
            <Image source={cat.icon} style={[
              styles.pigImage,
              categoriesLayout.tablet && styles.pigImageTablet,
            ]} resizeMode="contain" accessible={false} />
          ) : (
            <Text style={styles.pendingArt} accessible={false}>Arte pendente</Text>
          )}
        </View>
        <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
          {cat.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header Roxo */}
      <View style={styles.header}>
        {/* Pesquisa e filtros lado a lado */}
        <View style={[styles.searchRow, layout.compact && { flexWrap: 'wrap' }]}>
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
          <TouchableOpacity style={styles.filterButton} onPress={onFilterPress}>
            <MaterialIcons name="filter-list" size={18} color="#FFFFFF" />
            <Text style={styles.filterText}>Filtros</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Conteúdo com Fundo Branco */}

      {/* Conteúdo com Fundo Branco */}
      <View style={styles.body}>
          <View style={styles.contentContainer}>
          {!hideCategories && (
            <ScrollView
              key="category-carousel"
              horizontal
              style={styles.categoriesContainer}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.categoriesScroll,
                { gap: categoriesLayout.gap, paddingHorizontal: categoriesLayout.paddingHorizontal },
              ]}
              accessibilityLabel="Categorias de rolê"
            >
              {CATEGORIES.map(renderCategory)}
            </ScrollView>
          )}

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
    backgroundColor: '#1E1B4B',
  },// Roxo escuro do header
    contentContainer: {
    flex: 1,
    ...PAGE_CONTENT,
  },
  categoriesContainer: {
  flexGrow: 0,
},
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 16,
  },
  searchRow: { ...PAGE_CONTENT, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBar: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
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
    minHeight: 44,
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
    minHeight: 44,
    paddingVertical: 8,
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
  categoriesScroll: { paddingVertical: 10 },
  categoryItem: { alignItems: 'center', minWidth: 44, paddingHorizontal: 4, paddingVertical: 4, minHeight: 88 },
  pigBadge: { width: 56, minHeight: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  pigBadgeTablet: { width: 68, minHeight: 68, borderRadius: 34 },
  pigBadgeSelected: {
    borderWidth: 2,
    borderColor: '#3B1A66',
    backgroundColor: '#F0EFF8',
  },
  pigImage: { width: 52, height: 52 },
  pigImageTablet: { width: 64, height: 64 },
  pendingArt: { fontSize: 10, color: '#64748B', textAlign: 'center', padding: 4 },
  categoryText: { fontSize: 12, color: '#0F172A', fontWeight: '700', marginTop: 4, textAlign: 'center', alignSelf: 'stretch' },
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
