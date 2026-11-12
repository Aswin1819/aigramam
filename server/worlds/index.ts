import { CharacterManager, WorldManager } from "./manager";

/** The app's world and character managers (started from server/_core/index.ts). */
export const worldManager = new WorldManager();
export const characterManager = new CharacterManager();
