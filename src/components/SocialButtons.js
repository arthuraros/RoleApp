import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { spacing } from '../utils/theme';

export function SocialButtons({ onGooglePress, text, loading = false }) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onGooglePress}
        disabled={loading}
        style={[styles.socialCircle, loading && styles.socialCircleDisabled]}
        accessibilityLabel="Entrar com Google"
      >
        {loading ? (
          <ActivityIndicator color="#090A1A" size="small" />
        ) : (
          <>
            <Image source={require('../../assets/Google.png')} style={styles.googleIcon} />
            <Text style={styles.text}>{text}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  text: {
    fontWeight: 500,
  },
  googleIcon: {
    width: 30,
    height: 30,
    objectFit: 'contain'
  },
  socialCircle: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    flexDirection: 'row',
    gap: spacing.md,
  },
  socialCircleDisabled: {
    opacity: 0.6,
  },
});
