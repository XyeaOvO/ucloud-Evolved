import { Settings } from "../settings";

export function isHomeworkTrashEnabled(): boolean {
  return Settings.get("home", "enableHomeworkTrash") !== false;
}
