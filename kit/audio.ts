/* The page's one AudioContext, and opening it, for every game (owner, 2026-10-06: the audio
   activation leaves the games and goes to the start screen). Browsers open audio only inside a
   press. On minigames.world that press is Play on the start screen (apps/web/components/PlayGate.tsx
   calls unlockAudio()); anywhere else (a game's own dev app, its tests) the first press of any
   kind, wherever it lands. After that, every press wakes the context again if the browser put it
   to sleep (an iPhone after a call or a tab switch). The context is made in the press, never before:
   Chrome holds a context made earlier. A game asks for it with onAudio() and builds its own gains
   and buffers on it; it never makes a context of its own. Kept on window, so every copy of this
   module on a page shares it. */

type Shared = { context: AudioContext | null; waiting: Set<(context: AudioContext) => void>; listening: boolean };

const EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

function shared(): Shared {
  const page = window as unknown as { __minigamesAudio?: Shared };
  return (page.__minigamesAudio ??= { context: null, waiting: new Set(), listening: false });
}

function listen(state: Shared) {
  if (state.listening) return;
  state.listening = true;
  for (const type of EVENTS) window.addEventListener(type, () => void unlockAudio(), { capture: true, passive: true });
}

/** Opens the page's audio: makes the context on the first call, wakes it on every later one.
    Call it inside a press (the start screen does; so does every press once a game has asked for
    audio). Returns the context, or null without Web Audio. */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const state = shared();
  listen(state);
  try {
    if (!state.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      state.context = new Ctor();
    }
    const context = state.context;
    if (context.state !== "running") void context.resume().catch(() => {});
    // Older iOS Safari opens audio only when something starts inside the press.
    const blip = context.createBufferSource();
    blip.buffer = context.createBuffer(1, 1, context.sampleRate);
    blip.connect(context.destination);
    blip.start();
  } catch {
    // A browser that refuses: the game stays silent and playable.
  }
  const context = state.context;
  if (context) {
    const waiting = [...state.waiting];
    state.waiting.clear();
    for (const then of waiting) then(context);
  }
  return context;
}

/** Runs `then` with the page's context once it exists: at once if it does, else in the press that
    opens it. Returns a function that cancels a call still waiting. */
export function onAudio(then: (context: AudioContext) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const state = shared();
  listen(state);
  if (state.context) {
    then(state.context);
    return () => {};
  }
  state.waiting.add(then);
  return () => state.waiting.delete(then);
}

/** The page's context if it has been opened, else null. */
export function audioContext(): AudioContext | null {
  return typeof window === "undefined" ? null : shared().context;
}
