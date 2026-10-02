import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: "GEMINI_API_KEY is not configured in .env.local.",
        },
        { status: 500 }
      );
    }

    const model =
      process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Reply with exactly: Gemini API connection successful.",
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 256,
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      }),
    });

    const responseText = await response.text();

    let data: any;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Gemini returned an invalid JSON response.",
          status: response.status,
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      const apiMessage =
        data?.error?.message ||
        data?.error?.status ||
        "Gemini API request failed.";

      if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            message: "Gemini API key is invalid or unauthorized.",
          },
          { status: 401 }
        );
      }

      if (response.status === 403) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Gemini API access was denied. Check your API key and permissions.",
          },
          { status: 403 }
        );
      }

      if (response.status === 429) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Gemini API quota exceeded. Please check your Gemini quota or try again later.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: apiMessage,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];

    const generatedText = parts
      .map((part: any) => part?.text)
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!generatedText) {
      return NextResponse.json(
        {
          success: false,
          message: "Gemini returned no visible text.",
          model,
          finishReason: data?.candidates?.[0]?.finishReason ?? null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Gemini API Connected Successfully.",
      model,
      response: generatedText,
    });
  } catch (error) {
    console.error("Gemini test error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gemini API test failed.",
      },
      { status: 500 }
    );
  }
}