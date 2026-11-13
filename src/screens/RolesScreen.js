
import React, { useState, useCallback } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

import { MainLayout } from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { roleService } from '../services/roleService';

export function RolesScreen({ navigation }) {
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id_usuario || user?.id;

  // ==========================================
  // CARREGAR ROLÊS DO USUÁRIO
  // ==========================================

  const carregarRoles = useCallback(async () => {
    if (!userId) {
      setRoles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const data = await roleService.getRolesDoUsuario(userId);

      setRoles(data || []);

    } catch (error) {
      console.error('Erro ao carregar rolês:', error);

      Alert.alert(
        'Erro',
        'Não foi possível carregar sua lista de rolês.'
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Atualiza a lista sempre que a tela receber foco.
  useFocusEffect(
    useCallback(() => {
      carregarRoles();
    }, [carregarRoles])
  );

  // ==========================================
  // CRIAR NOVO ROLÊ
  // ==========================================

  const criarNovoRole = () => {
    navigation.navigate('RoleDetalhesScreen', {
      userId: userId,
      isRascunho: true,
    });
  };

  // ==========================================
  // ABRIR ROLÊ PARA EDIÇÃO
  // ==========================================

  const abrirDetalhesRole = (roleItem) => {
    navigation.navigate('RoleDetalhesScreen', {
      roleId: roleItem.id_role,
      roleItem: roleItem,
      userId: userId,
    });
  };

  // ==========================================
  // EXCLUIR ROLÊ
  // ==========================================

  const confirmarExclusaoRole = (roleItem) => {
    Alert.alert(
      'Excluir Rolê',
      `Deseja realmente excluir o rolê "${roleItem.nome_role}"?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Excluir',
          style: 'destructive',

          onPress: async () => {
            try {
              await roleService.deletarRole(
                roleItem.id_role,
                userId
              );

              Alert.alert(
                'Sucesso',
                'Rolê excluído com sucesso.'
              );

              carregarRoles();

            } catch (err) {
              console.error('Erro ao excluir rolê:', err);

              Alert.alert(
                'Erro',
                'Não foi possível excluir o rolê.'
              );
            }
          },
        },
      ]
    );
  };

  // ==========================================
  // FILTRAR ROLÊS
  // ==========================================

  const rolesFiltrados = roles.filter(role =>
    role.nome_role?.toLowerCase().includes(search.toLowerCase())
  );

  // ==========================================
  // INTERFACE
  // ==========================================

  return (
    <MainLayout
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={() => console.log('Abrir filtros')}
    >
      <View style={styles.container}>

        {/* CABEÇALHO */}
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>
            Meus Rolês
          </Text>

          <TouchableOpacity
            style={styles.addButton}
            onPress={criarNovoRole}
          >
            <Feather
              name="plus"
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.addButtonText}>
              Criar Rolê
            </Text>
          </TouchableOpacity>
        </View>

        {/* CARREGAMENTO */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator
              size="large"
              color="#1E1B4B"
            />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={rolesFiltrados}
            keyExtractor={item => String(item.id_role)}
            contentContainerStyle={styles.list}

            ListEmptyComponent={
              <Text style={styles.empty}>
                Nenhum rolê planejado encontrado.
                Crie o seu primeiro!
              </Text>
            }

            renderItem={({ item }) => (
              <View style={styles.card}>

                <View style={styles.info}>

                  <View style={styles.cardHeaderRow}>
                    <Text
                      style={styles.name}
                      numberOfLines={2}
                    >
                      {item.nome_role}
                    </Text>

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        onPress={() => confirmarExclusaoRole(item)}
                      >
                        <Feather
                          name="trash-2"
                          size={19}
                          color="#EF4444"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.statusContainer}>
                    <MaterialCommunityIcons
                      name="circle"
                      size={10}
                      color="#483AAE"
                    />

                    <Text style={styles.statusText}>
                      Status: {item.status}
                    </Text>
                  </View>

                  <Text style={styles.precoText}>
                    Total: R$ {Number(item.preco_final || 0).toFixed(2)}
                  </Text>

                  <Text style={styles.etapasText}>
                    {item.roles_etapas?.length || 0} registro(s) de etapa
                  </Text>

                  {/* BOTÃO DE DETALHES E EDIÇÃO */}
                  <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() => abrirDetalhesRole(item)}
                  >
                    <Feather
                      name="edit-3"
                      size={15}
                      color="#FFFFFF"
                    />

                    <Text style={styles.detailsButtonText}>
                      Ver detalhes / Editar rolê
                    </Text>
                  </TouchableOpacity>

                </View>
              </View>
            )}
          />
        )}

      </View>
    </MainLayout>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  screenTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E1B4B',
  },

  addButton: {
    backgroundColor: '#483AAE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  list: {
    paddingBottom: 30,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    marginBottom: 14,
    padding: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  info: {
    flex: 1,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  name: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1E1B4B',
    flex: 1,
  },

  cardActions: {
    flexDirection: 'row',
    gap: 15,
  },

  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },

  statusText: {
    color: '#64748B',
    fontSize: 13,
  },

  precoText: {
    color: '#483AAE',
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: 10,
  },

  etapasText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 5,
  },

  detailsButton: {
    backgroundColor: '#483AAE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },

  detailsButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  empty: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 50,
    lineHeight: 22,
  },
});
