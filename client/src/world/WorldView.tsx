import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Phaser from "phaser";
import type { ProjectView, SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import type { CharacterInfo } from "@shared/character";
import { WorldScene } from "./WorldScene";
import WorldLabels from "./WorldLabels";

export interface WorldHandle {
  focus: (sessionId: string) => void;
  resetView: () => void;
  startRain: (seconds: number) => void;
}

interface Props {
  world: WorldInfo;
  characters: CharacterInfo[];
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  now: number;
  hourOverride: number | null;
  reducedMotion: boolean;
}

/**
 * Hosts one Phaser game for one world. The parent gives it a React `key` of
 * world id + version (+ character versions), so switching worlds or
 * hot-reloading a pack remounts it.
 */
const WorldView = forwardRef<WorldHandle, Props>(function WorldView(props, ref) {
  const { world, characters, sessions, projects, selectedId, hoveredId, onSelect, now, hourOverride, reducedMotion } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const latest = useRef({ sessions, selectedId, hoveredId, onSelect });
  latest.current = { sessions, selectedId, hoveredId, onSelect };

  useImperativeHandle(ref, () => ({
    focus: (id) => sceneRef.current?.focus(id),
    resetView: () => sceneRef.current?.resetView(),
    startRain: (s) => sceneRef.current?.startRain(s),
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new WorldScene(world, characters);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: world.def.palette.background,
      pixelArt: false,
      antialias: true,
      roundPixels: false,
      scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH, width: world.def.size.width, height: world.def.size.height },
      scene: [scene],
    });
    sceneRef.current = scene;
    scene.setInput(latest.current);
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
    // The world and cast are fixed for this mount (the parent remounts on change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setInput({ sessions, selectedId, hoveredId, onSelect });
  }, [sessions, selectedId, hoveredId, onSelect]);
  useEffect(() => sceneRef.current?.setHourOverride(hourOverride), [hourOverride]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: world.def.palette.background }}>
      <div ref={hostRef} className="absolute inset-0" />
      <WorldLabels wrapRef={wrapRef} sceneRef={sceneRef} world={world} sessions={sessions} projects={projects} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} now={now} />
    </div>
  );
});

export default WorldView;
