
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { cardapioService } from '../services/cardapioService';

export function GerenciarCardapioScreen({ navigation, route }) {
  const local = route?.params?.local;
  const idLocal = local?.id_local;

  const [categorias, setCategorias] = useState([]);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregarCardapio = async () => {
    if (!idLocal) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [listaCategorias, listaItens] = await Promise.all([
        cardapioService.listarCategorias(idLocal),
        cardapioService.listarItens(idLocal),
      ]);

      setCategorias(listaCategorias);
      setItens(listaItens);
    } catch (error) {
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível carregar o cardápio.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarCardapio();
  }, [idLocal]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={26} color="#1D173F" />
        </TouchableOpacity>

        <Text style={styles.title}>Gerenciar Cardápio</Text>

        <Text style={styles.subtitle}>
          {local?.nome || 'Nenhum estabelecimento selecionado'}
        </Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color="#1D173F"
            style={styles.loading}
          />
        ) : !idLocal ? (
          <Text style={styles.empty}>
            Selecione um estabelecimento para gerenciar o cardápio.
          </Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              Categorias ({categorias.length})
            </Text>

            {categorias.length === 0 && (
              <Text style={styles.empty}>
                Nenhuma categoria cadastrada.
              </Text>
            )}

            {categorias.map((categoria) => (
              <View key={categoria.id_categoria} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {categoria.nome}
                </Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>
              Produtos ({itens.length})
            </Text>

            {itens.length === 0 && (
              <Text style={styles.empty}>
                Nenhum produto cadastrado.
              </Text>
            )}

            {itens.map((item) => (
              <View key={item.id_item} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {item.nome}
                </Text>

                <Text style={styles.description}>
                  {item.descricao || 'Sem descrição'}
                </Text>

                <Text style={styles.price}>
                  {Number(item.preco).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </Text>

                <Text style={styles.status}>
                  {item.disponivel ? 'Disponível' : 'Indisponível'}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F6FB',
  },
  content: {
    padding: 20,
    paddingBottom: 50,
  },
  backButton: {
    marginBottom: 18,
  },
  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#1D173F',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D173F',
    marginTop: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1D173F',
  },
  description: {
    color: '#64748B',
    marginTop: 6,
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16A34A',
    marginTop: 10,
  },
  status: {
    color: '#475569',
    marginTop: 8,
  },
  empty: {
    color: '#64748B',
    marginVertical: 12,
  },
  loading: {
    marginTop: 40,
  },
});
