import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

const STORAGE_KEYS = {
  provider: "lintl_provider",
  baseUrl: "lintl_base_url",
  apiKey: "lintl_api_key",
  model: "lintl_model",
  sourceLang: "lintl_source_lang",
  targetLang: "lintl_target_lang",
  chunkSize: "lintl_chunk_size",
  chunkOverlap: "lintl_chunk_overlap",
  editorEnabled: "lintl_editor_enabled",
  editorModel: "lintl_editor_model",
  termModel: "lintl_term_model",
  searchModel: "lintl_search_model",
  workMode: "lintl_work_mode",
  modelProvider: "lintl_model_provider",
  calcCharsPerToken: "lintl_calc_chars_per_token",
  calcOutputRatio: "lintl_calc_output_ratio",
  calcEditorChangeRatio: "lintl_calc_editor_change_ratio",
  theme: "lintl_theme",
  editorFontSize: "lintl_editor_font_size",
  cjkFontFamily: "lintl_cjk_font_family",
  autosaveSeconds: "lintl_autosave_seconds",
  syncScroll: "lintl_sync_scroll",
  showDiff: "lintl_show_diff",
  history: "lintl_translation_history",
  lastProjectPath: "lintl_last_project_path",
  localMode: "lintl_local_mode",
  localBackend: "lintl_local_backend",
  temperature: "lintl_temperature",
  topP: "lintl_top_p",
  maxTokens: "lintl_max_tokens",
  systemPromptTemplate: "lintl_system_prompt_template",
  ragTopK: "lintl_rag_top_k",
  ragMaxChars: "lintl_rag_max_chars",
  researchQuery: "lintl_research_query",
  autoStartEnabled: "lintl_autostart_enabled",
  uiLanguage: "lintl_ui_language",
};

const MAX_HISTORY_ITEMS = 30;
const MAX_HISTORY_TEXT_LENGTH = 30000;
const VERY_LONG_TEXT_THRESHOLD = 1_000_000;
const MAX_VISIBLE_CHUNK_CHIPS = 180;

type ThemeMode = "light" | "dark" | "oled";
type UiLanguage = "en" | "ru" | "ja";

const UI_TEXT = {
  en: {
    unknownError: "Unknown translation error.",
    splashLoading: "Loading...",
    appSubtitle: "AI light-novel translator v{version}",
    close: "Close",
    dropFile: "Drop file to open",
    modeTranslate: "Mode: Translate",
    modeEditor: "Mode: Editor",
    settings: "Settings",
    collapse: "Collapse",
    expand: "Expand",
    refresh: "Refresh",
    providerNeedsApiKey: "Enter API key to load models for this provider.",
    modelsLoadFailed: "Failed to load model list.",
    postEditWithSecondModel: "Post-edit with a second model",
    autoStartUpdating: "Updating auto-start...",
    autoStartLabel: "Auto-start on OS login",
    language: "Interface language",
    modelProviderPlaceholder: "e.g. deepinfra, fireworks",
    systemPromptPlaceholder: "You can use {mode}, {source_lang}, {target_lang}, {project_memory}",
    showDiff: "Show diff",
    costCalc: "Cost calculator",
    noPricingData: "no model pricing data",
    noData: "no data",
    translationCost: "Translation cost",
    editingCost: "Editing cost",
    total: "Total",
    projectMemory: "Project & memory",
    newProject: "New project",
    openProject: "Open project",
    saveProject: "Save project",
    updatingMemory: "Updating memory...",
    updateMemorySummary: "Update memory summary",
    projectNamePlaceholder: "Novel title",
    memoryPlaceholder: "Short context for previous chapters...",
    fullPrevChapter: "Full previous chapter text (for compression)",
    fullPrevChapterPlaceholder: "Paste a large previous chapter here...",
    autoGlossaryOnCompress: "Auto-extend glossary during memory compression",
    compressing: "Compressing...",
    compressToMemory: "Compress to memory",
    detecting: "Detecting...",
    autoDetectTerms: "Auto-detect terms",
    searching: "Searching...",
    webResearch: "Web research context",
    addToArchive: "Add to RAG archive",
    researchQueryPlaceholder: "e.g. era, mythology, geography, terminology",
    recentResearchSources: "Recent research sources",
    ragArchiveCount: "RAG chapter archive: {count}",
    delete: "Delete",
    glossary: "Glossary",
    addTerm: "Add term",
    addCharacter: "Add character",
    history: "Translation history",
    clear: "Clear",
    historyEmpty: "History is empty.",
    load: "Load",
    sourceText: "Source text",
    pasteChapter: "Paste chapter fragment...",
    showingFirstChunks: "Showing first {visible} chunks out of {total}.",
    editOrTranslate: "Edit",
    translation: "Translation",
    editorPlaceholder: "Paste text for editing or use translation output...",
    translationPlaceholder: "Translation result will appear here...",
    diffTitle: "Diff: source vs translation",
    diffDisabledLong: "Diff disabled for text > 1M characters",
    changedLines: "{count} changed lines",
    batchQueue: "Batch queue",
    addFiles: "Add files",
    running: "Running...",
    runQueue: "Run queue",
    removeCompleted: "Remove completed",
    batchHint: "Add several `.txt/.md/.epub` files for batch translation.",
    openFile: "Open file (.txt/.md/.epub)",
    translatingShort: "Translating...",
    translatingProgress: "Translating {current}/{total}",
    editorWorking: "Editor is working...",
    translateFile: "Translate full file",
    translate: "Translate",
    editing: "Editing...",
    runEditor: "Run editor",
    copyEdited: "Copy edited",
    copyTranslation: "Copy translation",
    editText: "Edit text",
    saveNear: "Save near file",
    exportHtml: "Export HTML",
    exportDocx: "Export DOCX",
    stopProcess: "Stop process",
    fileOpened: "Opened file: {name}",
    translatingChunkStatus: "Model {model} translates chunk {current}/{total}. Elapsed {seconds} sec...",
    translatingStatus: "Model {model} request in progress for {seconds} sec...",
    editingChunkStatus: "Editor model {model} processes chunk {current}/{total}. Elapsed {seconds} sec...",
    editingStatus: "Editor model {model} processes text for {seconds} sec...",
    stopRequested: "Stop requested.",
    longTextNotice: "Large text (>1M chars): diff is disabled, visual chunk lists are limited for stability.",
    textWillSplit: "Text will be split into about {count} chunks.",
    editWillSplit: "Editing will run through about {count} chunks.",
    translationFinished: "Done: {chunks} chunks in {duration}. Editor: {editorState}. Time: {finishedAt}",
    editorOn: "on",
    editorOff: "off",
    editingFinished: "Editing complete: {chunks} chunks in {duration}. Changed paragraphs: {changed}. Time: {finishedAt}",
    lastEditChanged: "Last edit changed {count} paragraph(s).",
    saved: "Saved: {path}",
    openAbout: "About",
    sourceDropError: "Drop a .txt or .md file.",
    veryLongDisabled: "Very long text detected (>1M chars): diff and heavy previews are disabled.",
    noTextForEditor: "No text for editing.",
    editApplied: "Editing applied ({count} paragraph(s)).",
    editNoIssues: "Editor found no problematic paragraphs.",
    noTranslationForArchive: "No translation to add to chapter archive.",
    addedToArchive: "Chapter added to project RAG archive.",
    translateBeforeMemory: "Translate text/chapter first, then update memory.",
    pastePrevChapter: "Paste full previous chapter text into compression field.",
    memoryUpdatedWithTerms: "Memory updated, added {count} term(s) to glossary.",
    memoryUpdatedNoTerms: "Memory updated, no new glossary terms found.",
    memoryUpdated: "Memory updated.",
    noTextForTerms: "No text for auto-detect terms.",
    termsAdded: "Auto-detect added {count} term(s) to glossary.",
    termsNoNew: "Auto-detect found no new terms.",
    enterResearchQuery: "Enter a query for context research.",
    researchUpdated: "Research updated: +{terms} term(s), +{characters} character(s). Sources: {sources}.",
    copied: "Translation copied to clipboard.",
    copyFailed: "Could not copy automatically.",
    openTranslationProject: "Open translation project",
    saveTranslationProject: "Save translation project",
    createTranslationProject: "Create translation project",
    operationStopped: "Operation stopped by user.",
  },
  ru: {
    unknownError: "Неизвестная ошибка перевода.",
    splashLoading: "Загрузка...",
    appSubtitle: "AI-переводчик лайт-новелл v{version}",
    close: "Закрыть",
    dropFile: "Отпустите файл, чтобы открыть его",
    modeTranslate: "Режим: Перевод",
    modeEditor: "Режим: Редактор",
    settings: "Настройки",
    collapse: "Свернуть",
    expand: "Развернуть",
    refresh: "Обновить",
    providerNeedsApiKey: "Введите API key для загрузки моделей этого провайдера.",
    modelsLoadFailed: "Не удалось загрузить список моделей.",
    postEditWithSecondModel: "Пост-редактура второй моделью",
    autoStartUpdating: "Обновляю auto-start...",
    autoStartLabel: "Auto-start при входе в ОС",
    language: "Язык интерфейса",
    modelProviderPlaceholder: "например: deepinfra, fireworks",
    systemPromptPlaceholder: "Можно использовать {mode}, {source_lang}, {target_lang}, {project_memory}",
    showDiff: "Показывать diff",
    costCalc: "Калькулятор цены",
    noPricingData: "нет данных по цене модели",
    noData: "нет данных",
    translationCost: "Цена перевода",
    editingCost: "Цена редактуры",
    total: "Итого",
    projectMemory: "Проект и память",
    newProject: "Новый проект",
    openProject: "Открыть проект",
    saveProject: "Сохранить проект",
    updatingMemory: "Обновление memory...",
    updateMemorySummary: "Обновить summary памяти",
    projectNamePlaceholder: "Название новеллы",
    memoryPlaceholder: "Краткий контекст предыдущих глав...",
    fullPrevChapter: "Полный текст прошлой главы (для сжатия)",
    fullPrevChapterPlaceholder: "Вставьте сюда большой текст прошлой главы...",
    autoGlossaryOnCompress: "Авто-дополнение глоссария при сжатии memory",
    compressing: "Сжимаю...",
    compressToMemory: "Сжать в memory",
    detecting: "Детект...",
    autoDetectTerms: "Авто-детект терминов",
    searching: "Ищу...",
    webResearch: "Web research контекст",
    addToArchive: "Добавить в RAG-архив",
    researchQueryPlaceholder: "например: эпоха, мифология, география, терминология",
    recentResearchSources: "Последние источники research",
    ragArchiveCount: "RAG-архив глав: {count}",
    delete: "Удалить",
    glossary: "Глоссарий",
    addTerm: "Добавить термин",
    addCharacter: "Добавить персонажа",
    history: "История переводов",
    clear: "Очистить",
    historyEmpty: "История пока пустая.",
    load: "Загрузить",
    sourceText: "Исходный текст",
    pasteChapter: "Вставьте фрагмент главы...",
    showingFirstChunks: "Показаны первые {visible} чанков из {total}.",
    editOrTranslate: "Редакт",
    translation: "Перевод",
    editorPlaceholder: "Вставьте текст для редактуры или используйте результат перевода...",
    translationPlaceholder: "Результат перевода появится здесь...",
    diffTitle: "Diff: оригинал vs перевод",
    diffDisabledLong: "Diff отключен для текста > 1M символов",
    changedLines: "{count} измененных строк",
    batchQueue: "Batch очередь",
    addFiles: "Добавить файлы",
    running: "Выполняется...",
    runQueue: "Запустить очередь",
    removeCompleted: "Убрать завершенные",
    batchHint: "Добавьте несколько `.txt/.md/.epub` файлов для batch-перевода.",
    openFile: "Открыть файл (.txt/.md/.epub)",
    translatingShort: "Перевод...",
    translatingProgress: "Перевод {current}/{total}",
    editorWorking: "Редактор работает...",
    translateFile: "Перевести весь файл",
    translate: "Перевести",
    editing: "Редактирую...",
    runEditor: "Запустить редактор",
    copyEdited: "Копировать редакт",
    copyTranslation: "Копировать перевод",
    editText: "Редактировать текст",
    saveNear: "Сохранить рядом",
    exportHtml: "Экспорт HTML",
    exportDocx: "Экспорт DOCX",
    stopProcess: "Остановить процесс",
    fileOpened: "Открыт файл: {name}",
    translatingChunkStatus: "Модель {model} переводит чанк {current}/{total}. Прошло {seconds} сек...",
    translatingStatus: "Запрос к модели {model} выполняется {seconds} сек...",
    editingChunkStatus: "Модель-редактор {model} обрабатывает чанк {current}/{total}. Прошло {seconds} сек...",
    editingStatus: "Модель-редактор {model} обрабатывает текст {seconds} сек...",
    stopRequested: "Остановка запрошена.",
    longTextNotice: "Большой текст (>1M символов): diff отключён, визуальные списки чанков ограничены для стабильности.",
    textWillSplit: "Текст будет разбит примерно на {count} чанков.",
    editWillSplit: "Редактура будет идти примерно по {count} чанкам.",
    translationFinished: "Завершено: {chunks} чанков за {duration}. Редактор: {editorState}. Время: {finishedAt}",
    editorOn: "включен",
    editorOff: "выключен",
    editingFinished: "Редактура завершена: {chunks} чанков за {duration}. Изменено абзацев: {changed}. Время: {finishedAt}",
    lastEditChanged: "Последняя редактура изменила {count} абзац/абзацев.",
    saved: "Сохранено: {path}",
    openAbout: "About",
    sourceDropError: "Перетащите .txt или .md файл.",
    veryLongDisabled: "Обнаружен очень длинный текст (>1M символов): diff и тяжелые превью отключены.",
    noTextForEditor: "Нет текста для редакторской правки.",
    editApplied: "Редакторская правка применена ({count} абзац/абзацев).",
    editNoIssues: "Редактор не нашел проблемных абзацев.",
    noTranslationForArchive: "Нет перевода для добавления в архив глав.",
    addedToArchive: "Глава добавлена в RAG-архив проекта.",
    translateBeforeMemory: "Сначала переведите текст/главу, затем обновляйте memory.",
    pastePrevChapter: "Вставьте полный текст прошлой главы в поле сжатия.",
    memoryUpdatedWithTerms: "Memory обновлена, в глоссарий добавлено {count} термин(ов).",
    memoryUpdatedNoTerms: "Memory обновлена, новых терминов для глоссария не найдено.",
    memoryUpdated: "Memory обновлена.",
    noTextForTerms: "Нет текста для авто-детекта терминов.",
    termsAdded: "Авто-детект добавил {count} термин(ов) в глоссарий.",
    termsNoNew: "Авто-детект не нашёл новых терминов.",
    enterResearchQuery: "Введите запрос для поиска контекста.",
    researchUpdated: "Research обновлён: +{terms} термин(ов), +{characters} персонаж(ей). Источники: {sources}.",
    copied: "Перевод скопирован в буфер обмена.",
    copyFailed: "Не удалось скопировать автоматически.",
    openTranslationProject: "Открыть translation project",
    saveTranslationProject: "Сохранить translation project",
    createTranslationProject: "Создать translation project",
    operationStopped: "Операция остановлена пользователем.",
  },
  ja: {
    unknownError: "不明な翻訳エラーです。",
    splashLoading: "読み込み中...",
    appSubtitle: "ライトノベルAI翻訳ツール v{version}",
    close: "閉じる",
    dropFile: "ファイルをドロップして開く",
    modeTranslate: "モード: 翻訳",
    modeEditor: "モード: 編集",
    settings: "設定",
    collapse: "折りたたむ",
    expand: "展開",
    refresh: "更新",
    providerNeedsApiKey: "このプロバイダーのモデル一覧には API キーが必要です。",
    modelsLoadFailed: "モデル一覧の取得に失敗しました。",
    postEditWithSecondModel: "別モデルでポスト編集",
    autoStartUpdating: "自動起動を更新中...",
    autoStartLabel: "OSログイン時に自動起動",
    language: "UI言語",
    modelProviderPlaceholder: "例: deepinfra, fireworks",
    systemPromptPlaceholder: "{mode}, {source_lang}, {target_lang}, {project_memory} が使えます",
    showDiff: "差分を表示",
    costCalc: "コスト計算",
    noPricingData: "モデル価格データなし",
    noData: "データなし",
    translationCost: "翻訳コスト",
    editingCost: "編集コスト",
    total: "合計",
    projectMemory: "プロジェクトとメモリ",
    newProject: "新規プロジェクト",
    openProject: "プロジェクトを開く",
    saveProject: "プロジェクトを保存",
    updatingMemory: "メモリ更新中...",
    updateMemorySummary: "メモリ要約を更新",
    projectNamePlaceholder: "作品名",
    memoryPlaceholder: "前章までの短いコンテキスト...",
    fullPrevChapter: "前章全文 (圧縮用)",
    fullPrevChapterPlaceholder: "前章の長文をここに貼り付け...",
    autoGlossaryOnCompress: "圧縮時に用語集を自動拡張",
    compressing: "圧縮中...",
    compressToMemory: "メモリへ圧縮",
    detecting: "検出中...",
    autoDetectTerms: "用語を自動検出",
    searching: "検索中...",
    webResearch: "Webリサーチ",
    addToArchive: "RAGアーカイブへ追加",
    researchQueryPlaceholder: "例: 時代、神話、地理、用語",
    recentResearchSources: "最近のリサーチ元",
    ragArchiveCount: "RAG章アーカイブ: {count}",
    delete: "削除",
    glossary: "用語集",
    addTerm: "用語を追加",
    addCharacter: "キャラを追加",
    history: "翻訳履歴",
    clear: "クリア",
    historyEmpty: "履歴はまだありません。",
    load: "読み込む",
    sourceText: "原文",
    pasteChapter: "章テキストを貼り付け...",
    showingFirstChunks: "{total} 件中先頭 {visible} チャンクを表示。",
    editOrTranslate: "編集",
    translation: "翻訳",
    editorPlaceholder: "編集するテキストを貼り付けるか翻訳結果を使用...",
    translationPlaceholder: "翻訳結果がここに表示されます...",
    diffTitle: "Diff: 原文 vs 翻訳",
    diffDisabledLong: "1M文字超のため差分は無効",
    changedLines: "変更行: {count}",
    batchQueue: "バッチキュー",
    addFiles: "ファイル追加",
    running: "実行中...",
    runQueue: "キュー実行",
    removeCompleted: "完了を削除",
    batchHint: "バッチ翻訳用に `.txt/.md/.epub` ファイルを追加してください。",
    openFile: "ファイルを開く (.txt/.md/.epub)",
    translatingShort: "翻訳中...",
    translatingProgress: "翻訳 {current}/{total}",
    editorWorking: "エディタ処理中...",
    translateFile: "ファイル全体を翻訳",
    translate: "翻訳",
    editing: "編集中...",
    runEditor: "エディタ実行",
    copyEdited: "編集結果をコピー",
    copyTranslation: "翻訳をコピー",
    editText: "テキスト編集",
    saveNear: "同じ場所に保存",
    exportHtml: "HTML書き出し",
    exportDocx: "DOCX書き出し",
    stopProcess: "停止",
    fileOpened: "開いたファイル: {name}",
    translatingChunkStatus: "モデル {model} がチャンク {current}/{total} を翻訳中。経過 {seconds} 秒...",
    translatingStatus: "モデル {model} にリクエスト中 {seconds} 秒...",
    editingChunkStatus: "編集モデル {model} がチャンク {current}/{total} を処理中。経過 {seconds} 秒...",
    editingStatus: "編集モデル {model} がテキスト処理中 {seconds} 秒...",
    stopRequested: "停止を要求しました。",
    longTextNotice: "長文 (>1M 文字): 安定性のため差分と重いプレビューを無効化。",
    textWillSplit: "テキストは約 {count} チャンクに分割されます。",
    editWillSplit: "編集は約 {count} チャンクで実行されます。",
    translationFinished: "完了: {chunks} チャンク / {duration}。エディタ: {editorState}。時刻: {finishedAt}",
    editorOn: "有効",
    editorOff: "無効",
    editingFinished: "編集完了: {chunks} チャンク / {duration}。変更段落: {changed}。時刻: {finishedAt}",
    lastEditChanged: "前回の編集で {count} 段落を変更。",
    saved: "保存先: {path}",
    openAbout: "About",
    sourceDropError: ".txt または .md ファイルをドロップしてください。",
    veryLongDisabled: "非常に長いテキスト (>1M): diff と重いプレビューを無効化しました。",
    noTextForEditor: "編集対象のテキストがありません。",
    editApplied: "編集を適用しました ({count} 段落)。",
    editNoIssues: "問題のある段落は見つかりませんでした。",
    noTranslationForArchive: "アーカイブに追加する翻訳がありません。",
    addedToArchive: "章をプロジェクトRAGアーカイブに追加しました。",
    translateBeforeMemory: "先に翻訳してからメモリを更新してください。",
    pastePrevChapter: "前章の全文を圧縮フィールドに貼り付けてください。",
    memoryUpdatedWithTerms: "メモリを更新し、用語集に {count} 件追加しました。",
    memoryUpdatedNoTerms: "メモリ更新: 新しい用語はありません。",
    memoryUpdated: "メモリを更新しました。",
    noTextForTerms: "用語自動検出の対象テキストがありません。",
    termsAdded: "自動検出で用語集に {count} 件追加しました。",
    termsNoNew: "新しい用語は見つかりませんでした。",
    enterResearchQuery: "コンテキスト検索クエリを入力してください。",
    researchUpdated: "リサーチ更新: +{terms} 用語, +{characters} キャラ。ソース: {sources}。",
    copied: "翻訳をクリップボードにコピーしました。",
    copyFailed: "自動コピーに失敗しました。",
    openTranslationProject: "translation project を開く",
    saveTranslationProject: "translation project を保存",
    createTranslationProject: "translation project を作成",
    operationStopped: "ユーザーが処理を停止しました。",
  },
} as const;

