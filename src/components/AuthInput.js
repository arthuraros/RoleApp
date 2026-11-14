import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export function AuthInput({
  label,
  sublabel,
  iconName,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  style,
  ...props
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      <View style={styles.inputWrapper}>
        {iconName ? (
          <Feather
            name={iconName}
            size={18}
            color="#475569"
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#64748B"
          secureTextEntry={secureTextEntry && !passwordVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          {...props}
        />
        {secureTextEntry ? (
          <TouchableOpacity
            style={styles.visibilityButton}
            onPress={() => setPasswordVisible(visible => !visible)}
            accessibilityRole="button"
            accessibilityLabel={`${passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}: ${label || 'Senha'}`}
            disabled={props.editable === false}
          >
            <Feather name={passwordVisible ? 'eye-off' : 'eye'} size={20} color="#475569" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
    width: '100%',
  },
  labelRow: {
    marginBottom: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  sublabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CBD5E1',
    borderWidth: 1.2,
    borderColor: '#090A1A',
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 10,
  },
  visibilityButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
});
