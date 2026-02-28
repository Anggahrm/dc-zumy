import path from "node:path";
import { fileURLToPath } from "node:url";

const filePath = fileURLToPath(import.meta.url);
const dirPath = path.dirname(filePath);

export const PROJECT_ROOT = path.resolve(dirPath, "..", "..");
