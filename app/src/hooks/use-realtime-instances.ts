import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Refresca los datos cuando cambia cualquier instancia de tarea del
 * hogar (alguien completa, reasigna o crea). Requiere Realtime
 * habilitado para task_instances en Supabase.
 */
export function useRealtimeInstances(householdId: string | null, onChange: () => void) {
  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`task-instances-${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_instances',
          filter: `household_id=eq.${householdId}`,
        },
        onChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // onChange se asume estable (useCallback en quien lo usa)
  }, [householdId, onChange]);
}
