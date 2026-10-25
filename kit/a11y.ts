/* Blind players (owner, 2026-10-08: "perfekt spielbar", the site and every game playable with a
   screen reader, on a keyboard or on a phone). What every game needs for that and shares:

   - announce(): one voice for the page. Two live regions, polite and urgent, kept on window like
     the audio context, so the site and every copy of this module on a page speak through the same
     two. They are made once and then stay in the page: a region that is put in together with its
     text is often not read. Every message is a new line in its region (screen readers read what
     is added), so the same text twice is said twice and quick messages queue instead of cutting
     each other off. A line leaves again after a while; removing is never read.
   - press(): a press that also takes the click a screen reader sends. Games react on pointerdown
     to feel quick, but VoiceOver, TalkBack, NVDA and JAWS activate an element with a click alone,
     and the keyboard does too (Enter and Space on a button). press() answers both and never twice.
   - keyIsForControl(): a game's global keys stay out of the way of a focused control (a text
     field, a slider, a tab strip, a button's own Enter) and of shortcuts with a modifier.
   - focusGame(): where the keys go when the game begins (after Play on minigames.world's start
     screen, after a dialog closes): the element marked [data-game-focus].
   - useDialog(): a modal sheet done right: the rest of the page inert while it is open, focus in,
     Escape closes, focus back where it was.
   - srOnly: the style of text that is read but not seen. */

import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SyntheticEvent } from "react";

/** Text for screen readers only: in the page, read, never seen. */
export const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/* ---------- announce ---------- */

/** `held`: lines said before the regions had settled, in the order they were said. */
type Voice = { polite: HTMLElement; urgent: HTMLElement; last: string; born: number; held?: { target: HTMLElement; words: string }[] };

/** How long a line stays in its region before it leaves (a reader in browse mode may find it). */
export const LINE_MS = 8000;
/** A region needs a moment in the page before what is added to it is read. */
const SETTLE_MS = 150;

const ANNOUNCER = "data-mg-announcer";

function region(urgent: boolean): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute(ANNOUNCER, urgent ? "urgent" : "polite");
  element.setAttribute("aria-live", urgent ? "assertive" : "polite");
  element.setAttribute("aria-relevant", "additions");
  element.setAttribute("aria-atomic", "false");
  Object.assign(element.style, { ...srOnly, width: "1px", height: "1px", margin: "-1px" });
  document.body.appendChild(element);
  return element;
}

/** Puts the page's two live regions in place if they are not there yet. Call it early (the start
    screen does when it mounts), so the first message lands in a region that is already there. */
export function ensureAnnouncer(): Voice | null {
  if (typeof document === "undefined" || !document.body) return null;
  const page = window as unknown as { __minigamesVoice?: Voice };
  const voice = page.__minigamesVoice;
  if (voice && voice.polite.isConnected && voice.urgent.isConnected) return voice;
  const made: Voice = { polite: region(false), urgent: region(true), last: "", born: Date.now(), held: [] };
  page.__minigamesVoice = made;
  return made;
}

/** Says `text` to a screen reader. `urgent` interrupts (a refusal, a warning, the end of a run);
    everything else waits its turn. Keep it short and in the game's language; a number with its
    unit ("Energie 120"), a card with its name ("Pik-Dame"), never a glyph alone. */
export function announce(text: string, options: { urgent?: boolean } = {}) {
  const words = text.trim();
  if (!words) return;
  const voice = ensureAnnouncer();
  if (!voice) return;
  voice.last = words;
  const target = options.urgent ? voice.urgent : voice.polite;
  // What was said while the regions settled comes out first and in its order, in one go: a timer
  // per line can fire in either order, and a late one would let a later line jump ahead.
  const held = (voice.held ??= []);
  const age = Date.now() - voice.born;
  if (age >= SETTLE_MS && held.length === 0) return addLine(target, words);
  held.push({ target, words });
  if (held.length === 1)
    window.setTimeout(() => {
      for (const { target, words } of held.splice(0)) addLine(target, words);
    }, Math.max(0, SETTLE_MS - age));
}

function addLine(target: HTMLElement, words: string) {
  const line = document.createElement("p");
  line.textContent = words;
  line.style.margin = "0";
  target.appendChild(line);
  window.setTimeout(() => line.remove(), LINE_MS);
}

/** Says the last message again (a key for "what was that?"). */
export function repeatAnnouncement() {
  if (typeof window === "undefined") return;
  const voice = (window as unknown as { __minigamesVoice?: Voice }).__minigamesVoice;
  if (voice?.last) announce(voice.last);
}

/** The last message said, or "" (for tests and for a game's own history). */
export function lastAnnouncement(): string {
  if (typeof window === "undefined") return "";
  return (window as unknown as { __minigamesVoice?: Voice }).__minigamesVoice?.last ?? "";
}

/* ---------- press ---------- */

/** A pointer press and the click that follows it are one press. */
const SAME_PRESS_MS = 800;
const pressedAt = new WeakMap<EventTarget, number>();

