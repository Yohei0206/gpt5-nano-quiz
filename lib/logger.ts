import { promises as fs } from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "gpt.log");

export async function logJsonLine(event: string, data: Record<string, any>) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), event, data }) + "\n";
    await fs.appendFile(LOG_FILE, line, { encoding: "utf8" });
  } catch {
    // ignore logging errors to avoid impacting main flow
  }
}

