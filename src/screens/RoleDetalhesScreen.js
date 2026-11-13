
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
import { supabase } from '../services/supabase';

export function RoleDetalhesScreen({ route, navigation }) {
  const { userId, roleId, roleItem } = route.params || {};

  // Se possuir roleId, a tela estará no modo de edição.
  const modoEdicao = !!roleId;

  // Estados principais
  const [nomeRole, setNomeRole] = useState('');
  const [statusRole, setStatusRole] = useState('planejado');
  const [etapasRascunho, setEtapasRascunho] = useState([]);

  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [carregandoRole, setCarregandoRole] = useState(false);

  // Estados do modal
  const [modalEtapaVisible, setModalEtapaVisible] = useState(false);
  const [locaisDisponiveis, setLocaisDisponiveis] = useState([]);
  const [buscaLocal, setBuscaLocal] = useState('');
  const [localSelecionado, setLocalSelecionado] = useState(null);
  const [cardapioLocal, setCardapioLocal] = useState([]);
  const [loadingCardapio, setLoadingCardapio] = useState(false);
  const [itensSelecionadosEtapa, setItensSelecionadosEtapa] = useState({});

  // Custo total
  const precoTotalRascunho = etapasRascunho.reduce(
    (acc, curr) => acc + Number(curr.custoEtapaTotal || 0),
    0
  );

  // ==========================================
  // CARREGAR ROLÊ EXISTENTE
  // ==========================================

  const carregarRoleExistente = async () => {
    if (!roleId || !userId) return;

    try {
      setCarregandoRole(true);

      let role = roleItem;

      // Se os dados das etapas não vieram pela navegação,
      // busca novamente no banco.
      if (!role || !Array.isArray(role.roles_etapas)) {
        const rolesUsuario = await roleService.getRolesDoUsuario(userId);

        role = rolesUsuario.find(
          r => String(r.id_role) === String(roleId)
        );
      }

      if (!role) {
        throw new Error('Rolê não encontrado.');
      }

      setNomeRole(role.nome_role || '');
      setStatusRole(role.status || 'planejado');

      // Agrupa todas as linhas de roles_etapas por número de etapa.
      const etapasAgrupadas = {};

      (role.roles_etapas || []).forEach(linha => {
        const numeroEtapa = linha.etapa;

        if (!etapasAgrupadas[numeroEtapa]) {
          etapasAgrupadas[numeroEtapa] = {
            etapa: numeroEtapa,
            id_local: linha.id_local,
            locais: linha.locais || {
              id_local: linha.id_local,
              nome: 'Local não encontrado',
              endereco: 'Endereço não informado',
            },
            itens: [],
            custoEtapaTotal: 0,
          };
        }

        // Registros sem item representam apenas visita.
        if (linha.item_cardapio) {
          const quantidade = Number(linha.quantidade_item || 1);
          const custoTotal = Number(linha.custo_acao || 0);

          etapasAgrupadas[numeroEtapa].itens.push({
            nomeItem: linha.item_cardapio,
            quantidade_item: quantidade,
            precoUnitario:
              quantidade > 0 ? custoTotal / quantidade : 0,
          });

          etapasAgrupadas[numeroEtapa].custoEtapaTotal += custoTotal;
        }
      });

      const etapasCarregadas = Object.values(etapasAgrupadas)
        .sort((a, b) => a.etapa - b.etapa);

      setEtapasRascunho(etapasCarregadas);

    } catch (error) {
      console.error('Erro ao carregar rolê:', error);

      Alert.alert(
        'Erro',
        'Não foi possível carregar os detalhes deste rolê.',
        [{ text: 'Voltar', onPress: () => navigation.goBack() }]
      );
    } finally {
      setCarregandoRole(false);
    }
  };

  useEffect(() => {
    if (modoEdicao) {
      carregarRoleExistente();
    }
  }, [roleId, userId]);

  // ==========================================
  // CARREGAR LOCAIS
  // ==========================================

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
      Alert.alert('Erro', 'Não foi possível carregar os locais.');
    }
  };

  const abrirModalAdicionarEtapa = () => {
    setLocalSelecionado(null);
    setCardapioLocal([]);
    setItensSelecionadosEtapa({});
    setBuscaLocal('');

    setModalEtapaVisible(true);
    carregarLocaisParaBusca();
  };

  // ==========================================
  // SELECIONAR LOCAL E CARREGAR CARDÁPIO
  // ==========================================

  const selecionarLocalParaEtapa = async (local) => {
    setLocalSelecionado(local);
    setLoadingCardapio(true);
    setItensSelecionadosEtapa({});
    setCardapioLocal([]);

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
      Alert.alert('Erro', 'Não foi possível carregar o cardápio.');
    } finally {
      setLoadingCardapio(false);
    }
  };

  // ==========================================
  // QUANTIDADE DOS ITENS
  // ==========================================

  const alterarQtdItemEtapa = (itemCardap, delta) => {
    setItensSelecionadosEtapa(prev => {
      const atual = prev[itemCardap.nome]?.quantidade_item || 0;
      const novaQtd = Math.max(0, atual + delta);

      const copia = { ...prev };

      if (novaQtd === 0) {
        delete copia[itemCardap.nome];
      } else {
        copia[itemCardap.nome] = {
          quantidade_item: novaQtd,
          precoUnitario: Number(itemCardap.preco || 0),
        };
      }

      return copia;
    });
  };

  // ==========================================
  // ADICIONAR ETAPA AO ROLÊ
  // ==========================================

  const adicionarEtapaAoRascunho = () => {
    if (!localSelecionado) {
      Alert.alert('Atenção', 'Selecione um local para esta etapa.');
      return;
    }

    const itensArray = Object.entries(itensSelecionadosEtapa).map(
      ([nomeItem, dados]) => ({
        nomeItem,
        quantidade_item: dados.quantidade_item,
        precoUnitario: dados.precoUnitario,
      })
    );

    const proximoNumeroEtapa =
      etapasRascunho.length > 0
        ? Math.max(...etapasRascunho.map(e => e.etapa)) + 1
        : 1;

    const custoEtapa = itensArray.reduce(
      (total, item) =>
        total + item.precoUnitario * item.quantidade_item,
      0
    );

    const novaEtapa = {
      etapa: proximoNumeroEtapa,
      id_local: localSelecionado.id_local,
      locais: localSelecionado,
      itens: itensArray,
      custoEtapaTotal: custoEtapa,
    };

    setEtapasRascunho(prev => [...prev, novaEtapa]);
    setModalEtapaVisible(false);
  };

  // ==========================================
  // REMOVER ETAPA
  // ==========================================

  const removerEtapaRascunho = (indexEtapa) => {
    Alert.alert(
      'Remover etapa',
      'Deseja realmente remover esta etapa do rolê?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            setEtapasRascunho(prev => {
              const novasEtapas = prev.filter(
                (_, idx) => idx !== indexEtapa
              );

              return novasEtapas.map((etapa, idx) => ({
                ...etapa,
                etapa: idx + 1,
              }));
            });
          },
        },
      ]
    );
  };

  // ==========================================
  // SALVAR OU ATUALIZAR ROLÊ
  // ==========================================

  const salvarRolpesDefinitivoNoBanco = async () => {
    if (!userId) {
      Alert.alert('Erro', 'Usuário não identificado.');
      return;
    }

    if (!nomeRole.trim()) {
      Alert.alert('Atenção', 'Dê um nome para o seu rolê.');
      return;
    }

    if (etapasRascunho.length === 0) {
      Alert.alert(
        'Atenção',
        'Adicione pelo menos uma etapa/local ao rolê.'
      );
      return;
    }

    try {
      setSalvandoBanco(true);

      const etapasFormatadas = etapasRascunho.map(e => ({
        id_local: e.id_local,
        etapa: e.etapa,
        itens: e.itens || [],
      }));

      if (modoEdicao) {
        // Atualiza o rolê que já existe.
        await roleService.atualizarRoleCompleto(
          roleId,
          userId,
          nomeRole.trim(),
          etapasFormatadas
        );

        Alert.alert(
          'Sucesso',
          'Rolê atualizado com sucesso!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        // Cria um novo rolê.
        await roleService.criarRoleCompletoComEtapas(
          userId,
          nomeRole.trim(),
          etapasFormatadas
        );

        Alert.alert(
          'Sucesso',
          'Rolê criado e salvo com sucesso!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (err) {
      console.error('Erro ao salvar rolê:', err);

      Alert.alert(
        'Erro',
        modoEdicao
          ? 'Não foi possível atualizar o rolê.'
          : 'Não foi possível salvar o rolê.'
      );
    } finally {
      setSalvandoBanco(false);
    }
  };

  // ==========================================
  // CARREGAMENTO INICIAL
  // ==========================================

  if (carregandoRole) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#483AAE" />
        <Text style={styles.loadingText}>
          Carregando informações do rolê...
        </Text>
      </View>
    );
  }

  // ==========================================
  // INTERFACE
  // ==========================================

  return (
    <View style={styles.container}>

      {/* CABEÇALHO */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={24} color="#1E1B4B" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {modoEdicao ? 'Editar Rolê' : 'Novo Rolê'}
        </Text>

        <TouchableOpacity
          style={styles.salvarTopBtn}
          onPress={salvarRolpesDefinitivoNoBanco}
          disabled={salvandoBanco}
        >
          {salvandoBanco ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.salvarTopBtnText}>
              {modoEdicao ? 'Atualizar' : 'Salvar'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >

        {/* INFORMAÇÕES DO ROLÊ */}
        <View style={styles.infoCard}>
          <Text style={styles.labelInput}>Nome do Rolê</Text>

          <TextInput
            style={styles.inputNomeRole}
            placeholder="Ex: Roteiro de Botecos"
            placeholderTextColor="#94A3B8"
            value={nomeRole}
            onChangeText={setNomeRole}
          />

          {modoEdicao && (
            <View style={styles.statusContainer}>
              <Text style={styles.statusLabel}>Status atual:</Text>
              <Text style={styles.statusValue}>{statusRole}</Text>
            </View>
          )}

          <Text style={styles.precoTotal}>
            Custo Estimado: R$ {precoTotalRascunho.toFixed(2)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Etapas do Roteiro</Text>

        {/* LISTAGEM DAS ETAPAS */}
        {etapasRascunho.length > 0 ? (
          etapasRascunho.map((etapaObj, index) => (
            <View key={`etapa-${etapaObj.etapa}`} style={styles.timelineWrapper}>

              <View style={styles.nodeCard}>

                <View style={styles.nodeHeader}>
                  <View style={styles.badgeEtapa}>
                    <Text style={styles.badgeText}>
                      Etapa {etapaObj.etapa}
                    </Text>
                  </View>

                  <Text style={styles.localNome} numberOfLines={1}>
                    {etapaObj.locais?.nome || 'Local'}
                  </Text>

                  <TouchableOpacity
                    onPress={() => removerEtapaRascunho(index)}
                  >
                    <Feather
                      name="trash-2"
                      size={18}
                      color="#EF4444"
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.localEndereco} numberOfLines={2}>
                  {etapaObj.locais?.endereco || 'Endereço não informado'}
                </Text>

                {etapaObj.itens.length > 0 ? (
                  <View style={styles.cardapioContainer}>

                    <View style={styles.cardapioHeaderRow}>
                      <MaterialCommunityIcons
                        name="silverware-fork-knife"
                        size={16}
                        color="#483AAE"
                      />

                      <Text style={styles.cardapioTituloLista}>
                        Itens consumidos:
                      </Text>
                    </View>

                    {etapaObj.itens.map((item, idx) => (
                      <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemName}>
                          {item.quantidade_item}x {item.nomeItem}
                        </Text>

                        <Text style={styles.itemPrice}>
                          R${' '}
                          {(
                            item.precoUnitario * item.quantidade_item
                          ).toFixed(2)}
                        </Text>
                      </View>
                    ))}

                    <View style={styles.totalEtapaRow}>
                      <Text style={styles.totalEtapaLabel}>
                        Total da etapa
                      </Text>

                      <Text style={styles.totalEtapaValue}>
                        R$ {etapaObj.custoEtapaTotal.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cardapioDescricaoBox}>
                    <MaterialCommunityIcons
                      name="map-marker-radius"
                      size={16}
                      color="#64748B"
                    />

                    <Text style={styles.cardapioDescricaoTexto}>
                      Apenas visita / sem consumo registrado
                    </Text>
                  </View>
                )}

              </View>

              <View style={styles.plusContainer}>
                <View style={styles.timelineLine} />

                <TouchableOpacity
                  style={styles.plusButton}
                  onPress={abrirModalAdicionarEtapa}
                >
                  <Feather name="plus" size={18} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.timelineLine} />
              </View>

            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>
            Nenhuma etapa adicionada ainda. Clique no botão abaixo para começar!
          </Text>
        )}

        {/* ADICIONAR ETAPA */}
        <TouchableOpacity
          style={styles.addButtonFinal}
          onPress={abrirModalAdicionarEtapa}
        >
          <Feather name="plus-circle" size={20} color="#483AAE" />

          <Text style={styles.addButtonFinalText}>
            Adicionar etapa
          </Text>
        </TouchableOpacity>

        {/* SALVAR */}
        {etapasRascunho.length > 0 && (
          <TouchableOpacity
            style={styles.salvarFundoBtn}
            onPress={salvarRolpesDefinitivoNoBanco}
            disabled={salvandoBanco}
          >
            {salvandoBanco ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.salvarFundoBtnText}>
                {modoEdicao
                  ? 'Salvar Alterações'
                  : 'Salvar Rolê Definitivo'}
              </Text>
            )}
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* ====================================== */}
      {/* MODAL DE ADICIONAR ETAPA */}
      {/* ====================================== */}

      <Modal
        visible={modalEtapaVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalEtapaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>

            <Text style={styles.modalTitle}>
              Selecionar Local e Consumo
            </Text>

            {!localSelecionado ? (
              <>
                <TextInput
                  style={styles.inputSearch}
                  placeholder="Pesquisar local..."
                  placeholderTextColor="#94A3B8"
                  value={buscaLocal}
                  onChangeText={setBuscaLocal}
                />

                <ScrollView style={{ maxHeight: 300 }}>
                  {locaisDisponiveis
                    .filter(l =>
                      (l.nome || '')
                        .toLowerCase()
                        .includes(buscaLocal.toLowerCase())
                    )
                    .map(local => (
                      <TouchableOpacity
                        key={local.id_local}
                        style={styles.localItemBox}
                        onPress={() => selecionarLocalParaEtapa(local)}
                      >
                        <Text style={styles.localItemName}>
                          {local.nome}
                        </Text>

                        <Text style={styles.localItemAddress}>
                          {local.endereco}
                        </Text>
                      </TouchableOpacity>
                    ))}

                  {locaisDisponiveis.length === 0 && (
                    <Text style={styles.semCardapio}>
                      Nenhum local disponível.
                    </Text>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.selectedLocalHeaderBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedLocalTitle}>
                      Local: {localSelecionado.nome}
                    </Text>

                    <Text style={styles.selectedLocalSub}>
                      {localSelecionado.endereco}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setLocalSelecionado(null);
                      setCardapioLocal([]);
                      setItensSelecionadosEtapa({});
                    }}
                  >
                    <Text style={styles.trocarLocalText}>Trocar</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionSubTitle}>
                  Selecione os itens do cardápio:
                </Text>

                <ScrollView style={{ maxHeight: 250 }}>
                  {loadingCardapio ? (
                    <ActivityIndicator
                      size="small"
                      color="#483AAE"
                    />
                  ) : cardapioLocal.length === 0 ? (
                    <Text style={styles.semCardapio}>
                      Nenhum item cadastrado neste local.
                    </Text>
                  ) : (
                    cardapioLocal.map(itemCardap => {
                      const qtd =
                        itensSelecionadosEtapa[itemCardap.nome]
                          ?.quantidade_item || 0;

                      return (
                        <View
                          key={itemCardap.id_item}
                          style={styles.cardapioItemRow}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardapioItemName}>
                              {itemCardap.nome}
                            </Text>

                            <Text style={styles.cardapioItemPrice}>
                              R$ {Number(itemCardap.preco || 0).toFixed(2)}
                            </Text>
                          </View>

                          <View style={styles.counterRow}>
                            <TouchableOpacity
                              style={styles.counterBtn}
                              onPress={() =>
                                alterarQtdItemEtapa(itemCardap, -1)
                              }
                            >
                              <Text style={styles.counterBtnText}>-</Text>
                            </TouchableOpacity>

                            <Text style={styles.counterText}>
                              {qtd}
                            </Text>

                            <TouchableOpacity
                              style={styles.counterBtn}
                              onPress={() =>
                                alterarQtdItemEtapa(itemCardap, 1)
                              }
                            >
                              <Text style={styles.counterBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalEtapaVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              {localSelecionado && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.saveBtn]}
                  onPress={adicionarEtapaAoRascunho}
                >
                  <Text style={styles.saveBtnText}>
                    Confirmar Etapa
                  </Text>
                </TouchableOpacity>
              )}
            </View>

          </View>
        </View>
      </Modal>

    </View>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },

  header: {
    height: 65,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  backButton: {
    padding: 5,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
  },

  salvarTopBtn: {
    backgroundColor: '#483AAE',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 75,
    alignItems: 'center',
  },

  salvarTopBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    marginBottom: 24,
    elevation: 2,
  },

  labelInput: {
    color: '#1E1B4B',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  inputNomeRole: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
  },

  statusContainer: {
    flexDirection: 'row',
    marginTop: 14,
    alignItems: 'center',
  },

  statusLabel: {
    color: '#64748B',
    fontSize: 13,
  },

  statusValue: {
    color: '#483AAE',
    fontWeight: 'bold',
    marginLeft: 6,
    textTransform: 'capitalize',
  },

  precoTotal: {
    color: '#483AAE',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 16,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 16,
  },

  timelineWrapper: {
    width: '100%',
  },

  nodeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  badgeEtapa: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },

  badgeText: {
    color: '#483AAE',
    fontSize: 11,
    fontWeight: 'bold',
  },

  localNome: {
    flex: 1,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
  },

  localEndereco: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 10,
  },

  cardapioContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  cardapioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },

  cardapioTituloLista: {
    fontSize: 13,
    color: '#483AAE',
    fontWeight: 'bold',
  },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  itemName: {
    color: '#475569',
    fontSize: 13,
    flex: 1,
  },

  itemPrice: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },

  totalEtapaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  totalEtapaLabel: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 12,
  },

  totalEtapaValue: {
    color: '#483AAE',
    fontWeight: 'bold',
    fontSize: 13,
  },

  cardapioDescricaoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },

  cardapioDescricaoTexto: {
    color: '#64748B',
    fontSize: 12,
  },

  plusContainer: {
    alignItems: 'center',
    height: 55,
  },

  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#CBD5E1',
  },

  plusButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#483AAE',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 3,
  },

  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    marginVertical: 30,
    lineHeight: 22,
  },

  addButtonFinal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 15,
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    marginTop: 10,
  },

  addButtonFinalText: {
    color: '#483AAE',
    fontWeight: 'bold',
    fontSize: 14,
  },

  salvarFundoBtn: {
    backgroundColor: '#483AAE',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },

  salvarFundoBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },

  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E1B4B',
    marginBottom: 18,
  },

  inputSearch: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    padding: 12,
    marginBottom: 12,
    color: '#1E293B',
  },

  localItemBox: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  localItemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
  },

  localItemAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },

  selectedLocalHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 9,
    marginBottom: 16,
    gap: 10,
  },

  selectedLocalTitle: {
    color: '#1E1B4B',
    fontWeight: 'bold',
    fontSize: 14,
  },

  selectedLocalSub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },

  trocarLocalText: {
    color: '#483AAE',
    fontWeight: 'bold',
  },

  sectionSubTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 12,
  },

  semCardapio: {
    textAlign: 'center',
    color: '#94A3B8',
    padding: 20,
  },

  cardapioItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  cardapioItemName: {
    color: '#1E293B',
    fontWeight: '600',
    fontSize: 14,
  },

  cardapioItemPrice: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },

  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  counterBtn: {
    width: 30,
    height: 30,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  counterBtnText: {
    color: '#483AAE',
    fontSize: 19,
    fontWeight: 'bold',
  },

  counterText: {
    color: '#1E293B',
    fontWeight: 'bold',
    minWidth: 15,
    textAlign: 'center',
  },

  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },

  modalBtn: {
    flex: 1,
    padding: 13,
    borderRadius: 9,
    alignItems: 'center',
  },

  cancelBtn: {
    backgroundColor: '#E2E8F0',
  },

  cancelBtnText: {
    color: '#475569',
    fontWeight: 'bold',
  },

  saveBtn: {
    backgroundColor: '#483AAE',
  },

  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
