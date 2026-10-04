import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Provider =
  | "gemini"
  | "openai"
  | "claude"
  | "groq";

const PROVIDERS: Record<
  Provider,
  {
    prefix: string;
    label: string;
  }
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

function getEnvPath() {
  return path.join(
    process.cwd(),
    ".env.local"
  );
}

function getEnvName(
  provider: Provider,
  index: number
) {
  return index === 1
    ? PROVIDERS[provider].prefix
    : `${PROVIDERS[provider].prefix}_${index}`;
}

function maskKey(value: string) {
  if (!value) return "";

  if (value.length <= 8) {
    return "••••••••";
  }

  return `${value.slice(
    0,
    4
  )}••••••••${value.slice(-4)}`;
}

function readEnvFile() {
  const filePath = getEnvPath();

  return fs.existsSync(filePath)
    ? fs.readFileSync(
        filePath,
        "utf8"
      )
    : "";
}

function escapeRegExp(
  value: string
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function writeEnvValue(
  source: string,
  envName: string,
  value: string
) {
  const escapedValue =
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

  const line =
    `${envName}="${escapedValue}"`;

  const pattern =
    new RegExp(
      `^\\s*${escapeRegExp(
        envName
      )}\\s*=.*$`,
      "m"
    );

  if (pattern.test(source)) {
    return source.replace(
      pattern,
      line
    );
  }

  const separator =
    source.length &&
    !source.endsWith("\n")
      ? "\n"
      : "";

  return `${source}${separator}${line}\n`;
}

function removeEnvValue(
  source: string,
  envName: string
) {
  const pattern =
    new RegExp(
      `^\\s*${escapeRegExp(
        envName
      )}\\s*=.*(?:\\r?\\n|$)`,
      "m"
    );

  return source.replace(
    pattern,
    ""
  );
}

function getProviderState(
  provider: Provider
) {
  return Array.from(
    {
      length: MAX_KEYS,
    },
    (_, i) => {
      const index = i + 1;

      const envName =
        getEnvName(
          provider,
          index
        );

      const key =
        process.env[
          envName
        ]?.trim() || "";

      return {
        index,
        configured: Boolean(key),
        maskedKey:
          maskKey(key),
      };
    }
  );
}

export async function GET() {
  const providers =
    (
      Object.keys(
        PROVIDERS
      ) as Provider[]
    ).reduce(
      (acc, provider) => {
        acc[provider] = {
          label:
            PROVIDERS[
              provider
            ].label,

          keys:
            getProviderState(
              provider
            ),
        };

        return acc;
      },
      {} as Record<
        Provider,
        {
          label: string;
          keys: ReturnType<
            typeof getProviderState
          >;
        }
      >
    );

  const keys =
    (
      Object.keys(
        PROVIDERS
      ) as Provider[]
    ).reduce(
      (acc, provider) => {
        acc[provider] =
          getProviderState(
            provider
          ).filter(
            (item) =>
              item.configured
          );

        return acc;
      },
      {} as Record<
        Provider,
        ReturnType<
          typeof getProviderState
        >
      >
    );

  return NextResponse.json({
    success: true,
    keys,
    providers,
  });
}

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const provider =
      body?.provider as Provider;

    const keyIndex = Number(
      body?.index ??
        body?.keyIndex ??
        1
    );

    const apiKey =
      typeof body?.apiKey ===
      "string"
        ? body.apiKey.trim()
        : "";

    const action =
      body?.action ===
      "remove"
        ? "remove"
        : "save";

    if (!PROVIDERS[provider]) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid API provider.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(
        keyIndex
      ) ||
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

    const envName =
      getEnvName(
        provider,
        keyIndex
      );

    let current =
      readEnvFile();

    if (action === "remove") {
      current =
        removeEnvValue(
          current,
          envName
        );

      fs.writeFileSync(
        getEnvPath(),
        current,
        "utf8"
      );

      delete process.env[
        envName
      ];

      return NextResponse.json({
        success: true,
        message:
          `${PROVIDERS[provider].label} Key ${keyIndex} removed.`,
      });
    }

    if (
      !apiKey ||
      apiKey.length < 8
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Please enter a valid API key.",
        },
        { status: 400 }
      );
    }

    current =
      writeEnvValue(
        current,
        envName,
        apiKey
      );

    fs.writeFileSync(
      getEnvPath(),
      current,
      "utf8"
    );

    process.env[envName] =
      apiKey;

    return NextResponse.json({
      success: true,
      index: keyIndex,
      key: maskKey(apiKey),
      message:
        `${PROVIDERS[provider].label} Key ${keyIndex} saved securely on the server.`,
    });
  } catch (error) {
    console.error(
      "API settings error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not update API key.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request
) {
  try {
    const body =
      await req.json();

    const provider =
      body?.provider as Provider;

    const index = Number(
      body?.index ??
        body?.keyIndex
    );

    if (
      !PROVIDERS[provider] ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > MAX_KEYS
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid provider or key number.",
        },
        { status: 400 }
      );
    }

    const envName =
      getEnvName(
        provider,
        index
      );

    const current =
      removeEnvValue(
        readEnvFile(),
        envName
      );

    fs.writeFileSync(
      getEnvPath(),
      current,
      "utf8"
    );

    delete process.env[
      envName
    ];

    return NextResponse.json({
      success: true,
      message:
        `${PROVIDERS[provider].label} Key ${index} removed.`,
    });
  } catch (error) {
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