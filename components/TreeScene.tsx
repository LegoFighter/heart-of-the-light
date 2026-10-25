"use client";

/* One tree, nothing else: the rig of lib/tree.ts on a canvas shown at a whole number of screen
   pixels per pixel, in the glade's palette, swaying in the glade's wind.

   The bare tree is a picture from OpenAI (owner, 2026-10-25: "den Stamm generier mit OpenAI
   Bildern"; public/assets/trunk.png, cut by tools/art/trunk.py), on whose twig tips the rig grows
   its twigs and leaves; ?grown=1 shows the tree grown wholly in code instead.

   Keys: ArrowUp / ArrowDown more or less wind, R grows other twigs and leaves (another tree when
   grown), L takes the leaves off and puts them back. The address can set the same:
   ?wind=0.8&seed=12&bare=1&grown=1. */

import { useEffect, useRef } from "react";
import { asset } from "../lib/asset";
import { grade } from "../lib/palette";
import { drawTree, growTree, leafTree, paintedTree, paintTree, shadedPicture, BARK, LEAF, type Painted, type Tree } from "../lib/tree";
import { nearest } from "../lib/view";

const W = 360;
const H = 350;
const FOOT_X = 180;
const FOOT_Y = 332;
const SKY = "#8ea7ad";

function hex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function rgb(h: string): number[] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load " + src));
    image.src = src;
  });
}

/** The painted bare tree (tools/art/trunk.py), its colours graded as the shader grades the glade
    and the wood in the crown's shadow. */
async function loadPainted(): Promise<Painted> {
  const [image, data] = await Promise.all([load(asset("trunk.png")), fetch(asset("trunk.json")).then((r) => r.json())]);
  const canvas = shadedPicture(image, 0, 0, image.width, image.height, ([r, g, b]) => {
    const out = grade([r / 255, g / 255, b / 255]);
    return [out[0] * 255, out[1] * 255, out[2] * 255];
  });
  return { image: canvas, w: image.width, h: image.height, foot: data.foot, tips: data.tips, twigs: data.twigs };
}

/** The painting's colours, so the tree is drawn in the glade's own palette. */
async function gladeColours(): Promise<number[][]> {
  const image = await load(asset("scene.png"));
  const probe = document.createElement("canvas");
  probe.width = image.width;
  probe.height = image.height;
  const c = probe.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(image, 0, 0);
  const data = c.getImageData(0, 0, image.width, image.height).data;
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return [...seen].map((v) => [v >> 16, (v >> 8) & 255, v & 255]);
}

export default function TreeScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const c = canvas.getContext("2d")!;
    const query = new URLSearchParams(window.location.search);
    let wind = Math.max(0, Math.min(1.5, Number(query.get("wind") ?? 0.8)));
    let seed = Number(query.get("seed") ?? 12);
    let bare = query.get("bare") === "1";
    // The painted bare tree with the rig grown on it, or (?grown=1) a tree grown wholly in code.
    const grown = query.get("grown") === "1";
    let painted: Painted | undefined;
    const make = () => (painted && !grown ? paintedTree(painted, seed) : leafTree(growTree(seed), seed));
    let tree: Tree = make();
    let stopped = false;
    if (!grown)
      loadPainted()
        .then((p) => {
          if (stopped) return;
          painted = p;
          tree = make();
        })
        .catch((e) => console.error(e));

    gladeColours()
      .then((colours) => {
        if (stopped) return;
        paintTree(
          LEAF.map((l) => hex(nearest(rgb(l), colours))),
          BARK.map((b) => hex(nearest(rgb(b), colours))),
        );
      })
      .catch(() => {});

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const n = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H)));
      const scale = n / dpr;
      canvas.style.width = W * scale + "px";
      canvas.style.height = H * scale + "px";
    };
    fit();
    window.addEventListener("resize", fit);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") wind = Math.min(1.5, wind + 0.1);
      else if (e.key === "ArrowDown") wind = Math.max(0, wind - 0.1);
      else if (e.key === "r" || e.key === "R") {
        seed = (seed * 7 + 3) % 1000;
        tree = make();
      } else if (e.key === "l" || e.key === "L") bare = !bare;
      else return;
      document.title = `Tree · wind ${wind.toFixed(1)} · seed ${seed}${bare ? " · bare" : ""}`;
    };
    window.addEventListener("keydown", onKey);

    const start = performance.now();
    let frame = 0;
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      c.fillStyle = SKY;
      c.fillRect(0, 0, W, H);
      drawTree(c, bare ? { ...tree, leaves: [], branches: tree.painted ? [] : tree.branches } : tree, FOOT_X, FOOT_Y, t, wind);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="hotl-tree" aria-label="A tree in the wind">
      <canvas ref={canvasRef} width={W} height={H} className="hotl-tree-canvas" />
    </div>
  );
}
