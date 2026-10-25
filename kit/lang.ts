/* One language for minigames.world and every game on it. The visitor's last choice, made with the
   flags at the foot of the site or with a game's own switch, is kept under one key in this browser,
   so the site and each game start in it. Without a choice the browser's languages decide (a German
   browser gets German), and English is the fallback. Never Coming Back keeps the same rule in its
   own code, under the same key. */

export const LANG_KEY = "minigames.lang";

/** The language to start in, out of `supported` (its first entry is the fallback): `chosen` when it
    is supported, else the first of the browser's `languages` that is (by its main tag, so de-AT is
    German), else the fallback. */
export function pickLang<L extends string>(supported: readonly L[], chosen: string | null | undefined, languages: readonly string[] | undefined): L {
  const known = (tag: string | null | undefined) => supported.find((lang) => lang === tag);
  for (const tag of [chosen, ...(languages ?? []).map((tag) => String(tag).toLowerCase().split("-")[0])]) {
    const lang = known(tag);
    if (lang) return lang;
  }
  return supported[0];
}

/** The visitor's last choice, as stored (null when there is none or no storage). */
export function chosenLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/** The language a game (or the site) starts in, in the browser. `fresh` (the games' ?fresh pin, a
    first visit) leaves the stored choice out. */
export function startLang<L extends string>(supported: readonly L[], fresh = false): L {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickLang(supported, fresh ? null : chosenLang(), languages);
}

/** Remembers the visitor's choice for the site and every game. */
export function chooseLang(lang: string): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // without storage the choice holds for this page only
  }
}

/** startLang for a page's <head>, as a script that runs before anything is painted and puts the
    language on <html lang> (the site shows the text of that language, site.css). Plain old
    JavaScript, because it goes into the page as it is; test/lang.test.ts holds it to pickLang.
    `target` is the element to put it on, as an expression in that script: <html> by default; the
    start screen on a game's play page puts it on itself, leaving <html lang> to the game. */
export function langScript(supported: readonly string[], target = "document.documentElement"): string {
  return `(function(s,k){var c=null;try{c=localStorage.getItem(k)}catch(e){}var b=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language],l=s.indexOf(c)>=0?c:null;for(var i=0;!l&&i<b.length;i++){var t=String(b[i]).toLowerCase().split("-")[0];if(s.indexOf(t)>=0)l=t}${target}.lang=l||s[0]})(${JSON.stringify(supported)},${JSON.stringify(LANG_KEY)})`;
}
