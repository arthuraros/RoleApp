import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

import { MainLayout } from '../components/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { roleService } from '../services/roleService';

export function RolesScreen({ navigation }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados do Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [roleEmEdicao, setRoleEmEdicao] = useState(null);
  const [nomeRole, setNomeRole] = useState('');
  const [locaisDisponiveis, setLocaisDisponiveis] = useState([]);
  const [buscaLocal, setBuscaLocal] = useState('');
  
  // Array ordenado de locais selecionados para garantir a ordem exata das etapas:
  // [{ localObj, itensSelecionados: { [nomeItem]: { quantidade_item, precoUnitario } } }]
  const [locaisSelecionadosOrdem, setLocaisSelecionadosOrdem] = useState([]);
  
  const [localExpandido, setLocalExpandido] = useState(null);
  const [cardapioLocal, setCardapioLocal] = useState([]);
  const [loadingCardapio, setLoadingCardapio] = useState(false);

  const userId = user?.id_usuario || user?.id;

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
      console.error('Erro ao carregar rolês:', error.message);
      Alert.alert('Erro', 'Não foi possível carregar sua lista de rolês.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      carregarRoles();
    }, [carregarRoles])
  );

  const carregarLocaisParaBusca = async () => {
    try {
      const { data, error } = await supabase
        .from('locais')
        .select('*')
        .eq('visivel', true);

      if (error) throw error;
      setLocaisDisponiveis(data || []);
    } catch (err) {
      console.error('Erro ao buscar locais:', err);
    }
  };

  const abrirModalCriacao = () => {
    setRoleEmEdicao(null);
    setNomeRole('');
    setLocaisSelecionadosOrdem([]);
    setLocalExpandido(null);
    carregarLocaisParaBusca();
    setModalVisible(true);
  };

  const abrirModalEdicao = async (roleItem) => {
    setRoleEmEdicao(roleItem);
    setNomeRole(roleItem.nome_role || '');
    setLocalExpandido(null);
    await carregarLocaisParaBusca();

    // Reconstruir a lista ordenada com base nas etapas salvas
    const etapasAgrupadas = {};
    (roleItem.roles_etapas || []).forEach((etapa) => {
      if (etapa.locais) {
        const idLocal = etapa.id_local;
        if (!etapasAgrupadas[idLocal]) {
          etapasAgrupadas[idLocal] = {
            localObj: etapa.locais,
            ordem: etapa.etapa,
            itensSelecionados: {}
          };
        }
        if (etapa.item_cardapio) {
          etapasAgrupadas[idLocal].itensSelecionados[etapa.item_cardapio] = {
            quantidade_item: etapa.quantidade_item || 1,
            precoUnitario: (etapa.custo_acao || 0) / (etapa.quantidade_item || 1)
          };
        }
      }
    });

    // Ordenar pelo número da etapa original
    const ordenados = Object.values(etapasAgrupadas)
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ localObj, itensSelecionados }) => ({ localObj, itensSelecionados }));

    setLocaisSelecionadosOrdem(ordenados);
    setModalVisible(true);
  };

  // Alternar adição/remoção de um local na lista ordenada
  const toggleSelecionarLocal = async (local) => {
    const indexExistente = locaisSelecionadosOrdem.findIndex(item => item.localObj.id_local === local.id_local);

    if (indexExistente >= 0) {
      // Remover local
      const novaLista = locaisSelecionadosOrdem.filter((_, idx) => idx !== indexExistente);
      setLocaisSelecionadosOrdem(novaLista);
      if (localExpandido === local.id_local) setLocalExpandido(null);
    } else {
      // Adicionar no final da fila de etapas
      setLocaisSelecionadosOrdem([
        ...locaisSelecionadosOrdem,
        { localObj: local, itensSelecionados: {} }
      ]);
      selecionarLocalParaCardapio(local);
    }
  };

  const selecionarLocalParaCardapio = async (local) => {
    setLocalExpandido(local.id_local);
    setLoadingCardapio(true);
    try {
      const { data, error } = await supabase
        .from('itens_cardapio')
        .select('*')
        .eq('id_local', local.id_local)
        .eq('disponivel', true);

      if (error) throw error;
      setCardapioLocal(data || []);
    } catch (err) {
      console.error('Erro ao carregar cardápio:', err);
    } finally {
      setLoadingCardapio(false);
    }
  };

  const alterarquantidade_itemItem = (id_local, itemCardapio, delta) => {
    setLocaisSelecionadosOrdem(prev => 
      prev.map(item => {
        if (item.localObj.id_local === id_local) {
          const itensAtuais = { ...item.itensSelecionados };
          const qtdAtual = itensAtuais[itemCardapio.nome]?.quantidade_item || 0;
          const novaQtd = Math.max(0, qtdAtual + delta);

          if (novaQtd === 0) {
            delete itensAtuais[itemCardapio.nome];
          } else {
            itensAtuais[itemCardapio.nome] = {
              quantidade_item: novaQtd,
              precoUnitario: Number(itemCardapio.preco || 0)
            };
          }
          return { ...item, itensSelecionados: itensAtuais };
        }
        return item;
      })
    );
  };

  // Mover etapa para cima na ordem
  const moverEtapaCima = (index) => {
    if (index === 0) return;
    const novaLista = [...locaisSelecionadosOrdem];
    const temp = novaLista[index];
    novaLista[index] = novaLista[index - 1];
    novaLista[index - 1] = temp;
    setLocaisSelecionadosOrdem(novaLista);
  };

  // Mover etapa para baixo na ordem
  const moverEtapaBaixo = (index) => {
    if (index === locaisSelecionadosOrdem.length - 1) return;
    const novaLista = [...locaisSelecionadosOrdem];
    const temp = novaLista[index];
    novaLista[index] = novaLista[index + 1];
    novaLista[index + 1] = temp;
    setLocaisSelecionadosOrdem(novaLista);
  };

  // Excluir rolê completo
  const confirmarExclusaoRole = (roleItem) => {
    Alert.alert(
      'Excluir Rolê',
      `Deseja realmente excluir o rolê "${roleItem.nome_role}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              await roleService.deletarRole(roleItem.id_role, userId);
              Alert.alert('Sucesso', 'Rolê excluído com sucesso.');
              carregarRoles();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível excluir o rolê.');
            }
          } 
        }
      ]
    );
  };

  const salvarRoleDinamico = async () => {
    if (!nomeRole.trim()) {
      Alert.alert('Atenção', 'Dê um nome para o seu rolê.');
      return;
    }

    if (locaisSelecionadosOrdem.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos um local ao rolê.');
      return;
    }

    try {
      // Recalcula as etapas sequencialmente com base na ordem atual da lista
      const etapasFormatadas = locaisSelecionadosOrdem.map((item, index) => {
        const itensArray = Object.entries(item.itensSelecionados).map(([nomeItem, dados]) => ({
          nomeItem,
          quantidade_item: dados.quantidade_item,
          precoUnitario: dados.precoUnitario
        }));

        return {
          id_local: item.localObj.id_local,
          etapa: index + 1, // Etapas recalculadas automaticamente (1, 2, 3...)
          itens: itensArray
        };
      });

      if (roleEmEdicao) {
        await roleService.atualizarRoleCompleto(roleEmEdicao.id_role, userId, nomeRole, etapasFormatadas);
        Alert.alert('Sucesso', 'Rolê atualizado com sucesso!');
      } else {
        await roleService.criarRoleCompleto(userId, nomeRole, etapasFormatadas);
        Alert.alert('Sucesso', 'Rolê criado com sucesso!');
      }

      setModalVisible(false);
      carregarRoles();
    } catch (err) {
      console.error('Erro ao salvar rolê:', err);
      Alert.alert('Erro', 'Não foi possível salvar o rolê.');
    }
  };

  const rolesFiltrados = roles.filter((role) =>
    role.nome_role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout
      searchValue={search}
      onSearchChange={setSearch}
      onFilterPress={() => console.log('Abrir filtros')}
    >
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Meus Rolês</Text>
          <TouchableOpacity style={styles.addButton} onPress={abrirModalCriacao}>
            <Feather name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Criar Rolê</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1E1B4B" />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={rolesFiltrados}
            keyExtractor={(item) => String(item.id_role)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Nenhum rolê planejado encontrado. Crie o seu primeiro!
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.info}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.name}>{item.nome_role}</Text>
                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => abrirModalEdicao(item)} style={{ marginRight: 12 }}>
                        <Feather name="edit-2" size={18} color="#483AAE" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmarExclusaoRole(item)}>
                        <Feather name="trash-2" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.statusText}>Total: R$ {item.preco_final?.toFixed(2) || '0.00'}</Text>
                  <Text style={styles.etapasTitulo}>Locais e Etapas:</Text>
                  
                  {item.roles_etapas?.map((etapa, idx) => (
                    <Text key={idx} style={styles.etapaItem}>
                      • Etapa {etapa.etapa}: {etapa.locais?.nome || 'Local'} 
                      {etapa.item_cardapio ? ` (${etapa.quantidade_item}x ${etapa.item_cardapio})` : ''}
                    </Text>
                  ))}

                  <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() => {
                    navigation.navigate('RoleDetalhesScreen', { 
                        roleId: item.id_role, 
                        roleItem: item 
                    });
                    }}
                    >
                        <Text style={styles.detailsButtonText}>Ver detalhes do rolê</Text>
                    </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Modal de Criação / Edição com Ordenação e Recálculo de Etapas */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {roleEmEdicao ? 'Editar Rolê' : 'Planejar Novo Rolê'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Nome do Rolê (Ex: Roteiro Gastronômico)"
              placeholderTextColor="#94A3B8"
              value={nomeRole}
              onChangeText={setNomeRole}
            />

            {/* Seção de Locais Selecionados e Ordenados */}
            {locaisSelecionadosOrdem.length > 0 && (
              <View style={styles.ordemContainer}>
                <Text style={styles.sectionSubTitle}>Ordem das Etapas (Arraste ou ordene):</Text>
                {locaisSelecionadosOrdem.map((itemEtapa, index) => (
                  <View key={itemEtapa.localObj.id_local} style={styles.etapaOrdenadaCard}>
                    <Text style={styles.etapaNumeroBadge}>#{index + 1}</Text>
                    <Text style={styles.etapaNomeLocal} numberOfLines={1}>
                      {itemEtapa.localObj.nome}
                    </Text>
                    <View style={styles.etapaControles}>
                      <TouchableOpacity onPress={() => moverEtapaCima(index)} disabled={index === 0}>
                        <Feather name="chevron-up" size={18} color={index === 0 ? '#CBD5E1' : '#483AAE'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moverEtapaBaixo(index)} disabled={index === locaisSelecionadosOrdem.length - 1}>
                        <Feather name="chevron-down" size={18} color={index === locaisSelecionadosOrdem.length - 1 ? '#CBD5E1' : '#483AAE'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleSelecionarLocal(itemEtapa.localObj)} style={{ marginLeft: 8 }}>
                        <Feather name="x" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionSubTitle}>Adicionar / Gerenciar Locais:</Text>
            <TextInput
              style={styles.inputSearch}
              placeholder="Pesquisar estabelecimento..."
              placeholderTextColor="#94A3B8"
              value={buscaLocal}
              onChangeText={setBuscaLocal}
            />

            <ScrollView style={styles.locaisScroll} nestedScrollEnabled={true}>
              {locaisDisponiveis
                .filter(l => l.nome.toLowerCase().includes(buscaLocal.toLowerCase()))
                .map((local) => {
                  const estaSelecionado = locaisSelecionadosOrdem.some(i => i.localObj.id_local === local.id_local);
                  return (
                    <View key={local.id_local} style={styles.localItemBox}>
                      <TouchableOpacity 
                        style={styles.localItemHeader}
                        onPress={() => toggleSelecionarLocal(local)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.localItemName}>{local.nome}</Text>
                          <Text style={styles.localItemAddress}>{local.endereco}</Text>
                        </View>
                        <MaterialCommunityIcons 
                          name={estaSelecionado ? "checkbox-marked-circle" : "checkbox-blank-outline"} 
                          size={24} 
                          color={estaSelecionado ? "#483AAE" : "#94A3B8"} 
                        />
                      </TouchableOpacity>

                      {/* Cardápio se o local estiver expandido ou selecionado */}
                      {localExpandido === local.id_local && estaSelecionado && (
                        <View style={styles.cardapioContainer}>
                          <Text style={styles.cardapioTitle}>Itens consumidos neste local:</Text>
                          {loadingCardapio ? (
                            <ActivityIndicator size="small" color="#483AAE" />
                          ) : cardapioLocal.length === 0 ? (
                            <Text style={styles.semCardapio}>Nenhum item cadastrado.</Text>
                          ) : (
                            cardapioLocal.map((itemCardap) => {
                              const etapaAtualObj = locaisSelecionadosOrdem.find(i => i.localObj.id_local === local.id_local);
                              const qtd = etapaAtualObj?.itensSelecionados[itemCardap.nome]?.quantidade_item || 0;
                              return (
                                <View key={itemCardap.id_item} style={styles.cardapioItemRow}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.cardapioItemName}>{itemCardap.nome}</Text>
                                    <Text style={styles.cardapioItemPrice}>R$ {itemCardap.preco}</Text>
                                  </View>
                                  <View style={styles.counterRow}>
                                    <TouchableOpacity 
                                      style={styles.counterBtn}
                                      onPress={() => alterarquantidade_itemItem(local.id_local, itemCardap, -1)}
                                    >
                                      <Text style={styles.counterBtnText}>-</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.counterText}>{qtd}</Text>
                                    <TouchableOpacity 
                                      style={styles.counterBtn}
                                      onPress={() => alterarquantidade_itemItem(local.id_local, itemCardap, 1)}
                                    >
                                      <Text style={styles.counterBtnText}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.saveBtn]} 
                onPress={salvarRoleDinamico}
              >
                <Text style={styles.saveBtnText}>
                  {roleEmEdicao ? 'Salvar Alterações' : 'Salvar Rolê'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </MainLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E1B4B',
  },
  addButton: {
    backgroundColor: '#483AAE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  list: {
    paddingBottom: 110,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#64748B',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  etapasTitulo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
  },
  etapaItem: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
    marginTop: 2,
  },
  detailsButton: {
    backgroundColor: '#483AAE',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    color: '#1E293B',
  },
  sectionSubTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E1B4B',
    marginBottom: 6,
    marginTop: 8,
  },
  ordemContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  etapaOrdenadaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  etapaNumeroBadge: {
    fontWeight: 'bold',
    color: '#483AAE',
    marginRight: 8,
    fontSize: 13,
  },
  etapaNomeLocal: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  etapaControles: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputSearch: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
    color: '#1E293B',
  },
  locaisScroll: {
    maxHeight: 200,
    marginBottom: 12,
  },
  localItemBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  localItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  localItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E1B4B',
  },
  localItemAddress: {
    fontSize: 12,
    color: '#64748B',
  },
  cardapioContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  cardapioTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  semCardapio: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  cardapioItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  cardapioItemName: {
    fontSize: 13,
    color: '#1E293B',
  },
  cardapioItemPrice: {
    fontSize: 11,
    color: '#64748B',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterBtn: {
    backgroundColor: '#E2E8F0',
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnText: {
    fontWeight: 'bold',
    color: '#1E1B4B',
  },
  counterText: {
    marginHorizontal: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#483AAE',
    marginLeft: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});