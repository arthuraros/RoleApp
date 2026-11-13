import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { locaisService } from '../services/locaisService';
import { parceiroService } from '../services/parceiroService';
import { favoritosService } from '../services/favoritosService';
import { useAuth } from '../contexts/AuthContext';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4';

const FALLBACK_LOCAIS = [
  {
    id_local: 1,
    nome: 'Café do Cerrado 2',
    endereco: 'Asa Sul, Brasília - DF',
    bairro: 'Asa Sul',
    preco: 20,
    preco_entrada: 0,
    latitude: -15.817,
    longitude: -47.9,
    imagem_url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb',
    isDestaque: true,
  },
  {
    id_local: 2,
    nome: 'Parque das Águas',
    endereco: 'Parque da Cidade, Brasília - DF',
    bairro: 'Asa Sul',
    preco: 0,
    preco_entrada: 0,
    latitude: -15.744,
    longitude: -47.882,
    imagem_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
    isDestaque: false,
  },
  {
    id_local: 3,
    nome: 'Cine Brasília',
    endereco: 'EQS 106/107, Brasília - DF',
    bairro: 'Asa Sul',
    preco: 12,
    preco_entrada: 12,
    latitude: -15.813,
    longitude: -47.901,
    imagem_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
    isDestaque: true,
  },
  {
    id_local: 4,
    nome: 'Sabor do Cerrado',
    endereco: 'Taguatinga Sul, DF',
    bairro: 'Taguatinga',
    preco: 35,
    preco_entrada: 0,
    latitude: -15.835,
    longitude: -48.056,
    imagem_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
    isDestaque: false,
  },
];

