import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Provider = "gemini" | "openai" | "claude" | "grok";

const PROVIDERS: Record<Provider, { prefix: string; label: string; key1: string }> = {
  gemini: { prefix: "GEMINI_API_KEY", label: "Gemini", key1: "GEMINI_API_KEY" },
  openai: { prefix: "OPENAI_API_KEY", label: "OpenAI / ChatGPT", key1: "OPENAI_API_KEY_1" },
  claude: { prefix: "ANTHROPIC_API_KEY", label: "Claude", key1: "ANTHROPIC_API_KEY_1" },
  grok: { prefix: "XAI_API_KEY", label: "Grok", key1: "XAI_API_KEY_1" },
};

function getEnvName(provider: Provider, index: number) {
  const config = PROVIDERS[provider];
  if (index === 1) return config.key1;
  return `${config.prefix}_${index}`;
}

function getEnvPath() {
  return path.join(process.cwd(), ".env.local");
}

function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function readEnvFile() {
  const filePath = getEnvPath();
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function writeEnvValue(source: string, envName: string, value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const line = `${envName}="${escaped}"`;
  const pattern = new RegExp(
    `^\\s*${envName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*$`,
    "m"
  );

  if (pattern.test(source)) return source.replace(pattern, line);

  const separator = source.length && !source.endsWith("\n") ? "\n" : "";
  return `${source}${separator}${line}\n`;
}

function removeEnvValue(source: string, envName: string) {
  const pattern = new RegExp(
    `^\\s*${envName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*(?:\\r?\\n|$)`,
    "m"
  );
  return source.replace(pattern, "");
}

function getKeys() {
  const result: Record<Provider, Array<{ index: number; label: string; maskedKey: string }>> = {
    gemini: [],
    openai: [],
    claude: [],
    grok: [],
  };

  (Object.keys(PROVIDERS) as Provider[]).forEach((provider) => {
    for (let index = 1; index <= 10; index++) {
      const envName = getEnvName(provider, index);
      const value = process.env[envName]?.trim() || "";
      if (!value) continue;
      result[provider].push({
        index,
        label: `${PROVIDERS[provider].label} Key ${index}`,
        maskedKey: maskKey(value),
      });
    }
  });

  return result;
}

export async function GET() {
  return NextResponse.json({ success: true, keys: getKeys() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider = body?.provider as Provider;
    const index = Number(body?.index);
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

    if (!PROVIDERS[provider] || !Number.isInteger(index) || index < 1 || index > 10) {
      return NextResponse.json({ success: false, message: "Invalid provider or key number." }, { status: 400 });
    }

    if (!apiKey || apiKey.length < 8) {
      return NextResponse.json({ success: false, message: "Please enter a valid API key." }, { status: 400 });
    }

    const envName = getEnvName(provider, index);
    const updated = writeEnvValue(readEnvFile(), envName, apiKey);
    fs.writeFileSync(getEnvPath(), updated, "utf8");
    process.env[envName] = apiKey;

    return NextResponse.json({
      success: true,
      provider,
      index,
      key: maskKey(apiKey),
      message: `${PROVIDERS[provider].label} Key ${index} saved successfully.`,
    });
  } catch (error) {
    console.error("API settings save error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not save API key." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const provider = body?.provider as Provider;
    const index = Number(body?.index);

    if (!PROVIDERS[provider] || !Number.isInteger(index) || index < 1 || index > 10) {
      return NextResponse.json({ success: false, message: "Invalid provider or key number." }, { status: 400 });
    }

    const envName = getEnvName(provider, index);
    const updated = removeEnvValue(readEnvFile(), envName);
    fs.writeFileSync(getEnvPath(), updated, "utf8");
    delete process.env[envName];

    return NextResponse.json({
      success: true,
      provider,
      index,
      message: `${PROVIDERS[provider].label} Key ${index} removed successfully.`,
    });
  } catch (error) {
    console.error("API settings remove error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not remove API key." }, { status: 500 });
  }
}
