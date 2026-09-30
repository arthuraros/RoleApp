import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';

export function AuthLayout({
  title,
  subtitle,
  error,
  children,
}) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1A0B2E', '#16082B', '#7A0C1E', '#C5162E', '#DC2626']}
        locations={[0, 0.25, 0.6, 0.85, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              {/* Header com Logo e Mascote */}
              <View style={styles.brandRow}>
                <View style={styles.logoTextWrapper}>
                  <Text style={styles.logoRole}>Rolê</Text>
                  <Text style={styles.logoApp}>App</Text>
                </View>
                <View style={styles.mascotBadge}>
                  <FontAwesome5 name="piggy-bank" size={26} color="#F472B6" />
                </View>
              </View>

              {/* Título e Subtítulo */}
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

              {/* Caixa de Erro */}
              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color="#DC2626" style={styles.errorIcon} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Formulário / Ações */}
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    width: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoTextWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  logoRole: {
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#D91A2A',
    letterSpacing: -0.5,
  },
  logoApp: {
    fontSize: 32,
    fontWeight: '900',
    color: '#090A1A',
    letterSpacing: -0.5,
  },
  mascotBadge: {
    marginLeft: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sunglassesIcon: {
    position: 'absolute',
    top: 5,
    left: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
});