function generateLeafletHtml(locais, destaqueIds, initialFilters, initialPontoRef, initialUserGps) {
  const jsonLocais = JSON.stringify(locais);
  const jsonDestaqueIds = JSON.stringify(Array.from(destaqueIds));
  const jsonFilters = JSON.stringify(initialFilters);
  const jsonPontoRef = JSON.stringify(initialPontoRef);
  const jsonUserGps = JSON.stringify(initialUserGps);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background: #F3F4F6; }
    
    .marker-wrap {
      background: transparent;
      border: none;
    }
    .custom-pin {
      width: 38px;
      height: 38px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      cursor: pointer;
      position: relative;
    }
    .normal-pin {
      background: #1E1848;
      border: 2.5px solid #FFFFFF;
    }
    .boost-pin {
      background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
      border: 2.5px solid #FEF08A;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.55);
    }
    .pin-icon {
      transform: rotate(45deg);
      font-size: 16px;
      line-height: 1;
    }
    .pin-star {
      position: absolute;
      top: -6px;
      right: -6px;
      background: #FEF08A;
      color: #854D0E;
      font-size: 10px;
      font-weight: bold;
      border-radius: 50%;
      width: 17px;
      height: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(45deg);
      box-shadow: 0 2px 4px rgba(0,0,0,0.25);
    }

    /* Marcador GPS do usuário */
    .user-gps-wrap {
      background: transparent;
      border: none;
    }
    .user-gps-dot {
      width: 18px;
      height: 18px;
      background: #2563EB;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.85);
    }

    /* Marcador de Ponto de Referência Arrastável */
    .ref-pin-wrap {
      background: transparent;
      border: none;
    }
    .ref-pin {
      width: 42px;
      height: 42px;
      background: #1E1848;
      border: 3px solid #FEF08A;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 16px rgba(0,0,0,0.45);
      cursor: grab;
    }
    .ref-pin:active {
      cursor: grabbing;
    }
    .ref-pin-icon {
      transform: rotate(45deg);
      font-size: 19px;
      line-height: 1;
    }

    /* Estilo do popup no mapa */
    .leaflet-popup-content-wrapper {
      border-radius: 14px;
      padding: 6px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    }
    .popup-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-width: 180px;
      max-width: 240px;
      padding: 4px;
    }
    .popup-title {
      font-weight: 700;
      font-size: 14px;
      color: #1E1848;
      margin-bottom: 3px;
    }
    .popup-address {
      font-size: 11px;
      color: #64748B;
      margin-bottom: 8px;
    }
    .popup-btn {
      display: block;
      width: 100%;
      background: #C1121F;
      color: #FFFFFF;
      text-align: center;
      padding: 8px 12px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 12px;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var allLocais = ${jsonLocais};
    var destaqueIds = new Set(${jsonDestaqueIds});
    var currentFilters = ${jsonFilters};
    var pontoRefCoords = ${jsonPontoRef} || { lat: -15.7942, lng: -47.8822 };
    var userGpsCoords = ${jsonUserGps} || null;
    var radiusCircle = null;
    var refMarker = null;
    var userGpsMarker = null;

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([-15.7942, -47.8822], 12);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
      keepBuffer: 4,
      updateWhenIdle: false
    }).addTo(map);

    window.map = map;

    window.invalidateMap = function() {
      if (window.map) {
        window.map.invalidateSize();
      }
    };

    window.addEventListener('resize', function() {
      if (window.map) {
        window.map.invalidateSize();
      }
    });

    var markersGroup = L.featureGroup().addTo(map);

    function haversineKm(lat1, lon1, lat2, lon2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Inicializa marcador de GPS (ponto azul) sempre que as coordenadas existirem
    if (userGpsCoords) {
      userGpsMarker = L.marker([userGpsCoords.lat, userGpsCoords.lng], {
        icon: L.divIcon({
          className: 'user-gps-wrap',
          html: '<div class="user-gps-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        }),
        interactive: false
      }).addTo(map);
    }

    window.setUserGps = function(lat, lng, shouldCenter) {
      userGpsCoords = { lat: lat, lng: lng };
      if (!userGpsMarker) {
        userGpsMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-gps-wrap',
            html: '<div class="user-gps-dot"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          }),
          interactive: false
        }).addTo(map);
      } else {
        userGpsMarker.setLatLng([lat, lng]);
        if (!map.hasLayer(userGpsMarker)) {
          userGpsMarker.addTo(map);
        }
      }
      applyFilters();
      if (shouldCenter) {
        if (currentFilters.raioKm && radiusCircle) {
          map.fitBounds(radiusCircle.getBounds().pad(0.12));
        } else {
          map.setView([lat, lng], 15);
        }
      }
    };

    // Ponto de Referência Arrastável (move SOMENTE arrastando)
    function ensureRefMarker() {
      if (!refMarker) {
        var refIcon = L.divIcon({
          className: 'ref-pin-wrap',
          html: '<div class="ref-pin"><span class="ref-pin-icon">🤚</span></div>',
          iconSize: [42, 42],
          iconAnchor: [21, 42]
        });
        refMarker = L.marker([pontoRefCoords.lat, pontoRefCoords.lng], {
          icon: refIcon,
          draggable: true,
          zIndexOffset: 1000
        }).addTo(map);

        refMarker.on('drag', function(e) {
          var pos = e.target.getLatLng();
          pontoRefCoords = { lat: pos.lat, lng: pos.lng };
          if (radiusCircle) {
            radiusCircle.setLatLng(pos);
          }
        });

        refMarker.on('dragend', function(e) {
          var pos = e.target.getLatLng();
          pontoRefCoords = { lat: pos.lat, lng: pos.lng };
          if (radiusCircle) {
            radiusCircle.setLatLng(pos);
          }
          applyFilters();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PONTO_MOVED',
              lat: pos.lat,
              lng: pos.lng
            }));
          }
        });
      } else {
        refMarker.setLatLng([pontoRefCoords.lat, pontoRefCoords.lng]);
        if (!map.hasLayer(refMarker)) {
          refMarker.addTo(map);
        }
      }
    }

    function applyFilters() {
      markersGroup.clearLayers();

      // O pino de referência aparece SEMPRE que a opção 'ponto' estiver ativa, mesmo sem raioKm
      if (currentFilters.origemTipo === 'ponto') {
        ensureRefMarker();
      } else {
        if (refMarker && map.hasLayer(refMarker)) {
          map.removeLayer(refMarker);
        }
      }

      // O marcador de GPS (ponto azul) permanece sempre no mapa sempre que tivermos as coordenadas
      if (userGpsCoords) {
        if (!userGpsMarker) {
          userGpsMarker = L.marker([userGpsCoords.lat, userGpsCoords.lng], {
            icon: L.divIcon({
              className: 'user-gps-wrap',
              html: '<div class="user-gps-dot"></div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            }),
            interactive: false
          }).addTo(map);
        } else {
          userGpsMarker.setLatLng([userGpsCoords.lat, userGpsCoords.lng]);
          if (!map.hasLayer(userGpsMarker)) {
            userGpsMarker.addTo(map);
          }
        }
      }

      var origin = currentFilters.origemTipo === 'gps'
        ? (userGpsCoords || pontoRefCoords)
        : pontoRefCoords;

      if (currentFilters.raioKm && origin) {
        var radiusMeters = currentFilters.raioKm * 1000;
        if (!radiusCircle) {
          radiusCircle = L.circle([origin.lat, origin.lng], {
            radius: radiusMeters,
            color: '#C1121F',
            fillColor: '#C1121F',
            fillOpacity: 0.08,
            weight: 2,
            dashArray: '6, 6'
          }).addTo(map);
        } else {
          radiusCircle.setLatLng([origin.lat, origin.lng]);
          radiusCircle.setRadius(radiusMeters);
          if (!map.hasLayer(radiusCircle)) {
            radiusCircle.addTo(map);
          }
        }
      } else {
        if (radiusCircle && map.hasLayer(radiusCircle)) {
          map.removeLayer(radiusCircle);
        }
      }

      var favSet = new Set(currentFilters.favoritosIds || []);
      var count = 0;

      allLocais.forEach(function(l) {
        if (!l.latitude || !l.longitude) return;
        var lat = parseFloat(l.latitude);
        var lng = parseFloat(l.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        if (currentFilters.apenasFavoritos) {
          var isFav = favSet.has(l.id_local) || favSet.has(Number(l.id_local)) || favSet.has(String(l.id_local));
          if (!isFav) return;
        }

        if (currentFilters.raioKm && origin) {
          var dist = haversineKm(origin.lat, origin.lng, lat, lng);
          if (dist > currentFilters.raioKm) return;
        }

        count++;
        var isDestaque = destaqueIds.has(l.id_local) || destaqueIds.has(String(l.id_local)) || Boolean(l.isDestaque);

        var pinHtml = isDestaque
          ? '<div class="custom-pin boost-pin"><span class="pin-star">★</span><span class="pin-icon">🔥</span></div>'
          : '<div class="custom-pin normal-pin"><span class="pin-icon">📍</span></div>';

        var customIcon = L.divIcon({
          className: 'marker-wrap',
          html: pinHtml,
          iconSize: [38, 38],
          iconAnchor: [19, 38],
          popupAnchor: [0, -38]
        });

        var marker = L.marker([lat, lng], { icon: customIcon });

        var popupHtml = '<div class="popup-container">' +
          '<div class="popup-title">' + (l.nome || 'Local') + '</div>' +
          '<div class="popup-address">' + (l.endereco || l.bairro || '') + '</div>' +
          '<button class="popup-btn" onclick="window.sendToApp(' + l.id_local + ')">Ver detalhes</button>' +
          '</div>';

        marker.bindPopup(popupHtml);

        marker.on('click', function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SELECT_LOCAL',
              id_local: l.id_local
            }));
          }
        });

        markersGroup.addLayer(marker);
      });

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'COUNT_UPDATED',
          count: count
        }));
      }
    }

    applyFilters();

    if (markersGroup.getLayers().length > 0) {
      map.fitBounds(markersGroup.getBounds().pad(0.18));
    }

    window.updateFilters = function(configJson) {
      try {
        var config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
        var modeChanged = Boolean(config.modeChanged);
        currentFilters = Object.assign(currentFilters, config);
        if (config.pontoRef) {
          pontoRefCoords = config.pontoRef;
        }
        applyFilters();

        // O zoom SÓ muda quando a forma de visualização é alterada (Meu GPS vs Ponto no mapa)
        if (modeChanged) {
          if (currentFilters.origemTipo === 'gps' && userGpsCoords) {
            if (radiusCircle) {
              map.fitBounds(radiusCircle.getBounds().pad(0.12));
            } else {
              map.setView([userGpsCoords.lat, userGpsCoords.lng], 14);
            }
          } else if (currentFilters.origemTipo === 'ponto' && pontoRefCoords) {
            if (radiusCircle) {
              map.fitBounds(radiusCircle.getBounds().pad(0.12));
            } else {
              map.setView([pontoRefCoords.lat, pontoRefCoords.lng], 14);
            }
          }
        }
      } catch(e) {
        console.error('Erro updateFilters:', e);
      }
    };

    window.sendToApp = function(idLocal) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'OPEN_DETAILS',
          id_local: idLocal
        }));
      }
    };

    window.recenterMap = function(targetMode) {
      if (targetMode === 'gps' && userGpsCoords) {
        map.setView([userGpsCoords.lat, userGpsCoords.lng], 15);
        return;
      }
      if (targetMode === 'ponto' && pontoRefCoords) {
        map.setView([pontoRefCoords.lat, pontoRefCoords.lng], 15);
        return;
      }
      if (currentFilters.raioKm && radiusCircle) {
        map.fitBounds(radiusCircle.getBounds().pad(0.12));
      } else if (markersGroup && markersGroup.getLayers().length > 0) {
        map.fitBounds(markersGroup.getBounds().pad(0.18));
      } else {
        map.setView([-15.7942, -47.8822], 12);
      }
    };

    window.fitAllMarkers = function() {
      window.recenterMap('all');
    };
  </script>
