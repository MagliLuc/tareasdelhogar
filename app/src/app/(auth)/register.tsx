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

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      setError('Completá todos los campos');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // El trigger handle_new_user usa este nombre para crear el perfil
        data: { name: name.trim() },
      },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    }
    // Si sale bien, el layout redirige solo al detectar la sesión
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Después vas a poder crear tu hogar o sumarte a uno existente
        </Text>

        <View style={styles.form}>
          <Input
            label="Tu nombre"
            value={name}
            onChangeText={setName}
            placeholder="Lucas"
            autoComplete="name"
          />
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
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
          />
          <ErrorText message={error} />
          <Button title="Registrarme" onPress={handleRegister} loading={loading} />
        </View>

        <Link href="/login" style={styles.link}>
          ¿Ya tenés cuenta? <Text style={styles.linkBold}>Ingresá</Text>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
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
