import { KeyboardViewport, KeyboardAwareScrollView } from './KeyboardForm';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsiveMetrics } from '../utils/responsive';
import { Feather, FontAwesome5 } from '@expo/vector-icons';

export function AuthLayout({
  title,
  subtitle,
  error,
  children,
}) {
  const dimensions = useWindowDimensions();
  const layout = responsiveMetrics({ ...dimensions, insets: useSafeAreaInsets() });
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1A0B2E', '#16082B', '#7A0C1E', '#C5162E', '#DC2626']}
        locations={[0, 0.25, 0.6, 0.85, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardViewport
          style={styles.keyboardAvoid}
        >
          <KeyboardAwareScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.card, { width: layout.authWidth }]}>
              <View style={styles.brandRow}>
                <View style={styles.mascotBadge}>
                  <Image source={require('../../assets/logoName.png')} style={[styles.mascotIcon, { width: layout.logoWidth }]} resizeMode="contain" />
                </View>
              </View>

              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color="#DC2626" style={styles.errorIcon} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {children}
            </View>
          </KeyboardAwareScrollView>
        </KeyboardViewport>
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
    alignItems: 'center',
    paddingHorizontal: 16,
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
  mascotBadge: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mascotIcon: {
    width: 250,
    height: 70,
    objectFit: 'contain'
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
