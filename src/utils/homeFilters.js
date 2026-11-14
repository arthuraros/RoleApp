// IDs de apresentação. Nunca são enviados ao Supabase como IDs de categorias.
export const HOME_CATEGORIES = [
  { id: '1', name: 'Comidas' },
  { id: '5', name: 'Cafés' },
  { id: '7', name: 'Bares e pubs' },
  { id: '2', name: 'Festas' },
  { id: '6', name: 'Eventos' },
  { id: '4', name: 'Cinemas' },
  { id: '3', name: 'Parques' },
  { id: '8', name: 'Oficinas culturais' },
  { id: '9', name: 'Aulas culturais' },
];

const normalizeName = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

export function resolveHomeCategory(visualId, categories) {
  const visual = HOME_CATEGORIES.find(category => category.id === visualId);
  if (!visual) return null;
  const matches = categories.filter(category => normalizeName(category.nome) === normalizeName(visual.name)
    && category.id_categoria != null);
  // Uma correspondência ambígua também não deve retornar locais incorretos.
  return { ...visual, databaseId: matches.length === 1 ? matches[0].id_categoria : null,
    status: matches.length === 1 ? 'matched' : matches.length ? 'ambiguous' : 'missing' };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterHomePlaces(places, { search = '', price = null, distance = null,
  location = null, pigPlaceIds = null, advancedPlaceIds = null } = {}) {
  const term = normalizeName(search);
  const pig = pigPlaceIds === null ? null : new Set(pigPlaceIds.map(String));
  const advanced = advancedPlaceIds === null ? null : new Set(advancedPlaceIds.map(String));
  return places.filter(place => {
    if (pig && !pig.has(String(place.id_local))) return false;
    if (advanced && !advanced.has(String(place.id_local))) return false;
    if (term && ![place.nome, place.endereco].some(value => normalizeName(value).includes(term))) return false;
    if (price !== null) {
      const value = place.preco ?? place.preco_entrada;
      if (value == null || !Number.isFinite(Number(value)) || Number(value) > price) return false;
    }
    if (distance !== null && distance > 0) {
      if (!location || place.latitude == null || place.longitude == null) return false;
      const lat = Number(place.latitude), lng = Number(place.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (haversineKm(location.lat, location.lng, lat, lng) > distance) return false;
    }
    return true;
  });
}
