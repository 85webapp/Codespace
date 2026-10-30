/** Lightweight, optional tactile and auditory feedback for supported browsers. */
let sharedAudioContext: AudioContext | null = null;
let lastHapticAt = 0;
let lastSuccessToneAt = 0;

const readPreference = (key: string, fallback: boolean): boolean => {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; } catch { return fallback; }
};

export type HapticInteraction = 'primary' | 'navigation' | 'minor';


/** Trigger a short vibration where the browser and device support it. */
export function triggerHaptic(durationMs = 20, interaction: HapticInteraction = 'primary'): void {
  try {
    if (!readPreference('cotrix_haptics_enabled', true)) return;
    if (readPreference('cotrix_haptics_primary_only', false) && interaction === 'minor') return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const now = Date.now();
    // Prevent duplicate bubbling/capture handlers from causing repeated vibrations.
    if (now - lastHapticAt < 35) return;
    lastHapticAt = now;
    // Some browsers expose vibrate but reject it in unsupported contexts.
    const accepted = navigator.vibrate(Math.max(10, Math.min(30, Math.round(durationMs))));
    if (!accepted) lastHapticAt = 0;
  } catch {
    // Haptics are progressive enhancement and must never interrupt the app.
  }
}

/** Play a very short, quiet synthesized confirmation tone after a successful action. */
export function playSuccessTone(): void {
  try {
    if (typeof window === 'undefined') return;
    if (!readPreference('cotrix_sound_enabled', true)) return;
    const now = Date.now();
    if (now - lastSuccessToneAt < 500) return;
    lastSuccessToneAt = now;

    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextConstructor();
    }
    const context = sharedAudioContext;
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(880, startAt + 0.07);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.15);
    oscillator.onended = () => {
      try { oscillator.disconnect(); gain.disconnect(); } catch { /* no-op */ }
    };
  } catch {
    // Audio can be unavailable or blocked by browser autoplay policies.
  }
}
