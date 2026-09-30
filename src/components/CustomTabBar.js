import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, normalizeFont } from '../utils/theme';

function TabButton({ label, iconName, isFocused, onPress, onLongPress }) {
  const iconColor = isFocused ? colors.white : colors.primary;
  const textColor = isFocused ? colors.white : colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.button,
        isFocused ? styles.buttonFocused : styles.buttonUnfocused,
      ]}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
    >
      <Feather name={iconName} size={22} color={iconColor} style={styles.icon} />
      <Text style={[styles.label, { color: textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function CustomTabBar({ state, descriptors, navigation, blurTarget }) {
  const insets = useSafeAreaInsets();

  const getTabIcon = (routeName) => {
    switch (routeName) {
      case 'Home':
      case 'In??cio':
        return 'home';
      case 'Favoritos':
        return 'heart';
      case 'Mapa':
        return 'map';
      case 'Perfil':
        return 'user';
      default:
        return 'circle';
    }
  };

  const getTabLabel = (routeName) => {
    switch (routeName) {
      case 'Home':
        return 'In??cio';
      default:
        return routeName;
    }
  };

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, 10),
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
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;
            const label = options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : getTabLabel(route.name);

            const iconName = getTabIcon(route.name);

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
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
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  blurContainer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  button: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 10,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonFocused: {
    backgroundColor: colors.primary,
  },
  buttonUnfocused: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  icon: {
    marginBottom: 4,
  },
  label: {
    fontSize: normalizeFont(11),
    fontWeight: '700',
  },
});

