import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,

  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, ErrorText, Input } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Completá email y contraseña');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : authError.message
      );
    }
    // Si sale bien, el layout redirige solo al detectar la sesión
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.emoji}>🏠</Text>
        <Text style={styles.title}>Tareas del Hogar</Text>
        <Text style={styles.subtitle}>Organizá las tareas en familia</Text>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <ErrorText message={error} />
          <Button title="Ingresar" onPress={handleLogin} loading={loading} />
        </View>

        <Link href="/register" style={styles.link}>
          ¿No tenés cuenta? <Text style={styles.linkBold}>Registrate</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emoji: { fontSize: 56, textAlign: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  form: { marginBottom: spacing.lg },
  link: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 15,
  },
  linkBold: { color: colors.primary, fontWeight: '700' },
});
