const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DAY_MS = 24 * 60 * 60 * 1000;

export const UNAVAILABLE_PARTNER_STATS = Object.freeze({
  mediaVisitasDia: '—', visitasSemana: '—', picoSemana: '—', cliquesMes: '—',
  picoNumero: '—', picoRotulo: ' visitas · últimos 7 dias',
});

// Filtra apenas os dados da consulta existente; propriedade NAO comprova aprovacao individual.
export function availablePartnerPlaces(rows, userId) {
  if (!userId) return [];
  if (!Array.isArray(rows)) throw new Error('Resposta de estabelecimentos inválida.');
  return rows.filter(place => place && place.id_local != null &&
    ['string', 'number'].includes(typeof place.id_local) && String(place.id_local).trim() &&
    !String(place.id_local).startsWith('demo-') && String(place.id_proprietario) === String(userId));
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? parsed.getTime() : null;
}

function countValue(value) {
  if (value == null) return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) {
    throw new Error('Contagem de métricas inválida.');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Contagem de métricas inválida.');
  return count;
}

function safeSum(values) {
  const sum = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(sum)) throw new Error('Total de métricas inválido.');
  return sum;
}

// DATE do banco e tratado como dia civil, sem deslocar o dia da semana por fuso.
// A janela termina no dia civil atual do dispositivo; dias ausentes nunca viram visitas zero.
export function calculatePartnerMetrics(rows, { now = new Date(), idLocal } = {}) {
  if (!Array.isArray(rows) || !Number.isFinite(now.getTime())) throw new Error('Métricas indisponíveis.');
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const weekData = DAY_NAMES.map(day => ({ day, date: null, visits: null, height: 0, isPeak: false }));
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(today - offset * DAY_MS);
    const dayIndex = (date.getUTCDay() + 6) % 7;
    weekData[dayIndex].date = date.toISOString().slice(0, 10);
  }
  const byDate = new Map();
  const clicks = [];
  for (const row of rows) {
    if (!row || (idLocal != null && String(row.id_local) !== String(idLocal))) {
      throw new Error('Métricas incompatíveis com o estabelecimento.');
    }
    const date = dateValue(row.data);
    if (date == null || byDate.has(row.data)) throw new Error('Datas de métricas inválidas.');
    const visits = countValue(row.visitas);
    const clickCount = countValue(row.cliques);
    byDate.set(row.data, { date, visits, clicks: clickCount });
    if (date <= today && clickCount != null) clicks.push(clickCount);
  }
  for (const day of weekData) day.visits = byDate.get(day.date)?.visits ?? null;
  const recorded = weekData.filter(day => day.visits != null);
  const totalVisits = safeSum(recorded.map(day => day.visits));
  const peak = Math.max(0, ...recorded.map(day => day.visits));
  for (const day of weekData) {
    day.isPeak = peak > 0 && day.visits === peak;
    day.height = peak > 0 && day.visits != null ? Math.round(day.visits / peak * 148) : 0;
  }
  const peakDays = weekData.filter(day => day.isPeak).map(day => day.day);
  const peakLabel = peakDays.join(', ');
  const format = value => value.toLocaleString('pt-BR');
  const hasRows = [...byDate.values()].some(row => row.date <= today && (row.visits != null || row.clicks != null));
  return {
    weekData,
    recordedDays: recorded.length,
    hasRows,
    stats: {
      mediaVisitasDia: recorded.length ? format(Math.round(totalVisits / recorded.length)) : '—',
      visitasSemana: recorded.length ? format(totalVisits) : '—',
      picoSemana: peakDays.length ? `Pico: ${peakLabel}` : recorded.length ? 'Sem pico de visitas' : 'Sem registros no período',
      cliquesMes: clicks.length ? format(safeSum(clicks)) : '—',
      picoNumero: recorded.length ? format(peak) : '—',
      picoRotulo: peakDays.length ? ` visitas · ${peakLabel}` : ' visitas · últimos 7 dias',
    },
    chartTip: peakDays.length
      ? `${peakDays.length > 1 ? 'Dias com mais visitas registradas' : 'Dia com mais visitas registradas'} no período: ${peakLabel}.`
      : recorded.length ? 'Os dias com registro não apresentam visitas no período.' : 'Sem registros de visitas nos últimos 7 dias.',
  };
}
