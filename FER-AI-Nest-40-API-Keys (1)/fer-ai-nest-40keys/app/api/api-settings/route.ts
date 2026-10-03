import { NextResponse } from "next/server";
import {
  API_KEY_LIMIT,
  type ApiProvider,
  getEnvPath,
  getProviderEnvName,
  getProviderKeySlots,
  maskApiKey,
  readEnvFile,
  removeEnvValue,
  writeEnvValue,
} from "../../../lib/api-keys";
import fs from "node:fs";

export const runtime = "nodejs";

const PROVIDERS: Record<ApiProvider, { label: string }> = {
  gemini: { label: "Gemini" },
  openai: { label: "OpenAI / ChatGPT" },
  claude: { label: "Claude" },
  grok: { label: "Grok" },
};

function validProvider(value: unknown): value is ApiProvider {
  return typeof value === "string" && value in PROVIDERS;
}

function normalizeSlot(value: unknown): number | null {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot > API_KEY_LIMIT) return null;
  return slot;
}

function setRuntimeEnv(provider: ApiProvider, slot: number, value: string) {
  const baseName = getProviderEnvName(provider);
  process.env[`${baseName}_${slot}`] = value;
  if (slot === 1) process.env[baseName] = value;
}

function clearRuntimeEnv(provider: ApiProvider, slot: number) {
  const baseName = getProviderEnvName(provider);
  delete process.env[`${baseName}_${slot}`];
  if (slot === 1) delete process.env[baseName];
}

export async function GET() {
  const providers = (Object.keys(PROVIDERS) as ApiProvider[]).reduce(
    (acc, provider) => {
      acc[provider] = getProviderKeySlots(provider).map((slot) => ({
        index: slot.index,
        configured: slot.configured,
        key: maskApiKey(slot.value),
      }));
      return acc;
    },
    {} as Record<ApiProvider, { index: number; configured: boolean; key: string }[]>
  );

  return NextResponse.json({
    success: true,
    limit: API_KEY_LIMIT,
    providers,
  });
}

export async function POST(req: Request) {
  try {
    if (process.env.VERCEL === "1") {
      return NextResponse.json(
        {
          success: false,
          message:
            "On Vercel, API keys must be added in Project Settings → Environment Variables. The multi-key rotation system will read them automatically.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const provider = body?.provider as ApiProvider;
    const slot = normalizeSlot(body?.slot);
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

    if (!validProvider(provider)) {
      return NextResponse.json({ success: false, message: "Invalid API provider." }, { status: 400 });
    }

    if (!slot) {
      return NextResponse.json({ success: false, message: `Slot must be between 1 and ${API_KEY_LIMIT}.` }, { status: 400 });
    }

    if (!apiKey || apiKey.length < 8) {
      return NextResponse.json({ success: false, message: "Please enter a valid API key." }, { status: 400 });
    }

    const envName = `${getProviderEnvName(provider)}_${slot}`;
    const updated = writeEnvValue(readEnvFile(), envName, apiKey);
    fs.writeFileSync(getEnvPath(), updated, "utf8");
    setRuntimeEnv(provider, slot, apiKey);

    return NextResponse.json({
      success: true,
      provider,
      slot,
      key: maskApiKey(apiKey),
      message: `${PROVIDERS[provider].label} key ${slot} saved successfully.`,
    });
  } catch (error) {
    console.error("API settings save error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Could not save API key." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    if (process.env.VERCEL === "1") {
      return NextResponse.json(
        { success: false, message: "Manage production API keys from Vercel Environment Variables." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const provider = body?.provider as ApiProvider;
    const slot = normalizeSlot(body?.slot);

    if (!validProvider(provider) || !slot) {
      return NextResponse.json({ success: false, message: "Invalid provider or key slot." }, { status: 400 });
    }

    let updated = readEnvFile();
    updated = removeEnvValue(updated, `${getProviderEnvName(provider)}_${slot}`);

    // Slot 1 may have been created by the old single-key system.
    if (slot === 1) updated = removeEnvValue(updated, getProviderEnvName(provider));

    fs.writeFileSync(getEnvPath(), updated, "utf8");
    clearRuntimeEnv(provider, slot);

    return NextResponse.json({
      success: true,
      provider,
      slot,
      message: `${PROVIDERS[provider].label} key ${slot} removed.`,
    });
  } catch (error) {
    console.error("API settings remove error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Could not remove API key." },
      { status: 500 }
    );
  }
}
