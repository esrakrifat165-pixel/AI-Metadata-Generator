import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { getProviderApiKeys, isKeyRotationError } from "../../../lib/api-keys";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type Provider =
  | "auto"
  | "gemini"
  | "openai"
  | "claude"
  | "grok";

type ImageInput = {
  name: string;
  type: string;
  data: string;
};

type Metadata = {
  title: string;
  description: string;
  keywords: string[];
  category: string;
  provider: string;
  model: string;
};

/* =========================================================
   PROMPT
========================================================= */


/* =========================================================
   KEYWORD QUALITY FILTER
========================================================= */

function cleanKeywords(input: unknown[], targetCount: number): string[] {
  const weakKeywords = new Set([
    "beautiful", "amazing", "awesome", "nice", "cool", "best",
    "perfect", "great", "lovely", "stunning", "wonderful",
    "fantastic", "classic", "popular", "professional",
    "creative", "artistic", "generic", "high quality",
  ]);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of input) {
    let keyword = String(item ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/^[,\s]+|[,\s]+$/g, "");

    if (!keyword) continue;
    if (keyword.startsWith("#")) continue;
    if (keyword.length < 2) continue;
    if (weakKeywords.has(keyword)) continue;

    const wordCount = keyword.split(" ").filter(Boolean).length;
    if (wordCount > 3) continue;

    if (seen.has(keyword)) continue;

    seen.add(keyword);
    result.push(keyword);

    if (result.length >= targetCount) break;
  }

  return result;
}

/* =========================================================
   PROMPT BUILDER
========================================================= */

function buildPrompt(platform: string, titleLength: number, keywordCount: number) {
  const platformRules: Record<string, string> = {
    General: `
- Focus on the exact visible subject, style, color, composition and texture.
- Create broadly useful stock metadata.`,
    "Adobe Stock": `
- Use natural, descriptive stock-search language.
- Put the strongest and most specific keywords first.
- Prioritize the primary subject before secondary details.
- Avoid keyword stuffing.
- Avoid speculative concepts that are not visually supported.`,
    Shutterstock: `
- Use concise and highly relevant searchable terminology.
- Prioritize the main subject, visual details, style and composition.
- Avoid irrelevant or repetitive keywords.`,
    Freepik: `
- Make the title descriptive and easy to search.
- Prioritize subject, design style, colors, composition and visual details.
- Keep keywords relevant to the actual artwork.`,
    Vecteezy: `
- Focus on the exact visual subject and design type.
- Use illustration, graphic design, background, icon or object terminology only when visually appropriate.
- Do not invent technical attributes.`,
    iStock: `
- Use precise descriptive language.
- Prioritize the primary subject and important visual details.
- Avoid keyword stuffing and unsupported concepts.`,
    Pond5: `
- Use clear descriptive terminology suitable for stock-media search.
- Prioritize visible subject, visual style, color, environment and composition.
- Avoid irrelevant keywords.`,
  };

  const rules = platformRules[platform] || platformRules.General;

  return `
You are an expert stock marketplace metadata specialist and SEO keyword researcher.

Analyze the supplied image VERY carefully before generating metadata.

TARGET PLATFORM:
${platform}

PLATFORM RULES:
${rules}

VISUAL ACCURACY RULES:
- Describe ONLY what is actually visible.
- Never invent people, animals, locations, brands, companies, trademarks, copyrighted characters, objects, materials, events or technical specifications.
- If something is uncertain, do not claim it as fact.
- Identify the primary subject first.
- Consider composition, orientation, colors, lighting, texture, style and background.
- Do not identify real people by name.
- Do not mention AI generation.

TITLE:
- Create ONE professional stock title.
- Target approximately ${titleLength} characters.
- Put the primary subject near the beginning.
- Use natural English.
- Be descriptive but concise.
- Avoid keyword stuffing and unnecessary adjectives.
- Do not use comma-separated keyword lists.
- Do not mention the filename.
- Do not use hashtags.
- Do not start with phrases like "Beautiful image of" or "Amazing background".

DESCRIPTION:
- Create ONE professional stock description around 120-180 characters.
- Describe the actual visible content naturally.
- Mention the primary subject first.
- Include useful visual details.
- Do not simply repeat the title.
- Do not create a keyword list.
- Do not mention AI generation or the filename.

KEYWORDS:
- Generate exactly ${keywordCount} relevant keywords when reasonably possible.
- Put the strongest and most specific keywords first.
- The first 10 keywords must be the most directly relevant terms.
- Use single words or short phrases.
- Maximum 3 words per keyword phrase.
- Keep keywords lowercase.
- Avoid duplicates and near-duplicates.
- Avoid irrelevant or generic filler terms.
- Do not use hashtags.
- Do not use brand names, trademarks or unsupported concepts.
- Every keyword must describe or strongly relate to something visually supported.
- For textures/backgrounds prioritize subject, material, surface, pattern, color, lighting and background.

CATEGORY:
- Choose ONE relevant stock category based on the actual visual subject.

FINAL CHECK:
- Verify title accuracy.
- Verify description accuracy.
- Verify the first 10 keywords are the strongest.
- Verify there are no duplicate or obvious filler keywords.
- Verify there are no unsupported claims or brand terms.
- Return ONLY valid JSON.

OUTPUT FORMAT:
{
  "title": "Professional stock title",
  "description": "Natural stock description",
  "keywords": ["keyword1", "keyword2"],
  "category": "Relevant category"
}
`;
}

