
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';

import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const ROXO = '#6820C9';

// Centro inicial apenas para visualizar o mapa.
// Nunca é salvo automaticamente.
const CENTRO_INICIAL = {
  latitude: -15.7942,
  longitude: -47.8822,
};

function coordenadasValidas(coords) {
  return (
    coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180
  );
}

function criarHtmlMapa(posicao) {
  const centro = coordenadasValidas(posicao)
    ? posicao
    : CENTRO_INICIAL;

  const possuiMarcador = coordenadasValidas(posicao);

  const lat = JSON.stringify(centro.latitude);
  const lng = JSON.stringify(centro.longitude);
  const mostrarMarcador = JSON.stringify(possuiMarcador);

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
        content="width=device-width, initial-scale=1.0">

      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />

      <style>
        html, body, #map {
          height: 100%;
          width: 100%;
          margin: 0;
        }
      </style>
    </head>

    <body>
      <div id="map"></div>

      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">
      </script>

      <script>
        if (!window.L) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'ERRO_MAPA' }));
          throw new Error('Mapa indispon?vel');
        }
        var map = L.map('map').setView([${lat}, ${lng}], 15);

        L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }
        ).on('tileerror', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'ERRO_MAPA' }));
        }).addTo(map);

        var marcador = null;

        function informarPosicao(posicao) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              tipo: 'POSICAO_SELECIONADA',
              latitude: posicao.lat,
              longitude: posicao.lng
            })
          );
        }

        function colocarMarcador(lat, lng, avisar) {
          var posicao = [lat, lng];

          if (!marcador) {
            marcador = L.marker(posicao, {
              draggable: true
            }).addTo(map);

            marcador.on('dragend', function() {
              informarPosicao(marcador.getLatLng());
            });
          } else {
            marcador.setLatLng(posicao);
          }

          map.setView(posicao, 17);

          if (avisar) {
            informarPosicao({ lat: lat, lng: lng });
          }
        }

        map.on('click', function(evento) {
          colocarMarcador(
            evento.latlng.lat,
            evento.latlng.lng,
            true
          );
        });

        window.atualizarPosicao = function(lat, lng) {
          colocarMarcador(lat, lng, false);
        };

        if (${mostrarMarcador}) {
          colocarMarcador(${lat}, ${lng}, false);
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'MAPA_PRONTO' }));
        setTimeout(function() {
          map.invalidateSize();
        }, 400);
      </script>
    </body>
    </html>
  `;
}

export function LocalizacaoEstabelecimento({
  local,
  endereco,
  bairro,
  cidadeUf,
  onSalvar,
  disabled = false,
}) {
  const mapaRef = useRef(null);

  const [posicao, setPosicao] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroMapa, setErroMapa] = useState(false);
  const [mapVersion, setMapVersion] = useState(0);
  const busyRef = useRef(false);
  const [confirmada, setConfirmada] = useState(false);

  useEffect(() => {
    const latitude = Number(local?.latitude);
    const longitude = Number(local?.longitude);

    if (
      local?.latitude != null &&
      local?.longitude != null &&
      coordenadasValidas({ latitude, longitude })
    ) {
      setPosicao({ latitude, longitude });
    } else {
      setPosicao(null);
    }

    setConfirmada(false);
  }, [local?.id_local, local?.latitude, local?.longitude]);

  const htmlMapa = React.useMemo(() => {
    const latitude = local?.latitude == null ? NaN : Number(local.latitude);
    const longitude = local?.longitude == null ? NaN : Number(local.longitude);
    return criarHtmlMapa({ latitude, longitude });
  }, [local?.id_local, local?.latitude, local?.longitude]);

  function atualizarPosicao(latitude, longitude) {
    const nova = {
      latitude: Number(latitude),
      longitude: Number(longitude),
    };

    if (!coordenadasValidas(nova)) return;

    setPosicao(nova);
    setConfirmada(false);

    mapaRef.current?.injectJavaScript(`
      if (window.atualizarPosicao) {
        window.atualizarPosicao(
          ${nova.latitude},
          ${nova.longitude}
        );
      }
      true;
    `);
  }

  async function solicitarPermissao() {
    const resposta =
      await Location.requestForegroundPermissionsAsync();

    if (resposta.status !== 'granted') {
      Alert.alert(
        'Permissão necessária',
        'Autorize a localização para utilizar esta opção.'
      );
      return false;
    }

    return true;
  }

  async function localizarEndereco() {
    if (busyRef.current || disabled) return;
    const consulta = [
      endereco?.trim(),
      bairro?.trim(),
      cidadeUf?.trim(),
      'Brasil',
    ]
      .filter(Boolean)
      .join(', ');

    if (!endereco?.trim() || !cidadeUf?.trim()) {
      Alert.alert(
        'Endereço incompleto',
        'Preencha o endereço e a cidade antes de buscar.'
      );
      return;
    }

    busyRef.current = true;
    setBuscando(true);

    try {
      // No Android, o geocodificador exige
      // a permissão de localização.
      if (Platform.OS === 'android' && !(await solicitarPermissao())) return;

      const resultados = await Location.geocodeAsync(
        consulta
      );

      if (!resultados.length) {
        Alert.alert(
          'Endereço não encontrado',
          'Confira o endereço ou marque manualmente o ponto no mapa.'
        );
        return;
      }

      atualizarPosicao(
        resultados[0].latitude,
        resultados[0].longitude
      );
    } catch (erro) {
      Alert.alert(
        'Não foi possível localizar',
        'Verifique a conexão e tente novamente. Você também pode tocar no mapa para posicionar o marcador.'
      );
    } finally {
      busyRef.current = false;
      setBuscando(false);
    }
  }

  async function usarGps() {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBuscando(true);

    try {
      const permitido = await solicitarPermissao();
      if (!permitido) return;

      const resultado =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      atualizarPosicao(
        resultado.coords.latitude,
        resultado.coords.longitude
      );
    } catch (erro) {
      Alert.alert(
        'GPS indisponível',
        'Não foi possível obter sua localização. Tente novamente ou selecione o ponto no mapa.'
      );
    } finally {
      busyRef.current = false;
      setBuscando(false);
    }
  }

  function receberMensagem(evento) {
    try {
      const dados = JSON.parse(evento.nativeEvent.data);

      if (dados.tipo === 'MAPA_PRONTO') {
        if (coordenadasValidas(posicao)) mapaRef.current?.injectJavaScript(`window.atualizarPosicao(${posicao.latitude}, ${posicao.longitude}); true;`);
        return;
      }
      if (dados.tipo === 'ERRO_MAPA') { setErroMapa(true); return; }
      if (busyRef.current || disabled) return;
      if (dados.tipo === 'POSICAO_SELECIONADA') {
        const nova = {
          latitude: dados.latitude,
          longitude: dados.longitude,
        };

        if (coordenadasValidas(nova)) {
          setPosicao(nova);
          setConfirmada(false);
        }
      }
    } catch {
      // Ignora mensagens inválidas do mapa.
    }
  }

  async function salvarLocalizacao() {
    if (busyRef.current || disabled) return;
    if (!coordenadasValidas(posicao)) {
      Alert.alert(
        'Localização obrigatória',
        'Primeiro selecione uma localização no mapa.'
      );
      return;
    }

    if (!confirmada) {
      Alert.alert(
        'Confirme a posição',
        'Marque a confirmação de que o ponto corresponde ao estabelecimento.'
      );
      return;
    }

    busyRef.current = true;
    setSalvando(true);

    try {
      await onSalvar(
        posicao.latitude,
        posicao.longitude
      );

      Alert.alert(
        'Localização salva!',
        'A posição do estabelecimento foi atualizada.'
      );
    } catch (erro) {
      Alert.alert(
        'Erro ao salvar localização',
        erro?.message || 'Não foi possível salvar.'
      );
    } finally {
      busyRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>
        Localização no mapa
      </Text>

      <Text style={styles.descricao}>
        Busque pelo endereço, use o GPS ou toque
        no mapa para marcar onde fica seu negócio.
      </Text>

      <TouchableOpacity
        style={styles.botaoBusca}
        onPress={localizarEndereco}
        disabled={buscando || salvando || disabled}
      >
        <Ionicons
          name="search-outline"
          size={20}
          color="#FFFFFF"
        />
        <Text style={styles.botaoTexto}>
          Buscar pelo endereço
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.botaoGps}
        onPress={usarGps}
        disabled={buscando || salvando || disabled}
      >
        <Ionicons
          name="navigate-outline"
          size={20}
          color={ROXO}
        />
        <Text style={styles.botaoGpsTexto}>
          Usar minha localização
        </Text>
      </TouchableOpacity>

      {buscando && (
        <ActivityIndicator color={ROXO} />
      )}

      {erroMapa && <TouchableOpacity onPress={() => { setErroMapa(false); setMapVersion(v => v + 1); }}>
        <Text>Não foi possível carregar o mapa. Verifique a conexão e toque para tentar novamente.</Text>
      </TouchableOpacity>}
      <View style={styles.mapa} pointerEvents={buscando || salvando || disabled ? 'none' : 'auto'}>
        <WebView
          key={mapVersion}
          ref={mapaRef}
          onError={() => setErroMapa(true)}
          onHttpError={() => setErroMapa(true)}
          originWhitelist={['*']}
          source={{ html: htmlMapa }}
          onMessage={receberMensagem}
          javaScriptEnabled
          style={{ flex: 1 }}
        />
      </View>

      <Text style={styles.ajuda}>
        Toque no mapa ou arraste o marcador para
        ajustar a posição exata.
      </Text>

      <TouchableOpacity
        style={styles.confirmacao}
        onPress={() => {
          if (posicao) {
            setConfirmada(valor => !valor);
          }
        }}
        disabled={!posicao || buscando || salvando || disabled}
      >
        <Ionicons
          name={
            confirmada ? 'checkbox' : 'square-outline'
          }
          color={ROXO}
          size={24}
        />

        <Text style={styles.confirmacaoTexto}>
          Confirmo que o marcador está na
          localização correta do estabelecimento.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.botaoSalvar,
          (!posicao || !confirmada || buscando || salvando || disabled) &&
            styles.desabilitado,
        ]}
        disabled={!posicao || !confirmada || buscando || salvando || disabled}
        onPress={salvarLocalizacao}
      >
        {salvando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.botaoTexto}>
            Salvar localização
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    gap: 12,
  },

  titulo: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1D173F',
  },

  descricao: {
    fontSize: 13,
    lineHeight: 19,
    color: '#665D78',
  },

  botaoBusca: {
    backgroundColor: ROXO,
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  botaoGps: {
    backgroundColor: '#F1E8FF',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  botaoTexto: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  botaoGpsTexto: {
    flexShrink: 1,
    textAlign: 'center',
    color: ROXO,
    fontWeight: '800',
    fontSize: 14,
  },

  mapa: {
    height: 260,
    backgroundColor: '#EDEAF4',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D9CCE9',
  },

  ajuda: {
    fontSize: 12,
    color: '#665D78',
    lineHeight: 18,
  },

  confirmacao: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#F4EFFA',
    padding: 12,
    borderRadius: 10,
  },

  confirmacaoTexto: {
    flex: 1,
    fontSize: 13,
    color: '#45395B',
    lineHeight: 18,
  },

  botaoSalvar: {
    backgroundColor: '#26804D',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  desabilitado: {
    opacity: 0.5,
  },
});
