/** On minigames.world the site serves this game's public/ under its own folder and sets NEXT_PUBLIC_ASSETS_HEART_OF_THE_LIGHT. */
const BASE = process.env.NEXT_PUBLIC_ASSETS_HEART_OF_THE_LIGHT ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Path to a file in `public/assets`, correct under any base path. */
export function asset(path: string): string {
  return BASE + "/assets/" + path;
}
