import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import {
  addShoppingItem,
  deleteShoppingItem,
  fetchMembers,
  fetchShoppingItems,
  toggleShoppingItem,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { Profile, ShoppingItem } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/settings-provider';

let shoppingChannelCounter = 0;

export default function ShoppingScreen() {
  const { profile } = useAuth();
  const { colors, ts } = useTheme();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [newItem, setNewItem] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.household_id) return;
    try {
      setError(null);
      const [its, mems] = await Promise.all([
        fetchShoppingItems(profile.household_id),
        fetchMembers(profile.household_id),
      ]);
      setItems(its);
      setMembers(mems);
    } catch {
      setError('No pudimos cargar la lista. Deslizá hacia abajo para reintentar.');
    }
  }, [profile?.household_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Tiempo real de la lista de compras
  useEffect(() => {
    if (!profile?.household_id) return;
    shoppingChannelCounter += 1;
    const channel = supabase
      .channel(`shopping-${profile.household_id}-${shoppingChannelCounter}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `household_id=eq.${profile.household_id}`,
        },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.household_id, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleAdd() {
    if (!profile?.household_id || !newItem.trim()) return;
    try {
      await addShoppingItem(profile.household_id, newItem.trim(), profile.id);
      AccessibilityInfo.announceForAccessibility(`${newItem.trim()} agregado a la lista`);
      setNewItem('');
      await load();
    } catch {
      setError('No se pudo agregar. Probá de nuevo.');
    }
  }

  async function handleToggle(item: ShoppingItem) {
    if (!profile) return;
    try {
      await toggleShoppingItem(item, profile.id);
      AccessibilityInfo.announceForAccessibility(
        item.done ? `${item.name} pendiente de nuevo` : `${item.name} comprado`
      );
      await load();
    } catch {
      setError('No se pudo actualizar. Probá de nuevo.');
    }
  }

  async function handleDelete(item: ShoppingItem) {
    try {
      await deleteShoppingItem(item.id);
      await load();
    } catch {
      setError('No se pudo eliminar. Probá de nuevo.');
    }
  }

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '';

  const pending = items.filter((i) => !i.done);
  const bought = items.filter((i) => i.done);

  const renderItem = (item: ShoppingItem) => (
    <View
      key={item.id}
      style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Pressable
        onPress={() => handleToggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={
          item.done
            ? `${item.name}, comprado por ${memberName(item.done_by)}. Tocá para volver a pendiente`
            : `${item.name}. Tocá para marcar comprado`
        }
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: item.done ? colors.success : colors.border,
            backgroundColor: item.done ? colors.success : 'transparent',
          },
        ]}
      >
        {item.done && <Ionicons name="checkmark" size={20} color="#fff" />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: ts(16),
            color: colors.text,
            textDecorationLine: item.done ? 'line-through' : 'none',
          }}
        >
          {item.name}
        </Text>
        {item.done && !!item.done_by && (
          <Text style={{ fontSize: ts(12), color: colors.textMuted }}>
            Comprado por {memberName(item.done_by)}
          </Text>
        )}
      </View>
      <Pressable
        onPress={() => handleDelete(item)}
        accessibilityRole="button"
        accessibilityLabel={`Eliminar ${item.name} de la lista`}
        hitSlop={8}
        style={styles.deleteButton}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: ts(22), fontWeight: '800', color: colors.text, marginBottom: spacing.md }}
        >
          Lista de compras 🛒
        </Text>

        {/* Agregar ítem */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Agregar algo… (ej: Leche)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Nuevo ítem de la lista de compras"
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
                fontSize: ts(16),
              },
            ]}
          />
          <Pressable
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel="Agregar a la lista"
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </View>

        {!!error && (
          <Text
            accessibilityLiveRegion="assertive"
            style={{ color: colors.danger, fontSize: ts(14), marginBottom: spacing.md }}
          >
            {error}
          </Text>
        )}

        {pending.length === 0 && bought.length === 0 && !error && (
          <Text style={{ fontSize: ts(15), color: colors.textMuted }}>
            La lista está vacía. Agregá lo que haga falta comprar. 📝
          </Text>
        )}

        {pending.map(renderItem)}

        {bought.length > 0 && (
          <>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: ts(15),
                fontWeight: '700',
                color: colors.textMuted,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              Comprado ✅
            </Text>
            {bought.map(renderItem)}
          </>
        )}

        <View style={{ height: spacing.lg }} />
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        <View style={{ height: spacing.xl + insets.bottom }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 50,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
