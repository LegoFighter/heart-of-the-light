/* Every line the game says, in English, German and Simplified Chinese. */

import type { Compass } from "./play";

export const LOCALES = ["en", "de", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

const LINES = {
  title: { en: "Heart of the Light", de: "Herz des Lichts", zh: "光之心" },
  goal: {
    en: "Gather the five lights, then carry them into the cave.",
    de: "Sammle die fünf Lichter und trag sie in die Höhle.",
    zh: "收集五道光，然后把它们带进洞穴。",
  },
  controls: {
    en: "Arrow keys or WASD to walk, or hold where you want to go.",
    de: "Pfeiltasten oder WASD zum Gehen, oder halte den Finger dorthin, wo du hinwillst.",
    zh: "用方向键或 WASD 行走，或按住想去的地方。",
  },
  begin: { en: "Begin", de: "Los", zh: "开始" },
  stage: {
    en: "Heart of the Light, a small glade. Arrow keys walk. H tells where the nearest light is, R says the last line again, M turns the music off and on, T moves the time on by three hours, Y changes the weather.",
    de: "Herz des Lichts, eine kleine Lichtung. Pfeiltasten zum Gehen. H sagt, wo das nächste Licht ist, R wiederholt den letzten Satz, M schaltet die Musik aus und an, T stellt die Zeit drei Stunden vor, Y wechselt das Wetter.",
    zh: "光之心，一片小小的林间空地。方向键行走。H 告诉你最近的光在哪里，R 重复上一句，M 开关音乐，T 让时间前进三小时，Y 切换天气。",
  },
  start: {
    en: "You stand on the path at the south edge of a glade. A waterfall to the left, a cottage to the right, a dark cave straight ahead.",
    de: "Du stehst auf dem Weg am Südrand einer Lichtung. Links ein Wasserfall, rechts eine Hütte, geradeaus eine dunkle Höhle.",
    zh: "你站在林间空地南边的小路上。左边是瀑布，右边是小屋，正前方是一个幽暗的洞穴。",
  },
  lights: { en: "Lights: {n} of 5", de: "Lichter: {n} von 5", zh: "光：{n}/5" },
  gather: {
    en: "A light joins your lantern. {n} of 5.",
    de: "Ein Licht geht in deine Laterne. {n} von 5.",
    zh: "一道光融入你的提灯。{n}/5。",
  },
  open: {
    en: "Your lantern burns bright. The cave is calling.",
    de: "Deine Laterne brennt hell. Die Höhle ruft.",
    zh: "你的提灯明亮燃烧。洞穴在召唤。",
  },
  pool: {
    en: "The waterfall roars into a cold, clear pool.",
    de: "Der Wasserfall rauscht in einen kalten, klaren Teich.",
    zh: "瀑布轰鸣着落入清冷的水潭。",
  },
  cottage: {
    en: "The door is shut. A note on it says: gone to the light.",
    de: "Die Tür ist zu. Ein Zettel daran: Bin beim Licht.",
    zh: "门关着。门上的纸条写着：去找光了。",
  },
  caveDark: {
    en: "Darkness breathes from the cave. Your lantern is too weak.",
    de: "Aus der Höhle atmet Dunkelheit. Deine Laterne ist zu schwach.",
    zh: "洞中黑暗涌动。你的提灯太弱了。",
  },
  caveOpen: { en: "The cave glows warm. Walk in.", de: "Die Höhle glüht warm. Geh hinein.", zh: "洞穴透出温暖的光。走进去吧。" },
  home: { en: "You carried the light home.", de: "Du hast das Licht heimgebracht.", zh: "你把光带回了家。" },
  walkOn: { en: "Walk on", de: "Weitergehen", zh: "继续前行" },
  nearestLight: { en: "The nearest light is {dir}, {dist}.", de: "Das nächste Licht ist {dir}, {dist}.", zh: "最近的光在{dir}，{dist}。" },
  nearestCave: { en: "The cave is {dir}, {dist}.", de: "Die Höhle ist {dir}, {dist}.", zh: "洞穴在{dir}，{dist}。" },
  clear: { en: "The sky clears.", de: "Der Himmel klart auf.", zh: "天空放晴了。" },
  clouds: { en: "Clouds gather over the glade.", de: "Wolken ziehen über der Lichtung auf.", zh: "云层在林间空地上空聚集。" },
  rain: { en: "Rain begins to fall.", de: "Es beginnt zu regnen.", zh: "开始下雨了。" },
  storm: { en: "A storm rolls in.", de: "Ein Gewitter zieht auf.", zh: "暴风雨来了。" },
  fog: { en: "Mist creeps into the glade.", de: "Nebel kriecht in die Lichtung.", zh: "薄雾悄悄漫进林间空地。" },
  snow: { en: "Snow begins to fall.", de: "Es beginnt zu schneien.", zh: "开始下雪了。" },
  dawn: { en: "Dawn breaks.", de: "Der Morgen dämmert.", zh: "天亮了。" },
  day: { en: "Morning light fills the glade.", de: "Morgenlicht füllt die Lichtung.", zh: "晨光洒满林间空地。" },
  dusk: { en: "The sun goes down.", de: "Die Sonne geht unter.", zh: "太阳落山了。" },
  night: { en: "Night falls. Your lantern lights the way.", de: "Es wird Nacht. Deine Laterne leuchtet dir den Weg.", zh: "夜幕降临。提灯为你照亮前路。" },
  hourNow: { en: "{hour} o'clock.", de: "{hour} Uhr.", zh: "{hour}点。" },
  skyLabel: { en: "{time}, {weather}. Press to move the time on.", de: "{time}, {weather}. Drücken stellt die Zeit vor.", zh: "{time}，{weather}。按下让时间前进。" },
  weatherLabel: { en: "{weather}. Press to change the weather.", de: "{weather}. Drücken wechselt das Wetter.", zh: "{weather}。按下切换天气。" },
  nameDawn: { en: "Dawn", de: "Morgengrauen", zh: "黎明" },
  nameDay: { en: "Day", de: "Tag", zh: "白天" },
  nameDusk: { en: "Dusk", de: "Abenddämmerung", zh: "黄昏" },
  nameNight: { en: "Night", de: "Nacht", zh: "夜晚" },
  nameClear: { en: "Clear", de: "Klar", zh: "晴" },
  nameClouds: { en: "Cloudy", de: "Bewölkt", zh: "多云" },
  nameRain: { en: "Rain", de: "Regen", zh: "雨" },
  nameStorm: { en: "Storm", de: "Gewitter", zh: "雷雨" },
  nameFog: { en: "Mist", de: "Nebel", zh: "雾" },
  nameSnow: { en: "Snow", de: "Schnee", zh: "雪" },
  musicOff: { en: "Music off.", de: "Musik aus.", zh: "音乐已关。" },
  musicOn: { en: "Music on.", de: "Musik an.", zh: "音乐已开。" },
  up: { en: "straight up", de: "geradeaus nach oben", zh: "正上方" },
  upRight: { en: "up and to the right", de: "oben rechts", zh: "右上方" },
  right: { en: "to the right", de: "rechts", zh: "右方" },
  downRight: { en: "down and to the right", de: "unten rechts", zh: "右下方" },
  down: { en: "straight down", de: "unten", zh: "正下方" },
  downLeft: { en: "down and to the left", de: "unten links", zh: "左下方" },
  left: { en: "to the left", de: "links", zh: "左方" },
  upLeft: { en: "up and to the left", de: "oben links", zh: "左上方" },
  veryClose: { en: "very close", de: "ganz nah", zh: "很近" },
  close: { en: "close", de: "nah", zh: "较近" },
  far: { en: "far", de: "weit", zh: "很远" },
} satisfies Record<string, Record<Locale, string>>;

export type LineKey = keyof typeof LINES;

export function say(locale: Locale, key: LineKey, params: Record<string, string | number> = {}): string {
  return LINES[key][locale].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}

export function direction(locale: Locale, way: Compass): string {
  return say(locale, way);
}
