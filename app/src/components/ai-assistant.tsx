import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AIAction, applyAction, askAssistant } from '@/lib/ai';
import { spacing } from '@/lib/theme';
import { isVoiceInputAvailable, speak, startVoiceInput, stopSpeaking } from '@/lib/voice';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  actions?: AIAction[];
  applied?: boolean;
}

function actionLabel(a: AIAction): string {
  if (a.type === 'create_task') {
    const who =
      a.assignment_type === 'rotative'
        ? 'rotativa'
        : a.assigned_to_name
          ? `para ${a.assigned_to_name}`
          : 'para vos';
    return `📋 Crear tarea "${a.title}" (${a.frequency ?? 'una vez'}, ${a.due_time ?? '20:00'}, ${who})`;
  }
  if (a.type === 'add_shopping_items') {
    return `🛒 Agregar a compras: ${a.items.join(', ')}`;
  }
  return `💡 ${a.text}`;
}

export function AIAssistant() {
  const { colors, ts } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const stopListenRef = useRef<(() => void) | null>(null);

  function reset() {
    setChat([]);
    setInput('');
    setError(null);
    stopSpeaking();
  }

  async function send(text: string) {
    if (!text.trim() || !profile?.household_id) return;
    setError(null);
    setChat((c) => [...c, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await askAssistant(profile.household_id, text);
      setChat((c) => [...c, { role: 'assistant', text: res.reply, actions: res.actions }]);
      speak(res.reply); // lectura en voz alta (accesibilidad)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setError('No pude conectarme con el asistente. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function runActions(item: ChatItem, index: number) {
    if (!profile?.household_id || !item.actions) return;
    setLoading(true);
    try {
      const results: string[] = [];
      for (const action of item.actions) {
        if (action.type === 'suggestion') continue;
        results.push(await applyAction(action, { householdId: profile.household_id, profile }));
      }
      setChat((c) => c.map((it, i) => (i === index ? { ...it, applied: true } : it)));
      if (results.length > 0) {
        const done = `✅ ${results.join(' ')}`;
        setChat((c) => [...c, { role: 'assistant', text: done }]);
        speak(done);
      }
    } catch {
      setError('No se pudo aplicar. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function toggleVoice() {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    setError(null);
    setListening(true);
    stopListenRef.current = startVoiceInput(
      (transcript) => {
        setListening(false);
        send(transcript);
      },
      (msg) => {
        setListening(false);
        setError(msg);
      }
    );
  }

  const executableActions = (item: ChatItem) =>
    item.actions?.filter((a) => a.type !== 'suggestion') ?? [];

  return (
    <>
      {/* Botón flotante */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Asistente de inteligencia artificial"
        accessibilityHint="Abre el asistente para crear tareas, compras y más hablando o escribiendo"
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 80 + insets.bottom }]}
      >
        <Ionicons name="sparkles" size={26} color="#fff" />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Encabezado */}
          <View
            style={[
              styles.header,
              { paddingTop: insets.top + spacing.sm, borderColor: colors.border },
            ]}
          >
            <Ionicons name="sparkles" size={22} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: ts(18), fontWeight: '800', color: colors.text }}>
              Asistente
            </Text>
            <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Limpiar conversación" hitSlop={8}>
              <Ionicons name="refresh" size={22} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar asistente"
              hitSlop={8}
              style={{ marginLeft: spacing.md }}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.md }}>
            {chat.length === 0 && (
              <View style={{ paddingVertical: spacing.lg }}>
                <Text style={{ fontSize: ts(15), color: colors.textMuted, marginBottom: spacing.md }}>
                  Pedime cosas en tus palabras. Por ejemplo:
                </Text>
                {[
                  '"Agregá lavar el auto cada 15 días a la mañana"',
                  '"Comprar todo para hacer milanesas con puré"',
                  '"¿Cómo reparto las tareas de esta semana?"',
                  '"Cuando alguien cocina, que se cree lavar los platos"',
                ].map((ex) => (
                  <Pressable
                    key={ex}
                    onPress={() => send(ex.replace(/"/g, ''))}
                    style={[styles.example, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={{ fontSize: ts(14), color: colors.text }}>{ex}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {chat.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  item.role === 'user'
                    ? { backgroundColor: colors.primary, alignSelf: 'flex-end' }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, alignSelf: 'flex-start' },
                ]}
              >
                <Text
                  style={{
                    fontSize: ts(15),
                    color: item.role === 'user' ? '#fff' : colors.text,
                  }}
                >
                  {item.text}
                </Text>

                {item.role === 'assistant' && executableActions(item).length > 0 && !item.applied && (
                  <View style={{ marginTop: spacing.sm }}>
                    {item.actions!.map((a, ai) => (
                      <Text
                        key={ai}
                        style={{ fontSize: ts(13), color: colors.textMuted, marginBottom: 4 }}
                      >
                        {actionLabel(a)}
                      </Text>
                    ))}
                    <Pressable
                      onPress={() => runActions(item, i)}
                      accessibilityRole="button"
                      accessibilityLabel="Confirmar y aplicar"
                      style={[styles.confirm, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: ts(14) }}>
                        Confirmar y aplicar
                      </Text>
                    </Pressable>
                  </View>
                )}
                {item.applied && (
                  <Text style={{ fontSize: ts(12), color: colors.success, marginTop: 4 }}>
                    ✓ Aplicado
                  </Text>
                )}
                {/* Sugerencias (no ejecutables) ya vienen en el texto de la acción */}
                {item.role === 'assistant' &&
                  item.actions
                    ?.filter((a) => a.type === 'suggestion')
                    .map((a, ai) => (
                      <Text
                        key={`s${ai}`}
                        style={{ fontSize: ts(14), color: colors.text, marginTop: spacing.sm }}
                      >
                        💡 {a.type === 'suggestion' ? a.text : ''}
                      </Text>
                    ))}
              </View>
            ))}

            {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}
            {!!error && (
              <Text
                accessibilityLiveRegion="assertive"
                style={{ color: colors.danger, fontSize: ts(14), marginTop: spacing.md }}
              >
                {error}
              </Text>
            )}
          </ScrollView>

          {/* Barra de entrada */}
          <View
            style={[
              styles.inputBar,
              { borderColor: colors.border, paddingBottom: insets.bottom + spacing.sm },
            ]}
          >
            {(isVoiceInputAvailable() || Platform.OS !== 'web') && (
              <Pressable
                onPress={toggleVoice}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Detener dictado' : 'Hablar'}
                style={[
                  styles.mic,
                  { backgroundColor: listening ? colors.danger : colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name={listening ? 'stop' : 'mic'}
                  size={24}
                  color={listening ? '#fff' : colors.primary}
                />
              </Pressable>
            )}
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={listening ? 'Escuchando…' : 'Escribí o hablá…'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Mensaje para el asistente"
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              editable={!listening}
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, fontSize: ts(16) },
              ]}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              style={[styles.mic, { backgroundColor: colors.primary, opacity: !input.trim() ? 0.5 : 1 }]}
            >
              <Ionicons name="send" size={22} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  example: {
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  confirm: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