type UiTextKey = keyof (typeof UI_TEXT)["en"];

function formatUiText(
  language: UiLanguage,
  key: UiTextKey,
  vars?: Record<string, string | number>,
): string {
  const template = (UI_TEXT[language][key] ?? UI_TEXT.en[key]) as string;
  if (!vars) {
    return template;
  }
  return Object.entries(vars).reduce((acc, [name, value]) => {
    const token = `{${name}}`;
    return acc.split(token).join(String(value));
  }, template);
}

type DiffRow = {
  index: number;
  kind: "same" | "changed" | "added" | "removed";
  source: string;
  target: string;
};

type TranslationHistoryItem = {
  id: string;
  createdAt: string;
  model: string;
  sourceLang: string;
  targetLang: string;
  fileName: string;
  sourceText: string;
  translatedText: string;
  truncated: boolean;
};

type LocalMode = "cloud" | "local";
type LocalBackend = "ollama" | "candle-sidecar" | "llama-rs-sidecar";

const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "chutes", label: "Chutes" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "custom", label: "Custom OpenAI-compatible" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  chutes: "https://llm.chutes.ai/v1",
  ollama: "http://127.0.0.1:11434",
  custom: "",
};

const FALLBACK_MODELS: Record<ProviderId, string[]> = {
  openrouter: [
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-001",
    "deepseek/deepseek-chat-v3-0324",
    "meta-llama/llama-3.1-70b-instruct",
  ],
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  chutes: ["deepseek-chat", "qwen2.5-72b-instruct"],
  ollama: ["qwen2.5:14b", "llama3.1:8b"],
  custom: [],
};

function extractErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }

  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    const maybeError = (err as { error?: unknown }).error;
    if (typeof maybeError === "string" && maybeError.trim().length > 0) {
      return maybeError;
    }
  }

  return UI_TEXT.en.unknownError;
}

type TranslationChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
  contextBefore: string;
};

type GlossaryEntry = {
  original: string;
  translated: string;
  note: string;
};

type CharacterCard = {
  name: string;
  description: string;
  appearance: string;
  relationships: string;
};

type TranslationProject = {
  project_name: string;
  source_lang: string;
  target_lang: string;
  model: string;
  glossary: GlossaryEntry[];
  memory: string;
  character_cards?: CharacterCard[];
  chapter_archive?: ChapterArchiveEntry[];
};

type ChapterArchiveEntry = {
  id: string;
  title: string;
  text: string;
  added_at: string;
};

type ResearchContextResult = {
  summary: string;
  glossary: GlossaryEntry[];
  characters: CharacterCard[];
  sources: string[];
};

type BatchItemStatus = "queued" | "processing" | "done" | "error";

type BatchQueueItem = {
  id: string;
  path: string;
  name: string;
  priority: number;
  addedAt: number;
  status: BatchItemStatus;
  message?: string;
  savedPath?: string;
};

type ParagraphPatch = {
  index: number;
  text: string;
};

type WorkMode = "translate" | "editor";

type TranslationStats = {
  chunks: number;
  seconds: number;
  usedEditor: boolean;
  finishedAt: string;
};

type EditStats = {
  chunks: number;
  seconds: number;
  patchedParagraphs: number;
  finishedAt: string;
};

type ModelPricing = {
  model: string;
  prompt_per_token: number | null;
  completion_per_token: number | null;
  currency: string;
  source: string;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

function applyParagraphPatches(baseText: string, patches: ParagraphPatch[]): string {
  const parts = baseText.split("\n\n");
  for (const patch of patches) {
    const idx = patch.index - 1;
    if (idx < 0 || idx >= parts.length) {
      continue;
    }
    parts[idx] = patch.text;
  }
  return parts.join("\n\n");
}

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveFloat(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function clampText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxLength), truncated: true };
}

function buildSimpleLineDiff(source: string, target: string): DiffRow[] {
  const sourceLines = source.split("\n");
  const targetLines = target.split("\n");
  const max = Math.max(sourceLines.length, targetLines.length);
  const rows: DiffRow[] = [];

  for (let index = 0; index < max; index += 1) {
    const left = sourceLines[index] ?? "";
    const right = targetLines[index] ?? "";
    let kind: DiffRow["kind"] = "same";

    if (left && !right) {
      kind = "removed";
    } else if (!left && right) {
      kind = "added";
    } else if (left !== right) {
      kind = "changed";
    }

    rows.push({
      index: index + 1,
      kind,
      source: left,
      target: right,
    });
  }

  return rows;
}

function splitIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number,
): TranslationChunk[] {
  const chunks: TranslationChunk[] = [];
  let start = 0;
  let index = 0;
  const safeChunkSize = Math.max(300, chunkSize);
  const safeOverlap = Math.max(0, Math.min(overlap, safeChunkSize - 50));

  while (start < text.length) {
    let end = Math.min(start + safeChunkSize, text.length);

    if (end < text.length) {
      const breakpointFloor = start + Math.floor(safeChunkSize * 0.6);
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > breakpointFloor) {
        end = paragraphBreak + 2;
      } else {
        const lineBreak = text.lastIndexOf("\n", end);
        if (lineBreak > breakpointFloor) {
          end = lineBreak + 1;
        }
      }
    }

    if (end <= start) {
      end = Math.min(start + safeChunkSize, text.length);
    }

    const contextStart = Math.max(0, start - safeOverlap);
    const chunkText = text.slice(start, end);
    const contextBefore = text.slice(contextStart, start);

    chunks.push({ index, start, end, text: chunkText, contextBefore });
    start = end;
    index += 1;
  }

  return chunks;
}

function mergeUnique(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function basenameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

function createEmptyGlossaryRow(): GlossaryEntry {
  return { original: "", translated: "", note: "" };
}

function createEmptyCharacterCard(): CharacterCard {
  return { name: "", description: "", appearance: "", relationships: "" };
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-zа-яё0-9_-]/gi, "").trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 2);
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

