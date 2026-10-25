/* The start signal and minigames.world's start screen (from the site's shared kit; this copy is
   trimmed to what the game uses). announceStart says the player has begun; in this copy nobody
   listens, so it is harmless.

   minigames.world puts a start screen in front of every game on its play pages, so the first
   press of every visit lands on one Play button. Browsers open audio only inside a press, so the
   start screen calls pressPlay() from its button, and a game that wants to open its sound or
   begin there and then listens with onPlay(). It is the game's loading screen too: a game that
   needs a while says so with reportLoading() and reportLoaded(). All of it is kept on the start
   screen itself ([data-play-gate], [data-loading], [data-played], --mg-progress). Without a
   start screen (this app on its own) onPlay runs at once and the rest does nothing. */

export const START_EVENT = "minigames:start";

export function announceStart() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(START_EVENT));
}

/* And the other way round: minigames.world puts its start screen in front of every game on its play
   pages (apps/web/components/PlayGate.tsx), so the first press of every visit lands on one Play
   button. Browsers open audio only inside a press, so the start screen calls pressPlay() from its
   button, and every game that wants to open its sound or begin there and then listens with onPlay().
   It is the game's loading screen too: a game that needs a while says so with reportLoading() (with
   how far it is, if it knows) and reportLoaded(); Play waits for that, so the press always reaches a
   game that is listening. A game that says nothing is ready when the page is.
   All of it is kept on the start screen itself ([data-play-gate], [data-loading], [data-played],
   --mg-progress), not in this module, so a game with its own copy of the kit sees the same. Without
   a start screen (a game's own dev app, its tests) onPlay runs at once and the rest does nothing. */

export const PLAY_EVENT = "minigames:play";
const GATE = "[data-play-gate]";

const gate = (): HTMLElement | null => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(GATE));

/** Does minigames.world's start screen stand in front of the game (pressed or not)? */
export function hasStartScreen(): boolean {
  return !!gate();
}

/** The game is loading: Play waits. `progress` from 0 to 1 fills the start screen's bar. */
export function reportLoading(progress?: number) {
  const element = gate();
  if (!element || element.hasAttribute("data-played")) return;
  element.setAttribute("data-loading", "");
  if (progress !== undefined) element.style.setProperty("--mg-progress", String(Math.min(1, Math.max(0, progress))));
}

/** The game has loaded: Play may be pressed. */
export function reportLoaded() {
  const element = gate();
  if (!element) return;
  element.style.setProperty("--mg-progress", "1");
  element.removeAttribute("data-loading");
}

/** Has the player pressed Play, or is there no start screen in front of the game? */
export function played(): boolean {
  const element = gate();
  return !element || element.hasAttribute("data-played");
}

/** Runs `then` once, when the player presses Play on the start screen: inside that press, so it may
    open audio. When it has already been pressed, or there is no start screen, `then` runs at once.
    Returns a function that cancels a call still waiting. */
export function onPlay(then: () => void): () => void {
  if (played()) {
    then();
    return () => {};
  }
  const listener = () => then();
  window.addEventListener(PLAY_EVENT, listener, { once: true });
  return () => window.removeEventListener(PLAY_EVENT, listener);
}

/** For the start screen's button, inside the press: marks `gate` as pressed and tells every game. */
export function pressPlay(gate: Element) {
  if (gate.hasAttribute("data-played")) return;
  gate.setAttribute("data-played", "");
  window.dispatchEvent(new Event(PLAY_EVENT));
}
