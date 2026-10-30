import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { parceiroService } from '../services/parceiroService';

const DEFAULT_MONTHLY_DATA = [
  { month: 'Mar', views: 820, viewsFormatted: '820', cliques: 96, visitas: 41 },
  { month: 'Abr', views: 1340, viewsFormatted: '1.340', cliques: 188, visitas: 87 },
  { month: 'Mai', views: 1910, viewsFormatted: '1.910', cliques: 301, visitas: 149 },
  { month: 'Jun', views: 2480, viewsFormatted: '2.480', cliques: 412, visitas: 214 },
  { month: 'Jul', views: 2310, viewsFormatted: '2.310', cliques: 389, visitas: 201 },
  { month: 'Ago', views: 3120, viewsFormatted: '3.120', cliques: 566, visitas: 318 },
  { month: 'Set', views: 3790, viewsFormatted: '3.790', cliques: 702, visitas: 407, isPeak: true },
  { month: 'Out', views: 2640, viewsFormatted: '2.640', cliques: 498, visitas: 296 },
];

const AGE_DEMOGRAPHICS = [
  { range: '18–24', percent: 38 },
  { range: '25–34', percent: 34 },
  { range: '35–44', percent: 17 },
  { range: '45+', percent: 11 },
];

const COMMON_INTERESTS = [
  'Almoço barato · 46%',
  'Universitários · 31%',
  'Lanches · 27%',
  'Happy hour · 18%',
];

