import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { roleService } from '../services/roleService';

export function RoleDetalhesScreen({ route, navigation }) {
  const { roleId, roleItem: initialRoleItem } = route.params || {};
  const [role, setRole] = useState(initialRoleItem || null);
  const [loading, setLoading] = useState(!initialRoleItem);

  // Estados para o Modal de Finalização/Status
  const [modalStatusVisible, setModalStatusVisible] = useState(false);
  const [novoStatus, setNovoStatus] = useState('realizado');
  const [tipoPreco, setTipoPreco] = useState('automatico'); // 'automatico' ou 'manual'
  const [valorManual, setValorManual] = useState('');
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  useEffect(() => {
    if (roleId) {
      carregarDetalhesRole();
    }
  }, [roleId]);

  const carregarDetalhesRole = async () => {
    try {
      setLoading(true);
      const rolesUsuario = await roleService.getRolesDoUsuario(role?.id_usuario);
      const encontrado = rolesUsuario.find(r => r.id_role === roleId);
      if (encontrado) {
        setRole(encontrado);
        setValorManual(String(encontrado.preco_final || '0'));
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      Alert.alert('Erro', 'Não foi possível carregar os detalhes do rolê.');
    } finally {
      setLoading(false);
    }
  };

  const abrirModalStatus = () => {
    setNovoStatus(role.status || 'realizado');
    setTipoPreco('automatico');
    setValorManual(String(role.preco_final || '0'));
    setModalStatusVisible(true);
  };

  const salvarAlteracaoStatus = async () => {
    try {
      setSalvandoStatus(true);

      // Calcula o preço final com base na escolha do usuário
      let precoFinalFinal = role.preco_final; // padrão automático

      if (tipoPreco === 'manual') {
        const parsed = parseFloat(valorManual.replace(',', '.'));
        if (isNaN(parsed) || parsed < 0) {
          Alert.alert('Atenção', 'Informe um valor válido para o gasto real.');
          setSalvandoStatus(false);
          return;
        }
        precoFinalFinal = parsed;
      }

      await roleService.atualizarStatusEPrecoRole(
        role.id_role,
        role.id_usuario,
        novoStatus,
        precoFinalFinal
      );

      Alert.alert('Sucesso', 'Status e valores atualizados com sucesso!');
      setModalStatusVisible(false);
      carregarDetalhesRole();
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      Alert.alert('Erro', 'Não foi possível atualizar o rolê.');
    } finally {
      setSalvandoStatus(false);
    }
  };

  const obterEtapasAgrupadas = () => {
    if (!role?.roles_etapas || role.roles_etapas.length === 0) return [];
    const mapa = {};

    role.roles_etapas.forEach((item) => {
      const numEtapa = item.etapa;
      if (!mapa[numEtapa]) {
        mapa[numEtapa] = {
          etapa: numEtapa,
          local: item.locais,
          itensConsumo: [],
        };
      }

      if (item.item_cardapio) {
        mapa[numEtapa].itensConsumo.push({
          nome: item.item_cardapio,
          quantidade: item.quantidade_item,
          custo: item.custo_acao,
        });
      }
    });

    return Object.values(mapa).sort((a, b) => a.etapa - b.etapa);
  };

  if (loading || !role) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#483AAE" />
      </View>
    );
  }

  const etapasAgrupadas = obterEtapasAgrupadas();
  const custoAutomaticoCalculado = role.preco_final || 0;

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#1E1B4B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{role.nome_role}</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('RolesScreen')} 
          style={styles.editButton}
        >
          <Feather name="edit-3" size={20} color="#483AAE" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Card de Informações e Ação de Status */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardTopRow}>
            <View>
              <Text style={styles.statusLabel}>Status Atual</Text>
              <Text style={styles.statusValue}>{role.status}</Text>
            </View>
            <TouchableOpacity style={styles.statusChangeButton} onPress={abrirModalStatus}>
              <Feather name="check-circle" size={16} color="#FFFFFF" />
              <Text style={styles.statusChangeButtonText}>Alterar Status</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <Text style={styles.precoTotal}>
            Custo Total: R$ {role.preco_final?.toFixed(2) || '0.00'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Etapas do Roteiro</Text>

        {/* Listagem das Etapas Agrupadas */}
        {etapasAgrupadas.length > 0 ? (
          etapasAgrupadas.map((etapaObj) => (
            <View key={etapaObj.etapa} style={styles.timelineWrapper}>
              <View style={styles.nodeCard}>
                <View style={styles.nodeHeader}>
                  <View style={styles.badgeEtapa}>
                    <Text style={styles.badgeText}>Etapa {etapaObj.etapa}</Text>
                  </View>
                  <Text style={styles.localNome} numberOfLines={1}>
                    {etapaObj.local?.nome || 'Local'}
                  </Text>
                </View>

                <Text style={styles.localEndereco} numberOfLines={1}>
                  {etapaObj.local?.endereco || 'Endereço não informado'}
                </Text>

                {etapaObj.itensConsumo.length > 0 ? (
                  <View style={styles.cardapioContainer}>
                    <View style={styles.cardapioHeaderRow}>
                      <MaterialCommunityIcons name="silverware-fork-knife" size={14} color="#483AAE" />
                      <Text style={styles.cardapioTituloLista}>Itens consumidos:</Text>
                    </View>
                    {etapaObj.itensConsumo.map((item, idx) => (
                      <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemName}>• {item.quantidade}x {item.nome}</Text>
                        <Text style={styles.itemPrice}>R$ {item.custo?.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.cardapioDescricaoBox}>
                    <MaterialCommunityIcons name="map-marker-radius" size={14} color="#64748B" />
                    <Text style={styles.cardapioDescricaoTextovisita}>Apenas visita / sem consumo registrado</Text>
                  </View>
                )}
              </View>

              <View style={styles.plusContainer}>
                <View style={styles.timelineLine} />
                <TouchableOpacity 
                  style={styles.plusButton}
                  onPress={() => navigation.navigate('RolesScreen')}
                >
                  <Feather name="plus" size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.timelineLine} />
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Nenhuma etapa cadastrada neste rolê.</Text>
        )}

        <TouchableOpacity 
          style={styles.addButtonFinal}
          onPress={() => navigation.navigate('RolesScreen')}
        >
          <Feather name="plus-circle" size={18} color="#483AAE" />
          <Text style={styles.addButtonFinalText}>Adicionar nova etapa</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal para Mudar Status e Definir Custo Final */}
      <Modal visible={modalStatusVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Atualizar Status do Rolê</Text>

            <Text style={styles.modalSubLabel}>Novo Status:</Text>
            <View style={styles.statusOptionsRow}>
              {['planejado', 'em andamento', 'realizado', 'cancelado'].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.statusOptionChip,
                    novoStatus === st && styles.statusOptionChipSelected
                  ]}
                  onPress={() => setNovoStatus(st)}
                >
                  <Text style={[
                    styles.statusOptionChipText,
                    novoStatus === st && styles.statusOptionChipTextSelected
                  ]}>
                    {st.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalSubLabel, { marginTop: 16 }]}>Valor / Gasto Final:</Text>
            
            <TouchableOpacity 
              style={styles.radioOption}
              onPress={() => setTipoPreco('automatico')}
            >
              <MaterialCommunityIcons 
                name={tipoPreco === 'automatico' ? 'radiobox-marked' : 'radiobox-blank'} 
                size={20} 
                color="#483AAE" 
              />
              <Text style={styles.radioText}>
                Usar valor atual (R$ {custoAutomaticoCalculado.toFixed(2)})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.radioOption}
              onPress={() => setTipoPreco('manual')}
            >
              <MaterialCommunityIcons 
                name={tipoPreco === 'manual' ? 'radiobox-marked' : 'radiobox-blank'} 
                size={20} 
                color="#483AAE" 
              />
              <Text style={styles.radioText}>Informar outro valor</Text>
            </TouchableOpacity>

            {tipoPreco === 'manual' && (
              <TextInput
                style={styles.inputValor}
                placeholder="Ex: 150.00"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={valorManual}
                onChangeText={setValorManual}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setModalStatusVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.saveBtn]} 
                onPress={salvarAlteracaoStatus}
                disabled={salvandoStatus}
              >
                {salvandoStatus ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  backButton: {
    padding: 4,
  },
  editButton: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  infoCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E1B4B',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statusChangeButton: {
    backgroundColor: '#483AAE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusChangeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  precoTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#483AAE',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 16,
  },
  timelineWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  nodeCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeEtapa: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#483AAE',
  },
  localNome: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E1B4B',
    flex: 1,
  },
  localEndereco: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  cardapioContainer: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  cardapioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardapioTituloLista: {
    fontSize: 13,
    fontWeight: '600',
    color: '#483AAE',
    marginLeft: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    paddingLeft: 4,
  },
  itemName: {
    fontSize: 13,
    color: '#1E293B',
  },
  itemPrice: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  cardapioDescricaoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  cardapioDescricaoTextovisita: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
  },
  plusContainer: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#CBD5E1',
  },
  plusButton: {
    backgroundColor: '#483AAE',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    elevation: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 20,
  },
  addButtonFinal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#483AAE',
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    elevation: 1,
  },
  addButtonFinalText: {
    marginLeft: 8,
    color: '#483AAE',
    fontWeight: 'bold',
    fontSize: 14,
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  statusOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  statusOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  statusOptionChipSelected: {
    backgroundColor: '#483AAE',
    borderColor: '#483AAE',
  },
  statusOptionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  statusOptionChipTextSelected: {
    color: '#FFFFFF',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  radioText: {
    fontSize: 13,
    color: '#1E293B',
    marginLeft: 8,
    flex: 1,
  },
  inputValor: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1E293B',
    marginTop: 6,
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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