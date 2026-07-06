# Tareas del Hogar 🏠

App móvil (Android + iOS) para organizar las tareas del hogar en familia: tareas recurrentes con reparto equitativo automático, calendario compartido, notificaciones push y ranking semanal de puntos.

## Stack

| Capa | Tecnología |
|---|---|
| App móvil | React Native + Expo (TypeScript) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Notificaciones | Expo Notifications |

## Estructura del repo

```
tareasdelhogar/
├── app/                  # App Expo (React Native) — próximamente
└── supabase/
    └── migrations/       # Esquema de base de datos, RLS y funciones
        ├── 0001_schema.sql     # Tablas, índices y vistas
        ├── 0002_rls.sql        # Seguridad por hogar (Row Level Security)
        └── 0003_functions.sql  # RPCs: hogares, completar, reasignar, reparto equitativo
```

## Modelo de datos

- **households** — el hogar, con código de invitación de 6 caracteres y zona horaria.
- **profiles** — un perfil por usuario (nombre, foto, color, rol adulto/menor), creado automáticamente al registrarse.
- **work_schedules** — franjas de horario laboral por día de la semana (1=lunes … 7=domingo).
- **categories** — categorías de tareas por hogar (se siembran 7 por defecto al crear el hogar).
- **tasks** — la *definición* de una tarea: frecuencia (única/diaria/semanal/cada X días), duración estimada, puntos, y tipo de asignación (manual o rotativa).
- **task_rotation_members** — quiénes participan de la rotación de una tarea rotativa.
- **task_instances** — cada *ocurrencia* concreta con fecha de vencimiento, asignado y estado. Se generan automáticamente para los próximos 7 días.
- **task_events** — historial: quién asignó, reasignó o completó qué y cuándo. Es también el disparador de las notificaciones push.
- **point_entries** — libro mayor de puntos (una fila por tarea completada) + vista `weekly_ranking`.
- **push_tokens** — tokens de Expo para las notificaciones.

### Reparto equitativo (tareas rotativas)

Al generar cada instancia, `pick_rotative_assignee()` elige al miembro con menor puntaje de carga:

```
carga = minutos de tareas pendientes esta semana
      + minutos de trabajo semanal / 4        (4 h de trabajo pesan como 1 h de tareas)
      + 240 si está trabajando a la hora de vencimiento ese día
```

Así, quien trabaja más horas o ya tiene más tareas asignadas recibe menos carga nueva.

## Configurar el backend (una sola vez)

1. **Crear el proyecto**: entrá a [supabase.com](https://supabase.com) → *New project*. Elegí nombre, contraseña de base de datos y región (South America - São Paulo es la más cercana).

2. **Aplicar las migraciones**: en el dashboard → *SQL Editor* → pegá y ejecutá, **en orden**, el contenido de:
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_functions.sql`

3. **Activar Realtime**: dashboard → *Database → Replication* → habilitá la publicación para `task_instances`, `tasks` y `task_events` (así los cambios se reflejan al instante en todos los celulares).

4. **Generación diaria de instancias** (opcional pero recomendado): dashboard → *Database → Extensions* → habilitá `pg_cron`, y en el SQL Editor:
   ```sql
   select cron.schedule(
     'generar-instancias-diarias',
     '0 3 * * *',  -- todos los días a las 3 AM UTC
     $$ select public.generate_task_instances(7) $$
   );
   ```
   (La app igual llama a `generate_task_instances()` al abrir el dashboard, esto es solo un respaldo.)

5. **Autenticación**:
   - *Authentication → Providers → Email*: ya viene activado.
   - Google y Apple los configuramos más adelante (requieren credenciales de Google Cloud y Apple Developer; Apple es obligatorio recién al publicar en App Store).

6. **Claves para la app**: dashboard → *Settings → API*. Vas a necesitar el **Project URL** y la **anon key** cuando armemos la app Expo (van en un archivo `.env` que no se sube al repo).

## Desarrollo de la app

La app Expo vive en `app/`:

```
app/src/
├── app/                # Rutas (expo-router)
│   ├── (auth)/         # login y registro
│   ├── onboarding.tsx  # crear o unirse a un hogar
│   └── (tabs)/         # pantallas principales (requieren sesión + hogar)
├── components/         # UI reutilizable (Button, Input, ...)
├── lib/                # cliente Supabase, tipos y tema
└── providers/          # AuthProvider (sesión + perfil)
```

### Probar en el celular (Expo Go)

1. Instalá **Expo Go** desde Google Play / App Store.
2. En la PC:
   ```bash
   cd app
   cp .env.example .env   # y completá con tus claves de Supabase
   npm install
   npx expo start
   ```
3. Escaneá el QR que aparece en la terminal (con Expo Go en Android, o con la cámara en iPhone). El celular y la PC tienen que estar en la **misma red WiFi**.

> Para desarrollo, desactivá la confirmación de email en Supabase: *Authentication → Sign In / Providers → Email → Confirm email* en OFF. Si no, cada registro queda esperando el mail de confirmación.

## Notificaciones

Dos vías, ambas gratuitas:

- **Recordatorios locales** (funcionan ya, incluso en Expo Go): la app programa un aviso 60 minutos antes del vencimiento de tus tareas del día.
- **Push remotas** (asignaciones, reasignaciones, completadas y recordatorios server-side): las envía la propia base de datos con `pg_net` + `pg_cron` (migración `0006_notifications.sql`) llamando a la API de push de Expo. No requieren servidor propio.

> ⚠️ Desde el SDK 53, **Expo Go en Android no recibe push remotas**. Para probarlas hace falta un *development build* (ver sección de compilación) y un proyecto EAS (`npx eas init`), que agrega el `projectId` que la app usa para obtener el token. Sin eso, la app simplemente no registra el token y sigue funcionando con recordatorios locales.
