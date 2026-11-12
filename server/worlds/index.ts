import { CharacterAssignmentStore } from "../characters/assignments";
import { CharacterManager, WorldManager } from "./manager";

/** The app's world and character managers (started from server/_core/index.ts). */
export const worldManager = new WorldManager();
export const characterManager = new CharacterManager();
/** Which character each project uses, as chosen in the browser. */
export const characterAssignments = new CharacterAssignmentStore();
