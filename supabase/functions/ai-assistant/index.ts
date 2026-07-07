// Edge Function: asistente de IA con Google Gemini.
// La API key vive SOLO acá (secret de Supabase), nunca en la app ni
// en el repo. La app manda el mensaje del usuario + un contexto del
// hogar (miembros, categorías, tareas, compras) y esta función pide a
// Gemini una respuesta estructurada con acciones que la app confirma
// y ejecuta bajo las políticas RLS del propio usuario.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Esquema de la respuesta que le exigimos a Gemini
const responseSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['create_task', 'add_shopping_items', 'suggestion'],
          },
          // create_task
          title: { type: 'string' },
          category_name: { type: 'string' },
          frequency: {
            type: 'string',
            enum: ['once', 'daily', 'weekly', 'every_x_days'],
          },
          frequency_interval: { type: 'integer' },
          due_time: { type: 'string' }, // 'HH:MM'
          estimated_minutes: { type: 'integer' },
          points: { type: 'integer' },
          assignment_type: { type: 'string', enum: ['manual', 'rotative'] },
          assigned_to_name: { type: 'string' },
          rotation_member_names: { type: 'array', items: { type: 'string' } },
          chained_task_titles: { type: 'array', items: { type: 'string' } },
          // add_shopping_items
          items: { type: 'array', items: { type: 'string' } },
          // suggestion
          text: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
};

function systemPrompt(context: unknown, today: string): string {
  return `Sos el asistente de una app familiar de tareas del hogar, en español rioplatense (voseo), cálido y breve.

Hoy es ${today}.

Contexto del hogar (JSON):
${JSON.stringify(context)}

Tu trabajo es interpretar lo que pide la persona y devolver acciones. Reglas:
- Para crear una tarea usá type "create_task". Inferí frecuencia, hora (HH:MM 24h), duración estimada en minutos y puntos razonables (tareas cortas 5-10, medias 15-20, largas 30). Elegí una category_name de las que existen en el contexto. Si no aclaran quién la hace, usá assignment_type "rotative" con rotation_member_names = todos los miembros. Si nombran a alguien, assignment_type "manual" con assigned_to_name.
- Para agregar cosas a la lista de compras usá type "add_shopping_items" con items (nombres cortos, uno por producto). Si piden ingredientes de una comida, desglosalos vos.
- Para encadenar tareas (ej: cocinar dispara lavar platos) poné chained_task_titles con títulos EXACTOS de tareas existentes en el contexto.
- Para repartir tareas de forma justa o explicar asignaciones, usá type "suggestion" con text: considerá horarios (trabajo/estudio ocupan y suman; salidas solo ocupan), carga de la semana y disponibilidad. No inventes datos que no estén en el contexto.
- Nunca inventes miembros ni categorías que no estén en el contexto.
- El campo "reply" es lo que le decís a la persona (1-3 frases). Si no hay acciones, dejá actions vacío.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Falta GEMINI_API_KEY en el servidor' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // La función se invoca con verify_jwt: solo usuarios autenticados
    const { message, context, today } = await req.json();
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Mensaje vacío' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt(context, today ?? '') }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.4,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'Gemini rechazó la consulta', detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { reply: text, actions: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
