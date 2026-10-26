"use client";

/* The game as the player meets it: the loop that walks the wanderer, the camera that keeps them in
   view, the hands (keys, or a finger or the mouse held where to go), the few words over the glade,
   and the sound. The rules are in game/play.ts, the picture in lib/view.ts, the sound in
   lib/sound.ts.

   For blind players: the glade is a focusable play area (role="application", [data-game-focus])
   whose label lists the keys. Every place and every light found is said through the kit's live
   regions; H says where the nearest light (or the cave) is and how far, R says the last line again.
   The nearest light hums from its side and grows louder on the way to it, the waterfall roars from
   the left, and a rustle says the way is blocked.

   The day turns (game/sky.ts) and the weather changes (game/weather.ts) as the game runs; each
   turn of the day and each new weather is said. T moves the time on three hours and Y brings the
   next weather (the two buttons at the top do the same); ?hour=22&weather=rain in the address
   starts there (for pictures and tests). */

import { announce, focusGame, keyIsForControl, press, repeatAnnouncement } from "../kit/a11y";
import { startLang } from "../kit/lang";
import { announceStart, hasStartScreen, onPlay, reportLoaded, reportLoading } from "../kit/start";
import { useCallback, useEffect, useRef, useState } from "react";
import { caveOpen, compass, createPlay, nearestGoal, nearness, step, walkOn, type Play, type PlayEvent } from "../game/play";
import { advance, phaseOf, skyAt, START_HOUR, type DayPhase } from "../game/sky";
import { LOCALES, say, type LineKey, type Locale } from "../game/text";
import { airOf, changeTo, createWeather, flashOf, KINDS, stepWeather, type Kind, type WeatherEvent } from "../game/weather";
import { H, MOTES, W } from "../game/world";
import { createCamera, follow } from "../lib/camera";
import { setMusic, setSurroundings, soundEvent, startSound, thunder, updateSound } from "../lib/sound";
import { loadArt, View } from "../lib/view";

const MOVES: Record<string, [number, number]> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};

const PHASE_NAME: Record<DayPhase, LineKey> = { dawn: "nameDawn", day: "nameDay", dusk: "nameDusk", night: "nameNight" };
const KIND_NAME: Record<Kind, LineKey> = {
  clear: "nameClear",
  clouds: "nameClouds",
  rain: "nameRain",
  storm: "nameStorm",
  fog: "nameFog",
  snow: "nameSnow",
};

/** Small pictures for the hour and the weather, on a 16-pixel grid. */
const ICONS: Record<DayPhase | Kind, string> = {
  day: "M8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM7.25 0h1.5v2.5h-1.5zM7.25 13.5h1.5V16h-1.5zM0 7.25h2.5v1.5H0zM13.5 7.25H16v1.5h-2.5z",
  dawn: "M1 12h14v1.5H1zM8 6a4.5 4.5 0 0 1 4.5 4.5h-9A4.5 4.5 0 0 1 8 6zM7.25 1.5h1.5V4h-1.5zM2.2 4.6l1.06-1.06 1.7 1.7-1.06 1.06zM12.74 3.54l1.06 1.06-1.7 1.7-1.06-1.06z",
  dusk: "M1 12h14v1.5H1zM8 7.5a4 4 0 0 1 4 3h-8a4 4 0 0 1 4-3zM3 14.5h10V16H3z",
  night: "M10 1a7 7 0 1 0 5 11.9A6 6 0 0 1 10 1z",
  clear: "M8 5a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM7.25 1h1.5v2h-1.5zM7.25 13h1.5v2h-1.5zM1 7.25h2v1.5H1zM13 7.25h2v1.5h-2z",
  clouds: "M4.5 12A3.5 3.5 0 0 1 4 5.05 4.5 4.5 0 0 1 12.6 6.1 3 3 0 0 1 12.5 12z",
  rain: "M4.5 9A3.5 3.5 0 0 1 4 2.05 4.5 4.5 0 0 1 12.6 3.1 3 3 0 0 1 12.5 9zM4 11h1.5v3H4zM7.25 11h1.5v4h-1.5zM10.5 11H12v3h-1.5z",
  storm: "M4.5 9A3.5 3.5 0 0 1 4 2.05 4.5 4.5 0 0 1 12.6 3.1 3 3 0 0 1 12.5 9zM8.5 9.5 6 13h2l-1 3 3.5-4.5h-2l1-2z",
  fog: "M1 4h14v1.5H1zM3 7.5h12V9H3zM1 11h12v1.5H1z",
  snow: "M7.25 1h1.5v14h-1.5zM1 7.25h14v1.5H1zM2.7 3.76l1.06-1.06 9.54 9.54-1.06 1.06zM12.24 2.7l1.06 1.06-9.54 9.54-1.06-1.06z",
};
/** How much closer than the whole glade the camera stands: the glade is about a screen and a half
    wide, and the wanderer big enough to read. Rounded to whole screen pixels per pixel
    (lib/camera.ts), so it comes out a little more or less. */
