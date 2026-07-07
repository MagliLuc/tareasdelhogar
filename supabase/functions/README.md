# Edge Functions

## ai-assistant

Asistente de IA con Google Gemini. La API key vive **solo** acá como secret; nunca en la app ni en el repo.

### Desplegar (una vez, desde la PC)

Requiere la [CLI de Supabase](https://supabase.com/docs/guides/cli):

```bash
# 1. Instalar la CLI si no la tenés (con npx no hace falta instalar nada)
# 2. Loguearte y enlazar el proyecto
npx supabase login
npx supabase link --project-ref bvfayigcaaixhrruoqqh

# 3. Guardar la API key de Gemini como secret (NO va al repo)
npx supabase secrets set GEMINI_API_KEY=TU_API_KEY_DE_GEMINI

# 4. Desplegar la función
npx supabase functions deploy ai-assistant
```

### Actualizar la key (p. ej. tras rotarla)

```bash
npx supabase secrets set GEMINI_API_KEY=LA_NUEVA_KEY
```

No hace falta volver a desplegar la función al cambiar solo el secret.

### Notas

- La función corre con `verify_jwt` activado: solo usuarios autenticados de la app pueden invocarla.
- La app manda el mensaje + un contexto del hogar (miembros, categorías, tareas, compras, horarios) y recibe una respuesta con acciones que **el usuario confirma** antes de aplicarse. Las acciones se ejecutan desde la app bajo las políticas RLS del propio usuario.