export function EstatisticasParceiroScreen({ navigation, route }) {
  const local = route?.params?.local || null;
  const [activeTab, setActiveTab] = useState('Views'); // 'Views' | 'Cliques' | 'Visitas'
  const [showTable, setShowTable] = useState(false);
  const [monthlyData, setMonthlyData] = useState(DEFAULT_MONTHLY_DATA);
  const [totals, setTotals] = useState({
    views: '18.410',
    cliques: '3.152',
    visitas: '1.713',
    conversao: '9.3%',
  });

  const loadMetricas = useCallback(async () => {
    if (!local?.id_local) return;
    try {
      const data = await parceiroService.getMetricasDoLocal(local.id_local);
      if (data && data.length > 0) {
        // Se houver métricas no Supabase, soma os totais
        const sumViews = data.reduce((acc, m) => acc + (m.views || 0), 0);
        const sumCliques = data.reduce((acc, m) => acc + (m.cliques || 0), 0);
        const sumVisitas = data.reduce((acc, m) => acc + (m.visitas || 0), 0);
        const conv = sumViews > 0 ? ((sumVisitas / sumViews) * 100).toFixed(1) + '%' : '0%';

        setTotals({
          views: sumViews.toLocaleString('pt-BR'),
          cliques: sumCliques.toLocaleString('pt-BR'),
          visitas: sumVisitas.toLocaleString('pt-BR'),
          conversao: conv,
        });

        // Agrupa por mês para montar a evolução mensal
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const porMes = {};
        data.forEach((m) => {
          if (m.data) {
            const d = new Date(m.data + 'T12:00:00');
            const chave = mesesNomes[d.getMonth()];
            if (!porMes[chave]) porMes[chave] = { month: chave, views: 0, cliques: 0, visitas: 0 };
            porMes[chave].views += (m.views || 0);
            porMes[chave].cliques += (m.cliques || 0);
            porMes[chave].visitas += (m.visitas || 0);
          }
        });

        const listaMeses = Object.values(porMes).map((item) => ({
          ...item,
          viewsFormatted: item.views.toLocaleString('pt-BR'),
        }));

        if (listaMeses.length > 0) {
          let maxVal = -1;
          listaMeses.forEach((m) => {
            if (m.views > maxVal) maxVal = m.views;
          });
          listaMeses.forEach((m) => {
            if (m.views === maxVal && maxVal > 0) m.isPeak = true;
          });
          setMonthlyData(listaMeses);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar métricas:', err);
    }
  }, [local?.id_local]);

  useEffect(() => {
    loadMetricas();
  }, [loadMetricas]);

  // Peak metric configurations dinâmico
  const getHeaderMetric = () => {
    const pico = monthlyData.find((m) => m.isPeak) || monthlyData[monthlyData.length - 1];
    if (!pico) return { value: '0', label: ' visualizações' };
    switch (activeTab) {
      case 'Views':
        return { value: (pico.views || 0).toLocaleString('pt-BR'), label: ` visualizações · ${pico.month}` };
      case 'Cliques':
        return { value: (pico.cliques || 0).toLocaleString('pt-BR'), label: ` cliques · ${pico.month}` };
      case 'Visitas':
        return { value: (pico.visitas || 0).toLocaleString('pt-BR'), label: ` visitas ao local · ${pico.month}` };
      default:
        return { value: (pico.views || 0).toLocaleString('pt-BR'), label: ` visualizações · ${pico.month}` };
    }
  };

  // Max value for bar scaling dinâmico
  const getMaxValue = () => {
    const vals = monthlyData.map((item) => {
      switch (activeTab) {
        case 'Views':
          return item.views || 0;
        case 'Cliques':
          return item.cliques || 0;
        case 'Visitas':
          return item.visitas || 0;
        default:
          return item.views || 0;
      }
    });
    const max = Math.max(...vals, 100);
    return max > 0 ? max : 100;
  };

  const getBarValue = (item) => {
    switch (activeTab) {
      case 'Views':
        return item.views;
      case 'Cliques':
        return item.cliques;
      case 'Visitas':
        return item.visitas;
      default:
        return item.views;
    }
  };

  const maxValue = getMaxValue();
  const headerMetric = getHeaderMetric();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
        <Text style={styles.screenTitle}>Sua evolução</Text>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroCardSubtitle}>
            DESDE MARÇO DE 2026 · 8 MESES DE PARCERIA
          </Text>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{totals.views}</Text>
              <Text style={styles.heroMetricLabel}>visualizações</Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{totals.cliques}</Text>
              <Text style={styles.heroMetricLabel}>cliques</Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricValue}>{totals.visitas}</Text>
              <Text style={styles.heroMetricLabel}>visitas</Text>
            </View>
          </View>

          <Text style={styles.heroConversionText}>
            {totals.conversao} de quem viu seu local foi até lá.
          </Text>
        </View>

        {/* Section: Mês a mês */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mês a mês</Text>
        </View>

        {/* Pill Tabs: Views | Cliques | Visitas */}
        {!showTable && (
          <View style={styles.tabContainer}>
            {['Views', 'Cliques', 'Visitas'].map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Content Box: Bar Chart or Table */}
        <View style={styles.cardContainer}>
          {!showTable ? (
            /* Bar Chart View */
            <View>
              <View style={styles.chartHeader}>
                <Text style={styles.chartNumber}>{headerMetric.value}</Text>
                <Text style={styles.chartLabel}>{headerMetric.label}</Text>
              </View>

              {/* Dotted guideline top */}
              <View style={styles.dottedLine} />

              {/* Bars Row */}
              <View style={styles.barsRow}>
                {monthlyData.map((item) => {
                  const val = getBarValue(item);
                  const barHeight = Math.max(22, Math.round((val / maxValue) * 125));
                  return (
                    <View key={item.month} style={styles.barColumn}>
                      <View
                        style={[
                          styles.bar,
                          { height: barHeight },
                          item.isPeak ? styles.barPeak : styles.barNormal,
                        ]}
                      />
                      <Text
                        style={[
                          styles.barLabel,
                          item.isPeak && styles.barLabelPeak,
                        ]}
                      >
                        {item.month}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Dotted guideline mid */}
              <View style={styles.dottedLineMid} />

              <View style={styles.chartFooterRow}>
                <Text style={styles.chartFooterText}>
                  Melhor mês: Set. Outubro parcial (até dia 15).{' '}
                  <Text
                    style={styles.verTabelaLink}
                    onPress={() => setShowTable(true)}
                  >
                    Ver tabela
                  </Text>
                </Text>
              </View>
            </View>
          ) : (
            /* Table View */
            <View>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <View style={styles.tableColMonth}>
                  <Text numberOfLines={1} style={styles.tableHeaderCell}>Mês</Text>
                </View>
                <View style={styles.tableColViews}>
                  <Text numberOfLines={1} style={styles.tableHeaderCell}>Views</Text>
                </View>
                <View style={styles.tableColCliques}>
                  <Text numberOfLines={1} style={styles.tableHeaderCell}>Cliques</Text>
                </View>
                <View style={styles.tableColVisitas}>
                  <Text numberOfLines={1} style={styles.tableHeaderCell}>Visitas</Text>
                </View>
              </View>

              {/* Table Rows */}
              {monthlyData.map((row) => (
                <View key={row.month} style={styles.tableRow}>
                  <View style={styles.tableColMonth}>
                    <Text numberOfLines={1} style={styles.tableCellMonth}>{row.month}</Text>
                  </View>
                  <View style={styles.tableColViews}>
                    <Text numberOfLines={1} style={styles.tableCellValue}>{row.viewsFormatted}</Text>
                  </View>
                  <View style={styles.tableColCliques}>
                    <Text numberOfLines={1} style={styles.tableCellValue}>{row.cliques}</Text>
                  </View>
                  <View style={styles.tableColVisitas}>
                    <Text numberOfLines={1} style={styles.tableCellValue}>{row.visitas}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.tableFooterRow}>
                <Text style={styles.chartFooterText}>
                  Outubro parcial (até dia 15).{' '}
                  <Text
                    style={styles.verTabelaLink}
                    onPress={() => setShowTable(false)}
                  >
                    Ver gráfico
                  </Text>
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Section: Quem visita você */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quem visita você</Text>
          <Text style={styles.sectionSubtitle}>
            Perfil dos usuários que abriram seu local.
          </Text>
        </View>

        {/* Audience Card */}
        <View style={styles.audienceCard}>
          {/* Age Demographics */}
          <View style={styles.demographicsList}>
            {AGE_DEMOGRAPHICS.map((item) => (
              <View key={item.range} style={styles.demographicRow}>
                <Text style={styles.ageLabel}>{item.range}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${item.percent}%` },
                    ]}
                  />
                </View>
                <Text style={styles.percentLabel}>{item.percent}%</Text>
              </View>
            ))}
          </View>

          {/* Thin divider */}
          <View style={styles.audienceDivider} />

          {/* Interesses mais comuns */}
          <Text style={styles.interestsTitle}>Interesses mais comuns</Text>
          <View style={styles.interestsWrap}>
            {COMMON_INTERESTS.map((interest) => (
              <View key={interest} style={styles.interestPill}>
                <Text style={styles.interestPillText}>{interest}</Text>
              </View>
            ))}
          </View>
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
    paddingBottom: 32,
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
  heroCard: {
    backgroundColor: '#1B1445',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  heroCardSubtitle: {
    color: '#A096D3',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroMetricItem: {
    flex: 1,
  },
  heroMetricValue: {
    color: '#F87171',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 2,
  },
  heroMetricLabel: {
    color: '#B5ACDF',
    fontSize: 11,
    fontWeight: '600',
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 10,
  },
  heroConversionText: {
    color: '#B5ACDF',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
  },
  sectionSubtitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#8A7E72',
    marginTop: 2,
  },
  tabContainer: {
    backgroundColor: '#7D6BE8',
    borderRadius: 999,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1B1445',
  },
  tabTextActive: {
    color: '#1B1445',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  chartNumber: {
    fontSize: 23,
    fontWeight: '800',
    color: '#000000',
  },
  chartLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  dottedLine: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: 10,
  },
  dottedLineMid: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(239, 68, 68, 0.18)',
    marginTop: -40,
    marginBottom: 50,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingHorizontal: 2,
    zIndex: 2,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 26,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    marginBottom: 6,
  },
  barNormal: {
    backgroundColor: '#1E1848',
  },
  barPeak: {
    backgroundColor: '#B91C1C',
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  barLabelPeak: {
    fontWeight: '800',
    color: '#000000',
  },
  chartFooterRow: {
    marginTop: 10,
  },
  chartFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#70645B',
    lineHeight: 18,
  },
  verTabelaLink: {
    color: '#B91C1C',
    fontWeight: '800',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableHeaderCell: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6B7280',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  tableColMonth: {
    flex: 1.1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  tableColViews: {
    flex: 1.2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  tableColCliques: {
    flex: 1.2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  tableColVisitas: {
    flex: 1.2,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tableCellMonth: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  tableCellValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  tableFooterRow: {
    marginTop: 12,
  },
  audienceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  demographicsList: {
    gap: 12,
    marginBottom: 14,
  },
  demographicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ageLabel: {
    width: 44,
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: '#C5BFFB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#B91C1C',
    borderRadius: 6,
  },
  percentLabel: {
    width: 38,
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'right',
  },
  audienceDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  interestsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 10,
  },
  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestPill: {
    backgroundColor: '#DDD7FE',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  interestPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#342674',
  },
});