type PressEvent<E extends Element> = SyntheticEvent<E, PointerEvent | MouseEvent>;

/** Handlers for an element that reacts to a press: on pointerdown (the primary button or a touch)
    for a quick feel, and on click for everything that sends only a click (a screen reader, the
    keyboard on a button). The click that follows a pointer press is skipped, so it never counts
    twice. Spread it on the element: `<button {...press(stamp)}>`. */
export function press<E extends Element>(handler: (event: PressEvent<E>) => void) {
  return {
    onPointerDown(event: ReactPointerEvent<E>) {
      if (event.button !== 0) return;
      pressedAt.set(event.currentTarget, Date.now());
      handler(event);
    },
    onClick(event: ReactMouseEvent<E>) {
      const at = pressedAt.get(event.currentTarget);
      if (at !== undefined && Date.now() - at < SAME_PRESS_MS) return;
      handler(event);
    },
  };
}

/* ---------- keys ---------- */

const EDITABLE = "input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=reset]), textarea, select, [contenteditable=''], [contenteditable=true]";
const COMPOSITE = "[role=tablist], [role=radiogroup], [role=listbox], [role=menu], [role=menubar], [role=grid], [role=tree], [role=toolbar], [role=slider], input[type=range]";
const ACTIVATES = "button, a[href], summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=menuitem], [role=option], input[type=checkbox], input[type=radio]";
const NAVIGATION = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

/** Does this key belong to the focused control rather than to the game's global shortcuts? True
    for any key with Ctrl, Alt or Meta held (the browser's and the screen reader's), for typing in
    a text field, for arrows and Home/End inside a composite control (tabs, radios, a grid, a
    slider), and for Enter or Space on a button or link (they press it). A game's window keydown
    handler starts with `if (keyIsForControl(event)) return;`. A game whose own play area is the
    focused element ([role=application] or its grid) handles those keys itself and is not asked. */
export function keyIsForControl(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) return true;
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== "function") return false;
  if (target.closest(EDITABLE)) return true;
  if (NAVIGATION.has(event.key) && target.closest(COMPOSITE)) return true;
  if ((event.key === "Enter" || event.key === " ") && target.closest(ACTIVATES)) return true;
  return false;
}

/* ---------- focus ---------- */

const FOCUS_TARGET = "[data-game-focus]";

function shown(element: HTMLElement): boolean {
  if (element.closest("[inert], [hidden], [aria-hidden=true]")) return false;
  const rects = element.getClientRects();
  return rects.length > 0;
}

/** Puts the keys on the game: the first shown element marked [data-game-focus] (its play area, its
    first control, the dialog it opens with). An element that cannot take focus by itself gets
    tabindex -1. Returns whether it found one; without, focus stays where it is. */
export function focusGame(): boolean {
  if (typeof document === "undefined") return false;
  const target = [...document.querySelectorAll<HTMLElement>(FOCUS_TARGET)].find(shown);
  if (!target) return false;
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

/* ---------- inert ---------- */

const KEEP_LIVE = `[${ANNOUNCER}], script, style, template, link, meta, next-route-announcer, .mg-back`;

/** Makes everything in the page inert except `keep`, the elements it stands in, the live regions
    and the way back. Returns a function that undoes exactly what it did. */
export function inertOutside(keep: Element): () => void {
  const made: HTMLElement[] = [];
  let node: Element | null = keep;
  while (node && node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert || sibling.matches(KEEP_LIVE)) continue;
      sibling.inert = true;
      made.push(sibling);
    }
    node = node.parentElement;
  }
  return () => {
    for (const element of made) element.inert = false;
  };
}

/* ---------- dialogs ---------- */

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export interface DialogOptions {
  /** Escape calls it; without, Escape does nothing here. */
  onClose?: () => void;
  /** What takes focus when it opens: a selector inside the dialog, or a function. Without, the
      element marked [data-autofocus], else the first control, else the dialog itself. */
  initialFocus?: string | (() => HTMLElement | null);
}

/** A modal sheet: give it role="dialog", aria-modal="true" and a name (aria-labelledby or
    aria-label), and call this with its ref and whether it is open. While it is open the rest of the
    page is inert (so Tab, a screen reader's reading and its touch exploration stay inside), focus
    moves in, and Escape closes when `onClose` is given. When it closes focus goes back to what had
    it before, or to the game ([data-game-focus]). */
export function useDialog(ref: RefObject<HTMLElement | null>, open: boolean, options: DialogOptions = {}) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const release = inertOutside(dialog);
    const chosen = latest.current.initialFocus;
    const first =
      (typeof chosen === "function" ? chosen() : chosen ? dialog.querySelector<HTMLElement>(chosen) : null) ??
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
    else {
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      dialog.focus({ preventScroll: true });
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !latest.current.onClose) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onClose();
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      release();
      // Back to where the player was, unless something else took focus meanwhile.
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected && !dialog.contains(active)) return;
      if (opener && opener.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
      else focusGame();
    };
  }, [open, ref]);
}