function splitRagChunks(text: string, maxChars = 900): string[] {
  const paragraphs = text.split("\n\n").map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  let buffer = "";
  for (const para of paragraphs) {
    if (!buffer) {
      buffer = para;
      continue;
    }
    if (buffer.length + 2 + para.length <= maxChars) {
      buffer += `\n\n${para}`;
    } else {
      out.push(buffer);
      buffer = para;
    }
  }
  if (buffer) {
    out.push(buffer);
  }
  return out.length > 0 ? out : [text.slice(0, maxChars)];
}

function buildRagContext(
  query: string,
  archive: ChapterArchiveEntry[],
  topK: number,
  maxChars: number,
): string {
  if (!query.trim() || archive.length === 0 || topK <= 0 || maxChars <= 0) {
    return "";
  }
  const queryTokens = uniqueTokens(query);
  if (queryTokens.size === 0) {
    return "";
  }

  const scored: { score: number; title: string; chunk: string }[] = [];
  for (const chapter of archive) {
    const chunks = splitRagChunks(chapter.text);
    for (const chunk of chunks) {
      const chunkTokens = uniqueTokens(chunk);
      if (chunkTokens.size === 0) {
        continue;
      }
      let overlap = 0;
      queryTokens.forEach((token) => {
        if (chunkTokens.has(token)) {
          overlap += 1;
        }
      });
      if (overlap > 0) {
        scored.push({
          score: overlap / Math.sqrt(chunkTokens.size),
          title: chapter.title,
          chunk,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, topK);
  let currentLength = 0;
  const parts: string[] = [];
  for (const item of selected) {
    const part = `[${item.title}]\n${item.chunk}`;
    if (currentLength + part.length > maxChars) {
      break;
    }
    parts.push(part);
    currentLength += part.length + 2;
  }
  return parts.join("\n\n");
}

function normalizeGlossaryKey(value: string): string {
  return value.trim().toLowerCase();
}

function mergeGlossaryEntries(
  current: GlossaryEntry[],
  incoming: GlossaryEntry[],
): { merged: GlossaryEntry[]; added: number } {
  const merged = [...current];
  let added = 0;

  for (const item of incoming) {
    const original = item.original.trim();
    const translated = item.translated.trim();
    const note = item.note.trim();
    if (!original || !translated) {
      continue;
    }

    const key = normalizeGlossaryKey(original);
    const existingIndex = merged.findIndex(
      (entry) => normalizeGlossaryKey(entry.original) === key,
    );

    if (existingIndex === -1) {
      merged.push({ original, translated, note });
      added += 1;
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing.translated.trim()) {
      merged[existingIndex] = {
        original: existing.original || original,
        translated,
        note: existing.note || note,
      };
    }
  }

  return { merged, added };
}

function mergeCharacterCards(
  current: CharacterCard[],
  incoming: CharacterCard[],
): { merged: CharacterCard[]; added: number } {
  const merged = [...current];
  let added = 0;

  for (const card of incoming) {
    const name = card.name.trim();
    if (!name) {
      continue;
    }
    const existingIndex = merged.findIndex(
      (item) => item.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existingIndex === -1) {
      merged.push({
        name,
        description: card.description.trim(),
        appearance: card.appearance.trim(),
        relationships: card.relationships.trim(),
      });
      added += 1;
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      name: existing.name || name,
      description: existing.description || card.description.trim(),
      appearance: existing.appearance || card.appearance.trim(),
      relationships: existing.relationships || card.relationships.trim(),
    };
  }

  return { merged, added };
}

function App() {
  const [workMode, setWorkMode] = useState<WorkMode>(
    () => (localStorage.getItem(STORAGE_KEYS.workMode) === "editor" ? "editor" : "translate"),
  );
  const [provider, setProvider] = useState<ProviderId>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.provider);
    return (PROVIDERS.find((item) => item.id === raw)?.id ?? "openrouter") as ProviderId;
  });
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem(STORAGE_KEYS.baseUrl) ?? DEFAULT_BASE_URLS.openrouter,
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(STORAGE_KEYS.apiKey) ?? "",
  );
  const [model, setModel] = useState(
    () => localStorage.getItem(STORAGE_KEYS.model) ?? FALLBACK_MODELS.openrouter[0],
  );
  const [editorEnabled, setEditorEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.editorEnabled) === "1",
  );
  const [modelProvider, setModelProvider] = useState(
    () => localStorage.getItem(STORAGE_KEYS.modelProvider) ?? "",
  );
  const [editorModel, setEditorModel] = useState(
    () => localStorage.getItem(STORAGE_KEYS.editorModel) ?? "",
  );
  const [termModel, setTermModel] = useState(
    () => localStorage.getItem(STORAGE_KEYS.termModel) ?? "",
  );
  const [searchModel, setSearchModel] = useState(
    () => localStorage.getItem(STORAGE_KEYS.searchModel) ?? "",
  );
  const [calcCharsPerToken, setCalcCharsPerToken] = useState(
    () => localStorage.getItem(STORAGE_KEYS.calcCharsPerToken) ?? "4",
  );
  const [calcOutputRatio, setCalcOutputRatio] = useState(
    () => localStorage.getItem(STORAGE_KEYS.calcOutputRatio) ?? "1.05",
  );
  const [calcEditorChangeRatio, setCalcEditorChangeRatio] = useState(
    () => localStorage.getItem(STORAGE_KEYS.calcEditorChangeRatio) ?? "0.35",
  );
  const [models, setModels] = useState<string[]>(() => FALLBACK_MODELS.openrouter);
  const [modelsErrorText, setModelsErrorText] = useState("");
  const [isModelsLoading, setIsModelsLoading] = useState(false);
  const [sourceLang, setSourceLang] = useState(
    () => localStorage.getItem(STORAGE_KEYS.sourceLang) ?? "ja",
  );
  const [targetLang, setTargetLang] = useState(
    () => localStorage.getItem(STORAGE_KEYS.targetLang) ?? "ru",
  );
  const [chunkSize, setChunkSize] = useState(
    () => localStorage.getItem(STORAGE_KEYS.chunkSize) ?? "3200",
  );
  const [chunkOverlap, setChunkOverlap] = useState(
    () => localStorage.getItem(STORAGE_KEYS.chunkOverlap) ?? "300",
  );
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [editorText, setEditorText] = useState("");
  const [currentFilePath, setCurrentFilePath] = useState("");
  const [currentFileName, setCurrentFileName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectName, setProjectName] = useState("New Project");
  const [projectMemory, setProjectMemory] = useState("");
  const [chapterArchive, setChapterArchive] = useState<ChapterArchiveEntry[]>([]);
  const [memorySourceChapter, setMemorySourceChapter] = useState("");
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([createEmptyGlossaryRow()]);
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([createEmptyCharacterCard()]);
  const [autoGlossaryOnCompress, setAutoGlossaryOnCompress] = useState(true);
  const [isUpdatingMemory, setIsUpdatingMemory] = useState(false);
  const [isCompressingMemory, setIsCompressingMemory] = useState(false);
  const [isDetectingTerms, setIsDetectingTerms] = useState(false);
  const [isResearchingContext, setIsResearchingContext] = useState(false);
  const [compressInfo, setCompressInfo] = useState("");
  const [researchSources, setResearchSources] = useState<string[]>([]);
  const [lastSavedPath, setLastSavedPath] = useState("");
  const [copyInfo, setCopyInfo] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lastEditPatchCount, setLastEditPatchCount] = useState<number | null>(null);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [editSeconds, setEditSeconds] = useState(0);
  const [chunkProgress, setChunkProgress] = useState({ current: 0, total: 0 });
  const [editProgress, setEditProgress] = useState({ current: 0, total: 0 });
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null);
  const [selectedEditorChunkIndex, setSelectedEditorChunkIndex] = useState<number | null>(null);
  const [translationStats, setTranslationStats] = useState<TranslationStats | null>(null);
  const [editStats, setEditStats] = useState<EditStats | null>(null);
  const [translationPricing, setTranslationPricing] = useState<ModelPricing | null>(null);
  const [editorPricing, setEditorPricing] = useState<ModelPricing | null>(null);
  const [pricingError, setPricingError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isStopRequested, setIsStopRequested] = useState(false);
  const [isCostOpen, setIsCostOpen] = useState(false);
  const [localMode, setLocalMode] = useState<LocalMode>(
    () => (localStorage.getItem(STORAGE_KEYS.localMode) as LocalMode) || "cloud",
  );
  const [localBackend, setLocalBackend] = useState<LocalBackend>(
    () => (localStorage.getItem(STORAGE_KEYS.localBackend) as LocalBackend) || "ollama",
  );
  const [temperature, setTemperature] = useState(
    () => localStorage.getItem(STORAGE_KEYS.temperature) ?? "0.2",
  );
  const [topP, setTopP] = useState(
    () => localStorage.getItem(STORAGE_KEYS.topP) ?? "1.0",
  );
  const [maxTokens, setMaxTokens] = useState(
    () => localStorage.getItem(STORAGE_KEYS.maxTokens) ?? "0",
  );
  const [systemPromptTemplate, setSystemPromptTemplate] = useState(
    () =>
      localStorage.getItem(STORAGE_KEYS.systemPromptTemplate) ??
      "You are a professional light-novel translator. Write naturally and keep terminology consistent.",
  );
  const [ragTopK, setRagTopK] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ragTopK) ?? "4",
  );
  const [ragMaxChars, setRagMaxChars] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ragMaxChars) ?? "2800",
  );
  const [researchQuery, setResearchQuery] = useState(
    () => localStorage.getItem(STORAGE_KEYS.researchQuery) ?? "",
  );
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || "light",
  );
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(
    () => (localStorage.getItem(STORAGE_KEYS.uiLanguage) as UiLanguage) || "en",
  );
  const [editorFontSize, setEditorFontSize] = useState(
    () => localStorage.getItem(STORAGE_KEYS.editorFontSize) ?? "16",
  );
  const [cjkFontFamily, setCjkFontFamily] = useState(
    () =>
      localStorage.getItem(STORAGE_KEYS.cjkFontFamily) ??
      `"Noto Sans CJK JP", "Noto Sans CJK SC", "Yu Gothic UI", "Microsoft YaHei UI"`,
  );
  const [autosaveSeconds, setAutosaveSeconds] = useState(
    () => localStorage.getItem(STORAGE_KEYS.autosaveSeconds) ?? "8",
  );
  const [isSyncScrollEnabled, setIsSyncScrollEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.syncScroll) !== "0",
  );
  const [isDiffVisible, setIsDiffVisible] = useState(
    () => localStorage.getItem(STORAGE_KEYS.showDiff) !== "0",
  );
  const [history, setHistory] = useState<TranslationHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as TranslationHistoryItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isAutoStartEnabled, setIsAutoStartEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEYS.autoStartEnabled) === "1",
  );
  const [isAutoStartLoading, setIsAutoStartLoading] = useState(false);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSyncingScrollRef = useRef(false);

  const sourceStats = useMemo(
    () => `${sourceText.length} symbols`,
    [sourceText.length],
  );
  const t = (key: UiTextKey, vars?: Record<string, string | number>) =>
    formatUiText(uiLanguage, key, vars);
  const plannedChunks = useMemo(() => {
    const size = parsePositiveInt(chunkSize, 3200);
    const overlap = parsePositiveInt(chunkOverlap, 300);
    return splitIntoChunks(sourceText, size, overlap);
  }, [sourceText, chunkSize, chunkOverlap]);
  const editorBaseText = editorText.trim() ? editorText : sourceText;
  const plannedEditorChunks = useMemo(() => {
    const size = parsePositiveInt(chunkSize, 3200);
    const overlap = parsePositiveInt(chunkOverlap, 300);
    return splitIntoChunks(editorBaseText, size, overlap);
  }, [editorBaseText, chunkSize, chunkOverlap]);
  const chunkCountPreview = plannedChunks.length;
  const activeOutputText = workMode === "editor" ? editorText : translatedText;
  const progressTotal = workMode === "translate" ? chunkProgress.total : editProgress.total;
  const progressCurrent = workMode === "translate" ? chunkProgress.current : editProgress.current;
  const progressPercent =
    progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0;
  const isVeryLongText = sourceText.length > VERY_LONG_TEXT_THRESHOLD;
  const diffRows = useMemo(
    () => (isVeryLongText ? [] : buildSimpleLineDiff(sourceText, activeOutputText)),
    [sourceText, activeOutputText, isVeryLongText],
  );
  const costInputs = useMemo(() => {
    const charsPerToken = parsePositiveFloat(calcCharsPerToken, 4);
    const outputRatio = parsePositiveFloat(calcOutputRatio, 1.05);
    const editorChangeRatio = parsePositiveFloat(calcEditorChangeRatio, 0.35);

    const translationInputChars = plannedChunks.reduce(
      (acc, chunk) => acc + chunk.text.length + chunk.contextBefore.length,
      0,
    );
    const translationOutputChars = Math.round(sourceText.length * outputRatio);
    const editorInputChars = plannedEditorChunks.reduce(
      (acc, chunk) => acc + chunk.text.length + chunk.contextBefore.length,
      0,
    );
    const editorOutputChars = Math.round(editorBaseText.length * editorChangeRatio);

    return {
      charsPerToken,
      translationInputTokens: Math.ceil(translationInputChars / charsPerToken),
      translationOutputTokens: Math.ceil(translationOutputChars / charsPerToken),
      editorInputTokens: Math.ceil(editorInputChars / charsPerToken),
      editorOutputTokens: Math.ceil(editorOutputChars / charsPerToken),
    };
  }, [
    calcCharsPerToken,
    calcOutputRatio,
    calcEditorChangeRatio,
    plannedChunks,
    plannedEditorChunks,
    sourceText.length,
    editorBaseText.length,
  ]);
  const translationCostEstimate = useMemo(() => {
    if (!translationPricing) {
      return null;
    }
    const prompt = translationPricing.prompt_per_token ?? 0;
    const completion = translationPricing.completion_per_token ?? 0;
    return (
      costInputs.translationInputTokens * prompt +
      costInputs.translationOutputTokens * completion
    );
  }, [translationPricing, costInputs.translationInputTokens, costInputs.translationOutputTokens]);

  const editorCostEstimate = useMemo(() => {
    if (!editorPricing) {
      return null;
    }
    const prompt = editorPricing.prompt_per_token ?? 0;
    const completion = editorPricing.completion_per_token ?? 0;
    return costInputs.editorInputTokens * prompt + costInputs.editorOutputTokens * completion;
  }, [editorPricing, costInputs.editorInputTokens, costInputs.editorOutputTokens]);

  const requestTemperature = useMemo(() => {
    const value = Number.parseFloat(temperature);
    if (!Number.isFinite(value)) {
      return 0.2;
    }
    return Math.min(2, Math.max(0, value));
  }, [temperature]);

  const requestTopP = useMemo(() => {
    const value = Number.parseFloat(topP);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(1, Math.max(0.01, value));
  }, [topP]);

  const requestMaxTokens = useMemo(() => {
    const value = Number.parseInt(maxTokens, 10);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }, [maxTokens]);

  function persistSettings(next: {
    workMode?: WorkMode;
    provider?: ProviderId;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    editorEnabled?: boolean;
    modelProvider?: string;
    editorModel?: string;
    termModel?: string;
    searchModel?: string;
    calcCharsPerToken?: string;
    calcOutputRatio?: string;
    calcEditorChangeRatio?: string;
    sourceLang?: string;
    targetLang?: string;
    chunkSize?: string;
    chunkOverlap?: string;
    theme?: ThemeMode;
    editorFontSize?: string;
    cjkFontFamily?: string;
    autosaveSeconds?: string;
    syncScroll?: boolean;
    showDiff?: boolean;
    localMode?: LocalMode;
    localBackend?: LocalBackend;
    temperature?: string;
    topP?: string;
    maxTokens?: string;
    systemPromptTemplate?: string;
    ragTopK?: string;
    ragMaxChars?: string;
    researchQuery?: string;
    autoStartEnabled?: boolean;
    uiLanguage?: UiLanguage;
  }) {
    if (next.workMode !== undefined) {
      localStorage.setItem(STORAGE_KEYS.workMode, next.workMode);
    }
    if (next.provider !== undefined) {
      localStorage.setItem(STORAGE_KEYS.provider, next.provider);
    }
    if (next.baseUrl !== undefined) {
      localStorage.setItem(STORAGE_KEYS.baseUrl, next.baseUrl);
    }
    if (next.apiKey !== undefined) {
      localStorage.setItem(STORAGE_KEYS.apiKey, next.apiKey);
    }
    if (next.model !== undefined) {
      localStorage.setItem(STORAGE_KEYS.model, next.model);
    }
    if (next.editorEnabled !== undefined) {
      localStorage.setItem(STORAGE_KEYS.editorEnabled, next.editorEnabled ? "1" : "0");
    }
    if (next.modelProvider !== undefined) {
      localStorage.setItem(STORAGE_KEYS.modelProvider, next.modelProvider);
    }
    if (next.editorModel !== undefined) {
      localStorage.setItem(STORAGE_KEYS.editorModel, next.editorModel);
    }
    if (next.termModel !== undefined) {
      localStorage.setItem(STORAGE_KEYS.termModel, next.termModel);
    }
    if (next.searchModel !== undefined) {
      localStorage.setItem(STORAGE_KEYS.searchModel, next.searchModel);
    }
    if (next.calcCharsPerToken !== undefined) {
      localStorage.setItem(STORAGE_KEYS.calcCharsPerToken, next.calcCharsPerToken);
    }
    if (next.calcOutputRatio !== undefined) {
      localStorage.setItem(STORAGE_KEYS.calcOutputRatio, next.calcOutputRatio);
    }
    if (next.calcEditorChangeRatio !== undefined) {
      localStorage.setItem(STORAGE_KEYS.calcEditorChangeRatio, next.calcEditorChangeRatio);
    }
    if (next.sourceLang !== undefined) {
      localStorage.setItem(STORAGE_KEYS.sourceLang, next.sourceLang);
    }
    if (next.targetLang !== undefined) {
      localStorage.setItem(STORAGE_KEYS.targetLang, next.targetLang);
    }
    if (next.chunkSize !== undefined) {
      localStorage.setItem(STORAGE_KEYS.chunkSize, next.chunkSize);
    }
    if (next.chunkOverlap !== undefined) {
      localStorage.setItem(STORAGE_KEYS.chunkOverlap, next.chunkOverlap);
    }
    if (next.theme !== undefined) {
      localStorage.setItem(STORAGE_KEYS.theme, next.theme);
    }
    if (next.editorFontSize !== undefined) {
      localStorage.setItem(STORAGE_KEYS.editorFontSize, next.editorFontSize);
    }
    if (next.cjkFontFamily !== undefined) {
      localStorage.setItem(STORAGE_KEYS.cjkFontFamily, next.cjkFontFamily);
    }
    if (next.autosaveSeconds !== undefined) {
      localStorage.setItem(STORAGE_KEYS.autosaveSeconds, next.autosaveSeconds);
    }
    if (next.syncScroll !== undefined) {
      localStorage.setItem(STORAGE_KEYS.syncScroll, next.syncScroll ? "1" : "0");
    }
    if (next.showDiff !== undefined) {
      localStorage.setItem(STORAGE_KEYS.showDiff, next.showDiff ? "1" : "0");
    }
    if (next.localMode !== undefined) {
      localStorage.setItem(STORAGE_KEYS.localMode, next.localMode);
    }
    if (next.localBackend !== undefined) {
      localStorage.setItem(STORAGE_KEYS.localBackend, next.localBackend);
    }
    if (next.temperature !== undefined) {
      localStorage.setItem(STORAGE_KEYS.temperature, next.temperature);
    }
    if (next.topP !== undefined) {
      localStorage.setItem(STORAGE_KEYS.topP, next.topP);
    }
    if (next.maxTokens !== undefined) {
      localStorage.setItem(STORAGE_KEYS.maxTokens, next.maxTokens);
    }
    if (next.systemPromptTemplate !== undefined) {
      localStorage.setItem(STORAGE_KEYS.systemPromptTemplate, next.systemPromptTemplate);
    }
    if (next.ragTopK !== undefined) {
      localStorage.setItem(STORAGE_KEYS.ragTopK, next.ragTopK);
    }
    if (next.ragMaxChars !== undefined) {
      localStorage.setItem(STORAGE_KEYS.ragMaxChars, next.ragMaxChars);
    }
    if (next.researchQuery !== undefined) {
      localStorage.setItem(STORAGE_KEYS.researchQuery, next.researchQuery);
    }
    if (next.autoStartEnabled !== undefined) {
      localStorage.setItem(STORAGE_KEYS.autoStartEnabled, next.autoStartEnabled ? "1" : "0");
    }
    if (next.uiLanguage !== undefined) {
      localStorage.setItem(STORAGE_KEYS.uiLanguage, next.uiLanguage);
    }
  }

  async function refreshModels(showErrors = false) {
    if (provider !== "ollama" && provider !== "openrouter" && provider !== "custom" && !apiKey.trim()) {
      setModels(mergeUnique([model, ...FALLBACK_MODELS[provider]]));
      setModelsErrorText(
        showErrors ? t("providerNeedsApiKey") : "",
      );
      return;
    }

    setIsModelsLoading(true);
    setModelsErrorText("");
    try {
      const result = await invoke<string[]>("list_models", {
        provider,
        apiKey,
        baseUrl,
      });
      setModels(result);
      if (!result.includes(model) && result.length > 0) {
        setModel(result[0]);
        persistSettings({ model: result[0] });
      }
    } catch (err) {
      setModels(mergeUnique([model, ...FALLBACK_MODELS[provider]]));
      const message =
        err instanceof Error ? err.message : t("modelsLoadFailed");
      setModelsErrorText(showErrors ? message : "");
    } finally {
      setIsModelsLoading(false);
    }
  }

  useEffect(() => {
    setModels(mergeUnique([model, ...FALLBACK_MODELS[provider]]));
  }, [provider]);

  useEffect(() => {
    if (localMode !== "local") {
      return;
    }
    const local = resolveLocalProvider(localBackend);
    if (provider !== local.provider) {
      setProvider(local.provider);
      persistSettings({ provider: local.provider });
    }
    if (baseUrl !== local.baseUrl) {
      setBaseUrl(local.baseUrl);
      persistSettings({ baseUrl: local.baseUrl });
    }
    if (apiKey !== local.apiKey) {
      setApiKey(local.apiKey);
      persistSettings({ apiKey: local.apiKey });
    }
  }, [localMode, localBackend]);

  useEffect(() => {
    if (!editorModel && models.length > 0) {
      const fallbackEditorModel = models[0];
      setEditorModel(fallbackEditorModel);
      persistSettings({ editorModel: fallbackEditorModel });
    }
    if (!termModel && models.length > 0) {
      const fallbackTermModel = models[0];
      setTermModel(fallbackTermModel);
      persistSettings({ termModel: fallbackTermModel });
    }
    if (!searchModel && models.length > 0) {
      const fallbackSearchModel = models[0];
      setSearchModel(fallbackSearchModel);
      persistSettings({ searchModel: fallbackSearchModel });
    }
  }, [models, editorModel, termModel, searchModel]);

  useEffect(() => {
    const fetchPricing = async () => {
      setPricingError("");
      try {
        const pricing = await invoke<ModelPricing | null>("get_model_pricing", {
          provider,
          apiKey,
          baseUrl,
          model,
        });
        setTranslationPricing(pricing);
      } catch (err) {
        setTranslationPricing(null);
        setPricingError(extractErrorMessage(err));
      }

      try {
        const pricing = await invoke<ModelPricing | null>("get_model_pricing", {
          provider,
          apiKey,
          baseUrl,
          model: editorModel || model,
        });
        setEditorPricing(pricing);
      } catch {
        setEditorPricing(null);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchPricing();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [provider, apiKey, baseUrl, model, editorModel]);

  useEffect(() => {
    stopRequestedRef.current = isStopRequested;
  }, [isStopRequested]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      refreshModels(false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [provider, baseUrl, apiKey]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingSeconds(0);
      return;
    }

    const intervalId = setInterval(() => {
      setLoadingSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isLoading]);

  useEffect(() => {
    if (!isEditing) {
      setEditSeconds(0);
      return;
    }

    const intervalId = setInterval(() => {
      setEditSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isEditing]);

  useEffect(() => {
    if (workMode === "editor") {
      setLoadingSeconds(0);
    } else {
      setEditSeconds(0);
    }
  }, [workMode]);

  useEffect(() => {
    if (plannedChunks.length === 0) {
      setSelectedChunkIndex(null);
    } else if (selectedChunkIndex !== null && selectedChunkIndex >= plannedChunks.length) {
      setSelectedChunkIndex(null);
    }
  }, [plannedChunks.length, selectedChunkIndex]);

  useEffect(() => {
    if (plannedEditorChunks.length === 0) {
      setSelectedEditorChunkIndex(null);
    } else if (
      selectedEditorChunkIndex !== null &&
      selectedEditorChunkIndex >= plannedEditorChunks.length
    ) {
      setSelectedEditorChunkIndex(null);
    }
  }, [plannedEditorChunks.length, selectedEditorChunkIndex]);

  useEffect(() => {
    if (workMode === "editor" && !editorText.trim()) {
      if (translatedText.trim()) {
        setEditorText(translatedText);
      } else if (sourceText.trim()) {
        setEditorText(sourceText);
      }
    }
  }, [workMode, editorText, translatedText, sourceText]);

  useEffect(() => {
    getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion("1.0.0"));
    invoke<boolean>("get_autostart_enabled")
      .then((enabled) => {
        setIsAutoStartEnabled(enabled);
        persistSettings({ autoStartEnabled: enabled });
      })
      .catch(() => {
        // keep local fallback value when autostart API unavailable
      });
    const id = setTimeout(() => setIsSplashVisible(false), 1100);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--editor-font-size", `${parsePositiveInt(editorFontSize, 16)}px`);
    document.documentElement.style.setProperty("--cjk-font-family", cjkFontFamily);
  }, [theme, editorFontSize, cjkFontFamily]);

  useEffect(() => {
    if (!isSyncScrollEnabled) {
      return;
    }
    const source = sourceTextareaRef.current;
    const target = editorTextareaRef.current;
    if (!source || !target) {
      return;
    }

    const sync = (from: HTMLTextAreaElement, to: HTMLTextAreaElement) => {
      if (isSyncingScrollRef.current) {
        return;
      }
      isSyncingScrollRef.current = true;
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    };

    const onSourceScroll = () => sync(source, target);
    const onTargetScroll = () => sync(target, source);
    source.addEventListener("scroll", onSourceScroll);
    target.addEventListener("scroll", onTargetScroll);
    return () => {
      source.removeEventListener("scroll", onSourceScroll);
      target.removeEventListener("scroll", onTargetScroll);
    };
  }, [isSyncScrollEnabled, workMode, sourceText, translatedText, editorText]);

  useEffect(() => {
    const everySeconds = parsePositiveInt(autosaveSeconds, 8);
    if (everySeconds <= 0) {
      return;
    }
    const id = setInterval(() => {
      saveDraftSnapshot("interval");
    }, everySeconds * 1000);
    return () => clearInterval(id);
  }, [autosaveSeconds, workMode, sourceText, translatedText, editorText, currentFilePath, currentFileName]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragOver(true);
          return;
        }
        if (event.payload.type === "leave") {
          setIsDragOver(false);
          return;
        }
        if (event.payload.type === "drop") {
          setIsDragOver(false);
          const path = event.payload.paths.find((item) => /\.(txt|md)$/i.test(item));
          if (!path) {
            setErrorText(t("sourceDropError"));
            return;
          }
          try {
            await loadFileByPath(path);
          } catch (err) {
            setErrorText(extractErrorMessage(err));
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        setIsDragOver(false);
      });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    const lastProject = localStorage.getItem(STORAGE_KEYS.lastProjectPath);
    if (!lastProject) {
      return;
    }

    openProjectByPath(lastProject).catch(() => {
      localStorage.removeItem(STORAGE_KEYS.lastProjectPath);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (key === "escape" && (isLoading || isEditing || isBatchRunning)) {
        event.preventDefault();
        void handleStopProcessing();
        return;
      }

      if (!ctrlOrMeta) {
        return;
      }
      if (key === "o") {
        event.preventDefault();
        void handleOpenFile();
        return;
      }
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        void handleSaveTranslatedFile();
        return;
      }
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        void handleExportHtml();
        return;
      }
      if (key === "d" && event.shiftKey) {
        event.preventDefault();
        void handleExportDocx();
        return;
      }
      if (key === "enter") {
        event.preventDefault();
        if (workMode === "translate") {
          void handleTranslate();
        } else {
          void handleEditCurrentTranslation();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workMode, isLoading, isEditing, isBatchRunning, sourceText, translatedText, editorText, currentFilePath]);

  function focusChunk(chunk: TranslationChunk) {
    const textarea = sourceTextareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(chunk.start, chunk.end);
    setSelectedChunkIndex(chunk.index);
  }

  function focusEditorChunk(chunk: TranslationChunk) {
    const textarea = editorTextareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(chunk.start, chunk.end);
    setSelectedEditorChunkIndex(chunk.index);
  }

  function beginAbortScope(): AbortSignal {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller.signal;
  }

  function stopAbortScope() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }

  async function invokeWithAbort<T>(
    command: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) {
      throw new Error(t("operationStopped"));
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(new Error(t("operationStopped")));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      invoke<T>(command, args)
        .then(resolve)
        .catch(reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  function resolveLocalProvider(backend: LocalBackend): {
    provider: ProviderId;
    baseUrl: string;
    apiKey: string;
  } {
    if (backend === "ollama") {
      return { provider: "ollama", baseUrl: DEFAULT_BASE_URLS.ollama, apiKey: "" };
    }
    if (backend === "candle-sidecar") {
      return { provider: "custom", baseUrl: "http://127.0.0.1:8080/v1", apiKey: "" };
    }
    return { provider: "custom", baseUrl: "http://127.0.0.1:8081/v1", apiKey: "" };
  }

  function renderSystemPrompt(mode: "translate" | "edit" | "memory" | "glossary"): string {
    return systemPromptTemplate
      .split("{mode}").join(mode)
      .split("{source_lang}").join(sourceLang)
      .split("{target_lang}").join(targetLang)
      .split("{project_memory}").join(projectMemory);
  }

  function buildModelRequestOptions(mode: "translate" | "edit" | "memory" | "glossary") {
    return {
      systemPrompt: renderSystemPrompt(mode),
      temperature: requestTemperature,
      topP: requestTopP,
      maxTokens: requestMaxTokens,
    };
  }

  function persistHistory(next: TranslationHistoryItem[]) {
    setHistory(next);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(next));
  }

  function addHistoryItem(source: string, translated: string) {
    const sourceTrimmed = source.trim();
    const translatedTrimmed = translated.trim();
    if (!sourceTrimmed || !translatedTrimmed) {
      return;
    }

    const sourceClamped = clampText(sourceTrimmed, MAX_HISTORY_TEXT_LENGTH);
    const translatedClamped = clampText(translatedTrimmed, MAX_HISTORY_TEXT_LENGTH);
    const item: TranslationHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toLocaleString(),
      model,
      sourceLang,
      targetLang,
      fileName: currentFileName || "manual-input",
      sourceText: sourceClamped.text,
      translatedText: translatedClamped.text,
      truncated: sourceClamped.truncated || translatedClamped.truncated,
    };

    const next = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
    persistHistory(next);
  }

  function saveDraftSnapshot(reason: "interval" | "chunk" | "manual") {
    const output = (workMode === "editor" ? editorText : translatedText).trim();
    if (!output) {
      return;
    }

    const payload = {
      reason,
      createdAt: new Date().toISOString(),
      filePath: currentFilePath,
      fileName: currentFileName,
      model,
      sourceLang,
      targetLang,
      sourceText: sourceText.slice(0, MAX_HISTORY_TEXT_LENGTH),
      translatedText: output.slice(0, MAX_HISTORY_TEXT_LENGTH),
      workMode,
    };
    localStorage.setItem("lintl_autosave_draft", JSON.stringify(payload));
  }

  async function loadFileByPath(path: string) {
    const content = await invoke<string>("read_text_file", { path });
    setCurrentFilePath(path);
    setCurrentFileName(basenameFromPath(path));
    setSourceText(content);
    setTranslatedText("");
    setEditorText(content);
    setErrorText("");
    setLastSavedPath("");
    setCopyInfo("");
    setCompressInfo("");
    setChunkProgress({ current: 0, total: 0 });
    setEditProgress({ current: 0, total: 0 });
    setSelectedChunkIndex(null);
    setSelectedEditorChunkIndex(null);
    setTranslationStats(null);
    setEditStats(null);
    setLastEditPatchCount(null);
    if (content.length > VERY_LONG_TEXT_THRESHOLD) {
      setIsDiffVisible(false);
      persistSettings({ showDiff: false });
      setCopyInfo(t("veryLongDisabled"));
      setTimeout(() => setCopyInfo(""), 4000);
    }
  }

  function applyProjectToState(path: string, project: TranslationProject) {
    setProjectPath(path);
    setProjectName(project.project_name || "Project");
    setProjectMemory(project.memory || "");
    setGlossary(project.glossary.length > 0 ? project.glossary : [createEmptyGlossaryRow()]);
    setCharacterCards(
      project.character_cards && project.character_cards.length > 0
        ? project.character_cards
        : [createEmptyCharacterCard()],
    );
    setChapterArchive(
      (project.chapter_archive ?? []).map((chapter, index) => ({
        ...chapter,
        id: chapter.id || `archive-${index}-${Math.random().toString(36).slice(2, 7)}`,
        added_at: chapter.added_at || new Date().toISOString(),
      })),
    );
    localStorage.setItem(STORAGE_KEYS.lastProjectPath, path);

    if (project.source_lang) {
      setSourceLang(project.source_lang);
      persistSettings({ sourceLang: project.source_lang });
    }
    if (project.target_lang) {
      setTargetLang(project.target_lang);
      persistSettings({ targetLang: project.target_lang });
    }
    if (project.model) {
      setModel(project.model);
      persistSettings({ model: project.model });
    }
  }

  async function openProjectByPath(path: string) {
    const project = await invoke<TranslationProject>("read_translation_project", { path });
    applyProjectToState(path, project);
  }

  async function runEditorPass(
    inputText: string,
    signal: AbortSignal,
    sourceReference?: string,
  ): Promise<{ text: string; patchCount: number; chunks: number; seconds: number }> {
    const normalizedEditorModel = editorModel.trim() || model;
    const editorChunks = splitIntoChunks(
      inputText,
      parsePositiveInt(chunkSize, 3200),
      parsePositiveInt(chunkOverlap, 300),
    );
    const total = editorChunks.length;
    const startedAt = Date.now();
    let patchedTotal = 0;
    let editedAccum = "";

    setEditProgress({ current: 0, total });
    setSelectedEditorChunkIndex(null);
    setIsEditing(true);
    try {
      for (let i = 0; i < editorChunks.length; i += 1) {
        if (stopRequestedRef.current) {
          throw new Error(t("operationStopped"));
        }
        const chunk = editorChunks[i];
        setEditProgress({ current: i + 1, total });
        if (workMode === "editor") {
          focusEditorChunk(chunk);
        }

        const sourceBase = sourceReference ?? sourceText;
        const sourceChunk =
          sourceBase.length >= chunk.end ? sourceBase.slice(chunk.start, chunk.end) : sourceBase;

        const patches = await invokeWithAbort<ParagraphPatch[]>("suggest_edit_patches", {
          provider,
          baseUrl,
          apiKey,
          model: normalizedEditorModel,
          sourceLang,
          targetLang,
          sourceText: sourceChunk,
          editableText: chunk.text,
          modelProvider,
          ...buildModelRequestOptions("edit"),
        }, signal);

        const editedChunk = applyParagraphPatches(chunk.text, patches);
        patchedTotal += patches.length;
        editedAccum += editedChunk;

        if (workMode === "editor") {
          setEditorText(editedAccum);
        } else {
          setTranslatedText(editedAccum);
        }
        saveDraftSnapshot("chunk");
      }

      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      return {
        text: editedAccum,
        patchCount: patchedTotal,
        chunks: total,
        seconds,
      };
    } finally {
      setIsEditing(false);
    }
  }

  async function executeTranslationPipeline(
    sourceInput: string,
    signal: AbortSignal,
    options?: { focusChunks?: boolean; sourceForEditor?: string },
  ): Promise<{ finalText: string; chunksCount: number }> {
    const size = parsePositiveInt(chunkSize, 3200);
    const overlap = parsePositiveInt(chunkOverlap, 300);
    const chunks = splitIntoChunks(sourceInput, size, overlap);
    let translatedAccum = "";
    const focusChunks = options?.focusChunks ?? false;

    setChunkProgress({ current: 0, total: chunks.length });
    setSelectedChunkIndex(null);

    for (let i = 0; i < chunks.length; i += 1) {
      if (stopRequestedRef.current) {
        throw new Error(t("operationStopped"));
      }
      const chunk = chunks[i];
      setChunkProgress({ current: i + 1, total: chunks.length });
      if (focusChunks) {
        focusChunk(chunk);
      }
      const ragContext = buildRagContext(
        chunk.text,
        chapterArchive,
        parsePositiveInt(ragTopK, 4),
        parsePositiveInt(ragMaxChars, 2800),
      );

      const result = await invokeWithAbort<string>("translate", {
        text: chunk.text,
        model,
        apiKey,
        sourceLang,
        targetLang,
        provider,
        baseUrl,
        contextBefore: chunk.contextBefore,
        glossary,
        characterCards,
        ragContext,
        memory: projectMemory,
        modelProvider,
        ...buildModelRequestOptions("translate"),
      }, signal);

      translatedAccum += result;
      setTranslatedText(translatedAccum);
      saveDraftSnapshot("chunk");
    }

    let finalText = translatedAccum;
    if (editorEnabled && finalText.trim()) {
      const edited = await runEditorPass(
        finalText,
        signal,
        options?.sourceForEditor ?? sourceInput,
      );
      finalText = edited.text;
      setLastEditPatchCount(edited.patchCount);
      setEditStats({
        chunks: edited.chunks,
        seconds: edited.seconds,
        patchedParagraphs: edited.patchCount,
        finishedAt: new Date().toLocaleString(),
      });
    } else {
      setLastEditPatchCount(null);
    }

    setTranslatedText(finalText);
    setEditorText(finalText);
    return { finalText, chunksCount: chunks.length };
  }

  async function handleTranslate() {
    setErrorText("");
    setLastSavedPath("");
    setTranslationStats(null);
    setEditStats(null);
    setIsStopRequested(false);
    await invoke("clear_cancel_processing");
    setIsLoading(true);
    const signal = beginAbortScope();
    setChunkProgress({ current: 0, total: 0 });
    setSelectedChunkIndex(null);
    const startedAt = Date.now();
    try {
      const { finalText, chunksCount } = await executeTranslationPipeline(sourceText, signal, {
        focusChunks: true,
        sourceForEditor: sourceText,
      });
      addHistoryItem(sourceText, finalText);
      saveDraftSnapshot("manual");

      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setTranslationStats({
        chunks: chunksCount,
        seconds,
        usedEditor: editorEnabled,
        finishedAt: new Date().toLocaleString(),
      });
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsLoading(false);
      setChunkProgress((prev) => (prev.total > 0 ? prev : { current: 0, total: 0 }));
      setIsStopRequested(false);
      stopAbortScope();
      await invoke("clear_cancel_processing");
    }
  }

  async function handleCreateProject() {
    try {
      const suggestedName = currentFileName
        ? basenameFromPath(currentFileName).replace(/\.(txt|md)$/i, "")
        : "novel-project";
      const suggestedPath = currentFilePath
        ? `${currentFilePath.replace(/[^\\/]+$/, "")}.translation-project`
        : undefined;
      const selectedPath = await save({
        title: t("createTranslationProject"),
        defaultPath: suggestedPath,
        filters: [{ name: "Translation project", extensions: ["translation-project"] }],
      });
      if (!selectedPath) {
        return;
      }

      const nextProject: TranslationProject = {
        project_name: suggestedName || "New Project",
        source_lang: sourceLang,
        target_lang: targetLang,
        model,
        glossary: glossary.filter(
          (item) => item.original.trim().length > 0 || item.translated.trim().length > 0,
        ),
        memory: projectMemory,
        character_cards: characterCards.filter((card) => card.name.trim().length > 0),
        chapter_archive: chapterArchive,
      };
      await invoke("write_translation_project", { path: selectedPath, project: nextProject });
      setProjectPath(selectedPath);
      setProjectName(nextProject.project_name);
      setLastSavedPath(selectedPath);
      localStorage.setItem(STORAGE_KEYS.lastProjectPath, selectedPath);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleEditCurrentTranslation() {
    const base = (workMode === "editor" ? editorText : translatedText).trim() || sourceText.trim();
    if (!base) {
      setErrorText(t("noTextForEditor"));
      return;
    }
    try {
      const signal = beginAbortScope();
      setIsStopRequested(false);
      await invoke("clear_cancel_processing");
      setEditStats(null);
      const edited = await runEditorPass(base, signal);
      if (workMode === "editor") {
        setEditorText(edited.text);
      } else {
        setTranslatedText(edited.text);
      }
      addHistoryItem(sourceText, edited.text);
      saveDraftSnapshot("manual");
      setLastEditPatchCount(edited.patchCount);
      setEditStats({
        chunks: edited.chunks,
        seconds: edited.seconds,
        patchedParagraphs: edited.patchCount,
        finishedAt: new Date().toLocaleString(),
      });
      setCopyInfo(
        edited.patchCount > 0
          ? t("editApplied", { count: edited.patchCount })
          : t("editNoIssues"),
      );
      setTimeout(() => setCopyInfo(""), 2500);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
    stopAbortScope();
    await invoke("clear_cancel_processing");
    setIsStopRequested(false);
  }

  async function handleOpenProject() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Translation project", extensions: ["translation-project", "json"] }],
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }

      await openProjectByPath(selected);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleSaveProject() {
    try {
      let pathToSave = projectPath;
      if (!pathToSave) {
        const selectedPath = await save({
          title: t("saveTranslationProject"),
          defaultPath: currentFilePath
            ? `${currentFilePath.replace(/[^\\/]+$/, "")}.translation-project`
            : ".translation-project",
          filters: [{ name: "Translation project", extensions: ["translation-project"] }],
        });
        if (!selectedPath) {
          return;
        }
        pathToSave = selectedPath;
        setProjectPath(selectedPath);
      }

      const project: TranslationProject = {
        project_name: projectName,
        source_lang: sourceLang,
        target_lang: targetLang,
        model,
        glossary: glossary.filter(
          (item) => item.original.trim().length > 0 || item.translated.trim().length > 0,
        ),
        memory: projectMemory,
        character_cards: characterCards.filter((card) => card.name.trim().length > 0),
        chapter_archive: chapterArchive,
      };
      await invoke("write_translation_project", { path: pathToSave, project });
      setLastSavedPath(pathToSave);
      localStorage.setItem(STORAGE_KEYS.lastProjectPath, pathToSave);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  function updateGlossaryRow(index: number, next: Partial<GlossaryEntry>) {
    setGlossary((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next } : item)),
    );
  }

  function addGlossaryRow() {
    setGlossary((prev) => [...prev, createEmptyGlossaryRow()]);
  }

  function removeGlossaryRow(index: number) {
    setGlossary((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [createEmptyGlossaryRow()] : next;
    });
  }

  function updateCharacterCard(index: number, next: Partial<CharacterCard>) {
    setCharacterCards((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next } : item)),
    );
  }

  function addCharacterCard() {
    setCharacterCards((prev) => [...prev, createEmptyCharacterCard()]);
  }

  function removeCharacterCard(index: number) {
    setCharacterCards((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [createEmptyCharacterCard()] : next;
    });
  }

  function addCurrentChapterToArchive() {
    const translated = (workMode === "editor" ? editorText : translatedText).trim();
    if (!translated) {
      setErrorText(t("noTranslationForArchive"));
      return;
    }
    const titleBase = currentFileName || `chapter-${chapterArchive.length + 1}`;
    const item: ChapterArchiveEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: titleBase,
      text: translated,
      added_at: new Date().toISOString(),
    };
    setChapterArchive((prev) => [item, ...prev].slice(0, 200));
    setCopyInfo(t("addedToArchive"));
    setTimeout(() => setCopyInfo(""), 2000);
  }

  function removeArchiveItem(id: string) {
    setChapterArchive((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleUpdateMemorySummary() {
    if (!translatedText.trim()) {
      setErrorText(t("translateBeforeMemory"));
      return;
    }
    setIsUpdatingMemory(true);
    try {
      const memory = await invoke<string>("update_memory_summary", {
        provider,
        baseUrl,
        apiKey,
        model,
        previousMemory: projectMemory,
        chapterSource: sourceText,
        chapterTranslation: translatedText,
        targetLang,
        modelProvider,
        ...buildModelRequestOptions("memory"),
      });
      setProjectMemory(memory);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsUpdatingMemory(false);
    }
  }

  async function handleCompressChapterToMemory() {
    if (!memorySourceChapter.trim()) {
      setErrorText(t("pastePrevChapter"));
      return;
    }
    setIsCompressingMemory(true);
    setCompressInfo("");
    try {
      const memory = await invoke<string>("compress_chapter_to_memory", {
        provider,
        baseUrl,
        apiKey,
        model,
        sourceLang,
        targetLang,
        currentMemory: projectMemory,
        chapterText: memorySourceChapter,
        modelProvider,
        ...buildModelRequestOptions("memory"),
      });
      setProjectMemory(memory);

      if (autoGlossaryOnCompress) {
        const suggested = await invoke<GlossaryEntry[]>("suggest_glossary_entries", {
          provider,
          baseUrl,
          apiKey,
          model,
          sourceLang,
          targetLang,
          currentMemory: memory,
          chapterText: memorySourceChapter,
          existingGlossary: glossary,
          modelProvider,
          ...buildModelRequestOptions("glossary"),
        });
        const { merged, added } = mergeGlossaryEntries(glossary, suggested);
        setGlossary(merged);
        setCompressInfo(
          added > 0
            ? t("memoryUpdatedWithTerms", { count: added })
            : t("memoryUpdatedNoTerms"),
        );
      } else {
        setCompressInfo(t("memoryUpdated"));
      }
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsCompressingMemory(false);
    }
  }

  async function handleAutoDetectTerms() {
    const chapterText = sourceText.trim() || memorySourceChapter.trim();
    if (!chapterText) {
      setErrorText(t("noTextForTerms"));
      return;
    }
    setIsDetectingTerms(true);
    try {
      const suggested = await invoke<GlossaryEntry[]>("suggest_glossary_entries", {
        provider,
        baseUrl,
        apiKey,
        model: termModel || model,
        sourceLang,
        targetLang,
        currentMemory: projectMemory,
        chapterText,
        existingGlossary: glossary,
        modelProvider,
        ...buildModelRequestOptions("glossary"),
      });
      const { merged, added } = mergeGlossaryEntries(glossary, suggested);
      setGlossary(merged);
      setCompressInfo(
        added > 0
          ? t("termsAdded", { count: added })
          : t("termsNoNew"),
      );
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsDetectingTerms(false);
    }
  }

  async function handleResearchContext() {
    const query = researchQuery.trim() || projectName.trim() || currentFileName.trim();
    if (!query) {
      setErrorText(t("enterResearchQuery"));
      return;
    }
    setIsResearchingContext(true);
    try {
      const result = await invoke<ResearchContextResult>("research_project_context", {
        provider,
        baseUrl,
        apiKey,
        model: searchModel || model,
        projectName,
        userQuery: query,
        sourceLang,
        targetLang,
        currentMemory: projectMemory,
        existingGlossary: glossary,
        existingCharacters: characterCards,
        modelProvider,
        ...buildModelRequestOptions("memory"),
      });

      if (result.summary.trim()) {
        setProjectMemory((prev) =>
          prev.trim()
            ? `${prev.trim()}\n\n[Research]\n${result.summary.trim()}`
            : result.summary.trim(),
        );
      }
      const mergedGlossary = mergeGlossaryEntries(glossary, result.glossary);
      setGlossary(mergedGlossary.merged);

      const mergedCharacters = mergeCharacterCards(characterCards, result.characters);
      setCharacterCards(mergedCharacters.merged);
      setResearchSources(result.sources ?? []);

      setCompressInfo(
        t("researchUpdated", {
          terms: mergedGlossary.added,
          characters: mergedCharacters.added,
          sources: result.sources.length,
        }),
      );
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsResearchingContext(false);
    }
  }

  async function handleOpenFile() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: "Text/Markdown/EPUB", extensions: ["txt", "md", "epub"] },
          { name: "Text", extensions: ["txt"] },
          { name: "Markdown", extensions: ["md"] },
          { name: "EPUB", extensions: ["epub"] },
        ],
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      await loadFileByPath(selected);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleSaveTranslatedFile() {
    try {
      const textToSave = workMode === "editor" ? editorText : translatedText;
      const savedPath = await invoke<string>("save_translated_file", {
        originalPath: currentFilePath,
        translatedText: textToSave,
      });
      setLastSavedPath(savedPath);
      saveDraftSnapshot("manual");
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleCopyTranslation() {
    const textToCopy = workMode === "editor" ? editorText : translatedText;
    if (!textToCopy.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyInfo(t("copied"));
      setTimeout(() => setCopyInfo(""), 2500);
    } catch {
      setCopyInfo(t("copyFailed"));
    }
  }

  async function handleExportHtml() {
    try {
      const textToExport = workMode === "editor" ? editorText : translatedText;
      const savedPath = await invoke<string>("export_translation_html", {
        originalPath: currentFilePath,
        translatedText: textToExport,
      });
      setLastSavedPath(savedPath);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleExportDocx() {
    try {
      const textToExport = workMode === "editor" ? editorText : translatedText;
      const savedPath = await invoke<string>("export_translation_docx", {
        originalPath: currentFilePath,
        translatedText: textToExport,
      });
      setLastSavedPath(savedPath);
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    }
  }

  async function handleStopProcessing() {
    try {
      setIsStopRequested(true);
      abortControllerRef.current?.abort();
      await invoke("request_cancel_processing");
    } catch {
      // no-op: UI state still reflects stop request
    }
  }

  async function handleToggleAutoStart(next: boolean) {
    setIsAutoStartLoading(true);
    try {
      await invoke("set_autostart_enabled", { enabled: next });
      setIsAutoStartEnabled(next);
      persistSettings({ autoStartEnabled: next });
    } catch (err) {
      const message = extractErrorMessage(err);
      setErrorText(message);
      alert(message);
    } finally {
      setIsAutoStartLoading(false);
    }
  }

  function handleLoadHistoryItem(item: TranslationHistoryItem) {
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setEditorText(item.translatedText);
    setCurrentFileName(item.fileName);
    setCurrentFilePath("");
    setErrorText("");
  }

  function handleDeleteHistoryItem(id: string) {
    const next = history.filter((item) => item.id !== id);
    persistHistory(next);
  }

  function handleClearHistory() {
    persistHistory([]);
  }

  function updateBatchItem(id: string, patch: Partial<BatchQueueItem>) {
    setBatchQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function enqueueBatchPaths(paths: string[]) {
    if (paths.length === 0) {
      return;
    }
    setBatchQueue((prev) => {
      const existing = new Set(prev.map((item) => item.path));
      const now = Date.now();
      const nextItems = paths
        .filter((path) => !existing.has(path))
        .map((path, idx) => ({
          id: `${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          path,
          name: basenameFromPath(path),
          priority: 0,
          addedAt: now + idx,
          status: "queued" as BatchItemStatus,
        }));
      return [...prev, ...nextItems];
    });
  }

  async function handleAddBatchFiles() {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          { name: "Text/Markdown/EPUB", extensions: ["txt", "md", "epub"] },
          { name: "Text", extensions: ["txt"] },
          { name: "Markdown", extensions: ["md"] },
          { name: "EPUB", extensions: ["epub"] },
        ],
      });
      if (!selected) {
        return;
      }
      const selectedPaths = Array.isArray(selected) ? selected : [selected];
      enqueueBatchPaths(selectedPaths);
    } catch (err) {
      setErrorText(extractErrorMessage(err));
    }
  }

  function handleRemoveBatchItem(id: string) {
    setBatchQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function handleClearBatchDone() {
    setBatchQueue((prev) => prev.filter((item) => item.status !== "done"));
  }

  async function handleRunBatchQueue() {
    const queued = batchQueue.filter((item) => item.status === "queued");
    if (queued.length === 0 || isBatchRunning || isLoading || isEditing) {
      return;
    }

    setIsBatchRunning(true);
    setIsLoading(true);
    setErrorText("");
    setIsStopRequested(false);
    await invoke("clear_cancel_processing");
    const signal = beginAbortScope();
    setTranslationStats(null);
    setEditStats(null);

    const ordered = [...queued].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.addedAt - b.addedAt;
    });

    try {
      for (const item of ordered) {
        if (stopRequestedRef.current || signal.aborted) {
          break;
        }
        updateBatchItem(item.id, { status: "processing", message: undefined });
        setCurrentFilePath(item.path);
        setCurrentFileName(item.name);
        try {
          const content = await invoke<string>("read_text_file", { path: item.path });
          setSourceText(content);
          setTranslatedText("");
          setEditorText(content);

          const { finalText } = await executeTranslationPipeline(content, signal, {
            focusChunks: false,
            sourceForEditor: content,
          });
          addHistoryItem(content, finalText);
          const savedPath = await invoke<string>("save_translated_file", {
            originalPath: item.path,
            translatedText: finalText,
          });
          updateBatchItem(item.id, { status: "done", savedPath });
        } catch (err) {
          updateBatchItem(item.id, {
            status: "error",
            message: extractErrorMessage(err),
          });
        } finally {
          setChunkProgress({ current: 0, total: 0 });
        }
      }
    } finally {
      setIsLoading(false);
      setIsBatchRunning(false);
      setIsStopRequested(false);
      stopAbortScope();
      await invoke("clear_cancel_processing");
    }
  }

  return (
    <main class="app-shell">
      {isSplashVisible && (
        <div class="splash-overlay">
          <div class="splash-card">
            <h2>LinTL</h2>
            <p>{t("splashLoading")}</p>
          </div>
        </div>
      )}
      <header class="topbar">
        <div>
          <h1>LinTL</h1>
          <p>{t("appSubtitle", { version: appVersion })}</p>
        </div>
        <div class="history-actions">
          <button type="button" class="secondary-button" onClick={() => setShowAbout(true)}>
            {t("openAbout")}
          </button>
        </div>
      </header>
      {showAbout && (
        <section class="collapsible-panel">
          <div class="panel-head">
            <h2>About</h2>
            <button type="button" class="secondary-button" onClick={() => setShowAbout(false)}>
              {t("close")}
            </button>
          </div>
          <p class="loading-text">LinTL v{appVersion}</p>
          <p class="loading-text">Tauri + Preact desktop translator for long-form novels.</p>
          <p class="loading-text">
            Hotkeys: Ctrl/Cmd+O open, Ctrl/Cmd+Enter run, Ctrl/Cmd+S save, Shift+Ctrl/Cmd+S HTML, Shift+Ctrl/Cmd+D DOCX, Esc cancel.
          </p>
        </section>
      )}
      {isDragOver && <div class="drop-banner">{t("dropFile")}</div>}
      <section class="mode-switch">
        <button
          type="button"
          class={`secondary-button ${workMode === "translate" ? "mode-active" : ""}`}
          onClick={() => {
            setWorkMode("translate");
            persistSettings({ workMode: "translate" });
          }}
        >
          {t("modeTranslate")}
        </button>
        <button
          type="button"
          class={`secondary-button ${workMode === "editor" ? "mode-active" : ""}`}
          onClick={() => {
            setWorkMode("editor");
            persistSettings({ workMode: "editor" });
          }}
        >
          {t("modeEditor")}
        </button>
      </section>

      <section class="collapsible-panel settings-panel">
        <div class="panel-head">
          <h2>{t("settings")}</h2>
          <button
            type="button"
            class="secondary-button panel-toggle"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
          >
            {isSettingsOpen ? t("collapse") : t("expand")}
          </button>
        </div>
        {isSettingsOpen && (
          <section class="settings">
            <label>
              Provider
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.currentTarget.value as ProviderId;
                  const nextBase = DEFAULT_BASE_URLS[next];
                  setProvider(next);
                  setBaseUrl(nextBase);
                  persistSettings({ provider: next, baseUrl: nextBase });
                }}
              >
                {PROVIDERS.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Base URL
              <input
                value={baseUrl}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setBaseUrl(next);
                  persistSettings({ baseUrl: next });
                }}
                placeholder="https://api.provider.com/v1"
              />
            </label>

            <label>
              API key
              <input
                type="password"
                value={apiKey}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setApiKey(next);
                  persistSettings({ apiKey: next });
                }}
                placeholder="sk-or-v1-..."
              />
            </label>

            <label>
              Model
              <div class="model-row">
                <select
                  value={model}
                  onChange={(e) => {
                    const next = e.currentTarget.value;
                    setModel(next);
                    persistSettings({ model: next });
                  }}
                >
                  {models.map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  class="refresh-button"
                  onClick={() => refreshModels(true)}
                  disabled={isModelsLoading}
                >
                  {isModelsLoading ? "..." : t("refresh")}
                </button>
              </div>
              {modelsErrorText && <small class="model-error">{modelsErrorText}</small>}
            </label>

            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={editorEnabled}
                onChange={(e) => {
                  const next = e.currentTarget.checked;
                  setEditorEnabled(next);
                  persistSettings({ editorEnabled: next });
                }}
              />
              <span>{t("postEditWithSecondModel")}</span>
            </label>

            <label>
              Editor Model
              <select
                value={editorModel}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setEditorModel(next);
                  persistSettings({ editorModel: next });
                }}
              >
                {models.map((item) => (
                  <option value={item} key={`editor-${item}`}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Term Model
              <select
                value={termModel}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setTermModel(next);
                  persistSettings({ termModel: next });
                }}
              >
                {models.map((item) => (
                  <option value={item} key={`term-${item}`}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Search Model
              <select
                value={searchModel}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setSearchModel(next);
                  persistSettings({ searchModel: next });
                }}
              >
                {models.map((item) => (
                  <option value={item} key={`search-${item}`}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Model Provider (OpenRouter)
              <input
                value={modelProvider}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setModelProvider(next);
                  persistSettings({ modelProvider: next });
                }}
                placeholder={t("modelProviderPlaceholder")}
              />
            </label>

            <label>
              Runtime mode
              <select
                value={localMode}
                onChange={(e) => {
                  const next = e.currentTarget.value as LocalMode;
                  setLocalMode(next);
                  persistSettings({ localMode: next });
                }}
              >
                <option value="cloud">Cloud APIs</option>
                <option value="local">Local mode</option>
              </select>
            </label>

            <label>
              Local backend
              <select
                value={localBackend}
                onChange={(e) => {
                  const next = e.currentTarget.value as LocalBackend;
                  setLocalBackend(next);
                  persistSettings({ localBackend: next });
                }}
              >
                <option value="ollama">Ollama</option>
                <option value="candle-sidecar">candle-sidecar</option>
                <option value="llama-rs-sidecar">llama-rs-sidecar</option>
              </select>
            </label>

            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={isAutoStartEnabled}
                disabled={isAutoStartLoading}
                onChange={(e) => {
                  void handleToggleAutoStart(e.currentTarget.checked);
                }}
              />
              <span>{isAutoStartLoading ? t("autoStartUpdating") : t("autoStartLabel")}</span>
            </label>

            <label>
              {t("language")}
              <select
                value={uiLanguage}
                onChange={(e) => {
                  const next = e.currentTarget.value as UiLanguage;
                  setUiLanguage(next);
                  persistSettings({ uiLanguage: next });
                }}
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="ja">日本語</option>
              </select>
            </label>

            <label>
              Source
              <input
                value={sourceLang}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setSourceLang(next);
                  persistSettings({ sourceLang: next });
                }}
                placeholder="ja"
              />
            </label>

            <label>
              Target
              <input
                value={targetLang}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setTargetLang(next);
                  persistSettings({ targetLang: next });
                }}
                placeholder="ru"
              />
            </label>

            <label>
              Chunk size
              <input
                type="number"
                min="300"
                step="100"
                value={chunkSize}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setChunkSize(next);
                  persistSettings({ chunkSize: next });
                }}
                placeholder="3200"
              />
            </label>

            <label>
              Overlap
              <input
                type="number"
                min="0"
                step="50"
                value={chunkOverlap}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setChunkOverlap(next);
                  persistSettings({ chunkOverlap: next });
                }}
                placeholder="300"
              />
            </label>

            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setTemperature(next);
                  persistSettings({ temperature: next });
                }}
              />
            </label>

            <label>
              Top P
              <input
                type="number"
                min="0.01"
                max="1"
                step="0.01"
                value={topP}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setTopP(next);
                  persistSettings({ topP: next });
                }}
              />
            </label>

            <label>
              Max tokens (0=auto)
              <input
                type="number"
                min="0"
                step="128"
                value={maxTokens}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setMaxTokens(next);
                  persistSettings({ maxTokens: next });
                }}
              />
            </label>

            <label>
              RAG top-k
              <input
                type="number"
                min="1"
                max="20"
                value={ragTopK}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setRagTopK(next);
                  persistSettings({ ragTopK: next });
                }}
              />
            </label>

            <label>
              RAG max chars
              <input
                type="number"
                min="300"
                max="12000"
                step="100"
                value={ragMaxChars}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setRagMaxChars(next);
                  persistSettings({ ragMaxChars: next });
                }}
              />
            </label>

            <label>
              System prompt template
              <textarea
                class="memory-box"
                value={systemPromptTemplate}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setSystemPromptTemplate(next);
                  persistSettings({ systemPromptTemplate: next });
                }}
                placeholder={t("systemPromptPlaceholder")}
              />
            </label>

            <label>
              Theme
              <select
                value={theme}
                onChange={(e) => {
                  const next = e.currentTarget.value as ThemeMode;
                  setTheme(next);
                  persistSettings({ theme: next });
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="oled">OLED</option>
              </select>
            </label>

            <label>
              Font size
              <input
                type="number"
                min="12"
                max="32"
                value={editorFontSize}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setEditorFontSize(next);
                  persistSettings({ editorFontSize: next });
                }}
              />
            </label>

            <label>
              CJK font stack
              <input
                value={cjkFontFamily}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setCjkFontFamily(next);
                  persistSettings({ cjkFontFamily: next });
                }}
                placeholder={'"Noto Sans CJK JP", "Noto Sans CJK SC"'}
              />
            </label>

            <label>
              Autosave (sec)
              <input
                type="number"
                min="2"
                max="120"
                value={autosaveSeconds}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setAutosaveSeconds(next);
                  persistSettings({ autosaveSeconds: next });
                }}
              />
            </label>

            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={isSyncScrollEnabled}
                onChange={(e) => {
                  const next = e.currentTarget.checked;
                  setIsSyncScrollEnabled(next);
                  persistSettings({ syncScroll: next });
                }}
              />
              <span>Sync scroll (source/translation)</span>
            </label>

            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={isDiffVisible}
                onChange={(e) => {
                  const next = e.currentTarget.checked;
                  setIsDiffVisible(next);
                  persistSettings({ showDiff: next });
                }}
              />
              <span>{t("showDiff")}</span>
            </label>
          </section>
        )}
      </section>

      <section class="collapsible-panel cost-panel">
        <div class="panel-head">
          <h2>{t("costCalc")}</h2>
          <button
            type="button"
            class="secondary-button panel-toggle"
            onClick={() => setIsCostOpen((prev) => !prev)}
          >
            {isCostOpen ? t("collapse") : t("expand")}
          </button>
        </div>
        {isCostOpen && (
          <div class="cost-grid">
            <label>
              Chars per token
              <input
                value={calcCharsPerToken}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setCalcCharsPerToken(next);
                  persistSettings({ calcCharsPerToken: next });
                }}
                placeholder="4"
              />
            </label>
            <label>
              Output ratio (translate)
              <input
                value={calcOutputRatio}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setCalcOutputRatio(next);
                  persistSettings({ calcOutputRatio: next });
                }}
                placeholder="1.05"
              />
            </label>
            <label>
              Changed ratio (editor)
              <input
                value={calcEditorChangeRatio}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setCalcEditorChangeRatio(next);
                  persistSettings({ calcEditorChangeRatio: next });
                }}
                placeholder="0.35"
              />
            </label>

            <p class="loading-text">
              Translate tokens: in ~{costInputs.translationInputTokens}, out ~
              {costInputs.translationOutputTokens}
            </p>
            <p class="loading-text">
              Editor tokens: in ~{costInputs.editorInputTokens}, out ~{costInputs.editorOutputTokens}
            </p>

            <p class="loading-text">
              {t("translationCost")}:{" "}
              {translationCostEstimate !== null
                ? `${formatUsd(translationCostEstimate)} (${translationPricing?.source})`
                : t("noPricingData")}
            </p>
            <p class="loading-text">
              {t("editingCost")}:{" "}
              {editorCostEstimate !== null
                ? `${formatUsd(editorCostEstimate)} (${editorPricing?.source})`
                : t("noPricingData")}
            </p>
            <p class="loading-text">
              {t("total")}:{" "}
              {translationCostEstimate !== null || editorCostEstimate !== null
                ? formatUsd((translationCostEstimate ?? 0) + (editorCostEstimate ?? 0))
                : t("noData")}
            </p>
            {pricingError && <p class="error-text">Pricing error: {pricingError}</p>}
          </div>
        )}
      </section>

      <section class="collapsible-panel project-panel">
        <div class="panel-head">
          <h2>{t("projectMemory")}</h2>
          <button
            type="button"
            class="secondary-button panel-toggle"
            onClick={() => setIsProjectOpen((prev) => !prev)}
          >
            {isProjectOpen ? t("collapse") : t("expand")}
          </button>
        </div>

        {isProjectOpen && (
          <>
            <div class="project-actions">
              <button
                type="button"
                class="secondary-button"
                onClick={handleCreateProject}
                disabled={isLoading}
              >
                {t("newProject")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={handleOpenProject}
                disabled={isLoading}
              >
                {t("openProject")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={handleSaveProject}
                disabled={isLoading}
              >
                {t("saveProject")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={handleUpdateMemorySummary}
                disabled={isLoading || isUpdatingMemory || translatedText.trim().length === 0}
              >
                {isUpdatingMemory ? t("updatingMemory") : t("updateMemorySummary")}
              </button>
            </div>

            <label>
              Project Name
              <input
                value={projectName}
                onInput={(e) => setProjectName(e.currentTarget.value)}
                placeholder={t("projectNamePlaceholder")}
              />
            </label>
            {projectPath && <p class="loading-text">Project file: {projectPath}</p>}

            <label>
              Memory
              <textarea
                class="memory-box"
                value={projectMemory}
                onInput={(e) => setProjectMemory(e.currentTarget.value)}
                placeholder={t("memoryPlaceholder")}
              />
            </label>
            <label>
              {t("fullPrevChapter")}
              <textarea
                class="memory-box"
                value={memorySourceChapter}
                onInput={(e) => setMemorySourceChapter(e.currentTarget.value)}
                placeholder={t("fullPrevChapterPlaceholder")}
              />
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={autoGlossaryOnCompress}
                onChange={(e) => setAutoGlossaryOnCompress(e.currentTarget.checked)}
              />
              <span>{t("autoGlossaryOnCompress")}</span>
            </label>
            <div class="project-actions">
              <button
                type="button"
                class="secondary-button"
                onClick={handleCompressChapterToMemory}
                disabled={isLoading || isCompressingMemory || memorySourceChapter.trim().length === 0}
              >
                {isCompressingMemory ? t("compressing") : t("compressToMemory")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={handleAutoDetectTerms}
                disabled={isLoading || isDetectingTerms || (sourceText.trim() + memorySourceChapter.trim()).length === 0}
              >
                {isDetectingTerms ? t("detecting") : t("autoDetectTerms")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={handleResearchContext}
                disabled={isLoading || isResearchingContext}
              >
                {isResearchingContext ? t("searching") : t("webResearch")}
              </button>
              <button
                type="button"
                class="secondary-button"
                onClick={addCurrentChapterToArchive}
                disabled={(workMode === "editor" ? editorText : translatedText).trim().length === 0}
              >
                {t("addToArchive")}
              </button>
            </div>
            {compressInfo && <p class="loading-text">{compressInfo}</p>}
            <label>
              Research query
              <input
                value={researchQuery}
                onInput={(e) => {
                  const next = e.currentTarget.value;
                  setResearchQuery(next);
                  persistSettings({ researchQuery: next });
                }}
                placeholder={t("researchQueryPlaceholder")}
              />
            </label>
            {researchSources.length > 0 && (
              <div class="sources-log">
                <h4>{t("recentResearchSources")}</h4>
                {researchSources.slice(0, 12).map((source, index) => (
                  <button
                    type="button"
                    key={`${source}-${index}`}
                    class="link-button"
                    onClick={() => {
                      void openUrl(source);
                    }}
                  >
                    {source}
                  </button>
                ))}
              </div>
            )}
            <p class="loading-text">{t("ragArchiveCount", { count: chapterArchive.length })}</p>
            {chapterArchive.slice(0, 8).map((chapter) => (
              <article class="history-item" key={chapter.id}>
                <p>{chapter.title} | {new Date(chapter.added_at).toLocaleString()}</p>
                <div class="history-actions">
                  <button
                    type="button"
                    class="danger-button"
                    onClick={() => removeArchiveItem(chapter.id)}
                  >
                    {t("delete")}
                  </button>
                </div>
              </article>
            ))}

            <div class="glossary-head">
              <h3>{t("glossary")}</h3>
              <button type="button" class="secondary-button" onClick={addGlossaryRow}>
                {t("addTerm")}
              </button>
            </div>
            <div class="glossary-table">
              <div class="glossary-row glossary-row-head">
                <span>Original</span>
                <span>Translated</span>
                <span>Note</span>
                <span>Action</span>
              </div>
              {glossary.map((item, index) => (
                <div class="glossary-row" key={`${index}-${item.original}-${item.translated}`}>
                  <input
                    value={item.original}
                    onInput={(e) => updateGlossaryRow(index, { original: e.currentTarget.value })}
                    placeholder="主人公"
                  />
                  <input
                    value={item.translated}
                    onInput={(e) => updateGlossaryRow(index, { translated: e.currentTarget.value })}
                    placeholder="главный герой"
                  />
                  <input
                    value={item.note}
                    onInput={(e) => updateGlossaryRow(index, { note: e.currentTarget.value })}
                    placeholder="всегда так"
                  />
                  <button
                    type="button"
                    class="danger-button"
                    onClick={() => removeGlossaryRow(index)}
                  >
                    {t("delete")}
                  </button>
                </div>
              ))}
            </div>

            <div class="glossary-head">
              <h3>Character cards</h3>
              <button type="button" class="secondary-button" onClick={addCharacterCard}>
                {t("addCharacter")}
              </button>
            </div>
            <div class="glossary-table">
              <div class="glossary-row glossary-row-head">
                <span>Name</span>
                <span>Description</span>
                <span>Appearance / Relations</span>
                <span>Action</span>
              </div>
              {characterCards.map((card, index) => (
                <div class="glossary-row" key={`character-${index}-${card.name}`}>
                  <input
                    value={card.name}
                    onInput={(e) => updateCharacterCard(index, { name: e.currentTarget.value })}
                    placeholder="Юки"
                  />
                  <input
                    value={card.description}
                    onInput={(e) => updateCharacterCard(index, { description: e.currentTarget.value })}
                    placeholder="спокойная, умная, саркастичная"
                  />
                  <input
                    value={`${card.appearance}${card.appearance && card.relationships ? " | " : ""}${card.relationships}`}
                    onInput={(e) => {
                      const raw = e.currentTarget.value;
                      const parts = raw.split("|");
                      updateCharacterCard(index, {
                        appearance: (parts[0] ?? "").trim(),
                        relationships: parts.slice(1).join("|").trim(),
                      });
                    }}
                    placeholder="серые глаза | близка с Акирой"
                  />
                  <button
                    type="button"
                    class="danger-button"
                    onClick={() => removeCharacterCard(index)}
                  >
                    {t("delete")}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section class="collapsible-panel">
        <div class="panel-head">
          <h2>{t("history")}</h2>
          <button
            type="button"
            class="danger-button"
            onClick={handleClearHistory}
            disabled={history.length === 0}
          >
            {t("clear")}
          </button>
        </div>
        {history.length === 0 && <p class="loading-text">{t("historyEmpty")}</p>}
        {history.map((item) => (
          <article class="history-item" key={item.id}>
            <p>
              {item.createdAt} | {item.fileName} | {item.sourceLang}
              {" -> "}
              {item.targetLang} | {item.model}
              {item.truncated ? " | trimmed" : ""}
            </p>
            <div class="history-actions">
              <button
                type="button"
                class="secondary-button"
                onClick={() => handleLoadHistoryItem(item)}
              >
                {t("load")}
              </button>
              <button
                type="button"
                class="danger-button"
                onClick={() => handleDeleteHistoryItem(item.id)}
              >
                {t("delete")}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section class="editor-grid">
        <article class="editor-card">
          <div class="editor-head">
            <h2>{t("sourceText")}</h2>
            <span>{sourceStats}</span>
          </div>
          <textarea
            ref={sourceTextareaRef}
            value={sourceText}
            onInput={(e) => setSourceText(e.currentTarget.value)}
            placeholder={t("pasteChapter")}
          />
          {workMode === "translate" && plannedChunks.length > 0 && (
            <div class="chunk-list">
              {plannedChunks.slice(0, MAX_VISIBLE_CHUNK_CHIPS).map((chunk) => (
                <button
                  type="button"
                  key={`chunk-${chunk.index}`}
                  class={`chunk-chip ${selectedChunkIndex === chunk.index ? "active" : ""}`}
                  onClick={() => focusChunk(chunk)}
                >
                  #{chunk.index + 1} [{chunk.start}-{chunk.end}]
                </button>
              ))}
              {plannedChunks.length > MAX_VISIBLE_CHUNK_CHIPS && (
                <p class="loading-text">
                  {t("showingFirstChunks", {
                    visible: MAX_VISIBLE_CHUNK_CHIPS,
                    total: plannedChunks.length,
                  })}
                </p>
              )}
            </div>
          )}
        </article>

        <article class="editor-card">
          <div class="editor-head">
            <h2>{workMode === "editor" ? t("editOrTranslate") : t("translation")}</h2>
          </div>
          <textarea
            ref={editorTextareaRef}
            value={workMode === "editor" ? editorText : translatedText}
            readOnly={workMode !== "editor"}
            onInput={(e) => {
              if (workMode === "editor") {
                setEditorText(e.currentTarget.value);
              }
            }}
            placeholder={
              workMode === "editor"
                ? t("editorPlaceholder")
                : t("translationPlaceholder")
            }
          />
          {workMode === "editor" && plannedEditorChunks.length > 0 && (
            <div class="chunk-list">
              {plannedEditorChunks.slice(0, MAX_VISIBLE_CHUNK_CHIPS).map((chunk) => (
                <button
                  type="button"
                  key={`editor-chunk-${chunk.index}`}
                  class={`chunk-chip ${selectedEditorChunkIndex === chunk.index ? "active" : ""}`}
                  onClick={() => focusEditorChunk(chunk)}
                >
                  #{chunk.index + 1} [{chunk.start}-{chunk.end}]
                </button>
              ))}
              {plannedEditorChunks.length > MAX_VISIBLE_CHUNK_CHIPS && (
                <p class="loading-text">
                  {t("showingFirstChunks", {
                    visible: MAX_VISIBLE_CHUNK_CHIPS,
                    total: plannedEditorChunks.length,
                  })}
                </p>
              )}
            </div>
          )}
        </article>
      </section>

      {isDiffVisible && (
        <section class="collapsible-panel">
          <div class="panel-head">
            <h2>{t("diffTitle")}</h2>
            <span class="loading-text">
              {isVeryLongText
                ? t("diffDisabledLong")
                : t("changedLines", { count: diffRows.filter((row) => row.kind !== "same").length })}
            </span>
          </div>
          {!isVeryLongText && (
            <div class="diff-grid">
              {diffRows.slice(0, 400).map((row) => (
                <div class={`diff-row diff-${row.kind}`} key={`diff-${row.index}`}>
                  <span class="diff-index">{row.index}</span>
                  <pre>{row.source || " "}</pre>
                  <pre>{row.target || " "}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section class="collapsible-panel">
        <div class="panel-head">
          <h2>{t("batchQueue")}</h2>
          <div class="history-actions">
            <button type="button" class="secondary-button" onClick={handleAddBatchFiles}>
              {t("addFiles")}
            </button>
            <button
              type="button"
              onClick={handleRunBatchQueue}
              disabled={
                isBatchRunning ||
                isLoading ||
                isEditing ||
                batchQueue.every((item) => item.status !== "queued")
              }
            >
              {isBatchRunning ? t("running") : t("runQueue")}
            </button>
            <button
              type="button"
              class="secondary-button"
              onClick={handleClearBatchDone}
              disabled={batchQueue.every((item) => item.status !== "done")}
            >
              {t("removeCompleted")}
            </button>
          </div>
        </div>
        {batchQueue.length === 0 && (
          <p class="loading-text">{t("batchHint")}</p>
        )}
        {batchQueue.map((item) => (
          <article class="history-item" key={item.id}>
            <p>
              {item.name} | priority {item.priority} | status {item.status}
              {item.savedPath ? ` | saved: ${item.savedPath}` : ""}
            </p>
            {item.message && <p class="error-text">{item.message}</p>}
            <div class="history-actions">
              <input
                type="number"
                min="-10"
                max="10"
                value={String(item.priority)}
                onInput={(e) => {
                  const next = Number.parseInt(e.currentTarget.value, 10);
                  updateBatchItem(item.id, {
                    priority: Number.isFinite(next) ? next : 0,
                  });
                }}
                disabled={isBatchRunning || item.status === "processing"}
              />
              <button
                type="button"
                class="danger-button"
                onClick={() => handleRemoveBatchItem(item.id)}
                disabled={isBatchRunning && item.status === "processing"}
              >
                {t("delete")}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section class="actions">
        <div class="actions-row">
          <button type="button" class="secondary-button" onClick={handleOpenFile} disabled={isLoading}>
            {t("openFile")}
          </button>
          <button
            type="button"
            disabled={
              isLoading ||
              isEditing ||
              model.trim().length === 0 ||
              (workMode === "translate"
                ? sourceText.trim().length === 0
                : ((editorText.trim() || sourceText.trim()).length === 0))
            }
            onClick={workMode === "translate" ? handleTranslate : handleEditCurrentTranslation}
          >
            {workMode === "translate"
              ? isLoading
                ? chunkProgress.total > 1
                  ? t("translatingProgress", {
                    current: chunkProgress.current,
                    total: chunkProgress.total,
                  })
                  : t("translatingShort")
                : isEditing
                  ? t("editorWorking")
                  : currentFilePath
                    ? t("translateFile")
                    : t("translate")
              : isEditing
                ? t("editing")
                : t("runEditor")}
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={handleCopyTranslation}
            disabled={(workMode === "editor" ? editorText : translatedText).trim().length === 0}
          >
            {workMode === "editor" ? t("copyEdited") : t("copyTranslation")}
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={handleEditCurrentTranslation}
            disabled={
              (((workMode === "editor" ? editorText : translatedText).trim() || sourceText.trim())
                .length === 0) ||
              isEditing
            }
          >
            {isEditing ? t("editing") : t("editText")}
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={handleSaveTranslatedFile}
            disabled={
              isLoading ||
              (workMode === "editor" ? editorText : translatedText).trim().length === 0 ||
              currentFilePath.trim().length === 0
            }
          >
            {t("saveNear")}
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={handleExportHtml}
            disabled={
              isLoading ||
              (workMode === "editor" ? editorText : translatedText).trim().length === 0 ||
              currentFilePath.trim().length === 0
            }
          >
            {t("exportHtml")}
          </button>
          <button
            type="button"
            class="secondary-button"
            onClick={handleExportDocx}
            disabled={
              isLoading ||
              (workMode === "editor" ? editorText : translatedText).trim().length === 0 ||
              currentFilePath.trim().length === 0
            }
          >
            {t("exportDocx")}
          </button>
          <button
            type="button"
            class="danger-button"
            onClick={handleStopProcessing}
            disabled={!isLoading && !isEditing}
          >
            {t("stopProcess")}
          </button>
        </div>
        {(isLoading || isEditing) && (
          <div class="progress-wrap">
            <progress value={progressCurrent} max={progressTotal || 1} />
            <span class="loading-text">{progressPercent}%</span>
          </div>
        )}

        {currentFilePath && <p class="loading-text">{t("fileOpened", { name: currentFileName })}</p>}
        {isLoading && workMode === "translate" && (
          <p class="loading-text">
            {chunkProgress.total > 1
              ? t("translatingChunkStatus", {
                model,
                current: chunkProgress.current,
                total: chunkProgress.total,
                seconds: loadingSeconds,
              })
              : t("translatingStatus", { model, seconds: loadingSeconds })}
          </p>
        )}
        {isEditing && (
          <p class="loading-text">
            {editProgress.total > 1
              ? t("editingChunkStatus", {
                model: editorModel || model,
                current: editProgress.current,
                total: editProgress.total,
                seconds: editSeconds,
              })
              : t("editingStatus", { model: editorModel || model, seconds: editSeconds })}
          </p>
        )}
        {isStopRequested && <p class="error-text">{t("stopRequested")}</p>}
        {isVeryLongText && (
          <p class="loading-text">
            {t("longTextNotice")}
          </p>
        )}
        {!isLoading && workMode === "translate" && sourceText.trim().length > 0 && (
          <p class="loading-text">{t("textWillSplit", { count: chunkCountPreview })}</p>
        )}
        {!isEditing && workMode === "editor" && editorBaseText.trim().length > 0 && (
          <p class="loading-text">
            {t("editWillSplit", { count: plannedEditorChunks.length })}
          </p>
        )}
        {translationStats && (
          <p class="loading-text">
            {t("translationFinished", {
              chunks: translationStats.chunks,
              duration: formatDuration(translationStats.seconds),
              editorState: translationStats.usedEditor ? t("editorOn") : t("editorOff"),
              finishedAt: translationStats.finishedAt,
            })}
          </p>
        )}
        {editStats && (
          <p class="loading-text">
            {t("editingFinished", {
              chunks: editStats.chunks,
              duration: formatDuration(editStats.seconds),
              changed: editStats.patchedParagraphs,
              finishedAt: editStats.finishedAt,
            })}
          </p>
        )}
        {lastEditPatchCount !== null && (
          <p class="loading-text">
            {t("lastEditChanged", { count: lastEditPatchCount })}
          </p>
        )}
        {copyInfo && <p class="loading-text">{copyInfo}</p>}
        {lastSavedPath && <p class="loading-text">{t("saved", { path: lastSavedPath })}</p>}
        {errorText && <p class="error-text">{errorText}</p>}
      </section>

    </main>
  );
}

export default App;
