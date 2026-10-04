import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "gemini" | "openai" | "claude" | "groq";

const PROVIDERS: Record<
  Provider,
  { prefix: string; label: string }
> = {
  gemini: {
    prefix: "GEMINI_API_KEY",
    label: "Gemini",
  },
  openai: {
    prefix: "OPENAI_API_KEY",
    label: "OpenAI / ChatGPT",
  },
  claude: {
    prefix: "ANTHROPIC_API_KEY",
    label: "Claude",
  },
  groq: {
    prefix: "GROQ_API_KEY",
    label: "Groq",
  },
};

const MAX_KEYS = 10;

function getEnvName(provider: Provider, index: number) {
  return index === 1
    ? PROVIDERS[provider].prefix
    : `${PROVIDERS[provider].prefix}_${index}`;
}

function maskKey(value: string) {
  if (!value) return "";

  if (value.length <= 8) {
    return "••••••••";
  }

  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function getProviderState(provider: Provider) {
  return Array.from({ length: MAX_KEYS }, (_, i) => {
    const index = i + 1;

    const key =
      process.env[getEnvName(provider, index)]?.trim() || "";

    return {
      index,
      configured: Boolean(key),
      maskedKey: maskKey(key),
    };
  });
}

/* =========================
   GET API KEY STATUS
========================= */

export async function GET() {
  const providers = (
    Object.keys(PROVIDERS) as Provider[]
  ).reduce(
    (result, provider) => {
      const keys = getProviderState(provider);

      result[provider] = {
        label: PROVIDERS[provider].label,
        configuredCount: keys.filter(
          (item) => item.configured
        ).length,
        keys,
      };

      return result;
    },
    {} as Record<
      Provider,
      {
        label: string;
        configuredCount: number;
        keys: ReturnType<typeof getProviderState>;
      }
    >
  );

  return NextResponse.json(
    {
      success: true,
      providers,
      message:
        "API keys are managed through server environment variables. On Vercel, add them in Project Settings → Environment Variables.",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

/* =========================
   POST
========================= */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const provider = body?.provider as Provider;

    const keyIndex = Number(
      body?.index ?? body?.keyIndex ?? 1
    );

    if (!PROVIDERS[provider]) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid API provider.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(keyIndex) ||
      keyIndex < 1 ||
      keyIndex > MAX_KEYS
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "API key number must be between 1 and 10.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        code: "ENVIRONMENT_VARIABLES_REQUIRED",
        message:
          `${PROVIDERS[provider].label} Key ${keyIndex} cannot be saved from the live website. ` +
          "Add it in Vercel Project Settings → Environment Variables, then redeploy.",
        envName: getEnvName(provider, keyIndex),
      },
      { status: 409 }
    );
  } catch (error) {
    console.error("API settings POST error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not process API key settings.",
      },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE
========================= */

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const provider = body?.provider as Provider;

    const keyIndex = Number(
      body?.index ?? body?.keyIndex ?? 1
    );

    if (!PROVIDERS[provider]) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid API provider.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(keyIndex) ||
      keyIndex < 1 ||
      keyIndex > MAX_KEYS
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "API key number must be between 1 and 10.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        code: "ENVIRONMENT_VARIABLES_REQUIRED",
        message:
          `${PROVIDERS[provider].label} Key ${keyIndex} cannot be removed from the live website. ` +
          "Remove the corresponding environment variable from Vercel Project Settings → Environment Variables, then redeploy.",
        envName: getEnvName(provider, keyIndex),
      },
      { status: 409 }
    );
  } catch (error) {
    console.error("API settings DELETE error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not process API key removal.",
      },
      { status: 500 }
    );
  }
}