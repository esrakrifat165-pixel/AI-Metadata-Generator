"use client";

import { useState } from "react";

type Provider =
  | "auto"
  | "gemini"
  | "openai"
  | "claude"
  | "grok";

type Mode = "metadata" | "prompt";

type PromptResult = {
  fileName: string;
  prompt: string;
  provider?: string;
  model?: string;
};

type MetadataResult = {
  fileName: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  provider?: string;
  model?: string;
};

type ApiKeyProvider = "gemini" | "openai" | "claude" | "grok";

type ApiKeySlot = {
  index: number;
  configured: boolean;
  key: string;
};

type ApiKeyState = Record<ApiKeyProvider, ApiKeySlot[]>;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the selected file."));
        return;
      }

      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => {
      reject(reader.error || new Error("Could not read the selected file."));
    };

    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("metadata");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] =
    useState<MetadataResult[]>([]);

  const [promptResults, setPromptResults] =
    useState<PromptResult[]>([]);

  const [promptType, setPromptType] =
    useState("Image Recreation Prompt");

  const [promptDetail, setPromptDetail] =
    useState("Professional");

  const [platform, setPlatform] =
    useState("General");

  const [provider, setProvider] =
    useState<Provider>("gemini");

  const [titleLength, setTitleLength] =
    useState(70);

  const [keywordCount, setKeywordCount] =
    useState(50);

  const [generating, setGenerating] =
    useState(false);

  const [promptProgress, setPromptProgress] =
    useState({ completed: 0, total: 0 });

  const [generationError, setGenerationError] =
    useState("");

  const [showApiModal, setShowApiModal] =
    useState(false);

  const [apiStatus, setApiStatus] =
    useState("");

  const [testingApi, setTestingApi] =
    useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyState>({
    gemini: [],
    openai: [],
    claude: [],
    grok: [],
  });

  const [apiKeyProvider, setApiKeyProvider] =
    useState<ApiKeyProvider>("gemini");

  const [apiKeyInputs, setApiKeyInputs] =
    useState<Record<string, string>>({});

  const [apiKeysLoading, setApiKeysLoading] =
    useState(false);

  const [apiKeySaving, setApiKeySaving] =
    useState(false);

  const [projectMessage, setProjectMessage] =
    useState("");

  function handleFiles(
    selected: FileList | null
  ) {
    if (!selected) return;

    const validFiles = Array.from(selected).filter(
      (file) => {
        const extension = file.name
          .split(".")
          .pop()
          ?.toLowerCase();

        return (
          file.type.startsWith("image/") ||
          extension === "eps"
        );
      }
    );

    setFiles((old) =>
      [...old, ...validFiles].slice(0, 100)
    );

    setGenerationError("");
  }

  function removeFile(index: number) {
    setFiles((old) =>
      old.filter((_, i) => i !== index)
    );
  }

  function clearAll() {
    setFiles([]);
    setResults([]);
    setPromptResults([]);
    setGenerationError("");
    setProjectMessage("");
    setPromptProgress({ completed: 0, total: 0 });
  }

  async function generateAll() {
    if (!files.length) {
      setGenerationError("Please upload at least one file.");
      return;
    }

    setGenerating(true);
    setGenerationError("");
    setResults([]);

    try {
      const generatedResults: MetadataResult[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("platform", platform);
        formData.append("provider", provider);
        formData.append("titleLength", String(titleLength));
        formData.append("keywordCount", String(keywordCount));

        const response = await fetch("/api/generate-metadata", {
          method: "POST",
          body: formData,
        });

        const raw = await response.text();
        let data: any = null;

        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          throw new Error(
            response.status === 413
              ? `${file.name}: File is too large for the current Vercel upload limit. Please use a file under 4 MB.`
              : `${file.name}: Server returned a non-JSON error (${response.status}).`
          );
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            `${file.name}: ${data?.message || "Metadata generation failed."}`
          );
        }

        if (Array.isArray(data.results)) {
          generatedResults.push(...data.results);
          setResults([...generatedResults]);
        }
      }
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function generatePrompts() {
    if (!files.length) {
      setGenerationError("Please upload at least one image.");
      return;
    }

    const BATCH_SIZE = 1;

    setGenerating(true);
    setGenerationError("");
    setPromptResults([]);
    setResults([]);
    setPromptProgress({ completed: 0, total: files.length });

    try {
      const allResults: PromptResult[] = [];
      const failedFiles: string[] = [];

      for (let start = 0; start < files.length; start += BATCH_SIZE) {
        const batch = files.slice(start, start + BATCH_SIZE);

        try {
          const encodedFiles = await Promise.all(
            batch.map(async (file) => ({
              name: file.name,
              type:
                file.type ||
                (file.name.toLowerCase().endsWith(".eps")
                  ? "application/postscript"
                  : "image/jpeg"),
              data: await fileToBase64(file),
            }))
          );

          const response = await fetch("/api/generate-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: encodedFiles,
              settings: {
                provider,
                promptType,
                promptDetail,
              },
            }),
          });

          const raw = await response.text();
          let data: any = null;

          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            throw new Error(
              response.status === 413
                ? "This batch is too large for the server. The app will continue with the remaining files."
                : `Server returned a non-JSON error (${response.status}).`
            );
          }

          if (!response.ok || !data?.success) {
            throw new Error(
              data?.message || "Image prompt generation failed."
            );
          }

          if (Array.isArray(data.results)) {
            allResults.push(...data.results);
            setPromptResults([...allResults]);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Image prompt generation failed.";

          batch.forEach((file) => {
            failedFiles.push(`${file.name}: ${message}`);
          });
        } finally {
          setPromptProgress((old) => ({
            ...old,
            completed: Math.min(old.completed + batch.length, files.length),
          }));
        }
      }

      if (!allResults.length && failedFiles.length) {
        throw new Error(failedFiles[0]);
      }

      if (failedFiles.length) {
        setGenerationError(
          `${allResults.length} image(s) completed. ${failedFiles.length} image(s) failed. You can regenerate failed items individually.`
        );
      }
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Image prompt generation failed."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function regeneratePrompt(index: number) {
    if (!files[index]) return;

    setGenerating(true);
    setGenerationError("");

    try {
      const file = files[index];
      const encoded = {
        name: file.name,
        type:
          file.type ||
          (file.name.toLowerCase().endsWith(".eps")
            ? "application/postscript"
            : "image/jpeg"),
        data: await fileToBase64(file),
      };

      const response = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [encoded],
          settings: { provider, promptType, promptDetail },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success || !data.results?.[0]) {
        throw new Error(data?.message || "Prompt regeneration failed.");
      }

      const next = data.results[0] as PromptResult;
      setPromptResults((old) =>
        old.map((item, i) => (i === index ? next : item))
      );
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "Prompt regeneration failed."
      );
    } finally {
      setGenerating(false);
    }
  }

  function updatePrompt(index: number, value: string) {
    setPromptResults((old) =>
      old.map((item, i) =>
        i === index ? { ...item, prompt: value } : item
      )
    );
  }

  function copyPrompt(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setProjectMessage("Prompt copied to clipboard.");
      setTimeout(() => setProjectMessage(""), 1800);
    });
  }

  function deletePrompt(index: number) {
    setPromptResults((old) => old.filter((_, i) => i !== index));
  }

  function updateResult(
    index: number,
    field:
      | "title"
      | "description",
    value: string
  ) {
    setResults((old) =>
      old.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function updateKeyword(
    resultIndex: number,
    keywordIndex: number,
    value: string
  ) {
    setResults((old) =>
      old.map((item, i) => {
        if (i !== resultIndex) return item;

        const keywords = [
          ...item.keywords,
        ];

        keywords[keywordIndex] = value;

        return {
          ...item,
          keywords,
        };
      })
    );
  }

  function deleteKeyword(
    resultIndex: number,
    keywordIndex: number
  ) {
    setResults((old) =>
      old.map((item, i) => {
        if (i !== resultIndex) return item;

        return {
          ...item,
          keywords: item.keywords.filter(
            (_, k) => k !== keywordIndex
          ),
        };
      })
    );
  }

  function addKeyword(index: number) {
    setResults((old) =>
      old.map((item, i) =>
        i === index
          ? {
              ...item,
              keywords: [
                ...item.keywords,
                "",
              ],
            }
          : item
      )
    );
  }

  function exportCSV() {
    if (!results.length) {
      setGenerationError(
        "Generate metadata first."
      );
      return;
    }

    const headers = [
      "File Name",
      "Title",
      "Description",
      "Keywords",
      "Category",
      "Platform",
      "AI Provider",
      "AI Model",
    ];

    const quote = (value: unknown) =>
      `"${String(value ?? "").replace(
        /"/g,
        '""'
      )}"`;

    const rows = results.map((item) => [
      item.fileName,
      item.title,
      item.description,
      item.keywords.join(", "),
      item.category,
      platform,
      item.provider || "",
      item.model || "",
    ]);

    const csv = [
      headers.map(quote).join(","),
      ...rows.map((row) =>
        row.map(quote).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(
      ["\uFEFF" + csv],
      {
        type: "text/csv;charset=utf-8",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = "stock-metadata.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function saveProject() {
    if (!results.length) {
      setGenerationError("Generate metadata before saving a project.");
      return;
    }

    const project = {
      app: "FER AI Nest",
      version: 1,
      savedAt: new Date().toISOString(),
      settings: {
        platform,
        provider,
        titleLength,
        keywordCount,
      },
      results,
    };

    const blob = new Blob(
      [JSON.stringify(project, null, 2)],
      { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `fer-ai-nest-project-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setProjectMessage("Project saved successfully.");
    setTimeout(() => setProjectMessage(""), 2500);
  }

  function loadProjectFile(file: File | undefined) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const project = JSON.parse(String(reader.result || "{}"));

        if (!project || !Array.isArray(project.results)) {
          throw new Error("Invalid FER AI Nest project file.");
        }

        setResults(project.results);

        if (project.settings?.platform) {
          setPlatform(project.settings.platform);
        }

        if (project.settings?.provider) {
          setProvider(project.settings.provider as Provider);
        }

        if (Number.isFinite(Number(project.settings?.titleLength))) {
          setTitleLength(Number(project.settings.titleLength));
        }

        if (Number.isFinite(Number(project.settings?.keywordCount))) {
          setKeywordCount(Number(project.settings.keywordCount));
        }

        setGenerationError("");
        setProjectMessage("Project loaded successfully.");
        setTimeout(() => setProjectMessage(""), 2500);
      } catch (error) {
        setProjectMessage(
          error instanceof Error
            ? error.message
            : "Could not load project."
        );
      }
    };

    reader.onerror = () => {
      setProjectMessage("Could not read the project file.");
    };

    reader.readAsText(file);
  }

  function clearResults() {
    setResults([]);
    setGenerationError("");
    setProjectMessage("");
  }

  async function loadApiKeys() {
    setApiKeysLoading(true);

    try {
      const response = await fetch("/api/api-settings", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.message || "Could not load API keys.");
      }

      setApiKeys(data.providers);
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Could not load API keys."
      );
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function openApiModal() {
    setShowApiModal(true);
    setApiStatus("");
    await loadApiKeys();
  }

  async function saveApiKey(slot: number) {
    const value = (apiKeyInputs[`${apiKeyProvider}-${slot}`] || "").trim();

    if (!value) {
      setApiStatus("Please enter an API key first.");
      return;
    }

    setApiKeySaving(true);
    setApiStatus("");

    try {
      const response = await fetch("/api/api-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiKeyProvider,
          slot,
          apiKey: value,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.message || "Could not save API key.");
      }

      setApiKeyInputs((old) => ({
        ...old,
        [`${apiKeyProvider}-${slot}`]: "",
      }));

      setApiStatus(data.message || "API key saved successfully.");
      await loadApiKeys();
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Could not save API key."
      );
    } finally {
      setApiKeySaving(false);
    }
  }

  async function removeApiKey(slot: number) {
    if (!window.confirm(`Remove ${apiKeyProvider} API key ${slot}?`)) return;

    setApiKeysLoading(true);
    setApiStatus("");

    try {
      const response = await fetch("/api/api-settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiKeyProvider,
          slot,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.message || "Could not remove API key.");
      }

      setApiStatus(data.message || "API key removed.");
      await loadApiKeys();
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Could not remove API key."
      );
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function testGemini() {
    setTestingApi(true);
    setApiStatus("");

    try {
      const response = await fetch("/api/gemini-test", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.message || "Gemini API test failed."
        );
      }

      setApiStatus("Gemini API Connected Successfully.");
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Gemini API test failed."
      );
    } finally {
      setTestingApi(false);
    }
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon">
            ✦
          </div>

          <div>
            <strong>FER AI Nest</strong>
            <span>AI Creative Studio</span>
          </div>
        </div>

        <nav>
          <button className="navItem active">
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className="navItem"
            onClick={() =>
              setMode("metadata")
            }
          >
            <span>✦</span>
            Metadata
          </button>

          <button
            className="navItem"
            onClick={() =>
              setMode("prompt")
            }
          >
            <span>Ｔ</span>
            Image → Prompt
          </button>

          <button className="navItem">
            <span>◈</span>
            Background Remover
          </button>

          <button className="navItem">
            <span>⌕</span>
            Keyword Research
          </button>

          <button className="navItem">
            <span>▦</span>
            Tools
          </button>
        </nav>

        <div className="sidebarBottom">
          <button className="navItem">
            <span>⚙</span>
            Settings
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>
              FER AI Nest
            </h1>

            <p>
              AI-powered tools for stock creators.
            </p>
          </div>

          <button
            className="apiButton"
            onClick={openApiModal}
          >
            ⚿ API Keys
          </button>
        </header>

        <div className="modeTabs">
          <button
            className={
              mode === "metadata"
                ? "modeTab active"
                : "modeTab"
            }
            onClick={() =>
              setMode("metadata")
            }
          >
            ▱ Metadata
          </button>

          <button
            className={
              mode === "prompt"
                ? "modeTab active"
                : "modeTab"
            }
            onClick={() =>
              setMode("prompt")
            }
          >
            Ｔ Prompt
          </button>
        </div>

        <section className="settingsCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionIcon">
                ⚙
              </span>

              <strong>
                {mode === "metadata"
                  ? "Metadata Settings"
                  : "Prompt Settings"}
              </strong>
            </div>

            <span>⌃</span>
          </div>

          {mode === "metadata" ? (
            <>
              <div className="settingBlock">
                <label>
                  EXPORT PLATFORM
                </label>

                <div className="platformGrid">
                  {[
                    "General",
                    "Adobe Stock",
                    "Shutterstock",
                    "Freepik",
                    "Vecteezy",
                    "iStock",
                    "Pond5",
                  ].map((item) => (
                    <button
                      key={item}
                      className={
                        platform === item
                          ? "platform active"
                          : "platform"
                      }
                      onClick={() =>
                        setPlatform(item)
                      }
                    >
                      <span>◆</span>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settingBlock">
                <label>
                  AI PROVIDER
                </label>

                <div className="platformGrid">
                  {[
                    ["auto", "✦", "Auto"],
                    [
                      "gemini",
                      "◆",
                      "Gemini",
                    ],
                    [
                      "openai",
                      "◉",
                      "OpenAI / ChatGPT",
                    ],
                    [
                      "claude",
                      "◇",
                      "Claude",
                    ],
                    [
                      "grok",
                      "✕",
                      "Grok",
                    ],
                  ].map(
                    ([value, icon, label]) => (
                      <button
                        key={value}
                        className={
                          provider === value
                            ? "platform active"
                            : "platform"
                        }
                        onClick={() =>
                          setProvider(
                            value as Provider
                          )
                        }
                      >
                        <span>{icon}</span>
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="sliderBlock">
                <div className="sliderLabel">
                  <span>
                    TITLE LENGTH
                  </span>

                  <b>
                    {titleLength} chars
                  </b>
                </div>

                <input
                  type="range"
                  min="30"
                  max="120"
                  value={titleLength}
                  onChange={(e) =>
                    setTitleLength(
                      Number(e.target.value)
                    )
                  }
                />
              </div>

              <div className="fixedSetting">
                <span>
                  DESCRIPTION
                </span>

                <b>150 chars</b>
              </div>

              <div className="sliderBlock">
                <div className="sliderLabel">
                  <span>
                    KEYWORDS COUNT
                  </span>

                  <b>
                    {keywordCount} keywords
                  </b>
                </div>

                <input
                  type="range"
                  min="10"
                  max="50"
                  value={keywordCount}
                  onChange={(e) =>
                    setKeywordCount(
                      Number(e.target.value)
                    )
                  }
                />
              </div>
            </>
          ) : (
            <div className="promptSettings">
              <div className="promptOption">
                <label>
                  PROMPT TYPE
                </label>

                <select
                  value={promptType}
                  onChange={(e) => setPromptType(e.target.value)}
                >
                  <option>Detailed Image Description</option>
                  <option>Image Recreation Prompt</option>
                  <option>Stock Image Prompt</option>
                  <option>Photorealistic Prompt</option>
                  <option>Vector Illustration Prompt</option>
                  <option>3D Render Prompt</option>
                </select>
              </div>

              <div className="promptOption">
                <label>
                  PROMPT DETAIL
                </label>

                <select
                  value={promptDetail}
                  onChange={(e) => setPromptDetail(e.target.value)}
                >
                  <option>Professional</option>
                  <option>Basic</option>
                  <option>Detailed</option>
                  <option>Ultra Detailed</option>
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="uploadCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionIcon">
                ↥
              </span>

              <strong>
                Upload Files
              </strong>
            </div>
          </div>

          <label
            className="dropzone"
            onDragOver={(e) =>
              e.preventDefault()
            }
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(
                e.dataTransfer.files
              );
            }}
          >
            <div className="uploadIcon">
              ↥
            </div>

            <strong>
              Drag & drop files here
            </strong>

            <span>
              or <u>browse</u>
            </span>

            <div className="fileTypes">
              <span>JPG</span>
              <span>PNG</span>
              <span>WEBP</span>
              <span>EPS</span>
            </div>

            <small>
              Supports JPG, PNG, WEBP
              and EPS • Maximum 100
              files
            </small>

            <input
              type="file"
              accept="image/*,.eps"
              multiple
              hidden
              onChange={(e) =>
                handleFiles(
                  e.target.files
                )
              }
            />
          </label>

          {files.length > 0 && (
            <div className="fileList">
              <div className="fileListHeader">
                <span>
                  Selected files (
                  {files.length})
                </span>

                <button
                  onClick={clearAll}
                >
                  Clear All
                </button>
              </div>

              {files.map(
                (file, index) => (
                  <div
                    className="fileRow"
                    key={`${file.name}-${index}`}
                  >
                    <div>
                      <span className="fileIcon">
                        ▧
                      </span>

                      <span>
                        {file.name}
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        removeFile(index)
                      }
                    >
                      ×
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <div className="actionBar">
          <button
            className="clearButton"
            onClick={clearAll}
          >
            🗑 Clear All
          </button>

          <button
            className="generateButton"
            onClick={mode === "prompt" ? generatePrompts : generateAll}
            disabled={generating || files.length === 0}
          >
            {generating
              ? "⏳ Generating..."
              : mode === "prompt"
              ? "✦ Generate Prompt"
              : "✦ Generate All"}
          </button>

          {mode === "metadata" && (
            <>
              <button className="actionButton" disabled>
                ▣ Embed Metadata
              </button>

              <button
                className="actionButton"
                onClick={exportCSV}
                disabled={results.length === 0}
              >
                ⇩ Export CSV
              </button>
            </>
          )}
        </div>

        {generationError && (
          <div className="generationError">
            ✕ {generationError}
          </div>
        )}

        {generating && (
          <div className="generatingBox">
            <div className="loadingSpinner"></div>

            <h3>
              AI is analyzing your
              files...
            </h3>

            <p>
              {mode === "prompt"
                ? `${provider} is analyzing your image and building the selected prompt.`
                : provider === "auto"
                ? "Auto mode is selecting an available provider."
                : `${provider} is generating your metadata.`}
            </p>
          </div>
        )}

        {mode === "prompt" && generating && promptProgress.total > 0 && (
          <div className="apiStatus">
            Processing prompts: {promptProgress.completed} / {promptProgress.total} images completed.
          </div>
        )}

        {mode === "metadata" && results.length > 0 && (
          <section className="results">
            <div className="resultsHeader">
              <div>
                <h2>
                  Generated Metadata
                </h2>

                <p>
                  {results.length} file
                  {results.length > 1
                    ? "s"
                    : ""}{" "}
                  processed successfully.
                </p>
              </div>

              <div className="resultsActions">
                <button
                  type="button"
                  className="actionButton"
                  onClick={saveProject}
                >
                  ⇩ Save Project
                </button>

                <label className="actionButton">
                  ⇧ Load Project
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      loadProjectFile(e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <button
                  type="button"
                  className="clearButton"
                  onClick={clearResults}
                >
                  Clear Results
                </button>
              </div>
            </div>

            {projectMessage && (
              <div className="apiStatus">
                {projectMessage}
              </div>
            )}

            {results.map(
              (result, index) => (
                <div
                  className="metadataResult"
                  key={`${result.fileName}-${index}`}
                >
                  <div className="resultTop">
                    <div>
                      <span className="resultNumber">
                        #{index + 1}
                      </span>

                      <strong>
                        {result.fileName}
                      </strong>
                    </div>

                    <div>
                      {result.provider && (
                        <span className="categoryBadge">
                          {result.provider}
                        </span>
                      )}

                      <span className="categoryBadge">
                        {result.category ||
                          "General"}
                      </span>
                    </div>
                  </div>

                  <div className="resultField">
                    <label>Title</label>

                    <input
                      className="editableInput"
                      value={
                        result.title || ""
                      }
                      onChange={(e) =>
                        updateResult(
                          index,
                          "title",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="resultField">
                    <label>
                      Description
                    </label>

                    <textarea
                      className="editableTextarea"
                      rows={4}
                      value={
                        result.description ||
                        ""
                      }
                      onChange={(e) =>
                        updateResult(
                          index,
                          "description",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="resultField">
                    <label>
                      Keywords (
                      {result.keywords.length}
                      )
                    </label>

                    <div className="keywordList">
                      {result.keywords.map(
                        (
                          keyword,
                          keywordIndex
                        ) => (
                          <div
                            className="editableKeyword"
                            key={`${index}-${keywordIndex}`}
                          >
                            <input
                              value={keyword}
                              onChange={(e) =>
                                updateKeyword(
                                  index,
                                  keywordIndex,
                                  e.target
                                    .value
                                )
                              }
                            />

                            <button
                              type="button"
                              className="removeKeywordButton"
                              onClick={() =>
                                deleteKeyword(
                                  index,
                                  keywordIndex
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      className="addKeywordButton"
                      onClick={() =>
                        addKeyword(index)
                      }
                    >
                      + Add Keyword
                    </button>
                  </div>
                </div>
              )
            )}
          </section>
        )}

        {mode === "prompt" && promptResults.length > 0 && (
          <section className="results">
            <div className="resultsHeader">
              <div>
                <h2>Generated Image Prompts</h2>
                <p>
                  {promptResults.length} image
                  {promptResults.length > 1 ? "s" : ""} processed successfully.
                </p>
              </div>
            </div>

            {projectMessage && (
              <div className="apiStatus">{projectMessage}</div>
            )}

            {promptResults.map((result, index) => (
              <div className="metadataResult" key={`${result.fileName}-${index}`}>
                <div className="resultTop">
                  <div>
                    <span className="resultNumber">#{index + 1}</span>
                    <strong>{result.fileName}</strong>
                  </div>
                  <div>
                    {result.provider && (
                      <span className="categoryBadge">{result.provider}</span>
                    )}
                    {result.model && (
                      <span className="categoryBadge">{result.model}</span>
                    )}
                  </div>
                </div>

                <div className="resultField">
                  <label>{promptType}</label>
                  <textarea
                    className="editableTextarea"
                    rows={10}
                    value={result.prompt}
                    onChange={(e) => updatePrompt(index, e.target.value)}
                  />
                </div>

                <div className="resultsActions">
                  <button
                    type="button"
                    className="actionButton"
                    onClick={() => copyPrompt(result.prompt)}
                  >
                    Copy Prompt
                  </button>
                  <button
                    type="button"
                    className="actionButton"
                    onClick={() => regeneratePrompt(index)}
                    disabled={generating}
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="clearButton"
                    onClick={() => deletePrompt(index)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {!generating &&
          !generationError &&
          results.length === 0 &&
          promptResults.length === 0 && (
            <div className="emptyResults">
              <div className="emptyIcon">
                ▧
              </div>

              <h3>
                Your generated results
                will appear here.
              </h3>

              <p>
                Upload files and click{" "}
                <b>{mode === "prompt" ? "Generate Prompt" : "Generate All"}</b>{" "}
                to get started.
              </p>
            </div>
          )}
      </section>

      {showApiModal && (
        <div
          className="modalOverlay"
          onClick={() =>
            setShowApiModal(false)
          }
        >
          <div
            className="apiModal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="apiModalHeader">
              <h2>AI API Keys</h2>
              <button onClick={() => setShowApiModal(false)}>×</button>
            </div>

            <p>
              Add up to <b>10 API keys per provider</b>. Keys stay server-side.
            </p>

            <div className="apiInfo">
              <strong>Automatic key rotation</strong>
              <p>
                If a key returns a quota, rate-limit, or authentication error,
                FER AI Nest automatically tries the next configured key.
              </p>
            </div>

            <div className="platformGrid">
              {([
                ["gemini", "Gemini"],
                ["openai", "OpenAI / ChatGPT"],
                ["claude", "Claude"],
                ["grok", "Grok"],
              ] as [ApiKeyProvider, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={apiKeyProvider === value ? "platform active" : "platform"}
                  onClick={() => setApiKeyProvider(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {apiKeysLoading ? (
              <div className="apiStatus">Loading API keys...</div>
            ) : (
              <div style={{ marginTop: 14, maxHeight: 430, overflowY: "auto" }}>
                {(apiKeys[apiKeyProvider] || []).map((slot) => (
                  <div
                    key={slot.index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "58px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>Key {slot.index}</span>

                    <input
                      type="password"
                      placeholder={slot.configured ? slot.key : "Paste API key"}
                      value={apiKeyInputs[`${apiKeyProvider}-${slot.index}`] || ""}
                      onChange={(e) =>
                        setApiKeyInputs((old) => ({
                          ...old,
                          [`${apiKeyProvider}-${slot.index}`]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        minWidth: 0,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(255,255,255,.04)",
                        color: "inherit",
                      }}
                    />

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="actionButton"
                        disabled={apiKeySaving}
                        onClick={() => saveApiKey(slot.index)}
                      >
                        {slot.configured ? "Update" : "Save"}
                      </button>

                      {slot.configured && (
                        <button
                          type="button"
                          className="clearButton"
                          onClick={() => removeApiKey(slot.index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {apiStatus && <div className="apiStatus">{apiStatus}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                className="generateButton"
                onClick={testGemini}
                disabled={testingApi}
              >
                {testingApi ? "Testing..." : "Test Gemini API"}
              </button>

              <button
                className="actionButton"
                onClick={loadApiKeys}
                disabled={apiKeysLoading}
              >
                Refresh Keys
              </button>
            </div>

            <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              Local development: keys are saved in .env.local. For Vercel production,
              add the numbered variables in Project Settings → Environment Variables.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}