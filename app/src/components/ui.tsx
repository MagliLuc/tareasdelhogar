import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, spacing } from '@/lib/theme';

// ------------------------------------------------------------
// Botón primario/secundario con estado de carga
// ------------------------------------------------------------
interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || isDisabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text
          style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------
// Campo de texto con etiqueta y mensaje de error
// ------------------------------------------------------------
interface InputProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !!error && { borderColor: colors.danger }]}
        {...props}
      />
      {!!error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

// ------------------------------------------------------------
// Mensaje de error general de pantalla
// ------------------------------------------------------------
export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: colors.primary,
  },
  inputWrapper: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
