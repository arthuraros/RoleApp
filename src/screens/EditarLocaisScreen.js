import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { parceiroService } from '../services/parceiroService';

const DEFAULT_HOURS = [
  { day: 'Seg', open: '08:00', close: '18:00', active: true, dia_semana: 1 },
  { day: 'Ter', open: '08:00', close: '18:00', active: true, dia_semana: 2 },
  { day: 'Qua', open: '08:00', close: '18:00', active: true, dia_semana: 3 },
  { day: 'Qui', open: '08:00', close: '18:00', active: true, dia_semana: 4 },
  { day: 'Sex', open: '08:00', close: '18:00', active: true, dia_semana: 5 },
  { day: 'Sáb', open: '08:00', close: '14:00', active: true, dia_semana: 6 },
  { day: 'Dom', open: '', close: '', active: false, dia_semana: 0 },
];

export function EditarLocaisScreen({ navigation, route }) {
  const { user } = useAuth();
  const userId = user?.id_usuario || user?.id;

  const [locaisList, setLocaisList] = useState([]);
  const [currentLocal, setCurrentLocal] = useState(route?.params?.local || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [nomeLocal, setNomeLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('Lanchonete');
  const [telefone, setTelefone] = useState('');
  const [faixaPreco, setFaixaPreco] = useState('$');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidadeUf, setCidadeUf] = useState('Brasília, DF');
  const [isVisibleInApp, setIsVisibleInApp] = useState(true);

  // Horários e Eventos
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [events, setEvents] = useState([]);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDays, setNewEventDays] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventDetails, setNewEventDetails] = useState('');

  // Carrega lista de locais do parceiro
  const loadLocais = useCallback(async () => {
    try {
      const data = await parceiroService.getLocaisDoParceiro(userId);
      setLocaisList(data || []);
      const initial = route?.params?.local || data?.[0] || null;
      if (initial) {
        loadLocalData(initial.id_local);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.warn('Erro ao buscar locais:', err);
      setLoading(false);
    }
  }, [userId, route?.params?.local]);

  // Carrega detalhes completos do local selecionado
  const loadLocalData = async (idLocal) => {
    try {
      setLoading(true);
      const detalhes = await parceiroService.getLocalComDetalhes(idLocal);
      if (detalhes) {
        setCurrentLocal(detalhes);
        setNomeLocal(detalhes.nome || '');
        setDescricao(detalhes.descricao || '');
        setTelefone(detalhes.telefone || '');
        setFaixaPreco(detalhes.faixa_preco || '$');
        setEndereco(detalhes.endereco || '');
        setBairro(detalhes.bairro || '');
        setCidadeUf(detalhes.cidade_uf || 'Brasília, DF');
        setIsVisibleInApp(detalhes.visivel !== false);

        // Mapeia horários
        if (detalhes.horarios && detalhes.horarios.length > 0) {
          const mapped = DEFAULT_HOURS.map((dh) => {
            const found = detalhes.horarios.find((h) => h.dia_semana === dh.dia_semana);
            if (found) {
              return {
                ...dh,
                open: found.abre ? found.abre.slice(0, 5) : '',
                close: found.fecha ? found.fecha.slice(0, 5) : '',
                active: !found.fechado,
              };
            }
            return dh;
          });
          setHours(mapped);
        } else {
          setHours(DEFAULT_HOURS);
        }

        // Mapeia eventos
        setEvents(detalhes.eventos || []);
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes do local:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocais();
  }, [loadLocais]);

  const handleSelectPlace = (place) => {
    loadLocalData(place.id_local);
  };

  const handleToggleDay = (index) => {
    setHours((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, active: !item.active } : item
      )
    );
  };

  const handleUpdateHour = (index, field, value) => {
    setHours((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      )
    );
  };

  const handleRepeatHours = () => {
    const first = hours.find((h) => h.active);
    if (!first) return;
    setHours((prev) =>
      prev.map((item) =>
        item.active ? { ...item, open: first.open, close: first.close } : item
      )
    );
    Alert.alert('Sucesso', 'Horários replicados para todos os dias abertos.');
  };

  const handleAddEvent = async () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Atenção', 'Informe ao menos o nome do evento.');
      return;
    }
    if (!currentLocal?.id_local) {
      Alert.alert('Atenção', 'Nenhum local selecionado.');
      return;
    }

    try {
      const created = await parceiroService.criarEvento({
        idLocal: currentLocal.id_local,
        titulo: newEventTitle.trim(),
        dias: newEventDays.trim() || 'Diário',
        hora: newEventTime.trim() || '18:00',
        detalhes: newEventDetails.trim(),
      });

      setEvents((prev) => [created, ...prev]);
      setNewEventTitle('');
      setNewEventDays('');
      setNewEventTime('');
      setNewEventDetails('');
      Alert.alert('Sucesso', 'Evento adicionado com sucesso!');
    } catch (err) {
      console.error('Erro ao adicionar evento:', err);
      Alert.alert('Erro', err.message || 'Não foi possível adicionar o evento.');
    }
  };

  const handleRemoveEvent = async (idEvento) => {
    try {
      await parceiroService.removerEvento(idEvento);
      setEvents((prev) => prev.filter((ev) => ev.id_evento !== idEvento && ev.id !== idEvento));
    } catch (err) {
      console.error('Erro ao excluir evento:', err);
      Alert.alert('Erro', 'Não foi possível remover o evento.');
    }
  };

  const handleSave = async () => {
    if (!currentLocal?.id_local) {
      Alert.alert('Atenção', 'Nenhum local selecionado para salvar.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        parceiroService.updateLocal(currentLocal.id_local, {
          nome: nomeLocal.trim(),
          descricao: descricao.trim(),
          telefone: telefone.trim(),
          faixa_preco: faixaPreco,
          endereco: endereco.trim(),
          bairro: bairro.trim(),
          cidade_uf: cidadeUf.trim(),
          visivel: isVisibleInApp,
          ...(userId && !currentLocal.id_proprietario ? { id_proprietario: userId } : {}),
        }),
        parceiroService.salvarHorarios(currentLocal.id_local, hours),
      ]);

      Alert.alert('Salvo com sucesso', 'As informações do seu local foram atualizadas no Supabase!', [
        { text: 'OK', onPress: () => navigation?.goBack() },
      ]);
    } catch (err) {
      console.error('Erro ao salvar local:', err);
      Alert.alert('Erro ao Salvar', err.message || 'Falha ao atualizar dados no banco.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Descartar alterações?', 'As alterações não salvas serão perdidas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => navigation?.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Back Arrow */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation?.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo-outline" size={28} color="#C1121F" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.screenTitle}>Seus locais</Text>

          {/* Place Selector Pills */}
          <View style={styles.placesRow}>
            {locaisList.length > 0 ? (
              locaisList.map((loc) => {
                const isSelected = currentLocal?.id_local === loc.id_local;
                return (
                  <TouchableOpacity
                    key={loc.id_local}
                    style={[
                      styles.placePill,
                      isSelected ? styles.placePillActive : styles.placePillInactive,
                    ]}
                    onPress={() => handleSelectPlace(loc)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.placePillText,
                        isSelected ? styles.placePillTextActive : styles.placePillTextInactive,
                      ]}
                    >
                      {loc.nome}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <TouchableOpacity style={[styles.placePill, styles.placePillActive]}>
                <Text style={[styles.placePillText, styles.placePillTextActive]}>
                  Bistrô do Centro
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Local visível no app Card */}
          <View style={styles.visibilityCard}>
            <View style={styles.visibilityTextCol}>
              <Text style={styles.visibilityTitle}>Local visível no app</Text>
              <Text style={styles.visibilitySubtitle}>
                {isVisibleInApp ? 'Aparecendo nas buscas agora' : 'Oculto nas buscas'}
              </Text>
            </View>
            <Switch
              value={isVisibleInApp}
              onValueChange={setIsVisibleInApp}
              trackColor={{ false: '#D1D5DB', true: '#1B1445' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Section: Informações */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Informações</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome do local</Text>
              <TextInput
                style={styles.textInput}
                value={nomeLocal}
                onChangeText={setNomeLocal}
                placeholder="Nome do estabelecimento"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Descrição</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={descricao}
                onChangeText={setDescricao}
                placeholder="Descrição do estabelecimento"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </View>

            <View style={styles.twoColsRow}>
              <View style={[styles.inputGroup, styles.colFlex]}>
                <Text style={styles.inputLabel}>Categoria</Text>
                <TextInput
                  style={styles.textInput}
                  value={categoria}
                  onChangeText={setCategoria}
                  placeholder="Ex: Bar, Lanchonete"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={[styles.inputGroup, styles.colFlex]}>
                <Text style={styles.inputLabel}>Telefone</Text>
                <TextInput
                  style={styles.textInput}
                  value={telefone}
                  onChangeText={setTelefone}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Faixa de preço */}
            <Text style={styles.inputLabel}>Faixa de preço</Text>
            <View style={styles.priceSegmentedContainer}>
              {[
                { key: '$', label: '$ · até R$ 25' },
                { key: '$$', label: '$$ · R$ 25–50' },
                { key: '$$$', label: '$$$ · R$ 50+' },
              ].map((p) => {
                const isSelected = faixaPreco === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.priceSegmentedButton,
                      isSelected && styles.priceSegmentedButtonActive,
                    ]}
                    onPress={() => setFaixaPreco(p.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.priceSegmentedText,
                        isSelected && styles.priceSegmentedTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Localidade */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Localidade</Text>
            <Text style={styles.sectionSubheading}>
              Usuários próximos veem seu local primeiro.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Endereço</Text>
              <TextInput
                style={styles.textInput}
                value={endereco}
                onChangeText={setEndereco}
                placeholder="Rua, número"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.twoColsRow}>
              <View style={[styles.inputGroup, styles.colFlex]}>
                <Text style={styles.inputLabel}>Bairro</Text>
                <TextInput
                  style={styles.textInput}
                  value={bairro}
                  onChangeText={setBairro}
                  placeholder="Nome do bairro"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={[styles.inputGroup, styles.colFlex]}>
                <Text style={styles.inputLabel}>Cidade / UF</Text>
                <TextInput
                  style={styles.textInput}
                  value={cidadeUf}
                  onChangeText={setCidadeUf}
                  placeholder="Cidade, UF"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            {/* Mini Map Card */}
            <View style={styles.miniMapCard}>
              {/* Map abstract graphics */}
              <View style={styles.mapRoadH} />
              <View style={styles.mapRoadV} />
              <View style={styles.mapRoadCurve} />

              <View style={styles.mapPinContainer}>
                <Ionicons name="location" size={32} color="#C1121F" />
              </View>

              <View style={styles.mapAddressPill}>
                <Text style={styles.mapAddressPillText} numberOfLines={1}>
                  {endereco || 'Rua das Flores, 123 - Centro'}
                </Text>
              </View>
            </View>
          </View>

          {/* Section: Horários de funcionamento */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Horários de funcionamento</Text>

            <View style={styles.hoursCard}>
              {hours.map((item, idx) => (
                <View key={item.day} style={styles.hourRow}>
                  <Text style={styles.hourDayLabel}>{item.day}</Text>

                  {item.active ? (
                    <View style={styles.hourInputsRow}>
                      <TextInput
                        style={styles.hourInput}
                        value={item.open}
                        onChangeText={(t) => handleUpdateHour(idx, 'open', t)}
                        placeholder="08:00"
                        placeholderTextColor="#9CA3AF"
                      />
                      <Text style={styles.hourHyphen}>-</Text>
                      <TextInput
                        style={styles.hourInput}
                        value={item.close}
                        onChangeText={(t) => handleUpdateHour(idx, 'close', t)}
                        placeholder="18:00"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  ) : (
                    <View style={styles.hourClosedContainer}>
                      <Text style={styles.hourClosedText}>Fechado</Text>
                    </View>
                  )}

                  <Switch
                    value={item.active}
                    onValueChange={() => handleToggleDay(idx)}
                    trackColor={{ false: '#DC2626', true: '#1B1445' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}

              <TouchableOpacity
                onPress={handleRepeatHours}
                style={styles.repeatButton}
                activeOpacity={0.7}
              >
                <Text style={styles.repeatButtonText}>
                  Repetir primeiro horário em todos os dias abertos
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Eventos e programação */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Eventos e programação</Text>
            <Text style={styles.sectionSubheading}>
              Aparecem na página do local e na aba “Hoje” do app.
            </Text>

            {/* Existing Events List */}
            {events.map((ev) => {
              const eventId = ev.id_evento || ev.id;
              return (
                <View key={eventId} style={styles.eventCard}>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeDays}>{ev.dias || ev.days}</Text>
                    <Text style={styles.eventBadgeTime}>{ev.hora || ev.time}</Text>
                  </View>

                  <View style={styles.eventDetailsCol}>
                    <Text style={styles.eventTitle}>{ev.titulo || ev.title}</Text>
                    {!!(ev.detalhes || ev.details) && (
                      <Text style={styles.eventDescription}>
                        {ev.detalhes || ev.details}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => handleRemoveEvent(eventId)}
                    style={styles.eventRemoveButton}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Novo evento Box */}
            <View style={styles.newEventBox}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Novo evento</Text>
                <TextInput
                  style={styles.textInputCompact}
                  value={newEventTitle}
                  onChangeText={setNewEventTitle}
                  placeholder="Nome do evento ou promoção"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.twoColsRow}>
                <View style={[styles.inputGroup, styles.colFlex]}>
                  <Text style={styles.inputLabel}>Dia(s)</Text>
                  <TextInput
                    style={styles.textInputCompact}
                    value={newEventDays}
                    onChangeText={setNewEventDays}
                    placeholder="Ex: Seg a Qui"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={[styles.inputGroup, styles.colFlex]}>
                  <Text style={styles.inputLabel}>Hora</Text>
                  <TextInput
                    style={styles.textInputCompact}
                    value={newEventTime}
                    onChangeText={setNewEventTime}
                    placeholder="Ex: 19:00"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Detalhes</Text>
                <TextInput
                  style={styles.textInputCompact}
                  value={newEventDetails}
                  onChangeText={setNewEventDetails}
                  placeholder="Regras, preços ou diferenciais"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <TouchableOpacity
                style={styles.addEventButton}
                onPress={handleAddEvent}
                activeOpacity={0.8}
              >
                <Text style={styles.addEventButtonText}>+ Adicionar evento</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={handleDiscard}
              activeOpacity={0.8}
            >
              <Text style={styles.discardButtonText}>Descartar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.publishButton, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.publishButtonText}>Tudo publicado</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAE8F4',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 36,
  },
  topBar: {
    marginBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 4,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 16,
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  placePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  placePillActive: {
    backgroundColor: '#1B1445',
  },
  placePillInactive: {
    backgroundColor: '#FFFFFF',
  },
  placePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  placePillTextActive: {
    color: '#FFFFFF',
  },
  placePillTextInactive: {
    color: '#000000',
  },
  visibilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  visibilityTextCol: {
    flex: 1,
  },
  visibilityTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
  visibilitySubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  sectionBlock: {
    marginBottom: 22,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  sectionSubheading: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#71655C',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 13.5,
    color: '#000000',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  twoColsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  colFlex: {
    flex: 1,
  },
  priceSegmentedContainer: {
    backgroundColor: '#8272EC',
    borderRadius: 999,
    padding: 4,
    flexDirection: 'row',
  },
  priceSegmentedButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceSegmentedButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  priceSegmentedText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1B1445',
  },
  priceSegmentedTextActive: {
    color: '#1B1445',
  },
  miniMapCard: {
    backgroundColor: '#E8F5E9',
    height: 95,
    borderRadius: 16,
    marginTop: 6,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapRoadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 40,
    height: 14,
    backgroundColor: '#FFFFFF',
  },
  mapRoadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '45%',
    width: 14,
    backgroundColor: '#FFFFFF',
  },
  mapRoadCurve: {
    position: 'absolute',
    right: -20,
    top: 20,
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 10,
    borderColor: '#FFFFFF',
  },
  mapPinContainer: {
    zIndex: 2,
    marginBottom: 8,
  },
  mapAddressPill: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mapAddressPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
  },
  hoursCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  hourDayLabel: {
    width: 40,
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  hourInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  hourInput: {
    borderWidth: 1.5,
    borderColor: '#1E1848',
    borderRadius: 8,
    width: 72,
    height: 38,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  hourHyphen: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  hourClosedContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  hourClosedText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C1121F',
  },
  repeatButton: {
    marginTop: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  repeatButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22194D',
    textDecorationLine: 'underline',
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    minWidth: 64,
  },
  eventBadgeDays: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  eventBadgeTime: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  eventDetailsCol: {
    flex: 1,
    paddingHorizontal: 12,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  eventDescription: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  eventRemoveButton: {
    padding: 6,
  },
  newEventBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#7C6EE6',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  textInputCompact: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1E1848',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    color: '#000000',
  },
  addEventButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addEventButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  discardButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  discardButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  publishButton: {
    flex: 1,
    backgroundColor: '#958EA5',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishButtonText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