const ZOOM = 1.4;

export default function Game() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const homeButton = useRef<HTMLButtonElement>(null);
  const playRef = useRef<Play>(createPlay());
  const keys = useRef(new Set<string>());
  const target = useRef<{ x: number; y: number } | null>(null);
  const holding = useRef(false);
  const started = useRef(false);
  const localeRef = useRef<Locale>("en");
  const hour = useRef(START_HOUR);
  const weather = useRef(createWeather("clear"));
  const dayPhase = useRef<DayPhase>(phaseOf(START_HOUR));

  const [locale, setLocale] = useState<Locale>("en");
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [lights, setLights] = useState(0);
  const [home, setHome] = useState(false);
  const [music, setMusicOn] = useState(true);
  const [skyNow, setSkyNow] = useState<{ phase: DayPhase; kind: Kind }>({ phase: phaseOf(START_HOUR), kind: "clear" });

  const speak = useCallback((key: LineKey, params?: Record<string, string | number>) => {
    // Spoken for blind players only: the glade shows no words of its own (owner, 2026-10-25:
    // "Intro-Dialog entfernen, Text unten auch").
    announce(say(localeRef.current, key, params));
  }, []);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    announceStart();
    speak("start");
    setRunning(true);
    if (!focusGame()) stageRef.current?.focus({ preventScroll: true });
  }, [speak]);

  // Language, the start screen, the art.
  useEffect(() => {
    // ?at=x,y starts the wanderer there (for pictures and tests).
    const at = new URLSearchParams(window.location.search).get("at")?.split(",").map(Number);
    if (at && at.length === 2 && at.every(Number.isFinite)) [playRef.current.hero.x, playRef.current.hero.y] = at;
    const query = new URLSearchParams(window.location.search);
    const startHour = Number(query.get("hour"));
    if (query.has("hour") && Number.isFinite(startHour)) hour.current = ((startHour % 24) + 24) % 24;
    const startKind = query.get("weather") as Kind | null;
    if (startKind && KINDS.includes(startKind)) weather.current = createWeather(startKind);
    dayPhase.current = phaseOf(hour.current);
    setSkyNow({ phase: dayPhase.current, kind: weather.current.to });
    const lang = startLang(LOCALES);
    localeRef.current = lang;
    setLocale(lang);
    const withGate = hasStartScreen();
    if (withGate) reportLoading(0);
    let live = true;
    loadArt((share) => reportLoading(share * 0.95)).then((art) => {
      if (!live || !canvasRef.current) return;
      viewRef.current = new View(canvasRef.current, art);
      reportLoaded();
      setReady(true);
    });
    const stopSound = startSound();
    const cancelPlay = withGate ? onPlay(begin) : () => {};
    return () => {
      live = false;
      stopSound();
      cancelPlay();
    };
  }, [begin]);

  const viewRef = useRef<View | null>(null);

  const onWeather = useCallback(
    (event: WeatherEvent) => {
      if (event.type === "lightning") {
        // Thunder follows, sooner when the storm is near.
        thunder(0.4 + Math.random() * 2.2);
        return;
      }
      setSkyNow((now) => ({ ...now, kind: event.kind }));
      speak(event.kind);
    },
    [speak],
  );

  /** The hour moved: say the new part of the day when it starts. */
  const onHour = useCallback(
    (spoken: boolean) => {
      const phase = phaseOf(hour.current);
      if (phase === dayPhase.current) return;
      dayPhase.current = phase;
      setSkyNow((now) => ({ ...now, phase }));
      if (spoken) speak(phase);
    },
    [speak],
  );

  const onEvent = useCallback(
    (event: PlayEvent) => {
      soundEvent(event);
      const play = playRef.current;
      switch (event.type) {
        case "gather":
          setLights(event.count);
          if (event.count < MOTES.length) speak("gather", { n: event.count });
          break;
        case "open":
          speak("open");
          break;
        case "place":
          speak(event.id === "cave" ? (caveOpen(play) ? "caveOpen" : "caveDark") : event.id);
          break;
        case "home":
          setHome(true);
          announce(say(localeRef.current, "title") + ". " + say(localeRef.current, "home"));
          break;
        case "bump":
          break;
      }
    },
    [speak],
  );

  // The loop.
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    let stuck = 0;
    const camera = createCamera();
    // ?zoom=1 shows the whole glade one to one (for pictures of it: tools/frames.mjs).
    const zoom = Number(new URLSearchParams(window.location.search).get("zoom")) || ZOOM;
    // ?promo=1: the camera aims where window.hotlCamera says instead of at the wanderer (the
    // promo video's own shots, tools/promo/short.mjs); it eases there as it does after the wanderer.
    const promo = new URLSearchParams(window.location.search).has("promo");
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const play = playRef.current;
      let dx = 0;
      let dy = 0;
      for (const key of keys.current) {
        dx += MOVES[key][0];
        dy += MOVES[key][1];
      }
      if (dx || dy) target.current = null;
      else if (target.current) {
        const tx = target.current.x - play.hero.x;
        const ty = target.current.y - play.hero.y;
        const distance = Math.hypot(tx, ty);
        if (distance < 2) target.current = holding.current ? target.current : null;
        else [dx, dy] = [tx / distance, ty / distance];
      }
      const events = started.current ? step(play, dx, dy, dt) : [];
      stuck = events.some((e) => e.type === "bump") ? stuck + dt : 0;
      if (stuck > 0.5 && !holding.current) target.current = null;
      for (const event of events) onEvent(event);
      if (started.current) {
        hour.current = advance(hour.current, dt);
        onHour(true);
        for (const event of stepWeather(weather.current, dt)) onWeather(event);
      }
      const w = weather.current;
      const sky = skyAt(hour.current);
      const air = airOf(w);
      setSurroundings(air, sky.night, w.cover);
      updateSound(play, viewRef.current?.groundAt(play.hero.x, play.hero.y));
      viewRef.current?.draw(play, now / 1000, { sky, air, cover: w.cover, wet: w.wet, flash: flashOf(w), hour: hour.current });

      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (stage && canvas) {
        const aim = promo ? (window as unknown as { hotlCamera?: { x: number; y: number; zoom?: number } }).hotlCamera : undefined;
        const shown = follow(camera, aim?.x ?? play.hero.x, aim?.y ?? play.hero.y - 16, stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1, aim?.zoom ?? zoom, dt);
        canvas.style.transform = `translate(${-shown.left * shown.scale}px, ${-shown.top * shown.scale}px) scale(${shown.scale})`;
        viewRef.current?.shows(shown.left, shown.top, stage.clientWidth / shown.scale, stage.clientHeight / shown.scale);
        const at = `${Math.round(play.hero.x)},${Math.round(play.hero.y)}`;
        if (stage.dataset.hero !== at) stage.dataset.hero = at;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, onEvent, onHour, onWeather]);

  const hint = useCallback(() => {
    const goal = nearestGoal(playRef.current);
    const lang = localeRef.current;
    const params = { dir: say(lang, compass(goal.dx, goal.dy)), dist: say(lang, nearness(goal.distance)) };
    speak(goal.kind === "cave" ? "nearestCave" : "nearestLight", params);
  }, [speak]);

  /** T, or the hour button: three hours on. */
  const moveTime = useCallback(() => {
    hour.current = (hour.current + 3) % 24;
    const before = dayPhase.current;
    onHour(false);
    const lang = localeRef.current;
    const said = say(lang, "hourNow", { hour: Math.floor(hour.current) });
    speak(dayPhase.current !== before ? dayPhase.current : "hourNow", { hour: Math.floor(hour.current) });
    if (dayPhase.current !== before) announce(said);
  }, [onHour, speak]);

  /** Y, or the weather button: the next kind of weather, in order. */
  const nextWeather = useCallback(() => {
    const now = weather.current.to;
    const next = KINDS[(KINDS.indexOf(now) + 1) % KINDS.length];
    for (const event of changeTo(weather.current, next, Math.random, true)) onWeather(event);
  }, [onWeather]);

  const toggleMusic = useCallback(() => {
    setMusicOn((on) => {
      setMusic(!on);
      announce(say(localeRef.current, on ? "musicOff" : "musicOn"));
      return !on;
    });
  }, []);

  // Keys, on the window, so the glade walks wherever focus is but in a control.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (keyIsForControl(event)) return;
      const key = event.key.toLowerCase();
      if (MOVES[key]) {
        event.preventDefault();
        keys.current.add(key);
        if (!started.current && ready) begin();
        return;
      }
      if (event.repeat) return;
      if (key === "h") hint();
      else if (key === "r") repeatAnnouncement();
      else if (key === "m") toggleMusic();
      else if (key === "t") moveTime();
      else if (key === "y") nextWeather();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [ready, begin, hint, toggleMusic, moveTime, nextWeather]);

  useEffect(() => {
    if (home) homeButton.current?.focus({ preventScroll: true });
  }, [home]);

  const toScene = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) * W) / rect.width, y: ((clientY - rect.top) * H) / rect.height };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (home || event.button !== 0) return;
    if ((event.target as Element).closest("button")) return;
    // Without the site's start screen the first press is the start (it opens the audio too).
    if (!started.current) {
      if (ready) begin();
      else return;
    }
    target.current = toScene(event.clientX, event.clientY);
    holding.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (holding.current) target.current = toScene(event.clientX, event.clientY);
  };
  const onPointerUp = () => {
    holding.current = false;
  };

  const leaveLight = () => {
    walkOn(playRef.current);
    setHome(false);
    if (!focusGame()) stageRef.current?.focus({ preventScroll: true });
  };

  const t = (key: LineKey, params?: Record<string, string | number>) => say(locale, key, params);

  return (
    <div
      ref={stageRef}
      className="hotl-stage"
      role="application"
      tabIndex={0}
      data-game-focus
      data-lights={lights}
      data-ready={ready ? "" : undefined}
      data-started={running ? "" : undefined}
      data-home={home ? "" : undefined}
      aria-label={t("stage")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="hotl-canvas" aria-hidden="true" />

      <div className="hotl-panel hotl-lights" role="img" aria-label={t("lights", { n: lights })}>
        {MOTES.map((_, i) => (
          <span key={i} className="hotl-orb" data-lit={i < lights ? "" : undefined} />
        ))}
      </div>

      <div className="hotl-corner">
        <button
          type="button"
          className="hotl-panel hotl-icon"
          aria-label={t("skyLabel", { time: t(PHASE_NAME[skyNow.phase]), weather: t(KIND_NAME[skyNow.kind]) })}
          {...press(() => moveTime())}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={ICONS[skyNow.phase]} />
          </svg>
        </button>
        <button
          type="button"
          className="hotl-panel hotl-icon"
          aria-label={t("weatherLabel", { weather: t(KIND_NAME[skyNow.kind]) })}
          {...press(() => nextWeather())}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={ICONS[skyNow.kind]} />
          </svg>
        </button>
        <button
          type="button"
          className="hotl-panel hotl-icon hotl-music"
          aria-pressed={music}
          aria-label={t(music ? "musicOn" : "musicOff")}
          {...press(() => toggleMusic())}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 2h8v9.5a2.5 2.5 0 1 1-2-2.45V5H8v7.5A2.5 2.5 0 1 1 6 10.05z" />
          </svg>
        </button>
      </div>


      {home && (
        <div className="hotl-home">
          <h1>{t("title")}</h1>
          <p>{t("home")}</p>
          <button ref={homeButton} type="button" className="hotl-button" {...press(leaveLight)}>
            {t("walkOn")}
          </button>
        </div>
      )}
    </div>
  );
}
