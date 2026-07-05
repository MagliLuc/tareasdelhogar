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

import { spacing } from '@/lib/theme';
import { useTheme } from '@/providers/settings-provider';

// ------------------------------------------------------------
// Botón primario/secundario con estado de carga, accesible
// ------------------------------------------------------------
interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityHint?: string;
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  accessibilityHint,
}: ButtonProps) {
  const { colors, ts } = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        variant === 'secondary' && { borderWidth: 2, borderColor: colors.primary },
        (pressed || isDisabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text
          style={{
            color: variant === 'secondary' ? colors.primary : '#fff',
            fontSize: ts(17),
            fontWeight: '700',
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------
// Campo de texto con etiqueta y mensaje de error, accesible
// ------------------------------------------------------------
interface InputProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function Input({ label, error, ...props }: InputProps) {
  const { colors, ts } = useTheme();
  return (
    <View style={styles.inputWrapper}>
      <Text style={{ fontSize: ts(14), fontWeight: '600', color: colors.text, marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
            fontSize: ts(16),
          },
        ]}
        {...props}
      />
      {!!error && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.danger, fontSize: ts(13), marginTop: 4 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

// ------------------------------------------------------------
// Mensaje de error general de pantalla (anunciado al lector)
// ------------------------------------------------------------
export function ErrorText({ message }: { message: string | null }) {
  const { colors, ts } = useTheme();
  if (!message) return null;
  return (
    <Text
      accessibilityLiveRegion="assertive"
      style={{
        color: colors.danger,
        fontSize: ts(14),
        textAlign: 'center',
        marginBottom: spacing.md,
      }}
    >
      {message}
    </Text>
  );
}

// ------------------------------------------------------------
// Chip seleccionable (filtros y formularios), accesible
// ------------------------------------------------------------
interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors, ts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? '#fff' : colors.text,
          fontSize: ts(14),
          fontWeight: selected ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  inputWrapper: {
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 50,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
});