function parseJSON(
  text: string,
  targetKeywordCount = 50
) {
  let cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (
    first !== -1 &&
    last !== -1 &&
    last > first
  ) {
    cleaned = cleaned.slice(
      first,
      last + 1
    );
  }

  let data: any;

  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "AI returned invalid JSON metadata."
    );
  }

  const rawKeywords =
    Array.isArray(data.keywords)
      ? data.keywords
          .map((item: unknown) =>
            String(item).trim()
          )
          .filter(Boolean)
      : [];

  const keywords = cleanKeywords(
    rawKeywords,
    targetKeywordCount
  );

  return {
    title: String(
      data.title || ""
    ).trim(),

    description: String(
      data.description || ""
    ).trim(),

    keywords,

    category:
      String(
        data.category || "General"
      ).trim() || "General",
  };
}

/* =========================================================
   EPS → PNG
========================================================= */

async function convertEPSToPNG(
  file: ImageInput
): Promise<ImageInput> {
  const tempFolder = path.join(
    os.tmpdir(),
    `stockai-${randomUUID()}`
  );

  await fs.mkdir(
    tempFolder,
    { recursive: true }
  );

  const epsPath = path.join(
    tempFolder,
    "input.eps"
  );

  const pngPath = path.join(
    tempFolder,
    "output.png"
  );

  try {
    const buffer = Buffer.from(
      file.data,
      "base64"
    );

    await fs.writeFile(
      epsPath,
      buffer
    );

    /*
      Your installed Ghostscript location:

      C:\Program Files\gs\gs10.08.0\bin\gswin64c.exe
    */

    const ghostscript =
      process.env.GHOSTSCRIPT_PATH ||
      "C:\\Program Files\\gs\\gs10.08.0\\bin\\gswin64c.exe";

    await execFileAsync(
      ghostscript,
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dEPSCrop",
        "-sDEVICE=pngalpha",
        "-r150",
        `-sOutputFile=${pngPath}`,
        epsPath,
      ],
      {
        windowsHide: true,
        timeout: 120000,
      }
    );

    const pngBuffer =
      await fs.readFile(
        pngPath
      );

    return {
      name: file.name,
      type: "image/png",
      data: pngBuffer.toString(
        "base64"
      ),
    };
  } catch (error) {
    console.error(
      "EPS conversion error:",
      error
    );

    throw new Error(
      "EPS conversion failed. Please check Ghostscript installation."
    );
  } finally {
    await fs.rm(
      tempFolder,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/* =========================================================
   GEMINI
   RETRY + MODEL FALLBACK
========================================================= */

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  /*
    429 quota/rate-limit errors are NOT retried.
    This prevents wasting quota by repeatedly calling
    the same API/model when the quota is already exhausted.
  */

  const maxAttempts = 2;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            apiKey,
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",

              parts: [
                {
                  text: prompt,
                },

                {
                  inline_data: {
                    mime_type:
                      file.type ||
                      "image/jpeg",

                    data:
                      file.data,
                  },
                },
              ],
            },
          ],

          generationConfig: {
            responseMimeType:
              "application/json",
          },
        }),
      }
    );

    const responseText =
      await response.text();

    if (response.ok) {
      let data: any;

      try {
        data =
          JSON.parse(
            responseText
          );
      } catch {
        throw new Error(
          "Gemini returned an invalid API response."
        );
      }

      const generated =
        data?.candidates?.[0]
          ?.content?.parts?.[0]
          ?.text;

      if (!generated) {
        throw new Error(
          "Gemini returned no metadata."
        );
      }

      const metadata =
        parseJSON(
          generated
        );

      return {
        ...metadata,
        provider: "Gemini",
        model,
      };
    }

    let message =
      responseText;

    try {
      const errorData =
        JSON.parse(
          responseText
        );

      message =
        errorData?.error?.message ||
        errorData?.message ||
        responseText;
    } catch {
      // Keep original message
    }

    console.error(
      `Gemini ${model} error:`,
      response.status,
      message
    );

    /* =========================
       429 QUOTA / RATE LIMIT
    ========================= */

    if (response.status === 429) {
      throw new Error(
        `GEMINI_QUOTA_EXCEEDED: Gemini API quota or rate limit has been exceeded. Please wait and try again later, or use another configured AI provider.`
      );
    }

    /* =========================
       AUTH / API KEY ERROR
    ========================= */

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        `GEMINI_AUTH_ERROR: Gemini API key was rejected. Please check your Gemini API key and API access.`
      );
    }

    /* =========================
       TEMPORARY SERVER ERRORS
       Only these are retried.
    ========================= */

    const temporary =
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;

    if (
      temporary &&
      attempt < maxAttempts
    ) {
      const delay =
        1500 *
        Math.pow(
          2,
          attempt - 1
        );

      console.log(
        `Retrying Gemini ${model} in ${delay / 1000}s...`
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            delay
          )
      );

      continue;
    }

    throw new Error(
      `Gemini ${response.status}: ${message}`
    );
  }

  throw new Error(
    `Gemini ${model} failed.`
  );
}


