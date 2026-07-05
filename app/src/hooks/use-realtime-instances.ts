import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

let channelCounter = 0;

/**
 * Refresca los datos cuando cambia cualquier instancia de tarea del
 * hogar (alguien completa, reasigna o crea). Requiere Realtime
 * habilitado para task_instances en Supabase (migración 0005).
 *
 * El nombre del canal es único por montaje: si varias pantallas
 * compartieran el nombre, supabase.channel() devolvería el canal ya
 * suscripto y agregar callbacks después de subscribe() es un error.
 */
export function useRealtimeInstances(householdId: string | null, onChange: () => void) {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) {
    channelCounter += 1;
    idRef.current = channelCounter;
  }

  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`task-instances-${householdId}-${idRef.current}`)
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
