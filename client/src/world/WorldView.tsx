import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { ProjectView, SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { WorldScene } from "./WorldScene";
import WorldLabels from "./WorldLabels";

interface Props {
  world: WorldInfo;
  sessions: SessionView[];
  projects: ProjectView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}

/**
 * Hosts one Phaser game for one world. The parent gives it a React `key` of
 * world id + version, so switching worlds or hot-reloading a world remounts it.
 */
export default function WorldView({ world, sessions, projects, selectedId, onSelect, now }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const latest = useRef({ sessions, selectedId, onSelect });
  latest.current = { sessions, selectedId, onSelect };

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new WorldScene(world);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: world.def.palette.background,
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: world.def.size.width, height: world.def.size.height },
      scene: [scene],
    });
    sceneRef.current = scene;
    scene.setInput(latest.current);
    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
    // The world object is fixed for this mount (parent remounts on change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setInput({ sessions, selectedId, onSelect });
  }, [sessions, selectedId, onSelect]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ background: world.def.palette.background }}>
      <div ref={hostRef} className="absolute inset-0" />
      <WorldLabels wrapRef={wrapRef} sceneRef={sceneRef} world={world} sessions={sessions} projects={projects} selectedId={selectedId} onSelect={onSelect} now={now} />
    </div>
  );
}
