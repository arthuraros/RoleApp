import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { parceiroService } from '../services/parceiroService';

const ALL_INTERESTS = [
  'Almoço barato',
  'Happy hour',
  'Música ao vivo',
  'Lanches',
  'Café',
  'Vegano',
  'Família',
  'Universitários',
  'Madrugada',
];

const AGE_RANGES = ['Todos', '18–24', '25–34', '35+'];

export function ImpulsionarScreen({ navigation, route }) {
  const { user } = useAuth();
  const userId = user?.id_usuario || user?.id;

  // Mode: 'destaque' | 'visibilidade'
  const [mode, setMode] = useState('destaque');

  // Locais do parceiro
  const [locais, setLocais] = useState([]);
  const [selectedLocal, setSelectedLocal] = useState(route?.params?.local || null);

  // Highlight inputs
  const [titulo, setTitulo] = useState();
  const [mensagem, setMensagem] = useState();

  // Audience & filters
  const [selectedInterests, setSelectedInterests] = useState([
    'Almoço barato',
    'Universitários',
  ]);
  const [selectedAge, setSelectedAge] = useState('Todos');
  const [selectedDuration, setSelectedDuration] = useState(7);
  const [campaigns, setCampaigns] = useState([]);
  const [offers, setOffers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Carrega locais e campanhas
  const loadData = useCallback(async () => {
    try {
      const dataLocais = await parceiroService.getLocaisDoParceiro(userId);
      setOffers(await parceiroService.listarOfertasCampanha().catch(() => []));
      setLocais(dataLocais || []);
      const current = route?.params?.local || dataLocais?.[0] || null;
      if (current) {
        setSelectedLocal(current);
        const camps = await parceiroService.getCampanhas(current.id_local);
        setCampaigns(camps || []);
      }
    } catch (err) {
      console.warn('Erro ao carregar campanhas:', err);
    }
  }, [userId, route?.params?.local]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectPlace = async (loc) => {
    setSelectedLocal(loc);
    try {
      const camps = await parceiroService.getCampanhas(loc.id_local);
      setCampaigns(camps || []);
    } catch (err) {
      console.warn('Erro ao filtrar campanhas:', err);
    }
  };

  const toggleInterest = (interest) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const durations = offers.filter(offer => /*offer.tipo === mode &&*/ [3, 7, 14].includes(Number(offer.duracao_dias)))
    .map(offer => ({
      days: Number(offer.duracao_dias), label: `${offer.duracao_dias} dias`,
      per_day: (Number(offer.valor_total) / Number(offer.duracao_dias)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      total: Number(offer.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      views: offer.views,
      publico: offer.publico,
    }));
  const currentDurationInfo = durations.find(d => d.days === selectedDuration) || durations[0];

  const handleAction = async () => {
    if (!currentDurationInfo) {
      Alert.alert('Campanhas indisponíveis', 'Aguarde as opções de duração e orçamento.'); return;
    }
    if (!selectedLocal?.id_local) {
      Alert.alert('Atenção', 'Selecione um estabelecimento.');
      return;
    }

    if (selectedLocal.visivel === false) {
      Alert.alert(
        'Local oculto',
        'Este local não está visível no aplicativo. Torne o local visível antes de solicitar um impulsionamento.'
      );
      return;
    }

    if (mode === 'destaque' && !titulo.trim()) {
      Alert.alert('Atenção', 'Por favor, insira o título do destaque.');
      return;
    }

    setSubmitting(true);
    try {
      const novaCampanha = await parceiroService.criarCampanha({
        idLocal: selectedLocal.id_local,
        idUsuario: userId,
        tipo: mode,
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        interesses: selectedInterests,
        faixaEtaria: selectedAge,
        raioKm: 5,
        duracaoDias: currentDurationInfo.days,
      });

      setCampaigns((prev) => [novaCampanha, ...prev]);

      Alert.alert(
        'Campanha solicitada',
        `Sua campanha para "${selectedLocal.nome}" foi registrada como rascunho. A ativação depende de análise e confirmação das condições.`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('Erro ao criar campanha:', err);
      Alert.alert('Erro', err.message || 'Não foi possível solicitar a campanha.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatNumber = (value) => {
    if (value == null || value === "") return "A confirmar";

    const number = Number(value);

    if (isNaN(number)) return value;

    const formatted = number.toLocaleString("pt-BR");

    return number >= 1000 ? `~${formatted}` : `~${formatted}`;
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

          {/* Screen Title */}
          <Text style={styles.screenTitle}>Mais gente chegando</Text>

          {/* Mode Switcher Pill */}
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'destaque' && styles.modeButtonActive,
              ]}
              onPress={() => setMode('destaque')}
              activeOpacity={0.85}
            >
              <Text style={styles.modeButtonText}>Criar destaque</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'visibilidade' && styles.modeButtonActive,
              ]}
              onPress={() => setMode('visibilidade')}
              activeOpacity={0.85}
            >
              <Text style={styles.modeButtonText}>Impulsionar visibilidade</Text>
            </TouchableOpacity>
          </View>

          {/* Section: Local */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Local</Text>
            <View style={styles.placesRow}>
              {locais.length > 0 ? (
                locais.map((loc) => {
                  const isSelected = selectedLocal?.id_local === loc.id_local;
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

            {selectedLocal && selectedLocal.visivel === false && (
              <View style={styles.warningBanner}>
                <Ionicons name="alert-circle-outline" size={20} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.warningBannerText}>
                  Este local está oculto no app e não pode receber impulsionamento até que seja ativado.
                </Text>
              </View>
            )}
          </View>

          {/* Section: Seu destaque (Only for mode === 'destaque') */}
          {mode === 'destaque' && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeading}>Seu destaque</Text>
              <Text style={styles.sectionSubheading}>
                Mostrado a usuários cujo perfil combina com a oferta.
              </Text>

              {/* Input Título */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Título</Text>
                <TextInput
                  style={styles.textInput}
                  value={titulo}
                  onChangeText={setTitulo}
                  placeholder='Combo estudante por R$ 9,90'
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Input Mensagem */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mensagem</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={mensagem}
                  onChangeText={setMensagem}
                  placeholder='Salgado + suco natural de segunda a quinta, com carteirinha.'
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </View>

              {/* Live Preview Card */}
              <View style={styles.previewCard}>
                <View style={styles.previewTopRow}>
                  <Text style={styles.previewTag}>PRÉVIA NO APP</Text>
                  <View style={styles.previewBadge}>
                    <Text style={styles.previewBadgeText}>Destaque</Text>
                  </View>
                </View>

                <Text style={styles.previewHeadline}>{titulo || 'Título da oferta'}</Text>
                <Text style={styles.previewMessage}>
                  {mensagem || 'Descrição do destaque aqui...'}
                </Text>
                <Text style={styles.previewFooter}>
                  {selectedLocal?.nome || 'Seu estabelecimento'} · {selectedLocal?.faixa_preco || '$'}
                </Text>
              </View>
            </View>
          )}

          {/* Section: Quem deve ver */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Quem deve ver</Text>
            <Text style={styles.sectionSubheading}>
              Combinamos com os interesses que os usuários marcam no perfil.
            </Text>

            {/* Interest Tags */}
            <View style={styles.interestsWrap}>
              {ALL_INTERESTS.map((interest) => {
                const isSelected = selectedInterests.includes(interest);
                return (
                  <TouchableOpacity
                    key={interest}
                    style={[
                      styles.interestPill,
                      isSelected ? styles.interestPillActive : styles.interestPillInactive,
                    ]}
                    onPress={() => toggleInterest(interest)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.interestPillText,
                        isSelected
                          ? styles.interestPillTextActive
                          : styles.interestPillTextInactive,
                      ]}
                    >
                      {isSelected ? `✓ ${interest}` : interest}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Faixa etária */}
            <Text style={styles.subLabel}>Faixa etária</Text>
            <View style={styles.segmentedContainer}>
              {AGE_RANGES.map((age) => {
                const isSelected = selectedAge === age;
                return (
                  <TouchableOpacity
                    key={age}
                    style={[
                      styles.segmentedButton,
                      isSelected && styles.segmentedButtonActive,
                    ]}
                    onPress={() => setSelectedAge(age)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        isSelected && styles.segmentedTextActive,
                      ]}
                    >
                      {age}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Raio ao redor do local */}
            <View style={styles.radiusRow}>
              <Text style={styles.subLabel}>Raio ao redor do local</Text>
              <Text style={styles.radiusValue}>5 km</Text>
            </View>
          </View>

          {/* Section: Orçamento e duração */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Orçamento e duração</Text>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Por dia</Text>
              <Text style={styles.costValue}>{currentDurationInfo?.per_day || 'Indisponível'}</Text>
            </View>

            {/* Duration Pills */}
            <View style={styles.segmentedContainer}>
              {durations.map((dur) => {
                const isSelected = currentDurationInfo?.days === dur.days;
                return (
                  <TouchableOpacity
                    key={dur.days}
                    style={[
                      styles.segmentedButton,
                      isSelected && styles.segmentedButtonActive,
                    ]}
                    onPress={() => setSelectedDuration(dur.days)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        isSelected && styles.segmentedTextActive,
                      ]}
                    >
                      {dur.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Calculation Card */}
            <View style={styles.calculationCard}>
              <View style={styles.calcMetricsRow}>
                <View style={styles.calcMetricCol}>
                  <Text style={styles.calcNumber}>{formatNumber(currentDurationInfo?.publico)}</Text>
                  <Text style={styles.calcLabel}>pessoas no público</Text>
                </View>

                <View style={styles.calcMetricCol}>
                  <Text style={styles.calcNumber}>{formatNumber(currentDurationInfo?.views)}</Text>
                  <Text style={styles.calcLabel}>visualizações estimadas</Text>
                </View>
              </View>

              <View style={styles.calcDivider} />

              <View style={styles.calcFooterRow}>
                <Text style={styles.calcTotalLabel}>
                  Total em {currentDurationInfo?.label || 'duração a confirmar'}
                </Text>
                <Text style={styles.calcTotalValue}>
                  {currentDurationInfo?.total || 'Indisponível'}
                </Text>
              </View>
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                (submitting || selectedLocal?.visivel === false) && { opacity: 0.6, backgroundColor: '#9CA3AF' }
              ]}
              onPress={handleAction}
              activeOpacity={0.85}
              disabled={submitting || !currentDurationInfo || selectedLocal?.visivel === false}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {selectedLocal?.visivel === false ? 'Local indisponível para campanha' : 'Solicitar campanha'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Section: Campanhas ativas */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeading}>Minhas campanhas</Text>
            {campaigns.length > 0 ? (
              campaigns.map((camp) => (
                <View key={camp.id_campanha} style={[styles.activeCampaignCard, { marginBottom: 10 }]}>
                  <View style={styles.activeCampaignLeft}>
                    <Text style={styles.activeCampaignTitle}>
                      {camp.tipo === 'destaque' ? 'Destaque' : 'Impulso'} · {camp.duracao_dias} dias
                    </Text>
                    <Text style={styles.activeCampaignSubtitle}>
                      {selectedLocal?.nome || 'Local'} · {camp.status}
                    </Text>
                  </View>
                  <View style={styles.activeCampaignRight}>
                    <Text style={styles.activeCampaignMetric}>{camp.alcance || '0'}</Text>
                    <Text style={styles.activeCampaignMetricLabel}>alcance</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.activeCampaignCard}>
                <View style={styles.activeCampaignLeft}>
                  <Text style={styles.activeCampaignTitle}>Nenhuma campanha cadastrada</Text>
                  <Text style={styles.activeCampaignSubtitle}>
                    As solicitações começam como rascunho, sem vigência até a ativação.
                  </Text>
                </View>
              </View>
            )}
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
  modeContainer: {
    backgroundColor: '#1B1445',
    borderRadius: 999,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#4C3BA3',
  },
  modeButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
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
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  placePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  placePillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#4C3BA3',
  },
  placePillInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
  },
  placePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  placePillTextActive: {
    color: '#4C3BA3',
  },
  placePillTextInactive: {
    color: '#6B7280',
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
    borderWidth: 1.5,
    borderColor: '#1E1848',
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
  previewCard: {
    backgroundColor: '#B91C1C',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  previewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewTag: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewBadge: {
    backgroundColor: '#F87171',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  previewBadgeText: {
    color: '#1E1848',
    fontSize: 11,
    fontWeight: '800',
  },
  previewHeadline: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  previewMessage: {
    color: '#FFFFFF',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 12,
  },
  previewFooter: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  interestPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  interestPillActive: {
    backgroundColor: '#1B1445',
  },
  interestPillInactive: {
    backgroundColor: '#FFFFFF',
  },
  interestPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  interestPillTextActive: {
    color: '#FFFFFF',
  },
  interestPillTextInactive: {
    color: '#000000',
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 6,
  },
  segmentedContainer: {
    backgroundColor: '#8272EC',
    borderRadius: 999,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 14,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B1445',
  },
  segmentedTextActive: {
    color: '#1B1445',
  },
  radiusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  radiusValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  costLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  costValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  calculationCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#B91C1C',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  calcMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calcMetricCol: {
    flex: 1,
  },
  calcNumber: {
    fontSize: 25,
    fontWeight: '800',
    color: '#1B1445',
    marginBottom: 2,
  },
  calcLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  calcDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  calcFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  calcTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
  },
  actionButton: {
    backgroundColor: '#B91C1C',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  activeCampaignCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeCampaignLeft: {
    flex: 1,
  },
  activeCampaignTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  activeCampaignSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeCampaignRight: {
    alignItems: 'flex-end',
  },
  activeCampaignMetric: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4C3BA3',
  },
  activeCampaignMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  warningBannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
});

