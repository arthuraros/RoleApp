
import React from 'react';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  radius,
  spacing,
} from '../utils/theme';

function TabButton({
  label,
  iconName,
  isFocused,
  onPress,
  onLongPress,
  compact,
}) {
  const iconColor = isFocused
    ? colors.white
    : colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        isFocused
          ? styles.buttonFocused
          : styles.buttonUnfocused,
      ]}
    >
      <Feather
        name={iconName}
        size={compact ? 19 : 22}
        color={iconColor}
        style={styles.icon}
      />

      <Text
        numberOfLines={2}
        style={[
          styles.label,
          compact && styles.labelCompact,
          { color: iconColor },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function CustomTabBar({
  state,
  descriptors,
  navigation,
  blurTarget,
}) {
  const insets = useSafeAreaInsets();
  const reportHeight = React.useContext(BottomTabBarHeightCallbackContext);

  // Ajusta o menu quando existem 5 ou mais abas
  const compact = state.routes.length >= 5;

  const getTabIcon = routeName => {
    switch (routeName) {
      case 'Home':
        return 'home';

      case 'Favoritos':
        return 'heart';

      case 'RolesScreen':
        return 'compass';

      case 'Mapa':
        return 'map';

      case 'Perfil':
        return 'user';

      case 'MeusLugares':
        return 'briefcase';

      default:
        return 'circle';
    }
  };

  const getTabLabel = routeName => {
    switch (routeName) {
      case 'Home':
        return 'Início';

      case 'RolesScreen':
        return 'Rolês';

      case 'MeusLugares':
        // Nome reduzido na barra para caber em 5 abas
        return 'Lugares';

      default:
        return routeName;
    }
  };

  return (
    <View
      onLayout={event => reportHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.wrapper,
        compact && styles.wrapperCompact,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: Math.max((insets.left || 0) + 8, compact ? 6 : spacing.md),
          paddingRight: Math.max((insets.right || 0) + 8, compact ? 6 : spacing.md),
        },
      ]}
    >
      <BlurView
        intensity={80}
        tint="light"
        blurMethod="dimezisBlurView"
        blurTarget={blurTarget}
        style={styles.blurContainer}
      >
        <View style={styles.container}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;

            const label = getTabLabel(route.name);
            const iconName = getTabIcon(route.name);

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(
                  route.name,
                  route.params
                );
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TabButton
                key={route.key}
                label={label}
                iconName={iconName}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                compact={compact}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },

  wrapperCompact: {
    paddingHorizontal: 6,
  },

  blurContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'transparent',
  },

  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 3,
  },

  button: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 3,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },

  buttonCompact: {
    marginHorizontal: 2,
    minHeight: 52,
    paddingHorizontal: 1,
    paddingVertical: 7,
  },

  buttonFocused: {
    backgroundColor: colors.primary,
  },

  buttonUnfocused: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primary,
  },

  icon: {
    marginBottom: 4,
  },

  label: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },

  labelCompact: {
    fontSize: 11,
    marginTop: 1,
  },
});
