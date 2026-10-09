import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export function PerfilScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      {/* Gradiente fixo apenas na parte superior do fundo */}
      <LinearGradient
        colors={['#1E1848', '#483AAE', '#FFFFFF']}
        locations={[0, 0.4, 0.8]}
        style={styles.topGradientBackground}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Cabeçalho / Perfil */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.notificationButton}>
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.avatarContainer}>
              <Image
                source={require('../../assets/brand_symbol.png')} // Substitua pelo seu ícone do porquinho/mascote
                style={styles.avatarImage}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'usuario@email.com'}</Text>
          </View>

          {/* Conteúdo da Página com Fundo Branco */}
          <View style={styles.contentCard}>
            {/* Cards Superiores */}
            <View style={styles.topCardsRow}>
              <View style={[styles.card, styles.visitedCard]}>
                <Text style={styles.visitedCount}>24</Text>
                <Text style={styles.cardLabel}>Rolês Visitados</Text>
              </View>

              <TouchableOpacity style={[styles.card, styles.wishlistCard]}>
                <Image
                  source={require('../../assets/bookmark_symbol.png')}
                  style={styles.cardIcon}
                  resizeMode="fill"
                />
                <Text style={styles.wishlistLabel}>Rolês que quero visitar</Text>
              </TouchableOpacity>
            </View>

            {/* Ações Rápidas */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionPill}>
                <Text style={styles.actionText}>Editar perfil</Text>
                <Feather name="edit-3" size={16} color="#1E293B" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionPill}>
                <Text style={styles.actionText}>Avaliações Feitas</Text>
                <Text style={styles.actionBadge}>12</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de Opções */}
            <View style={styles.menuList}>
              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Configurações</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Ajuda e Suporte</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Seja parceiro</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Contate-nos</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Termos e serviços</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem}>
                <Text style={styles.menuText}>Privacidade</Text>
              </TouchableOpacity>
            </View>

            {/* Botão Sair */}
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutText}>Sair</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.navItem}>
            <Feather name="home" size={20} color="#64748B" />
            <Text style={styles.navLabel}>Início</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem}>
            <Feather name="heart" size={20} color="#64748B" />
            <Text style={styles.navLabel}>Favoritos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem}>
            <MaterialIcons name="map" size={20} color="#64748B" />
            <Text style={styles.navLabel}>Mapa</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
            <Feather name="user" size={20} color="#FFFFFF" />
            <Text style={styles.activeNavLabel}>Perfil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topGradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280, // Define a altura onde o gradiente vai suavemente desvanecer para branco
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 20,
    position: 'relative',
  },
  notificationButton: {
    position: 'absolute',
    top: 10,
    right: 20,
    backgroundColor: '#DC2626',
    borderRadius: 20,
    padding: 8,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#342B76',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarImage: {
    width: 60,
    height: 60,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  userEmail: {
    fontSize: 13,
    color: '#0A0A0A',
    marginTop: 2,
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  topCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#1E1848',
    borderRadius: 16,
    padding: 12,
    height: 90,
  },
  visitedCard: {
    justifyContent: 'center',
  },
  visitedCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  wishlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 40,
    height: 40,
    marginRight: 8,
  },
  wishlistLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionPill: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#3B1A66',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  actionBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuList: {
    gap: 10,
    marginBottom: 20,
  },
  menuItem: {
    borderWidth: 1,
    borderColor: '#3B1A66',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  menuText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  logoutButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
  },
  activeNavLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 2,
  },
});