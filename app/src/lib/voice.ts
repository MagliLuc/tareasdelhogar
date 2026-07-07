import { Platform } from 'react-native';

// ------------------------------------------------------------
// Lectura en voz alta (TTS). expo-speech es módulo nativo: se carga
// diferido para no romper si un build viejo aún no lo incluye.
// Gran ayuda de accesibilidad para leer las respuestas de la IA.
// ------------------------------------------------------------
type SpeechModule = typeof import('expo-speech');
let speechCache: SpeechModule | null | undefined;

function getSpeech(): SpeechModule | null {
  if (speechCache !== undefined) return speechCache;
  try {
    speechCache = require('expo-speech') as SpeechModule;
  } catch {
    speechCache = null;
  }
  return speechCache;
}

export function speak(text: string) {
  if (Platform.OS === 'web') {
    try {
      const u = new globalThis.SpeechSynthesisUtterance(text);
      u.lang = 'es-AR';
      globalThis.speechSynthesis?.cancel();
      globalThis.speechSynthesis?.speak(u);
    } catch {
      // navegador sin soporte: ignorar
    }
    return;
  }
  const Speech = getSpeech();
  Speech?.speak(text, { language: 'es-AR' });
}

export function stopSpeaking() {
  if (Platform.OS === 'web') {
    globalThis.speechSynthesis?.cancel();
    return;
  }
  getSpeech()?.stop();
}

// ------------------------------------------------------------
// Dictado (voz → texto). En web usa la Web Speech API (funciona en
// la PWA de iPhone y en Chrome). En nativo, hasta agregar un módulo
// de reconocimiento, avisamos que no está disponible.
// ------------------------------------------------------------
export function isVoiceInputAvailable(): boolean {
  if (Platform.OS === 'web') {
    return !!(
      (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
      (globalThis as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    );
  }
  return false;
}

export function startVoiceInput(
  onResult: (text: string) => void,
  onError: (message: string) => void
): () => void {
  if (Platform.OS !== 'web') {
    onError('El dictado por voz está disponible en la versión web por ahora. Escribí tu mensaje.');
    return () => {};
  }
  try {
    const Ctor =
      (globalThis as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition ||
      (globalThis as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition;
    if (!Ctor) {
      onError('Tu navegador no soporta dictado por voz.');
      return () => {};
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new (Ctor as new () => unknown)();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onerror = () => onError('No se pudo escuchar. Probá de nuevo.');
    recognition.start();
    return () => recognition.stop();
  } catch {
    onError('No se pudo iniciar el dictado.');
    return () => {};
  }
}
