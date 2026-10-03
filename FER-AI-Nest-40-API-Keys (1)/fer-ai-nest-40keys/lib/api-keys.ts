// lib/api-keys.ts

export type APIProvider =
  | "gemini"
  | "openai"
  | "claude"
  | "grok";

export type APIKeyInfo = {
  provider: APIProvider;
  index: number;
  key: string;
  label: string;
};

const TOTAL_KEYS = 10;

/*
  ============================================================
  ENVIRONMENT VARIABLE NAMES
  ============================================================

  Gemini:
  GEMINI_API_KEY
  GEMINI_API_KEY_2
  ...
  GEMINI_API_KEY_10

  OpenAI:
  OPENAI_API_KEY_1
  ...
  OPENAI_API_KEY_10

  Claude:
  ANTHROPIC_API_KEY_1
  ...
  ANTHROPIC_API_KEY_10

  Grok:
  XAI_API_KEY_1
  ...
  XAI_API_KEY_10
*/

const providerConfig: Record<
  APIProvider,
  {
    label: string;
    prefix: string;
    legacy?: string;
  }
> = {
  gemini: {
    label: "Gemini",
    prefix: "GEMINI_API_KEY",
    legacy: "GEMINI_API_KEY",
  },

  openai: {
    label: "OpenAI",
    prefix: "OPENAI_API_KEY",
  },

  claude: {
    label: "Claude",
    prefix: "ANTHROPIC_API_KEY",
  },

  grok: {
    label: "Grok",
    prefix: "XAI_API_KEY",
  },
};


/*
  ============================================================
  INTERNAL ROUND-ROBIN POSITION
  ============================================================
*/

const currentIndex: Record<APIProvider, number> = {
  gemini: 0,
  openai: 0,
  claude: 0,
  grok: 0,
};


/*
  ============================================================
  GET ENV VARIABLE NAME
  ============================================================
*/

function getEnvName(
  provider: APIProvider,
  index: number
): string {
  const config = providerConfig[provider];

  /*
    Gemini Key 1 can use the existing
    GEMINI_API_KEY variable.
  */

  if (
    provider === "gemini" &&
    index === 1 &&
    process.env.GEMINI_API_KEY
  ) {
    return "GEMINI_API_KEY";
  }

  return `${config.prefix}_${index}`;
}


/*
  ============================================================
  GET ALL CONFIGURED KEYS
  ============================================================
*/

export function getProviderKeys(
  provider: APIProvider
): APIKeyInfo[] {
  const config = providerConfig[provider];

  const keys: APIKeyInfo[] = [];

  for (
    let index = 1;
    index <= TOTAL_KEYS;
    index++
  ) {
    const envName = getEnvName(
      provider,
      index
    );

    const value =
      process.env[envName]?.trim() || "";

    if (!value) {
      continue;
    }

    keys.push({
      provider,
      index,
      key: value,
      label: `${config.label} Key ${index}`,
    });
  }

  return keys;
}


/*
  ============================================================
  GET KEY COUNT
  ============================================================
*/

export function getProviderKeyCount(
  provider: APIProvider
): number {
  return getProviderKeys(provider).length;
}


/*
  ============================================================
  CHECK PROVIDER CONFIGURED
  ============================================================
*/

export function isProviderConfigured(
  provider: APIProvider
): boolean {
  return getProviderKeys(provider).length > 0;
}


/*
  ============================================================
  GET ALL PROVIDER STATUS
  ============================================================
*/

export function getAllProviderStatus() {
  return {
    gemini: {
      configured:
        isProviderConfigured("gemini"),
      keyCount:
        getProviderKeyCount("gemini"),
    },

    openai: {
      configured:
        isProviderConfigured("openai"),
      keyCount:
        getProviderKeyCount("openai"),
    },

    claude: {
      configured:
        isProviderConfigured("claude"),
      keyCount:
        getProviderKeyCount("claude"),
    },

    grok: {
      configured:
        isProviderConfigured("grok"),
      keyCount:
        getProviderKeyCount("grok"),
    },
  };
}


