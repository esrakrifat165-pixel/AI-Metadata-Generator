import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

/* =========================================================
   TYPES
========================================================= */

type ImageInput = {
  name: string;
  type?: string;
  data: string;
};

type PromptResult = {
  fileName: string;
  prompt: string;
  provider: string;
  model: string;
};

type GeminiResult = {
  prompt: string;
  model: string;
};

/* =========================================================
   GEMINI MODELS
========================================================= */

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

/* =========================================================
   GEMINI API KEY
========================================================= */

function getGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() || ""
  );
}

/* =========================================================
   CLEAN GENERATED PROMPT
========================================================= */

function cleanGeneratedPrompt(
  value: string
): string {
  return value
    .replace(
      /^```(?:text|markdown)?\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .replace(
      /^Prompt:\s*/i,
      ""
    )
    .trim();
}

/* =========================================================
   BUILD HIGH-QUALITY IMAGE PROMPT
========================================================= */

function buildImagePrompt(
  promptType: string,
  promptDetail: string
): string {
  return `
You are an expert AI image analyst and professional prompt engineer specializing in highly accurate image reconstruction.

Your task is to study the supplied reference image extremely carefully and create the BEST possible image-generation prompt that can recreate the visual appearance of the reference image as closely as possible.

PROMPT TYPE:
${promptType}

DETAIL LEVEL:
${promptDetail}

IMPORTANT OBJECTIVE:

Do NOT write a short caption or simple description.

Create a detailed, production-ready AI image-generation prompt based on the actual visual information visible in the reference image.

The final prompt should contain enough visual information that another AI image generator can recreate the same overall composition, appearance, colors, lighting, textures, atmosphere and visual style without seeing the original reference.

=========================================================
SUBJECT ANALYSIS
=========================================================

Identify and describe:

- Main subject
- Secondary subjects
- Number of visible objects
- Object shapes
- Object proportions
- Object size
- Object orientation
- Object position
- Pose or arrangement
- Relationship between objects
- Important visual characteristics

=========================================================
COMPOSITION ANALYSIS
=========================================================

Describe:

- Overall composition
- Layout
- Subject placement
- Object placement
- Spacing
- Alignment
- Symmetry or asymmetry
- Foreground
- Middle ground
- Background
- Visual hierarchy
- Negative space
- Cropping
- Framing
- Balance
- Direction of visual movement

=========================================================
CAMERA / VIEW ANALYSIS
=========================================================

When applicable describe:

- Camera angle
- Viewing direction
- Perspective
- Front view
- Side view
- Top view
- Three-quarter view
- Close-up
- Medium shot
- Wide shot
- Macro appearance
- Framing
- Crop
- Depth of field
- Lens-like characteristics
- Perspective distortion

Only include characteristics that are reasonably visible.

=========================================================
COLOR ANALYSIS
=========================================================

Describe:

- Dominant colors
- Secondary colors
- Accent colors
- Color palette
- Color intensity
- Saturation
- Brightness
- Contrast
- Gradient direction
- Gradient transitions
- Color relationships
- Warm or cool appearance
- Highlight colors
- Shadow colors

For abstract graphics pay special attention to exact color transitions and gradient behavior.

=========================================================
LIGHTING ANALYSIS
=========================================================

Describe:

- Main light source
- Light direction
- Light intensity
- Soft or hard lighting
- Highlights
- Shadows
- Shadow softness
- Glow
- Bloom
- Rim lighting
- Reflections
- Ambient light
- Light falloff
- Bright areas
- Dark areas

=========================================================
MATERIAL AND TEXTURE ANALYSIS
=========================================================

When visible describe:

- Material
- Surface finish
- Texture
- Smoothness
- Roughness
- Gloss
- Matte finish
- Metallic appearance
- Glass
- Plastic
- Fabric
- Paper
- Wood
- Stone
- Transparency
- Grain
- Noise
- Film grain
- Surface imperfections

=========================================================
BACKGROUND ANALYSIS
=========================================================

Describe:

- Background color
- Background gradient
- Background objects
- Environment
- Patterns
- Blur
- Atmospheric effects
- Glow
- Shadows
- Clean background
- Detailed background
- Negative space
- Background depth

=========================================================
STYLE ANALYSIS
=========================================================

Describe the visible style such as:

- Modern
- Minimal
- Premium
- Editorial
- Commercial
- Cinematic
- Photographic
- Abstract
- Graphic design
- 3D render
- Digital illustration
- Vector-like appearance
- Soft aesthetic
- Futuristic
- Technology-inspired
- Luxury
- Professional stock-image style

Only use styles that are reasonably supported by the image.

=========================================================
ABSTRACT / GRAPHIC IMAGE ANALYSIS
=========================================================

If the image is an abstract or graphic design, pay special attention to:

- Curves
- Waves
- Lines
- Shapes
- Light trails
- Glow
- Gradient direction
- Gradient transitions
- Blur
- Grain
- Noise
- Geometric relationships
- Color balance
- Negative space
- Layering
- Transparency
- Visual flow
- Contrast
- Edge softness
- Shape positioning
- Overall visual balance

=========================================================
PRODUCT / OBJECT IMAGE ANALYSIS
=========================================================

If the image contains a product or object, describe:

- Exact object form
- Shape
- Proportions
- Orientation
- Surface
- Material
- Finish
- Highlights
- Reflections
- Contact shadow
- Background
- Studio lighting
- Product placement
- Camera perspective

=========================================================
PHOTOGRAPHIC IMAGE ANALYSIS
=========================================================

If the image is photographic, describe:

- Subject placement
- Environment
- Camera perspective
- Lighting
- Depth
- Background blur
- Foreground
- Atmospheric conditions
- Realistic textures
- Photographic mood
- Exposure characteristics
- Contrast
- Natural details

=========================================================
IMPORTANT RULES
=========================================================

1. Describe only what is reasonably visible in the reference image.

2. Do not invent unnecessary objects.

3. Do not identify real people.

4. Do not mention the identity of any person.

5. Do not infer personal characteristics about people.

6. Do not invent brands.

7. Do not invent logos.

8. Do not invent unreadable text.

9. Do not use copyrighted character names.

10. Do not use artist names.

11. Do not use trademark-dependent descriptions.

12. Do not add irrelevant storytelling.

13. Do not add fictional details that are not visually supported.

14. Preserve the original composition as closely as possible.

15. Preserve the dominant color palette.

16. Preserve the lighting characteristics.

17. Preserve the texture and surface characteristics.

18. Preserve the background appearance.

19. Preserve the overall visual style.

20. Use precise visual language.

21. Make the prompt useful for professional AI image generation.

22. Make the prompt commercially useful for stock-image creation when applicable.

23. Avoid vague words such as "beautiful", "amazing", "nice" or "cool" unless they describe a clearly visible visual quality.

24. Do not explain your reasoning.

25. Do not describe the analysis process.

26. Do not mention that you analyzed a reference image.

=========================================================
FINAL OUTPUT
=========================================================

Return ONLY ONE polished, highly detailed image-generation prompt.

Do not provide bullet points.

Do not provide headings.

Do not provide explanations.

Do not provide analysis.

Do not say "the image shows".

Do not say "based on the image".

Write the final result as a natural professional AI image-generation prompt.
`;
}

/* =========================================================
   EPS → PNG
========================================================= */

async function convertEPSToPNG(
  file: ImageInput
): Promise<ImageInput> {
  const ghostscript =
    process.env.GHOSTSCRIPT_PATH ||
    "C:\\Program Files\\gs\\gs10.08.0\\bin\\gswin64c.exe";

  const tempDir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "stockai-prompt-"
      )
    );

  const inputPath =
    path.join(
      tempDir,
      file.name
    );

  const outputPath =
    path.join(
      tempDir,
      "converted.png"
    );

  try {
    const base64Data =
      file.data.replace(
        /^data:[^;]+;base64,/,
        ""
      );

    await fs.writeFile(
      inputPath,
      Buffer.from(
        base64Data,
        "base64"
      )
    );

    await execFileAsync(
      ghostscript,
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dEPSCrop",
        "-sDEVICE=pngalpha",
        "-r150",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      {
        windowsHide: true,
      }
    );

    const pngBuffer =
      await fs.readFile(
        outputPath
      );

    return {
      name: file.name.replace(
        /\.eps$/i,
        ".png"
      ),

      type: "image/png",

      data:
        pngBuffer.toString(
          "base64"
        ),
    };
  } finally {
    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/* =========================================================
   NORMALIZE IMAGE DATA
========================================================= */

function normalizeImageData(
  file: ImageInput
) {
  const data =
    file.data.replace(
      /^data:[^;]+;base64,/,
      ""
    );

  let mimeType =
    file.type ||
    "image/jpeg";

  const lowerName =
    file.name.toLowerCase();

  if (
    lowerName.endsWith(
      ".jpg"
    ) ||
    lowerName.endsWith(
      ".jpeg"
    )
  ) {
    mimeType =
      "image/jpeg";
  }

  if (
    lowerName.endsWith(
      ".png"
    )
  ) {
    mimeType =
      "image/png";
  }

  if (
    lowerName.endsWith(
      ".webp"
    )
  ) {
    mimeType =
      "image/webp";
  }

  return {
    data,
    mimeType,
  };
}

/* =========================================================
   GEMINI REQUEST
========================================================= */

async function requestGemini(
  file: ImageInput,
  model: string,
  promptType: string,
  promptDetail: string
): Promise<GeminiResult> {
  const apiKey =
    getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please add your Gemini API key from API Settings."
    );
  }

  const {
    data,
    mimeType,
  } =
    normalizeImageData(
      file
    );

  const prompt =
    buildImagePrompt(
      promptType,
      promptDetail
    );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response =
    await fetch(
      url,
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
                  inline_data: {
                    mime_type:
                      mimeType,

                    data,
                  },
                },

                {
                  text:
                    prompt,
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0.35,

            maxOutputTokens:
              1800,

            candidateCount: 1,
          },
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
        errorData?.error
          ?.message ||
        message;
    } catch {
      // Keep original response
    }

    const error =
      new Error(
        `Gemini HTTP ${response.status}: ${message}`
      ) as Error & {
        status?: number;
      };

    error.status =
      response.status;

    throw error;
  }

  let responseData: any;

  try {
    responseData =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }

  const generatedText =
    responseData
      ?.candidates?.[0]
      ?.content?.parts
      ?.map(
        (
          part: {
            text?: string;
          }
        ) =>
          part.text || ""
      )
      .join("")
      .trim();

  if (!generatedText) {
    throw new Error(
      "Gemini returned an empty prompt."
    );
  }

  return {
    prompt:
      cleanGeneratedPrompt(
        generatedText
      ),

    model,
  };
}

/* =========================================================
   GEMINI FALLBACK SYSTEM
========================================================= */

async function callGemini(
  file: ImageInput,
  promptType: string,
  promptDetail: string
): Promise<GeminiResult> {
  let lastError:
    | Error
    | null = null;

  for (
    let index = 0;
    index <
    GEMINI_MODELS.length;
    index++
  ) {
    const model =
      GEMINI_MODELS[index];

    try {
      console.log(
        `Image Prompt: trying ${model} for ${file.name}`
      );

      const result =
        await requestGemini(
          file,
          model,
          promptType,
          promptDetail
        );

      console.log(
        `Image Prompt: success using ${model} for ${file.name}`
      );

      return result;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown Gemini error."
            );

      const status =
        (
          lastError as Error & {
            status?: number;
          }
        ).status;

      console.error(
        `Image Prompt: ${model} failed for ${file.name}:`,
        lastError.message
      );

      /* ---------------------------------------------
         INVALID API KEY
      --------------------------------------------- */

      if (
        status === 401 ||
        status === 403
      ) {
        throw new Error(
          "Gemini API key is invalid or does not have permission."
        );
      }

      /* ---------------------------------------------
         QUOTA
      --------------------------------------------- */

      if (
        status === 429
      ) {
        throw new Error(
          "Gemini API quota exceeded. Please use another Gemini API key or wait until the quota resets."
        );
      }

      /* ---------------------------------------------
         MODEL NOT AVAILABLE
      --------------------------------------------- */

      if (
        status === 404
      ) {
        console.log(
          `Model ${model} unavailable. Trying next model...`
        );

        continue;
      }

      /* ---------------------------------------------
         TEMPORARY SERVER ERROR
      --------------------------------------------- */

      if (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        if (
          index <
          GEMINI_MODELS.length -
            1
        ) {
          await new Promise(
            (
              resolve
            ) =>
              setTimeout(
                resolve,
                1200 *
                  (index + 1)
              )
          );

          continue;
        }
      }

      /* ---------------------------------------------
         OTHER ERRORS
      --------------------------------------------- */

      if (
        index <
        GEMINI_MODELS.length -
          1
      ) {
        continue;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models failed."
    )
  );
}

/* =========================================================
   POST API
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const files =
      body?.files as
        | ImageInput[]
        | undefined;

    const settings =
      body?.settings || {};

    const promptType =
      String(
        settings.promptType ||
          "Image Recreation Prompt"
      );

    const promptDetail =
      String(
        settings.promptDetail ||
          "Professional"
      );

    /* ---------------------------------------------
       VALIDATE FILES
    --------------------------------------------- */

    if (
      !Array.isArray(
        files
      ) ||
      files.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "No image files received.",
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
            "Maximum 100 files allowed.",
        },
        {
          status: 400,
        }
      );
    }

    /* ---------------------------------------------
       RESULTS
    --------------------------------------------- */

    const results:
      PromptResult[] =
      [];

    /* ---------------------------------------------
       PROCESS FILES ONE BY ONE
    --------------------------------------------- */

    for (
      const originalFile of files
    ) {
      try {
        let imageFile =
          originalFile;

        /* -----------------------------------------
           EPS → PNG
        ----------------------------------------- */

        if (
          originalFile.name
            .toLowerCase()
            .endsWith(
              ".eps"
            )
        ) {
          console.log(
            `Converting EPS: ${originalFile.name}`
          );

          imageFile =
            await convertEPSToPNG(
              originalFile
            );
        }

        /* -----------------------------------------
           SUPPORTED FORMAT
        ----------------------------------------- */

        const lowerName =
          imageFile.name.toLowerCase();

        const supported =
          lowerName.endsWith(
            ".jpg"
          ) ||
          lowerName.endsWith(
            ".jpeg"
          ) ||
          lowerName.endsWith(
            ".png"
          ) ||
          lowerName.endsWith(
            ".webp"
          );

        if (!supported) {
          throw new Error(
            `Unsupported image format: ${imageFile.name}`
          );
        }

        /* -----------------------------------------
           GEMINI IMAGE ANALYSIS
        ----------------------------------------- */

        const generated =
          await callGemini(
            imageFile,
            promptType,
            promptDetail
          );

        /* -----------------------------------------
           SAVE RESULT
        ----------------------------------------- */

        results.push({
          fileName:
            originalFile.name,

          prompt:
            generated.prompt,

          provider:
            "Gemini",

          model:
            generated.model,
        });

      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Prompt generation failed.";

        console.error(
          `Prompt generation failed for ${originalFile.name}:`,
          message
        );

        return NextResponse.json(
          {
            success: false,

            message:
              `${originalFile.name}: ${message}`,

            fileName:
              originalFile.name,

            results,
          },
          {
            status: 500,
          }
        );
      }
    }

    /* ---------------------------------------------
       SUCCESS
    --------------------------------------------- */

    return NextResponse.json({
      success: true,

      results,

      count:
        results.length,

      promptType,

      promptDetail,
    });

  } catch (error) {
    console.error(
      "generate-prompt route error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Image prompt generation failed.",
      },
      {
        status: 500,
      }
    );
  }
}