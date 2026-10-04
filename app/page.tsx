"use client";



import { useState } from "react";



type Provider =

  | "auto"

  | "gemini"

  | "openai"

  | "claude"

  | "groq";



type Mode = "metadata" | "prompt";



type PromptResult = {

  fileName: string;

  prompt: string;

  provider?: string;

  model?: string;

  sourceIndex?: number;

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



  const [apiKeys, setApiKeys] = useState<Record<string, Array<{ index: number; label: string; maskedKey: string }>>>({});

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});

  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const [apiKeySaving, setApiKeySaving] = useState<string | null>(null);

  const [apiKeyMessage, setApiKeyMessage] = useState("");

  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});



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



    const MAX_PROMPT_FILES = 100;

    const BATCH_SIZE = 2;

    const MAX_RETRIES = 2;

    const totalFiles = Math.min(files.length, MAX_PROMPT_FILES);



    setGenerating(true);

    setGenerationError("");

    setPromptResults([]);

    setResults([]);

    setPromptProgress({ completed: 0, total: totalFiles });



    try {

      const allResults: PromptResult[] = [];

      const failedFiles: string[] = [];



      const sleep = (ms: number) =>

        new Promise((resolve) => setTimeout(resolve, ms));



      const encodeFile = async (file: File) => ({

        name: file.name,

        type:

          file.type ||

          (file.name.toLowerCase().endsWith(".eps")

            ? "application/postscript"

            : "image/jpeg"),

        data: await fileToBase64(file),

      });



      const requestBatch = async (

        batch: File[],

        batchStartIndex: number

      ): Promise<PromptResult[]> => {

        const encodedFiles = await Promise.all(batch.map(encodeFile));

        let lastError = "Image prompt generation failed.";



        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {

          try {

            const response = await fetch("/api/generate-prompt", {

              method: "POST",

              headers: { "Content-Type": "application/json" },

              body: JSON.stringify({

                files: encodedFiles,

                settings: { provider, promptType, promptDetail },

              }),

            });



            const raw = await response.text();

            let data: any = null;

            try {

              data = raw ? JSON.parse(raw) : null;

            } catch {

              lastError =

                response.status === 413

                  ? "Request is too large."

                  : `Server returned a non-JSON error (${response.status}).`;

            }



            if (response.ok && data?.success && Array.isArray(data.results)) {

              return data.results.map((item: PromptResult, resultIndex: number) => ({

                ...item,

                sourceIndex: batchStartIndex + resultIndex,

              }));

            }



            if (response.status === 413) throw new Error("PAYLOAD_TOO_LARGE");



            if (response.status === 429) {

              throw new Error(

                data?.message ||

                  "Gemini quota/rate limit was exceeded. The configured API keys were exhausted."

              );

            }



            lastError = data?.message || lastError || "Image prompt generation failed.";



            const retryable = [408, 425, 500, 502, 503, 504].includes(response.status);

            if (!retryable || attempt >= MAX_RETRIES) throw new Error(lastError);

          } catch (error) {

            const message = error instanceof Error ? error.message : "Image prompt generation failed.";

            if (message === "PAYLOAD_TOO_LARGE") throw error;

            lastError = message;



            if (

              message.toLowerCase().includes("quota") ||

              message.toLowerCase().includes("rate limit") ||

              message.toLowerCase().includes("401") ||

              message.toLowerCase().includes("403") ||

              attempt >= MAX_RETRIES

            ) {

              throw new Error(lastError);

            }

          }



          await sleep(1000 * (attempt + 1));

        }



        throw new Error(lastError);

      };



      for (let start = 0; start < totalFiles; start += BATCH_SIZE) {

        const batch = files.slice(start, Math.min(start + BATCH_SIZE, totalFiles));

        let batchResults: PromptResult[] = [];



        try {

          batchResults = await requestBatch(batch, start);

        } catch (error) {

          const message = error instanceof Error ? error.message : "Image prompt generation failed.";



          if (message === "PAYLOAD_TOO_LARGE" && batch.length > 1) {

            for (let i = 0; i < batch.length; i++) {

              const singleFile = batch[i];

              try {

                const singleResults = await requestBatch([singleFile], start + i);

                batchResults.push(...singleResults);

              } catch (singleError) {

                failedFiles.push(

                  `${singleFile.name}: ${singleError instanceof Error ? singleError.message : "Prompt generation failed."}`

                );

              } finally {

                setPromptProgress((old) => ({

                  ...old,

                  completed: Math.min(old.completed + 1, totalFiles),

                }));

              }

            }



            if (batchResults.length) {

              allResults.push(...batchResults);

              allResults.sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));

              setPromptResults([...allResults]);

            }

            continue;

          }



          batch.forEach((file) => failedFiles.push(`${file.name}: ${message}`));

        }



        if (batchResults.length) {

          allResults.push(...batchResults);

          allResults.sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));

          setPromptResults([...allResults]);

        }



        setPromptProgress((old) => ({

          ...old,

          completed: Math.min(old.completed + batch.length, totalFiles),

        }));

      }



      if (!allResults.length && failedFiles.length) throw new Error(failedFiles[0]);



      if (failedFiles.length) {

        setGenerationError(

          `${allResults.length} image(s) completed. ${failedFiles.length} image(s) failed. You can use Regenerate on completed items or try the failed files again.`

        );

      }

    } catch (error) {

      setGenerationError(error instanceof Error ? error.message : "Image prompt generation failed.");

    } finally {

      setGenerating(false);

    }

  }



  async function regeneratePrompt(index: number) {

    const result = promptResults[index];

    const sourceIndex = result?.sourceIndex ?? index;

    if (!files[sourceIndex]) return;



    setGenerating(true);

    setGenerationError("");



    try {

      const file = files[sourceIndex];

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



      const next = {

        ...(data.results[0] as PromptResult),

        sourceIndex:

          (data.results[0] as PromptResult).sourceIndex ?? sourceIndex,

      };



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



  const providerLabels: Record<string, string> = {

    gemini: "Gemini",

    openai: "OpenAI / ChatGPT",

    claude: "Claude",

    groq: "Groq",

  };



  async function loadApiKeys() {

    setApiKeyLoading(true);

    setApiKeyMessage("");



    try {

      const response = await fetch("/api/api-settings", { cache: "no-store" });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data?.message || "Could not load API keys.");

      }

      if (data.providers) {
        const normalized = Object.fromEntries(
          Object.entries(data.providers).map(([providerName, providerData]) => {
            const provider = providerData as {
              keys?: Array<{ index: number; configured: boolean; maskedKey: string }>;
            };

            return [
              providerName,
              (provider.keys || [])
                .filter((item) => item.configured)
                .map((item) => ({
                  index: item.index,
                  maskedKey: item.maskedKey,
                })),
            ];
          })
        );

        setApiKeys(normalized as typeof apiKeys);
      } else {
        setApiKeys(data.keys || {});
      }

    } catch (error) {

      setApiKeyMessage(error instanceof Error ? error.message : "Could not load API keys.");

    } finally {

      setApiKeyLoading(false);

    }

  }



  async function saveApiKey(providerName: string, index: number) {
    const inputKey = `${providerName}:${index}`;
    const apiKey = (apiKeyInputs[inputKey] || "").trim();

    if (!apiKey) {
      setApiKeyMessage(
        `Enter the ${providerLabels[providerName] || providerName} Key ${index}.`
      );
      return;
    }

    setApiKeyInputs((old) => ({ ...old, [inputKey]: "" }));
    setApiKeyMessage(
      `${providerLabels[providerName] || providerName} Key ${index} cannot be saved from the live website. ` +
      `Add it to Vercel Environment Variables as ${
        index === 1
          ? providerName === "gemini"
            ? "GEMINI_API_KEY"
            : providerName === "openai"
              ? "OPENAI_API_KEY"
              : providerName === "claude"
                ? "ANTHROPIC_API_KEY"
                : "GROQ_API_KEY"
          : providerName === "gemini"
            ? `GEMINI_API_KEY_${index}`
            : providerName === "openai"
              ? `OPENAI_API_KEY_${index}`
              : providerName === "claude"
                ? `ANTHROPIC_API_KEY_${index}`
                : `GROQ_API_KEY_${index}`
      }, then redeploy.`
    );
  }

  async function removeApiKey(providerName: string, index: number) {
    const envName =
      index === 1
        ? providerName === "gemini"
          ? "GEMINI_API_KEY"
          : providerName === "openai"
            ? "OPENAI_API_KEY"
            : providerName === "claude"
              ? "ANTHROPIC_API_KEY"
              : "GROQ_API_KEY"
        : providerName === "gemini"
          ? `GEMINI_API_KEY_${index}`
          : providerName === "openai"
            ? `OPENAI_API_KEY_${index}`
            : providerName === "claude"
              ? `ANTHROPIC_API_KEY_${index}`
              : `GROQ_API_KEY_${index}`;

    setApiKeyMessage(
      `Remove ${envName} from Vercel Environment Variables, then redeploy.`
    );
  }

  function toggleApiKeyVisibility(providerName: string, index: number) {

    const key = `${providerName}:${index}`;

    setVisibleApiKeys((old) => ({ ...old, [key]: !old[key] }));

  }



  async function testGemini() {

    setTestingApi(true);

    setApiStatus("");



    try {

      const response = await fetch("/api/gemini-test", { method: "POST" });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data?.message || "Gemini API test failed.");

      }

      setApiStatus("Gemini API Connected Successfully.");

      await loadApiKeys();

    } catch (error) {

      setApiStatus(error instanceof Error ? error.message : "Gemini API test failed.");

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

            onClick={() => {

              setShowApiModal(true);

              loadApiKeys();

            }}

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

                      "groq",

                      "✕",

                      "Groq",

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

          onClick={() => setShowApiModal(false)}

        >

          <div

            className="apiModal"

            onClick={(e) => e.stopPropagation()}

            style={{ maxWidth: 900, width: "calc(100% - 32px)", maxHeight: "85vh", overflowY: "auto" }}

          >

            <div className="apiModalHeader">

              <div>

                <h2>AI API Keys</h2>

                <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>

                  Add up to 10 keys for each provider. On Vercel, manage keys in Environment Variables.

                </p>

              </div>

              <button onClick={() => setShowApiModal(false)}>×</button>

            </div>



            {apiKeyLoading ? (

              <div className="apiStatus">Loading API keys...</div>

            ) : (

              <div style={{ display: "grid", gap: 18, marginTop: 16 }}>

                {(["gemini", "openai", "claude", "groq"] as const).map((providerName) => {

                  const configured = apiKeys[providerName] || [];

                  const configuredMap = new Map(configured.map((item) => [item.index, item]));



                  return (

                    <div key={providerName} className="apiInfo" style={{ padding: 16 }}>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>

                        <strong>{providerLabels[providerName]}</strong>

                        <span style={{ fontSize: 12, opacity: 0.7 }}>{configured.length}/10 configured</span>

                      </div>



                      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>

                        {Array.from({ length: 10 }, (_, i) => i + 1).map((index) => {

                          const item = configuredMap.get(index);

                          const inputId = `${providerName}:${index}`;

                          const visible = Boolean(visibleApiKeys[inputId]);

                          const saving = apiKeySaving === inputId;



                          return (

                            <div key={inputId} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto auto", gap: 8, alignItems: "center" }}>

                              <span style={{ fontSize: 13, fontWeight: 600 }}>Key {index}</span>

                              <input

                                className="editableInput"

                                type={visible ? "text" : "password"}

                                placeholder={item ? item.maskedKey : `Enter ${providerLabels[providerName]} Key ${index}`}

                                value={apiKeyInputs[inputId] || ""}

                                onChange={(e) => setApiKeyInputs((old) => ({ ...old, [inputId]: e.target.value }))}

                                autoComplete="off"

                              />

                              <button type="button" className="actionButton" onClick={() => toggleApiKeyVisibility(providerName, index)}>

                                {visible ? "Hide" : "Show"}

                              </button>

                              <div style={{ display: "flex", gap: 6 }}>

                                <button type="button" className="actionButton" disabled={saving} onClick={() => saveApiKey(providerName, index)}>

                                  {saving ? "Saving..." : item ? "Update" : "Save"}

                                </button>

                                {item && (

                                  <button type="button" className="clearButton" disabled={saving} onClick={() => removeApiKey(providerName, index)}>

                                    Remove

                                  </button>

                                )}

                              </div>

                            </div>

                          );

                        })}

                      </div>

                    </div>

                  );

                })}

              </div>

            )}



            {apiKeyMessage && (

              <div className="apiStatus" style={{ marginTop: 14 }}>

                {apiKeyMessage}

              </div>

            )}



            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>

              <button className="actionButton" onClick={loadApiKeys} disabled={apiKeyLoading}>

                Refresh Keys

              </button>

              <button className="generateButton" onClick={testGemini} disabled={testingApi}>

                {testingApi ? "Testing..." : "Test Gemini API"}

              </button>

            </div>



            {apiStatus && (

              <div className="apiStatus" style={{ marginTop: 10 }}>

                {apiStatus}

              </div>

            )}

          </div>

        </div>

      )}

    </main>

  );

}