</body>
</html>
  `;
}

export function MapaScreen({ navigation }) {
  const { user } = useAuth();
  const [locais, setLocais] = useState([]);
  const [destaqueIds, setDestaqueIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedLocal, setSelectedLocal] = useState(null);

  // Estados dos Filtros
  const [favoritosIds, setFavoritosIds] = useState(new Set());
  const [apenasFavoritos, setApenasFavoritos] = useState(false);
  const [raioKm, setRaioKm] = useState(null);
  const [origemTipo, setOrigemTipo] = useState('gps'); // 'gps' | 'ponto'
  const [pontoReferencia, setPontoReferencia] = useState({ lat: -15.7942, lng: -47.8822 });
  const [userGps, setUserGps] = useState(null);
  const [filteredCount, setFilteredCount] = useState(null);

  // Modal de Distância
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [tempRaio, setTempRaio] = useState('');
  const [tempOrigem, setTempOrigem] = useState('gps');

  const webViewRef = useRef(null);

  // Obter localização nativa do aparelho via expo-location
  const obterLocalizacaoUsuario = useCallback(async (shouldCenter = false, raioParaAplicar = null) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão de Localização Negada',
          'Não conseguimos acessar o seu GPS porque a permissão foi recusada.\n\nPara usar a opção "Meu GPS", autorize o acesso nas Configurações do seu aparelho, ou escolha a opção "Ponto no mapa" para marcar manualmente.',
          [
            { text: 'Entendido', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings().catch(() => {}) },
          ]
        );
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };

      setUserGps(coords);

      webViewRef.current?.injectJavaScript(
        `if (window.setUserGps) { window.setUserGps(${coords.lat}, ${coords.lng}, ${shouldCenter ? 'true' : 'false'}); } true;`
      );

      if (raioParaAplicar != null) {
        webViewRef.current?.injectJavaScript(
          `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({
            raioKm: raioParaAplicar,
            origemTipo: 'gps',
            modeChanged: shouldCenter,
          }))}); } true;`
        );
      }

      return coords;
    } catch (err) {
      console.warn('Erro ao obter localização com expo-location:', err);
      return null;
    }
  }, []);

  const carregarFavoritos = useCallback(async () => {
    if (!user?.id) {
      setFavoritosIds(new Set());
      return;
    }
    try {
      const favData = await favoritosService.getFavoritos(user.id);
      const setIds = new Set((favData || []).map((f) => f.id_local));
      setFavoritosIds(setIds);

      webViewRef.current?.injectJavaScript(
        `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({ favoritosIds: Array.from(setIds) }))}); } true;`
      );
    } catch (e) {
      console.warn('Erro ao carregar favoritos no mapa:', e);
    }
  }, [user?.id]);

  const carregarDados = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setLoading(true);
      }
      const [dadosLocais, dadosDestaques] = await Promise.all([
        locaisService.getLocais().catch(() => []),
        parceiroService.getDestaquesAtivos().catch(() => []),
      ]);

      const idsDestaques = new Set(
        (dadosDestaques || []).map((d) => d.id_local).filter(Boolean)
      );

      const validos = (dadosLocais || []).filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          !isNaN(Number(l.latitude)) &&
          !isNaN(Number(l.longitude)) &&
          l.visivel !== false
      );

      const novosLocais = validos.length > 0 ? validos : FALLBACK_LOCAIS;

      setLocais((prev) => {
        if (prev.length === novosLocais.length) {
          const identical = prev.every((p, idx) => {
            const n = novosLocais[idx];
            return (
              p.id_local === n.id_local &&
              p.visivel === n.visivel &&
              p.latitude === n.latitude &&
              p.longitude === n.longitude &&
              p.nome === n.nome
            );
          });
          if (identical) return prev;
        }
        return novosLocais;
      });

      setDestaqueIds((prev) => {
        if (prev.size === idsDestaques.size) {
          const allMatch = Array.from(idsDestaques).every((id) => prev.has(id));
          if (allMatch) return prev;
        }
        return idsDestaques;
      });

      await carregarFavoritos();
    } catch (err) {
      console.warn('Erro ao carregar dados do mapa:', err);
      setLocais((prev) => (prev.length > 0 ? prev : FALLBACK_LOCAIS));
    } finally {
      setLoading(false);
    }
  }, [carregarFavoritos]);

  useEffect(() => {
    carregarDados();
    // Tenta obter GPS nativo discretamente em segundo plano
    obterLocalizacaoUsuario(false).catch(() => {});
  }, [carregarDados, obterLocalizacaoUsuario]);

  useFocusEffect(
    useCallback(() => {
      carregarFavoritos();
      const timer = setTimeout(() => {
        webViewRef.current?.injectJavaScript(
          'if (window.invalidateMap) { window.invalidateMap(); } true;'
        );
      }, 150);

      return () => clearTimeout(timer);
    }, [carregarFavoritos])
  );

  const handleToggleFavoritos = () => {
    if (!user) {
      Alert.alert(
        'Favoritos',
        'Faça login na sua conta para visualizar e filtrar seus locais favoritados.',
        [{ text: 'Entendido' }]
      );
      return;
    }

    const novo = !apenasFavoritos;
    setApenasFavoritos(novo);
    setSelectedLocal(null);

    webViewRef.current?.injectJavaScript(
      `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({
        apenasFavoritos: novo,
        favoritosIds: Array.from(favoritosIds),
      }))}); } true;`
    );
  };

  const handleOpenFilterModal = () => {
    setTempRaio(raioKm != null ? String(raioKm) : '');
    setTempOrigem(origemTipo);
    setIsFilterModalVisible(true);
  };

  const handleAplicarFiltroDistancia = async () => {
    const valorNum = parseFloat(tempRaio.replace(',', '.'));
    const novoRaio = !isNaN(valorNum) && valorNum > 0 ? valorNum : null;

    if (tempRaio.trim() !== '' && (isNaN(valorNum) || valorNum <= 0)) {
      Alert.alert('Distância inválida', 'Informe uma distância em km maior que zero.');
      return;
    }

    const modoMudou = tempOrigem !== origemTipo;

    setRaioKm(novoRaio);
    setOrigemTipo(tempOrigem);
    setSelectedLocal(null);
    setIsFilterModalVisible(false);

    if (tempOrigem === 'gps') {
      if (!userGps) {
        await obterLocalizacaoUsuario(true, novoRaio);
      } else {
        webViewRef.current?.injectJavaScript(
          `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({
            raioKm: novoRaio,
            origemTipo: 'gps',
            modeChanged: modoMudou,
          }))}); } true;`
        );
      }
    } else {
      webViewRef.current?.injectJavaScript(
        `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({
          raioKm: novoRaio,
          origemTipo: 'ponto',
          pontoRef: pontoReferencia,
          modeChanged: modoMudou,
        }))}); } true;`
      );
    }
  };

  const handleLimparFiltroDistancia = () => {
    setTempRaio('');
    setRaioKm(null);
    setSelectedLocal(null);
    setIsFilterModalVisible(false);

    webViewRef.current?.injectJavaScript(
      `if (window.updateFilters) { window.updateFilters(${JSON.stringify(JSON.stringify({
        raioKm: null,
      }))}); } true;`
    );
  };

  const handleMessage = (dataString) => {
    try {
      const data = JSON.parse(dataString);
      if (data.type === 'SELECT_LOCAL') {
        const found = locais.find(
          (l) => String(l.id_local) === String(data.id_local)
        );
        if (found) {
          setSelectedLocal(found);
        }
      } else if (data.type === 'OPEN_DETAILS') {
        const found = locais.find(
          (l) => String(l.id_local) === String(data.id_local)
        );
        if (found) {
          if (found.id_local && !String(found.id_local).startsWith('demo-')) {
            parceiroService
              .registrarMetrica({ idLocal: found.id_local, cliques: 1 })
              .catch(() => {});
          }
          navigation.navigate('DetalhesLocal', {
            idLocal: found.id_local,
            local: found,
          });
        }
      } else if (data.type === 'COUNT_UPDATED') {
        setFilteredCount(data.count);
      } else if (data.type === 'PONTO_MOVED') {
        setPontoReferencia({ lat: data.lat, lng: data.lng });
      }
    } catch (e) {
      console.warn('Erro ao processar mensagem do WebView:', e);
    }
  };

  const handleRecenter = async () => {
    if (origemTipo === 'gps') {
      if (userGps) {
        webViewRef.current?.injectJavaScript(
          "if(window.recenterMap) window.recenterMap('gps'); true;"
        );
      } else {
        const coords = await obterLocalizacaoUsuario(true);
        if (!coords) {
          webViewRef.current?.injectJavaScript(
            "if(window.recenterMap) window.recenterMap('all'); true;"
          );
        }
      }
    } else if (origemTipo === 'ponto') {
      webViewRef.current?.injectJavaScript(
        "if(window.recenterMap) window.recenterMap('ponto'); true;"
      );
    } else {
      webViewRef.current?.injectJavaScript(
        "if(window.recenterMap) window.recenterMap('all'); true;"
      );
    }
  };

  const handleOpenSelected = () => {
    if (!selectedLocal) return;
    if (
      selectedLocal.id_local &&
      !String(selectedLocal.id_local).startsWith('demo-')
    ) {
      parceiroService
        .registrarMetrica({ idLocal: selectedLocal.id_local, cliques: 1 })
        .catch(() => {});
    }
    navigation.navigate('DetalhesLocal', {
      idLocal: selectedLocal.id_local,
      local: selectedLocal,
    });
  };

  const mapHtml = useMemo(
    () =>
      generateLeafletHtml(
        locais,
        destaqueIds,
        {
          apenasFavoritos,
          favoritosIds: Array.from(favoritosIds),
          raioKm,
          origemTipo,
        },
        pontoReferencia,
        userGps
      ),
    [locais, destaqueIds]
  );

  const isSelectedBoosted =
    selectedLocal &&
    (destaqueIds.has(selectedLocal.id_local) ||
      destaqueIds.has(String(selectedLocal.id_local)) ||
      selectedLocal.isDestaque);

  const displayCount = filteredCount !== null ? filteredCount : locais.length;
  let subtituloTexto = `${displayCount} ${displayCount === 1 ? 'local encontrado' : 'locais encontrados'}`;
  if (apenasFavoritos && raioKm != null) {
    subtituloTexto = `${displayCount} ${displayCount === 1 ? 'favorito' : 'favoritos'} até ${raioKm}km`;
  } else if (apenasFavoritos) {
    subtituloTexto = `${displayCount} ${displayCount === 1 ? 'favorito encontrado' : 'favoritos encontrados'}`;
  } else if (raioKm != null) {
    subtituloTexto = `${displayCount} ${displayCount === 1 ? 'local' : 'locais'} até ${raioKm}km`;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Floating Header */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <View style={styles.topHeaderIconWrap}>
            <Ionicons name="map" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.topHeaderTitleWrap}>
            <Text style={styles.topHeaderTitle}>Mapa do Rolê</Text>
            <Text style={styles.topHeaderSubtitle} numberOfLines={1}>
              {subtituloTexto}
            </Text>
          </View>
        </View>

        <View style={styles.topHeaderRight}>
          {/* Botão Favoritos */}
          <TouchableOpacity
            style={[
              styles.headerActionBtn,
              apenasFavoritos && styles.headerActionBtnActiveFav,
            ]}
            onPress={handleToggleFavoritos}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Filtrar locais favoritos"
          >
            <Ionicons
              name={apenasFavoritos ? 'heart' : 'heart-outline'}
              size={18}
              color={apenasFavoritos ? '#E11D48' : '#475569'}
            />
          </TouchableOpacity>

          {/* Botão Filtro de Distância */}
          <TouchableOpacity
            style={[
              styles.headerActionBtn,
              raioKm != null && styles.headerActionBtnActiveRaio,
            ]}
            onPress={handleOpenFilterModal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Filtrar por distância"
          >
            <Feather
              name="sliders"
              size={17}
              color={raioKm != null ? '#C1121F' : '#475569'}
            />
            {raioKm != null && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{raioKm}k</Text>
              </View>
            )}
          </TouchableOpacity>


        </View>
      </View>

      {/* Dica visual quando ponto arrastável estiver ativo */}
      {origemTipo === 'ponto' && (
        <View style={styles.hintPill}>
          <Ionicons name="hand-right-outline" size={13} color="#B45309" />
          <Text style={styles.hintPillText}>
            Arraste o pino 🎯 para onde quiser marcar a referência
          </Text>
        </View>
      )}

      {/* Card de Attribution do OpenStreetMap */}
      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          Map data © <Text style={styles.attributionLink} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>OpenStreetMap contributors</Text>
        </Text>
      </View>

      {/* Map WebView */}
      <View style={styles.mapWrap}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={true}
          geolocationEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1E1848" />
              <Text style={styles.loadingText}>Carregando mapa...</Text>
            </View>
          )}
          onMessage={(event) => handleMessage(event.nativeEvent.data)}
        />
      </View>

      {/* Floating Recenter Button */}
      <TouchableOpacity
        style={[
          styles.recenterButton,
          selectedLocal ? styles.recenterWithCard : styles.recenterNoCard,
        ]}
        onPress={handleRecenter}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Centralizar mapa"
      >
        <Ionicons name="locate" size={22} color="#1E1848" />
      </TouchableOpacity>

      {/* Floating Bottom Place Preview Card */}
      {selectedLocal && (
        <View style={styles.floatingCard}>
          <TouchableOpacity
            style={styles.cardCloseButton}
            onPress={() => setSelectedLocal(null)}
            accessibilityRole="button"
            accessibilityLabel="Fechar detalhes"
          >
            <Feather name="x" size={16} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardContentRow}
            onPress={handleOpenSelected}
            activeOpacity={0.88}
          >
            <Image
              source={{ uri: selectedLocal.imagem_url || FALLBACK_IMAGE }}
              style={styles.cardThumb}
            />

            <View style={styles.cardInfo}>
              {isSelectedBoosted && (
                <View style={styles.destaquePill}>
                  <Text style={styles.destaquePillText}>★ EM DESTAQUE</Text>
                </View>
              )}
              <Text style={styles.cardName} numberOfLines={1}>
                {selectedLocal.nome}
              </Text>
              <Text style={styles.cardAddress} numberOfLines={1}>
                {selectedLocal.endereco || selectedLocal.bairro || 'Brasília - DF'}
              </Text>
              <Text style={styles.cardPrice}>
                {selectedLocal.preco_entrada === 0
                  ? 'Entrada gratuita'
                  : selectedLocal.preco_entrada != null
                  ? `Entrada: R$ ${selectedLocal.preco_entrada}`
                  : selectedLocal.preco != null
                  ? `Gasto médio: R$ ${selectedLocal.preco}`
                  : 'Preço informado'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={handleOpenSelected}
            activeOpacity={0.85}
          >
            <Text style={styles.cardActionBtnText}>Ver detalhes</Text>
            <Feather name="arrow-right" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de Filtro de Distância */}
      <Modal
        visible={isFilterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsFilterModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Filtro de Distância</Text>
                <Text style={styles.modalSubtitle}>
                  Veja apenas locais dentro do raio escolhido
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsFilterModalVisible(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Origem da Medição */}
            <Text style={styles.filterSectionTitle}>Ponto de partida</Text>
            <View style={styles.origemRow}>
              <TouchableOpacity
                style={[
                  styles.origemBtn,
                  tempOrigem === 'gps' && styles.origemBtnActive,
                ]}
                onPress={() => setTempOrigem('gps')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="navigate"
                  size={16}
                  color={tempOrigem === 'gps' ? '#1E1848' : '#64748B'}
                />
                <Text
                  style={[
                    styles.origemBtnText,
                    tempOrigem === 'gps' && styles.origemBtnTextActive,
                  ]}
                >
                  Meu Local
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.origemBtn,
                  tempOrigem === 'ponto' && styles.origemBtnActive,
                ]}
                onPress={() => setTempOrigem('ponto')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="pin"
                  size={16}
                  color={tempOrigem === 'ponto' ? '#1E1848' : '#64748B'}
                />
                <Text
                  style={[
                    styles.origemBtnText,
                    tempOrigem === 'ponto' && styles.origemBtnTextActive,
                  ]}
                >
                  Marcar no mapa
                </Text>
              </TouchableOpacity>
            </View>

            {/* Raio em KM */}
            <Text style={styles.filterSectionTitle}>Distância máxima</Text>
            <View style={styles.presetGrid}>
              {[2, 5, 10, 20, 50].map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[
                    styles.presetChip,
                    Number(tempRaio) === km && styles.presetChipActive,
                  ]}
                  onPress={() => setTempRaio(String(km))}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      Number(tempRaio) === km && styles.presetChipTextActive,
                    ]}
                  >
                    {km} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input customizado de km */}
            <View style={styles.customKmWrap}>
              <Text style={styles.customKmLabel}>Ou digite outra distância:</Text>
              <View style={styles.customKmInputContainer}>
                <TextInput
                  style={styles.customKmInput}
                  placeholder="Ex: 15"
                  placeholderTextColor="#94A3B8"
                  value={tempRaio}
                  onChangeText={setTempRaio}
                  keyboardType="numeric"
                  maxLength={4}
                />
                <Text style={styles.customKmUnit}>km</Text>
              </View>
            </View>

            {/* Footer Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalClearBtn}
                onPress={handleLimparFiltroDistancia}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClearBtnText}>Remover filtro</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={handleAplicarFiltroDistancia}
                activeOpacity={0.85}
              >
                <Text style={styles.modalApplyBtnText}>Aplicar Filtro</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 20,
    left: 14,
    right: 14,
    zIndex: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  topHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E1848',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topHeaderTitleWrap: {
    flex: 1,
  },
  topHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  topHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerActionBtnActiveFav: {
    backgroundColor: '#FFE4E6',
  },
  headerActionBtnActiveRaio: {
    backgroundColor: '#FEE2E2',
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#C1121F',
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintPill: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 116 : 82,
    alignSelf: 'center',
    zIndex: 22,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  hintPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
  mapWrap: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recenterNoCard: {
    bottom: 95,
  },
  recenterWithCard: {
    bottom: 250,
  },
  floatingCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
    zIndex: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 35,
  },
  cardContentRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  cardThumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  cardInfo: {
    flex: 1,
    paddingRight: 20,
    gap: 3,
  },
  destaquePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  destaquePillText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '700',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardAddress: {
    fontSize: 12,
    color: '#64748B',
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  cardActionBtn: {
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cardActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Estilos do Modal de Filtro de Distância */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 8,
  },
  origemRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  origemBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  origemBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#8B5CF6',
  },
  origemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  origemBtnTextActive: {
    color: '#1E1848',
    fontWeight: '700',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#C1121F',
    borderColor: '#C1121F',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customKmWrap: {
    marginBottom: 20,
  },
  customKmLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  customKmInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  customKmInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 0,
  },
  customKmUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalClearBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalApplyBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C1121F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  modalApplyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attributionCard: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
    zIndex: 10,
  },
  attributionText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  attributionLink: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});