/* =========================================================
   OPENAI
========================================================= */

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model,

        input: [
          {
            role: "user",

            content: [
              {
                type:
                  "input_text",

                text:
                  prompt,
              },

              {
                type:
                  "input_image",

                image_url:
                  `data:${
                    file.type ||
                    "image/jpeg"
                  };base64,${file.data}`,
              },
            ],
          },
        ],
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    let message =
      responseText;

    try {
      const errorData =
        JSON.parse(
          responseText
        );

      message =
        errorData?.error?.message ||
        responseText;
    } catch {}

    throw new Error(
      `OpenAI ${response.status}: ${message}`
    );
  }

  let data: any;

  try {
    data =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      "OpenAI returned invalid JSON."
    );
  }

  const generated =
    data?.output_text;

  if (!generated) {
    throw new Error(
      "OpenAI returned no metadata."
    );
  }

  const metadata =
    parseJSON(
      generated
    );

  return {
    ...metadata,
    provider: "OpenAI",
    model,
  };
}

/* =========================================================
   CLAUDE
========================================================= */

async function callClaude(
  apiKey: string,
  model: string,
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-api-key":
          apiKey,

        "anthropic-version":
          "2023-06-01",
      },

      body: JSON.stringify({
        model,

        max_tokens: 2000,

        messages: [
          {
            role: "user",

            content: [
              {
                type:
                  "image",

                source: {
                  type:
                    "base64",

                  media_type:
                    file.type ||
                    "image/jpeg",

                  data:
                    file.data,
                },
              },

              {
                type:
                  "text",

                text:
                  prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    let message =
      responseText;

    try {
      const errorData =
        JSON.parse(
          responseText
        );

      message =
        errorData?.error?.message ||
        responseText;
    } catch {}

    throw new Error(
      `Claude ${response.status}: ${message}`
    );
  }

  let data: any;

  try {
    data =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      "Claude returned invalid JSON."
    );
  }

  const generated =
    data?.content?.find(
      (item: any) =>
        item?.type ===
        "text"
    )?.text;

  if (!generated) {
    throw new Error(
      "Claude returned no metadata."
    );
  }

  const metadata =
    parseJSON(
      generated
    );

  return {
    ...metadata,
    provider: "Claude",
    model,
  };
}

/* =========================================================
   GROK
========================================================= */

async function callGrok(
  apiKey: string,
  model: string,
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  const response = await fetch(
    "https://api.x.ai/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model,

        input: [
          {
            role: "user",

            content: [
              {
                type:
                  "input_image",

                image_url:
                  `data:${
                    file.type ||
                    "image/jpeg"
                  };base64,${file.data}`,
              },

              {
                type:
                  "input_text",

                text:
                  prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    let message =
      responseText;

    try {
      const errorData =
        JSON.parse(
          responseText
        );

      message =
        errorData?.error?.message ||
        responseText;
    } catch {}

    throw new Error(
      `Grok ${response.status}: ${message}`
    );
  }

  let data: any;

  try {
    data =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      "Grok returned invalid JSON."
    );
  }

  const generated =
    data?.output_text;

  if (!generated) {
    throw new Error(
      "Grok returned no metadata."
    );
  }

  const metadata =
    parseJSON(
      generated
    );

  return {
    ...metadata,
    provider: "Grok",
    model,
  };
}

/* =========================================================
   SELECTED PROVIDER
========================================================= */

async function generate(
  provider: Provider,
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  const geminiModel =
    process.env.GEMINI_MODEL ||
    "gemini-3.8-flash";

  const geminiModels = [
    ...new Set([
      geminiModel,
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
    ]),
  ];

  const openAIModel =
    process.env.OPENAI_MODEL ||
    "gpt-5.6";

  const claudeModel =
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-5";

  const grokModel =
    process.env.XAI_MODEL ||
    "grok-4.6";

  async function withKeyRotation<T>(
    keyProvider: "gemini" | "openai" | "claude" | "grok",
    fn: (apiKey: string) => Promise<T>
  ): Promise<T> {
    const keys = getProviderApiKeys(keyProvider);

    if (!keys.length) {
      const names = {
        gemini: "GEMINI_API_KEY_1..10",
        openai: "OPENAI_API_KEY_1..10",
        claude: "ANTHROPIC_API_KEY_1..10",
        grok: "XAI_API_KEY_1..10",
      } as const;
      throw new Error(`${names[keyProvider]} is missing in .env.local.`);
    }

    let lastError: unknown = null;

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];

      try {
        console.log(`${keyProvider}: using API key ${index + 1}/${keys.length}`);
        return await fn(key);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);

        if (isKeyRotationError(error) && index < keys.length - 1) {
          console.warn(`${keyProvider}: key ${index + 1} failed; rotating to key ${index + 2}.`);
          continue;
        }

        throw new Error(message);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("All configured API keys failed.");
  }

  if (provider === "gemini") {
    return withKeyRotation("gemini", async (apiKey) => {
      let lastError = "";

      for (const model of geminiModels) {
        try {
          console.log(`Trying Gemini model: ${model}`);
          return await callGemini(apiKey, model, prompt, file);
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown Gemini error.";

          // Quota/auth errors must escape immediately so the key-rotation
          // wrapper can move to the next Gemini key.
          if (isKeyRotationError(error)) throw error;

          console.error(`Gemini ${model} failed:`, lastError);
        }
      }

      throw new Error(`All Gemini models failed. Last error: ${lastError}`);
    });
  }

  if (provider === "openai") {
    return withKeyRotation("openai", (apiKey) =>
      callOpenAI(apiKey, openAIModel, prompt, file)
    );
  }

  if (provider === "claude") {
    return withKeyRotation("claude", (apiKey) =>
      callClaude(apiKey, claudeModel, prompt, file)
    );
  }

  if (provider === "grok") {
    return withKeyRotation("grok", (apiKey) =>
      callGrok(apiKey, grokModel, prompt, file)
    );
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/* =========================================================
   AUTO MODE
========================================================= */

async function autoGenerate(
  prompt: string,
  file: ImageInput
): Promise<Metadata> {
  const providers: Provider[] = [
    "gemini",
    "openai",
    "claude",
    "grok",
  ];

  let lastError =
    "No AI provider is configured.";

  for (
    const provider of providers
  ) {
    try {
      const result =
        await generate(
          provider,
          prompt,
          file
        );

      return result;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Unknown AI error.";

      console.error(
        `${provider} failed in auto mode:`,
        lastError
      );
    }
  }

  throw new Error(
    `All configured AI providers failed. Last error: ${lastError}`
  );
}

/* =========================================================
   PREPARE FILE
========================================================= */

async function prepareFile(
  file: ImageInput
): Promise<ImageInput> {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  if (extension === "eps") {
    console.log(
      `Converting EPS: ${file.name}`
    );

    return convertEPSToPNG(
      file
    );
  }

  return file;
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    let files: ImageInput[] = [];
    let settings: any = {};

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const uploaded = form.get("file");

      if (!(uploaded instanceof File)) {
        return NextResponse.json(
          {
            success: false,
            message: "No file was uploaded.",
          },
          { status: 400 }
        );
      }

      const maxFileBytes = 4 * 1024 * 1024;

      if (uploaded.size > maxFileBytes) {
        return NextResponse.json(
          {
            success: false,
            message: "File is too large. Please use a file under 4 MB on Vercel.",
          },
          { status: 413 }
        );
      }

      const bytes = Buffer.from(
        await uploaded.arrayBuffer()
      );

      files = [
        {
          name: uploaded.name || "upload",
          type:
            uploaded.type ||
            (uploaded.name.toLowerCase().endsWith(".eps")
              ? "application/postscript"
              : "image/jpeg"),
          data: bytes.toString("base64"),
        },
      ];

      settings = {
        platform: String(form.get("platform") || "General"),
        provider: String(form.get("provider") || "auto"),
        titleLength: Number(form.get("titleLength") || 70),
        keywordCount: Number(form.get("keywordCount") || 50),
      };
    } else {
      const body = await request.json();
      files = body?.files as ImageInput[];
      settings = body?.settings || {};
    }

    const platform =
      settings.platform ||
      "General";

    const titleLength =
      Number(
        settings.titleLength ||
          70
      );

    const keywordCount =
      Number(
        settings.keywordCount ||
          50
      );

    const provider =
      (settings.provider ||
        "auto") as Provider;

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No files were uploaded.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      files.length > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Maximum 100 files are allowed.",
        },
        {
          status: 400,
        }
      );
    }

    const prompt =
      buildPrompt(
        platform,
        titleLength,
        keywordCount
      );

    const results: Array<
      Metadata & {
        fileName: string;
      }
    > = [];

    for (
      const originalFile of files
    ) {
      try {
        console.log(
          `Processing: ${originalFile.name}`
        );

        /*
          Convert EPS to PNG before
          sending the image to AI.
        */

        const aiFile =
          await prepareFile(
            originalFile
          );

        let metadata: Metadata;

        if (
          provider === "auto"
        ) {
          metadata =
            await autoGenerate(
              prompt,
              aiFile
            );
        } else {
          metadata =
            await generate(
              provider,
              prompt,
              aiFile
            );
        }

        results.push({
          fileName:
            originalFile.name,

          ...metadata,
        });

        console.log(
          `Completed: ${originalFile.name}`
        );
      } catch (error) {
        console.error(
          `Failed processing ${originalFile.name}:`,
          error
        );

        throw new Error(
          `${originalFile.name}: ${
            error instanceof Error
              ? error.message
              : "Unknown error."
          }`
        );
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error(
      "Generate metadata API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Metadata generation failed.",
      },
      {
        status: 500,
      }
    );
  }
}