/*
  ============================================================
  MASK API KEY
  ============================================================
*/

export function maskApiKey(
  key: string
): string {
  if (!key) {
    return "";
  }

  if (key.length <= 8) {
    return "••••••••";
  }

  const first = key.slice(0, 4);
  const last = key.slice(-4);

  return `${first}••••••••${last}`;
}


/*
  ============================================================
  GET MASKED KEY STATUS
  ============================================================
*/

export function getMaskedProviderKeys(
  provider: APIProvider
) {
  return getProviderKeys(provider).map(
    (item) => ({
      provider: item.provider,
      index: item.index,
      label: item.label,
      maskedKey: maskApiKey(item.key),
    })
  );
}


/*
  ============================================================
  GET NEXT KEY
  ============================================================
*/

export function getNextApiKey(
  provider: APIProvider
): APIKeyInfo | null {
  const keys =
    getProviderKeys(provider);

  if (!keys.length) {
    return null;
  }

  const position =
    currentIndex[provider] %
    keys.length;

  const selected =
    keys[position];

  currentIndex[provider] =
    (position + 1) %
    keys.length;

  return selected;
}


/*
  ============================================================
  GET ORDERED KEY CANDIDATES
  ============================================================

  Example:

  Key 1 fails
      ↓
  Key 2
      ↓
  Key 3
      ↓
  Key 4

  ...

  Key 10
*/

export function getApiKeyCandidates(
  provider: APIProvider
): APIKeyInfo[] {
  const keys =
    getProviderKeys(provider);

  if (!keys.length) {
    return [];
  }

  const start =
    currentIndex[provider] %
    keys.length;

  const ordered: APIKeyInfo[] = [];

  for (
    let i = 0;
    i < keys.length;
    i++
  ) {
    const position =
      (start + i) % keys.length;

    ordered.push(
      keys[position]
    );
  }

  /*
    Move starting position forward
    for the next request.
  */

  currentIndex[provider] =
    (start + 1) %
    keys.length;

  return ordered;
}


/*
  ============================================================
  RESET KEY ROTATION
  ============================================================
*/

export function resetKeyRotation(
  provider?: APIProvider
) {
  if (provider) {
    currentIndex[provider] = 0;
    return;
  }

  currentIndex.gemini = 0;
  currentIndex.openai = 0;
  currentIndex.claude = 0;
  currentIndex.grok = 0;
}


/*
  ============================================================
  GET FIRST AVAILABLE KEY
  ============================================================
*/

export function getFirstAvailableKey(
  provider: APIProvider
): APIKeyInfo | null {
  const keys =
    getProviderKeys(provider);

  return keys.length
    ? keys[0]
    : null;
}


/*
  ============================================================
  FIND KEY BY INDEX
  ============================================================
*/

export function getApiKeyByIndex(
  provider: APIProvider,
  index: number
): APIKeyInfo | null {
  if (
    index < 1 ||
    index > TOTAL_KEYS
  ) {
    return null;
  }

  const envName =
    getEnvName(
      provider,
      index
    );

  const key =
    process.env[envName]?.trim() ||
    "";

  if (!key) {
    return null;
  }

  return {
    provider,
    index,
    key,
    label: `${providerConfig[provider].label} Key ${index}`,
  };
}


/*
  ============================================================
  GET TOTAL KEY CONFIGURATION
  ============================================================
*/

export function getAPIKeySummary() {
  const providers: APIProvider[] = [
    "gemini",
    "openai",
    "claude",
    "grok",
  ];

  return providers.reduce(
    (result, provider) => {
      result[provider] =
        getProviderKeyCount(
          provider
        );

      return result;
    },
    {} as Record<
      APIProvider,
      number
    >
  );
}


/*
  ============================================================
  EXPORT CONSTANT
  ============================================================
*/

export const API_KEY_LIMIT =
  TOTAL_KEYS;