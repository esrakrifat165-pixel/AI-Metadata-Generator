export type APIProvider =
  | "gemini"
  | "openai"
  | "claude"
  | "groq";

export type APIKeyInfo = {
  provider: APIProvider;
  index: number;
  key: string;
  label: string;
};

const TOTAL_KEYS = 10;

const providerConfig: Record<
  APIProvider,
  { label: string; prefix: string }
> = {
  gemini: {
    label: "Gemini",
    prefix: "GEMINI_API_KEY",
  },

  openai: {
    label: "OpenAI",
    prefix: "OPENAI_API_KEY",
  },

  claude: {
    label: "Claude",
    prefix: "ANTHROPIC_API_KEY",
  },

  groq: {
    label: "Groq",
    prefix: "GROQ_API_KEY",
  },
};

const currentIndex: Record<APIProvider, number> = {
  gemini: 0,
  openai: 0,
  claude: 0,
  groq: 0,
};

function getEnvName(
  provider: APIProvider,
  index: number
): string {
  if (index === 1) {
    return providerConfig[provider].prefix;
  }

  return `${providerConfig[provider].prefix}_${index}`;
}

export function getProviderKeys(
  provider: APIProvider
): APIKeyInfo[] {
  const keys: APIKeyInfo[] = [];

  for (
    let index = 1;
    index <= TOTAL_KEYS;
    index++
  ) {
    const key =
      process.env[
        getEnvName(provider, index)
      ]?.trim() || "";

    if (!key) continue;

    keys.push({
      provider,
      index,
      key,
      label: `${providerConfig[provider].label} Key ${index}`,
    });
  }

  return keys;
}

export function getProviderKeyCount(
  provider: APIProvider
): number {
  return getProviderKeys(provider).length;
}

export function isProviderConfigured(
  provider: APIProvider
): boolean {
  return getProviderKeys(provider).length > 0;
}

export function getAllProviderStatus() {
  return {
    gemini: {
      configured: isProviderConfigured("gemini"),
      keyCount: getProviderKeyCount("gemini"),
    },

    openai: {
      configured: isProviderConfigured("openai"),
      keyCount: getProviderKeyCount("openai"),
    },

    claude: {
      configured: isProviderConfigured("claude"),
      keyCount: getProviderKeyCount("claude"),
    },

    groq: {
      configured: isProviderConfigured("groq"),
      keyCount: getProviderKeyCount("groq"),
    },
  };
}

export function maskApiKey(
  key: string
): string {
  if (!key) return "";

  if (key.length <= 8) {
    return "••••••••";
  }

  return `${key.slice(
    0,
    4
  )}••••••••${key.slice(-4)}`;
}

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

export function getApiKeyCandidates(
  provider: APIProvider
): APIKeyInfo[] {
  const keys = getProviderKeys(provider);

  if (!keys.length) {
    return [];
  }

  const start =
    currentIndex[provider] % keys.length;

  const ordered: APIKeyInfo[] = [];

  for (
    let i = 0;
    i < keys.length;
    i++
  ) {
    ordered.push(
      keys[(start + i) % keys.length]
    );
  }

  currentIndex[provider] =
    (start + 1) % keys.length;

  return ordered;
}

export function getNextApiKey(
  provider: APIProvider
): APIKeyInfo | null {
  return (
    getApiKeyCandidates(provider)[0] ||
    null
  );
}

export function getFirstAvailableKey(
  provider: APIProvider
): APIKeyInfo | null {
  return (
    getProviderKeys(provider)[0] ||
    null
  );
}

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

  const key =
    process.env[
      getEnvName(provider, index)
    ]?.trim() || "";

  if (!key) return null;

  return {
    provider,
    index,
    key,
    label: `${providerConfig[provider].label} Key ${index}`,
  };
}

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
  currentIndex.groq = 0;
}

export function getAPIKeySummary() {
  const providers: APIProvider[] = [
    "gemini",
    "openai",
    "claude",
    "groq",
  ];

  return providers.reduce(
    (result, provider) => {
      result[provider] =
        getProviderKeyCount(provider);

      return result;
    },
    {} as Record<
      APIProvider,
      number
    >
  );
}

export const API_KEY_LIMIT =
  TOTAL_KEYS;