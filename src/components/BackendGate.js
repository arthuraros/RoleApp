import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, ScrollView } from 'react-native';
import { FEATURE_TITLES, isBackendReady } from '../utils/mvpAvailability';

// O filho nao e montado enquanto o contrato remoto continuar bloqueado.
export function BackendGate({ feature, navigation, children }) {
  if (isBackendReady(feature)) return children;
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>{FEATURE_TITLES[feature] || 'Recurso indisponível'}</Text>
    <Text style={styles.text}>Este recurso ainda não está disponível. Nenhuma alteração foi enviada.</Text>
    <Text style={styles.text}>Você pode continuar explorando os locais e acompanhar suas solicitações no Perfil.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.button}
      onPress={() => navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate('MainTabs')}>
      <Text style={styles.buttonText}>Voltar</Text>
    </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F6FB' },
  content: { flexGrow: 1, width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24, justifyContent: 'center' },
  title: { color: '#1E1848', fontSize: 25, fontWeight: '700', marginBottom: 16 },
  text: { color: '#475569', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  button: { backgroundColor: '#1E1848', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
