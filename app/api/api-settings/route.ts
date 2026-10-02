import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type ApiProvider = "gemini" | "openai" | "claude" | "grok";

const CONFIG: Record<
  ApiProvider,
  {
    env: string;
    label: string;
  }
> = {
  gemini: {
    env: "GEMINI_API_KEY",
    label: "Gemini",
  },
  openai: {
    env: "OPENAI_API_KEY",
    label: "OpenAI / ChatGPT",
  },
  claude: {
    env: "ANTHROPIC_API_KEY",
    label: "Claude",
  },
  grok: {
    env: "XAI_API_KEY",
    label: "Grok",
  },
};

function isProvider(value: unknown): value is ApiProvider {
  return (
    value === "gemini" ||
    value === "openai" ||
    value === "claude" ||
    value === "grok"
  );
}

function envPath() {
  return path.join(process.cwd(), ".env.local");
}

function readEnv() {
  const file = envPath();

  if (!fs.existsSync(file)) {
    return "";
  }

  return fs.readFileSync(file, "utf8");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setEnvValue(
  content: string,
  key: string,
  value: string
) {
  const regex = new RegExp(
    `^${escapeRegex(key)}=.*$`,
    "m"
  );

  const line = `${key}=${value}`;

  if (regex.test(content)) {
    return content.replace(regex, line);
  }

  const separator =
    content.length && !content.endsWith("\n")
      ? "\n"
      : "";

  return `${content}${separator}${line}\n`;
}

function removeEnvValue(
  content: string,
  key: string
) {
  const regex = new RegExp(
    `^${escapeRegex(key)}=.*\\r?\\n?`,
    "m"
  );

  return content.replace(regex, "");
}

function maskKey(key: string) {
  if (!key) return "";

  if (key.length <= 8) {
    return "••••••••";
  }

  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function configured() {
  return {
    gemini: Boolean(
      process.env.GEMINI_API_KEY?.trim()
    ),
    openai: Boolean(
      process.env.OPENAI_API_KEY?.trim()
    ),
    claude: Boolean(
      process.env.ANTHROPIC_API_KEY?.trim()
    ),
    grok: Boolean(
      process.env.XAI_API_KEY?.trim()
    ),
  };
}

export async function GET() {
  try {
    const status = configured();

    return NextResponse.json({
      success: true,
      configured: status,
      masked: {
        gemini: status.gemini
          ? maskKey(
              process.env.GEMINI_API_KEY || ""
            )
          : "",
        openai: status.openai
          ? maskKey(
              process.env.OPENAI_API_KEY || ""
            )
          : "",
        claude: status.claude
          ? maskKey(
              process.env.ANTHROPIC_API_KEY || ""
            )
          : "",
        grok: status.grok
          ? maskKey(
              process.env.XAI_API_KEY || ""
            )
          : "",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not load API settings.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const provider = body?.provider;
    const apiKey = String(
      body?.apiKey || ""
    ).trim();

    if (!isProvider(provider)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid API provider.",
        },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Please enter an API key.",
        },
        { status: 400 }
      );
    }

    const config = CONFIG[provider];

    let content = readEnv();

    content = setEnvValue(
      content,
      config.env,
      apiKey
    );

    fs.writeFileSync(
      envPath(),
      content,
      "utf8"
    );

    process.env[config.env] = apiKey;

    return NextResponse.json({
      success: true,
      provider,
      label: config.label,
      configured: true,
      key: maskKey(apiKey),
      message: `${config.label} API key saved successfully.`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not save API key.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();

    const provider = body?.provider;

    if (!isProvider(provider)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid API provider.",
        },
        { status: 400 }
      );
    }

    const config = CONFIG[provider];

    let content = readEnv();

    content = removeEnvValue(
      content,
      config.env
    );

    fs.writeFileSync(
      envPath(),
      content,
      "utf8"
    );

    delete process.env[config.env];

    return NextResponse.json({
      success: true,
      provider,
      configured: false,
      message: `${config.label} API key removed successfully.`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not remove API key.",
      },
      { status: 500 }
    );
  }
}