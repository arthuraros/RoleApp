import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { parceiroService } from '../services/parceiroService';

const DEFAULT_WEEK_DATA = [
  { day: 'Seg', height: 60, visits: 110, isPeak: false },
  { day: 'Ter', height: 68, visits: 125, isPeak: false },
  { day: 'Qua', height: 70, visits: 130, isPeak: false },
  { day: 'Qui', height: 80, visits: 148, isPeak: false },
  { day: 'Sex', height: 122, visits: 220, isPeak: false },
  { day: 'Sáb', height: 148, visits: 268, isPeak: true },
  { day: 'Dom', height: 72, visits: 135, isPeak: false },
];

export function PainelParceiroScreen({ navigation }) {
  const { user } = useAuth();
  const [locais, setLocais] = useState([]);
  const [selectedLocal, setSelectedLocal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState(DEFAULT_WEEK_DATA);
  const [stats, setStats] = useState({
    mediaVisitasDia: '167',
    visitasSemana: '1.171',
    picoSemana: 'Pico. Sáb',
    cliquesMes: '498',
    picoNumero: '268',
    picoRotulo: ' visitas · Sáb',
  });

  const userId = user?.id_usuario || user?.id;

  const loadLocais = useCallback(async () => {
    try {
      setLoading(true);
      const data = await parceiroService.getLocaisDoParceiro(userId);
      setLocais(data);
      if (data && data.length > 0) {
        setSelectedLocal(data[0]);
      }
    } catch (err) {
      console.warn('Erro ao carregar locais do parceiro:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadLocais();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadLocais();
    });
    return unsubscribe;
  }, [loadLocais, navigation]);

  // Carrega e calcula métricas reais do local selecionado
  const loadMetricas = useCallback(async () => {
    if (!selectedLocal?.id_local || String(selectedLocal.id_local).startsWith('demo-')) return;
    try {
      const data = await parceiroService.getMetricasDoLocal(selectedLocal.id_local);
      if (Array.isArray(data) && data.length > 0) {
        const totalVisitas = data.reduce((acc, m) => acc + (m.visitas || 0), 0);
        const totalCliques = data.reduce((acc, m) => acc + (m.cliques || 0), 0);
        const media = Math.round(totalVisitas / Math.max(1, data.length));

        // Últimos 7 dias
        const ultimos7 = data.slice(-7);
        const visitasSemana = ultimos7.reduce((acc, m) => acc + (m.visitas || 0), 0);

        // Agrupamento por dia da semana
        const diasNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const visitasPorDia = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
        data.forEach((m) => {
          if (m.data) {
            const d = new Date(m.data + 'T12:00:00');
            const nomeDia = diasNomes[d.getDay()];
            if (nomeDia && visitasPorDia[nomeDia] !== undefined) {
              visitasPorDia[nomeDia] += (m.visitas || 0);
            }
          }
        });

        let maxDia = 'Sáb';
        let maxVal = -1;
        Object.entries(visitasPorDia).forEach(([d, v]) => {
          if (v > maxVal) {
            maxVal = v;
            maxDia = d;
          }
        });

        const escala = maxVal > 0 ? 148 / maxVal : 1;
        const novaSemana = [
          { day: 'Seg', visits: visitasPorDia.Seg, height: Math.max(20, Math.round(visitasPorDia.Seg * escala)), isPeak: maxDia === 'Seg' },
          { day: 'Ter', visits: visitasPorDia.Ter, height: Math.max(20, Math.round(visitasPorDia.Ter * escala)), isPeak: maxDia === 'Ter' },
          { day: 'Qua', visits: visitasPorDia.Qua, height: Math.max(20, Math.round(visitasPorDia.Qua * escala)), isPeak: maxDia === 'Qua' },
          { day: 'Qui', visits: visitasPorDia.Qui, height: Math.max(20, Math.round(visitasPorDia.Qui * escala)), isPeak: maxDia === 'Qui' },
          { day: 'Sex', visits: visitasPorDia.Sex, height: Math.max(20, Math.round(visitasPorDia.Sex * escala)), isPeak: maxDia === 'Sex' },
          { day: 'Sáb', visits: visitasPorDia.Sáb, height: Math.max(20, Math.round(visitasPorDia.Sáb * escala)), isPeak: maxDia === 'Sáb' },
          { day: 'Dom', visits: visitasPorDia.Dom, height: Math.max(20, Math.round(visitasPorDia.Dom * escala)), isPeak: maxDia === 'Dom' },
        ];

        setWeekData(novaSemana);
        setStats({
          mediaVisitasDia: media.toLocaleString('pt-BR'),
          visitasSemana: visitasSemana.toLocaleString('pt-BR'),
          picoSemana: `Pico. ${maxDia}`,
          cliquesMes: totalCliques.toLocaleString('pt-BR'),
          picoNumero: maxVal > 0 ? maxVal.toLocaleString('pt-BR') : '0',
          picoRotulo: ` visitas · ${maxDia}`,
        });
      }
    } catch (err) {
      console.warn('Erro ao carregar métricas no painel:', err);
    }
  }, [selectedLocal?.id_local]);

  useEffect(() => {
    loadMetricas();
  }, [loadMetricas]);

  // Formata a data de início do parceiro com base no created_at
  const formatParceiroDesde = () => {
    const dataRef = selectedLocal?.created_at ? new Date(selectedLocal.created_at) : new Date();
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const mes = meses[dataRef.getMonth()];
    const ano = dataRef.getFullYear();
    const countAtivos = locais.filter((l) => l.visivel !== false).length;
    const countFormatado = countAtivos < 10 ? `0${countAtivos}` : countAtivos;
    return `Parceiro desde ${mes} de ${ano} - (${countFormatado}) locais ativos`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo-outline" size={28} color="#C1121F" />
          </TouchableOpacity>
        </View>

        {/* Greeting & Subtitle */}
        <View style={styles.header}>
          <Text style={styles.greetingTitle}>
            Olá, {user?.nome ? user.nome.split(' ')[0] : 'Parceiro'}
          </Text>
          <Text style={styles.subtitle}>{formatParceiroDesde()}</Text>
        </View>

        {/* Place Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.placePillsRow}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#4C3BA3" />
          ) : locais.length > 0 ? (
            locais.map((local) => {
              const isSelected = selectedLocal?.id_local === local.id_local;
              return (
                <TouchableOpacity
                  key={local.id_local}
                  style={[
                    styles.placePill,
                    isSelected ? styles.placePillActive : styles.placePillInactive,
                  ]}
                  onPress={() => setSelectedLocal(local)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.placePillText,
                      isSelected ? styles.placePillTextActive : styles.placePillTextInactive,
                    ]}
                  >
                    {local.nome}
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
        </ScrollView>

        {/* 2x2 Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Card 1 */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.mediaVisitasDia}</Text>
            <Text style={styles.statText}>visitas por dia (média)</Text>
          </View>

          {/* Card 2 */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.visitasSemana}</Text>
            <Text style={styles.statText}>visitas na semana</Text>
            <Text style={styles.statSubText}>{stats.picoSemana}</Text>
          </View>

          {/* Card 3 */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.cliquesMes}</Text>
            <Text style={styles.statText}>
              {'cliques acumulados\naté hoje'}
            </Text>
          </View>

          {/* Card 4 - Estatísticas with pig graphic */}
          <TouchableOpacity
            style={[styles.statCard, styles.statsSpecialCard]}
            onPress={() => navigation?.navigate('EstatisticasParceiro', { local: selectedLocal })}
            activeOpacity={0.85}
          >
            <Text style={styles.statSpecialTitle}>Estatísticas</Text>
            <View style={styles.chartGraphicContainer}>
              <Image
                source={require('../../assets/pig_chart.png')}
                style={styles.pigChartImage}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Weekly Visits Section */}
        <View style={styles.chartSection}>
          <Text style={styles.chartSectionTitle}>Visitas pela semana</Text>

          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartHighlightNumber}>{stats.picoNumero}</Text>
              <Text style={styles.chartHighlightLabel}>{stats.picoRotulo}</Text>
            </View>

            {/* Dotted Guideline */}
            <View style={styles.dottedLine} />

            {/* Bars */}
            <View style={styles.barsRow}>
              {DEFAULT_WEEK_DATA.map((item) => (
                <View key={item.day} style={styles.barColumn}>
                  <View
                    style={[
                      styles.bar,
                      { height: item.height },
                      item.isPeak ? styles.barPeak : styles.barNormal,
                    ]}
                  />
                  <Text
                    style={[
                      styles.barDayLabel,
                      item.isPeak && styles.barDayLabelPeak,
                    ]}
                  >
                    {item.day}
                  </Text>
                </View>
              ))}
            </View>

            {/* Dotted Bottom Guideline */}
            <View style={styles.dottedLineBottom} />

            <Text style={styles.chartFooterTip}>
              Sáb. é seu dia mais forte. Domingo tem espaço para crescer com um destaque.
            </Text>
          </View>
        </View>

        {/* Action Cards (Impulsionar & Editar locais) */}
        <View style={styles.actionCardsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation?.navigate('Impulsionar', { local: selectedLocal })}
            activeOpacity={0.85}
          >
            <Text style={styles.actionCardTitle}>Impulsionar</Text>
            <Text style={styles.actionCardSubtitle}>
              {'apareça para quem\ncurte o seu estilo'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation?.navigate('EditarLocais', { local: selectedLocal })}
            activeOpacity={0.85}
          >
            <Text style={styles.actionCardTitle}>Editar locais</Text>
            <Text style={styles.actionCardSubtitle}>
              {'Horários, eventos e\ninfos'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAE8F4',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
  },
  topBar: {
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 4,
  },
  header: {
    marginBottom: 16,
  },
  greetingTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#000000',
  },
  placePillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  placePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placePillActive: {
    backgroundColor: '#4C3BA3',
  },
  placePillInactive: {
    backgroundColor: '#6B7280',
  },
  placePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  placePillTextActive: {
    color: '#FFFFFF',
  },
  placePillTextInactive: {
    color: '#FFFFFF',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#DDD8FB',
    borderRadius: 16,
    padding: 14,
    minHeight: 94,
    justifyContent: 'center',
  },
  statsSpecialCard: {
    borderWidth: 1.5,
    borderColor: '#4C3BA3',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
  },
  statText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 16,
  },
  statSubText: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '600',
    color: '#000000',
    marginTop: 2,
  },
  statSpecialTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
  },
  chartGraphicContainer: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  pigChartImage: {
    width: 58,
    height: 38,
  },
  chartSection: {
    marginBottom: 20,
  },
  chartSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
  },
  chartContainer: {
    backgroundColor: '#DDD8FB',
    borderRadius: 20,
    padding: 18,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  chartHighlightNumber: {
    fontSize: 23,
    fontWeight: '800',
    color: '#000000',
  },
  chartHighlightLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '600',
    color: '#4B5563',
  },
  dottedLine: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    marginBottom: 12,
  },
  dottedLineBottom: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginVertical: 12,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 155,
    paddingHorizontal: 4,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 28,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    marginBottom: 6,
  },
  barNormal: {
    backgroundColor: '#1E1848',
  },
  barPeak: {
    backgroundColor: '#9E1B1B',
  },
  barDayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  barDayLabelPeak: {
    fontWeight: '800',
    color: '#000000',
  },
  chartFooterTip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6A637B',
    lineHeight: 17,
  },
  actionCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#1E2538',
    borderRadius: 16,
    padding: 14,
    minHeight: 90,
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FF6B6B',
    marginBottom: 4,
  },
  actionCardSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 17,
  },
});

