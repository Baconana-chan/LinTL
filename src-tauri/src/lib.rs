use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use std::fs::File;
use std::io::{Read, Write};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::time::sleep;
use zip::CompressionMethod;
use zip::ZipArchive;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;
use regex::Regex;
use docx_rs::{Docx, Paragraph, Run};

static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<ModelIdItem>,
}

#[derive(Deserialize)]
struct ModelIdItem {
    id: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelItem>,
}

#[derive(Deserialize)]
struct OllamaModelItem {
    name: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct GlossaryEntry {
    original: String,
    translated: String,
    #[serde(default)]
    note: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CharacterCard {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    appearance: String,
    #[serde(default)]
    relationships: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct TranslationProject {
    project_name: String,
    source_lang: String,
    target_lang: String,
    model: String,
    #[serde(default)]
    glossary: Vec<GlossaryEntry>,
    #[serde(default)]
    memory: String,
    #[serde(default)]
    character_cards: Vec<CharacterCard>,
    #[serde(default)]
    chapter_archive: Vec<ChapterArchiveEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChapterArchiveEntry {
    #[serde(default)]
    id: String,
    title: String,
    text: String,
    #[serde(default)]
    added_at: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ResearchContextResult {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    glossary: Vec<GlossaryEntry>,
    #[serde(default)]
    characters: Vec<CharacterCard>,
    #[serde(default)]
    sources: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ParagraphPatch {
    index: usize,
    text: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ModelPricing {
    model: String,
    prompt_per_token: Option<f64>,
    completion_per_token: Option<f64>,
    currency: String,
    source: String,
}

fn default_base_url(provider: &str) -> &'static str {
    match provider {
        "openrouter" => "https://openrouter.ai/api/v1",
        "openai" => "https://api.openai.com/v1",
        "groq" => "https://api.groq.com/openai/v1",
        "chutes" => "https://llm.chutes.ai/v1",
        "ollama" => "http://127.0.0.1:11434",
        _ => "",
    }
}

fn normalized_base_url(provider: &str, base_url: &str) -> String {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return default_base_url(provider).to_string();
    }
    trimmed.trim_end_matches('/').to_string()
}

fn join_endpoint(base_url: &str, path: &str) -> String {
    format!("{}/{}", base_url.trim_end_matches('/'), path.trim_start_matches('/'))
}

fn with_v1(base_url: &str, path: &str) -> String {
    if base_url.ends_with("/v1") || base_url.contains("/v1/") {
        join_endpoint(base_url, path)
    } else {
        join_endpoint(base_url, &format!("v1/{path}"))
    }
}

fn models_endpoint(provider: &str, base_url: &str) -> String {
    match provider {
        "openrouter" => join_endpoint(base_url, "models"),
        "openai" | "groq" | "chutes" | "custom" => with_v1(base_url, "models"),
        "ollama" => join_endpoint(base_url, "api/tags"),
        _ => with_v1(base_url, "models"),
    }
}

fn completion_endpoint(provider: &str, base_url: &str) -> String {
    match provider {
        "openrouter" => join_endpoint(base_url, "chat/completions"),
        "openai" | "groq" | "chutes" | "custom" => with_v1(base_url, "chat/completions"),
        "ollama" => join_endpoint(base_url, "api/chat"),
        _ => with_v1(base_url, "chat/completions"),
    }
}

fn extract_error_message(status: StatusCode, body: &str) -> String {
    if status == StatusCode::UNAUTHORIZED {
        return "Ошибка 401: неверный API ключ.".to_string();
    }
    if status == StatusCode::TOO_MANY_REQUESTS {
        return "Ошибка 429: превышен лимит запросов, попробуйте позже.".to_string();
    }
    format!("Ошибка API ({status}): {body}")
}

async fn read_response_body(response: reqwest::Response) -> Result<String, String> {
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Не удалось прочитать тело ответа: {err}"))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

async fn wait_for_cancel_signal() {
    loop {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            break;
        }
        sleep(Duration::from_millis(120)).await;
    }
}

async fn send_request_with_cancel(
    request: reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    tokio::select! {
        response = request.send() => {
            response.map_err(|err| format!("Сетевая ошибка: {err}"))
        }
        _ = wait_for_cancel_signal() => {
            Err("Операция остановлена пользователем.".to_string())
        }
    }
}

async fn read_response_body_with_cancel(response: reqwest::Response) -> Result<String, String> {
    tokio::select! {
        body = read_response_body(response) => body,
        _ = wait_for_cancel_signal() => Err("Операция остановлена пользователем.".to_string()),
    }
}

fn snippet(s: &str) -> String {
    const LIMIT: usize = 300;
    let trimmed = s.trim();
    if trimmed.chars().count() <= LIMIT {
        return trimmed.to_string();
    }
    let short = trimmed.chars().take(LIMIT).collect::<String>();
    format!("{short}...")
}

fn parse_openai_text_response(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|err| format!("Не удалось распарсить JSON ответа: {err}. Body: {}", snippet(body)))?;

    let maybe_content = value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"));

    if let Some(content) = maybe_content {
        if let Some(text) = content.as_str() {
            return Ok(text.to_string());
        }

        if let Some(parts) = content.as_array() {
            let joined = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !joined.trim().is_empty() {
                return Ok(joined);
            }
        }
    }

    if let Some(err_msg) = value
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
    {
        return Err(format!("Ошибка провайдера: {err_msg}"));
    }

    Err(format!(
        "Ответ не содержит choices[0].message.content. Body: {}",
        snippet(body)
    ))
}

fn parse_ollama_text_response(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|err| format!("Не удалось распарсить JSON ответа: {err}. Body: {}", snippet(body)))?;

    if let Some(text) = value
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
    {
        return Ok(text.to_string());
    }

    if let Some(err_msg) = value.get("error").and_then(|error| error.as_str()) {
        return Err(format!("Ошибка Ollama: {err_msg}"));
    }

    Err(format!(
        "Ответ Ollama не содержит message.content. Body: {}",
        snippet(body)
    ))
}

fn format_glossary(glossary: &[GlossaryEntry]) -> String {
    glossary
        .iter()
        .filter(|item| !item.original.trim().is_empty() && !item.translated.trim().is_empty())
        .map(|item| {
            if item.note.trim().is_empty() {
                format!("- {} => {}", item.original.trim(), item.translated.trim())
            } else {
                format!(
                    "- {} => {} ({})",
                    item.original.trim(),
                    item.translated.trim(),
                    item.note.trim()
                )
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_character_cards(cards: &[CharacterCard]) -> String {
    cards
        .iter()
        .filter(|card| !card.name.trim().is_empty())
        .map(|card| {
            let mut lines = vec![format!("- Персонаж: {}", card.name.trim())];
            if !card.description.trim().is_empty() {
                lines.push(format!("  Описание: {}", card.description.trim()));
            }
            if !card.appearance.trim().is_empty() {
                lines.push(format!("  Внешность: {}", card.appearance.trim()));
            }
            if !card.relationships.trim().is_empty() {
                lines.push(format!("  Отношения: {}", card.relationships.trim()));
            }
            lines.join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_glossary_from_model_output(raw: &str) -> Result<Vec<GlossaryEntry>, String> {
    let trimmed = raw.trim();

    let try_parse = |input: &str| -> Result<Vec<GlossaryEntry>, String> {
        let mut glossary: Vec<GlossaryEntry> = serde_json::from_str(input)
            .map_err(|err| format!("Не удалось распарсить JSON глоссария: {err}"))?;
        for item in &mut glossary {
            item.original = item.original.trim().to_string();
            item.translated = item.translated.trim().to_string();
            item.note = item.note.trim().to_string();
        }
        glossary.retain(|item| !item.original.is_empty() && !item.translated.is_empty());
        Ok(glossary)
    };

    if let Ok(parsed) = try_parse(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed.find('[');
    let end = trimmed.rfind(']');
    if let (Some(start), Some(end)) = (start, end) {
        if end > start {
            let candidate = &trimmed[start..=end];
            return try_parse(candidate);
        }
    }

    Err(format!(
        "Модель вернула невалидный JSON для глоссария. Ответ: {}",
        snippet(trimmed)
    ))
}

fn parse_paragraph_patches(raw: &str) -> Result<Vec<ParagraphPatch>, String> {
    let trimmed = raw.trim();

    let try_parse = |input: &str| -> Result<Vec<ParagraphPatch>, String> {
        let mut patches: Vec<ParagraphPatch> = serde_json::from_str(input)
            .map_err(|err| format!("Не удалось распарсить JSON патчей: {err}"))?;
        for patch in &mut patches {
            patch.text = patch.text.trim().to_string();
        }
        patches.retain(|patch| patch.index > 0 && !patch.text.is_empty());
        Ok(patches)
    };

    if let Ok(parsed) = try_parse(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed.find('[');
    let end = trimmed.rfind(']');
    if let (Some(start), Some(end)) = (start, end) {
        if end > start {
            let candidate = &trimmed[start..=end];
            return try_parse(candidate);
        }
    }

    Err(format!(
        "Модель вернула невалидный JSON патчей. Ответ: {}",
        snippet(trimmed)
    ))
}

fn parse_research_context_result(raw: &str) -> Result<ResearchContextResult, String> {
    let trimmed = raw.trim();

    let try_parse = |input: &str| -> Result<ResearchContextResult, String> {
        let mut result: ResearchContextResult = serde_json::from_str(input)
            .map_err(|err| format!("Не удалось распарсить JSON research-ответа: {err}"))?;
        result.summary = result.summary.trim().to_string();
        result.glossary = result
            .glossary
            .into_iter()
            .map(|mut item| {
                item.original = item.original.trim().to_string();
                item.translated = item.translated.trim().to_string();
                item.note = item.note.trim().to_string();
                item
            })
            .filter(|item| !item.original.is_empty() && !item.translated.is_empty())
            .collect();
        result.characters = result
            .characters
            .into_iter()
            .map(|mut card| {
                card.name = card.name.trim().to_string();
                card.description = card.description.trim().to_string();
                card.appearance = card.appearance.trim().to_string();
                card.relationships = card.relationships.trim().to_string();
                card
            })
            .filter(|card| !card.name.is_empty())
            .collect();
        result.sources = result
            .sources
            .into_iter()
            .map(|src| src.trim().to_string())
            .filter(|src| !src.is_empty())
            .collect();
        Ok(result)
    };

    if let Ok(parsed) = try_parse(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    if let (Some(start), Some(end)) = (start, end) {
        if end > start {
            let candidate = &trimmed[start..=end];
            return try_parse(candidate);
        }
    }

    Err(format!(
        "Модель вернула невалидный JSON для research. Ответ: {}",
        snippet(trimmed)
    ))
}

#[allow(clippy::too_many_arguments)]
async fn request_model_completion(
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    model_provider: Option<&str>,
    prompt: String,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    const MAX_ATTEMPTS: usize = 3;
    let client = reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|err| format!("Не удалось инициализировать HTTP клиент: {err}"))?;

    let mut last_error = String::new();
    let model_provider = model_provider
        .unwrap_or("")
        .trim()
        .to_string();
    let system_prompt = system_prompt.unwrap_or_default().trim().to_string();
    let safe_temperature = temperature.unwrap_or(0.2).clamp(0.0, 2.0);
    let safe_top_p = top_p
        .filter(|value| value.is_finite() && *value > 0.0 && *value <= 1.0);
    let safe_max_tokens = max_tokens.filter(|value| *value > 0);

    for attempt in 1..=MAX_ATTEMPTS {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            return Err("Операция остановлена пользователем.".to_string());
        }
        let response_result = if provider == "ollama" {
            let mut messages = Vec::new();
            if !system_prompt.is_empty() {
                messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.clone(),
                });
            }
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: prompt.clone(),
            });

            let request_body = OllamaChatRequest {
                model: model.to_string(),
                messages,
                stream: false,
                options: OllamaOptions {
                    temperature: safe_temperature,
                    top_p: safe_top_p,
                    num_predict: safe_max_tokens,
                },
            };

            let request = client
                .post(completion_endpoint(provider, base_url))
                .header("Content-Type", "application/json")
                .header("Accept-Encoding", "identity")
                .header("Connection", "close")
                .json(&request_body);

            send_request_with_cancel(request).await
        } else {
            let mut messages = vec![];
            if !system_prompt.is_empty() {
                messages.push(json!({
                    "role": "system",
                    "content": system_prompt.clone()
                }));
            }
            messages.push(json!({
                "role": "user",
                "content": prompt.clone()
            }));

            let mut request_body = json!({
                "model": model,
                "messages": messages,
                "temperature": safe_temperature
            });
            if let Some(value) = safe_top_p {
                request_body["top_p"] = json!(value);
            }
            if let Some(value) = safe_max_tokens {
                request_body["max_tokens"] = json!(value);
            }

            if provider == "openrouter" && !model_provider.is_empty() {
                request_body["provider"] = json!({
                    "order": [model_provider],
                    "allow_fallbacks": false
                });
            }

            let mut request = client
                .post(completion_endpoint(provider, base_url))
                .header("Content-Type", "application/json")
                .header("Accept-Encoding", "identity")
                .header("Connection", "close")
                .json(&request_body);

            if !api_key.trim().is_empty() {
                request = request.bearer_auth(api_key);
            }

            if provider == "openrouter" {
                request = request
                    .header("HTTP-Referer", "https://github.com/tauri-apps/tauri")
                    .header("X-Title", "LinTL");
            }

            send_request_with_cancel(request).await
        };

        let response = match response_result {
            Ok(response) => response,
            Err(err) => {
                last_error = err;
                if attempt < MAX_ATTEMPTS {
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = response.status();
        let body = match read_response_body_with_cancel(response).await {
            Ok(body) => body,
            Err(err) => {
                last_error = format!("{err} (attempt {attempt}/{MAX_ATTEMPTS})");
                if attempt < MAX_ATTEMPTS {
                    continue;
                }
                return Err(last_error);
            }
        };

        if !status.is_success() {
            let err_text = extract_error_message(status, &body);
            if status == StatusCode::CONFLICT && CANCEL_REQUESTED.load(Ordering::SeqCst) {
                return Err("Операция остановлена пользователем.".to_string());
            }
            if status.is_server_error() && attempt < MAX_ATTEMPTS {
                last_error = format!("{err_text} (attempt {attempt}/{MAX_ATTEMPTS})");
                continue;
            }
            return Err(err_text);
        }

        let translated = if provider == "ollama" {
            match parse_ollama_text_response(&body) {
                Ok(value) => value,
                Err(err) => {
                    if attempt < MAX_ATTEMPTS {
                        last_error = format!("{err} (attempt {attempt}/{MAX_ATTEMPTS})");
                        continue;
                    }
                    return Err(err);
                }
            }
        } else {
            match parse_openai_text_response(&body) {
                Ok(value) => value,
                Err(err) => {
                    if attempt < MAX_ATTEMPTS {
                        last_error = format!("{err} (attempt {attempt}/{MAX_ATTEMPTS})");
                        continue;
                    }
                    return Err(err);
                }
            }
        };

        if translated.trim().is_empty() {
            last_error = format!(
                "Модель вернула пустой ответ (attempt {attempt}/{MAX_ATTEMPTS})"
            );
            if attempt < MAX_ATTEMPTS {
                continue;
            }
            return Err("Модель вернула пустой ответ.".to_string());
        }

        return Ok(translated);
    }

    Err(if last_error.is_empty() {
        "Не удалось получить ответ модели после нескольких попыток.".to_string()
    } else {
        last_error
    })
}

#[tauri::command]
fn request_cancel_processing() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn clear_cancel_processing() {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}

fn is_supported_input_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.to_ascii_lowercase();
            ext == "txt" || ext == "md" || ext == "epub"
        })
        .unwrap_or(false)
}

fn is_epub_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("epub"))
        .unwrap_or(false)
}

fn decode_text_bytes(bytes: &[u8]) -> String {
    if bytes.len() >= 2 {
        let bom = (bytes[0], bytes[1]);
        if bom == (0xFF, 0xFE) {
            let mut u16_data = Vec::new();
            let mut i = 2;
            while i + 1 < bytes.len() {
                u16_data.push(u16::from_le_bytes([bytes[i], bytes[i + 1]]));
                i += 2;
            }
            return String::from_utf16_lossy(&u16_data);
        }
        if bom == (0xFE, 0xFF) {
            let mut u16_data = Vec::new();
            let mut i = 2;
            while i + 1 < bytes.len() {
                u16_data.push(u16::from_be_bytes([bytes[i], bytes[i + 1]]));
                i += 2;
            }
            return String::from_utf16_lossy(&u16_data);
        }
    }
    String::from_utf8_lossy(bytes).to_string()
}

fn escape_xml(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn collapse_blank_lines(input: &str) -> String {
    let mut out = String::new();
    let mut empty_streak = 0usize;
    for line in input.lines() {
        if line.trim().is_empty() {
            empty_streak += 1;
            if empty_streak <= 2 {
                out.push('\n');
            }
        } else {
            empty_streak = 0;
            out.push_str(line.trim_end());
            out.push('\n');
        }
    }
    out.trim().to_string()
}

fn html_fragment_to_text(html: &str) -> String {
    let mut s = html.to_string();
    let re_script = Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let re_style = Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let re_break = Regex::new(r"(?is)<br\s*/?>").unwrap();
    let re_block_close = Regex::new(r"(?is)</(p|div|h[1-6]|li|tr|blockquote|section|article)>").unwrap();
    let re_tags = Regex::new(r"(?is)<[^>]+>").unwrap();

    s = re_script.replace_all(&s, "").to_string();
    s = re_style.replace_all(&s, "").to_string();
    s = re_break.replace_all(&s, "\n").to_string();
    s = re_block_close.replace_all(&s, "\n\n").to_string();
    s = re_tags.replace_all(&s, "").to_string();
    let decoded = html_escape::decode_html_entities(&s).to_string();
    collapse_blank_lines(&decoded)
}

fn normalize_opf_href(base_path: &str, href: &str) -> String {
    let clean_href = href.trim().replace('\\', "/");
    if !base_path.contains('/') {
        return clean_href;
    }
    let mut parts = base_path.split('/').collect::<Vec<_>>();
    parts.pop();
    let base_dir = parts.join("/");
    if base_dir.is_empty() {
        clean_href
    } else {
        format!("{base_dir}/{clean_href}")
    }
}

fn read_zip_file_to_string<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Option<String> {
    let mut file = archive.by_name(name).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(decode_text_bytes(&bytes))
}

fn collect_epub_chapter_paths<R: Read + std::io::Seek>(archive: &mut ZipArchive<R>) -> Vec<String> {
    let container_path = "META-INF/container.xml";
    let mut ordered = Vec::new();

    if let Some(container_xml) = read_zip_file_to_string(archive, container_path) {
        let rootfile_re = Regex::new(r#"full-path\s*=\s*"([^"]+)""#).unwrap();
        if let Some(cap) = rootfile_re.captures(&container_xml) {
            if let Some(opf_path_match) = cap.get(1) {
                let opf_path = opf_path_match.as_str().to_string();
                if let Some(opf_xml) = read_zip_file_to_string(archive, &opf_path) {
                    let item_re = Regex::new(
                        r#"(?is)<item[^>]*id\s*=\s*"([^"]+)"[^>]*href\s*=\s*"([^"]+)"[^>]*media-type\s*=\s*"([^"]+)""#,
                    ).unwrap();
                    let spine_re = Regex::new(r#"(?is)<itemref[^>]*idref\s*=\s*"([^"]+)""#).unwrap();

                    let mut manifest: std::collections::HashMap<String, String> = std::collections::HashMap::new();
                    for cap in item_re.captures_iter(&opf_xml) {
                        let id = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
                        let href = cap.get(2).map(|m| m.as_str()).unwrap_or_default();
                        let media = cap.get(3).map(|m| m.as_str()).unwrap_or_default().to_ascii_lowercase();
                        if media.contains("xhtml") || media.contains("html") {
                            manifest.insert(id.to_string(), normalize_opf_href(&opf_path, href));
                        }
                    }
                    for cap in spine_re.captures_iter(&opf_xml) {
                        let idref = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
                        if let Some(path) = manifest.get(idref) {
                            ordered.push(path.clone());
                        }
                    }
                }
            }
        }
    }

    if ordered.is_empty() {
        for idx in 0..archive.len() {
            if let Ok(file) = archive.by_index(idx) {
                let name = file.name().to_string();
                let lower = name.to_ascii_lowercase();
                if lower.ends_with(".xhtml") || lower.ends_with(".html") || lower.ends_with(".htm") {
                    ordered.push(name);
                }
            }
        }
        ordered.sort();
    }

    ordered
}

fn read_epub_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|err| format!("Не удалось открыть EPUB: {err}"))?;
    let mut archive = ZipArchive::new(file).map_err(|err| format!("Некорректный EPUB (zip): {err}"))?;
    let chapter_paths = collect_epub_chapter_paths(&mut archive);
    if chapter_paths.is_empty() {
        return Err("В EPUB не найдены HTML/XHTML главы.".to_string());
    }

    let mut chunks = Vec::new();
    for chapter_path in chapter_paths {
        if let Some(raw) = read_zip_file_to_string(&mut archive, &chapter_path) {
            let cleaned = html_fragment_to_text(&raw);
            if !cleaned.trim().is_empty() {
                chunks.push(cleaned);
            }
        }
    }

    if chunks.is_empty() {
        return Err("В EPUB не удалось извлечь текст глав.".to_string());
    }
    Ok(chunks.join("\n\n"))
}

fn render_text_as_html(title: &str, text: &str) -> String {
    let safe_title = escape_xml(title);
    let mut body = String::new();
    for para in text.split("\n\n") {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }
        let line_html = escape_xml(trimmed).replace('\n', "<br/>");
        body.push_str(&format!("<p>{line_html}</p>\n"));
    }

    format!(
        r#"<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{safe_title}</title>
  <style>
    body {{ font-family: "Noto Serif", "Times New Roman", serif; line-height: 1.6; margin: 2rem auto; max-width: 860px; padding: 0 1rem; }}
    h1 {{ margin-bottom: 1rem; }}
    p {{ margin: 0 0 1rem; white-space: normal; }}
  </style>
</head>
<body>
  <h1>{safe_title}</h1>
  {body}
</body>
</html>"#,
    )
}

fn build_output_path_with_ext(original_path: &Path, ext: &str) -> Result<PathBuf, String> {
    let parent = original_path
        .parent()
        .ok_or_else(|| "Не удалось определить папку исходного файла.".to_string())?;
    let stem = original_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("document");
    for index in 0..1000 {
        let name = if index == 0 {
            format!("{stem}_translated.{ext}")
        } else {
            format!("{stem}_translated_{index}.{ext}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Не удалось подобрать имя для выходного файла.".to_string())
}

fn save_epub_from_text(output_path: &Path, title: &str, text: &str) -> Result<(), String> {
    let file = File::create(output_path).map_err(|err| format!("Не удалось создать EPUB: {err}"))?;
    let mut zip = ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("mimetype", stored)
        .map_err(|err| format!("EPUB write error: {err}"))?;
    zip.write_all(b"application/epub+zip")
        .map_err(|err| format!("EPUB write error: {err}"))?;

    zip.start_file("META-INF/container.xml", deflated)
        .map_err(|err| format!("EPUB write error: {err}"))?;
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
    )
    .map_err(|err| format!("EPUB write error: {err}"))?;

    let chapter_html = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>{}</title></head>
  <body>{}</body>
</html>"#,
        escape_xml(title),
        text
            .split("\n\n")
            .filter_map(|p| {
                let t = p.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(format!("<p>{}</p>", escape_xml(t).replace('\n', "<br/>")))
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    );

    zip.start_file("OEBPS/chapter.xhtml", deflated)
        .map_err(|err| format!("EPUB write error: {err}"))?;
    zip.write_all(chapter_html.as_bytes())
        .map_err(|err| format!("EPUB write error: {err}"))?;

    let nav_html = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>nav</title></head>
  <body>
    <nav epub:type="toc" id="toc" xmlns:epub="http://www.idpf.org/2007/ops">
      <ol><li><a href="chapter.xhtml">{}</a></li></ol>
    </nav>
  </body>
</html>"#,
        escape_xml(title)
    );

    zip.start_file("OEBPS/nav.xhtml", deflated)
        .map_err(|err| format!("EPUB write error: {err}"))?;
    zip.write_all(nav_html.as_bytes())
        .map_err(|err| format!("EPUB write error: {err}"))?;

    let opf = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">lintl-generated</dc:identifier>
    <dc:title>{}</dc:title>
    <dc:language>ru</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>"#,
        escape_xml(title)
    );

    zip.start_file("OEBPS/content.opf", deflated)
        .map_err(|err| format!("EPUB write error: {err}"))?;
    zip.write_all(opf.as_bytes())
        .map_err(|err| format!("EPUB write error: {err}"))?;

    zip.finish().map_err(|err| format!("EPUB finalize error: {err}"))?;
    Ok(())
}

fn build_translated_path(original_path: &Path) -> Result<PathBuf, String> {
    let parent = original_path
        .parent()
        .ok_or_else(|| "Не удалось определить папку исходного файла.".to_string())?;
    let stem = original_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("document");
    let ext = original_path
        .extension()
        .and_then(|extension| extension.to_str())
        .filter(|extension| !extension.trim().is_empty())
        .unwrap_or("txt");

    for index in 0..1000 {
        let name = if index == 0 {
            format!("{stem}_translated.{ext}")
        } else {
            format!("{stem}_translated_{index}.{ext}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Не удалось подобрать имя для выходного файла.".to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let candidate = PathBuf::from(path.trim());
    if candidate.as_os_str().is_empty() {
        return Err("Путь к файлу пустой.".to_string());
    }
    if !candidate.exists() {
        return Err("Файл не найден.".to_string());
    }
    if !is_supported_input_extension(&candidate) {
        return Err("Поддерживаются .txt, .md и .epub файлы.".to_string());
    }

    if is_epub_extension(&candidate) {
        return read_epub_file(&candidate);
    }

    let bytes = fs::read(&candidate).map_err(|err| format!("Не удалось прочитать файл: {err}"))?;
    Ok(decode_text_bytes(&bytes))
}

#[tauri::command]
fn save_translated_file(original_path: String, translated_text: String) -> Result<String, String> {
    if translated_text.trim().is_empty() {
        return Err("Перевод пустой, нечего сохранять.".to_string());
    }

    let original = PathBuf::from(original_path.trim());
    if original.as_os_str().is_empty() {
        return Err("Не выбран исходный файл.".to_string());
    }
    if !original.exists() {
        return Err("Исходный файл не найден на диске.".to_string());
    }

    let output_path = build_translated_path(&original)?;
    if is_epub_extension(&original) {
        let title = original
            .file_stem()
            .and_then(|name| name.to_str())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or("Translated EPUB");
        save_epub_from_text(&output_path, title, &translated_text)?;
    } else {
        fs::write(&output_path, translated_text)
            .map_err(|err| format!("Не удалось сохранить перевод: {err}"))?;
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_translation_html(original_path: String, translated_text: String) -> Result<String, String> {
    if translated_text.trim().is_empty() {
        return Err("Перевод пустой, нечего экспортировать.".to_string());
    }
    let original = PathBuf::from(original_path.trim());
    if original.as_os_str().is_empty() {
        return Err("Не выбран исходный файл.".to_string());
    }
    if !original.exists() {
        return Err("Исходный файл не найден на диске.".to_string());
    }

    let output_path = build_output_path_with_ext(&original, "html")?;
    let title = original
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("Translated");
    let html = render_text_as_html(title, &translated_text);
    fs::write(&output_path, html).map_err(|err| format!("Не удалось экспортировать HTML: {err}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_translation_docx(original_path: String, translated_text: String) -> Result<String, String> {
    if translated_text.trim().is_empty() {
        return Err("Перевод пустой, нечего экспортировать.".to_string());
    }
    let original = PathBuf::from(original_path.trim());
    if original.as_os_str().is_empty() {
        return Err("Не выбран исходный файл.".to_string());
    }
    if !original.exists() {
        return Err("Исходный файл не найден на диске.".to_string());
    }

    let output_path = build_output_path_with_ext(&original, "docx")?;
    let mut doc = Docx::new();
    for paragraph in translated_text.split("\n\n") {
        let trimmed = paragraph.trim();
        if trimmed.is_empty() {
            continue;
        }
        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(trimmed)));
    }
    let file = File::create(&output_path).map_err(|err| format!("Не удалось создать DOCX: {err}"))?;
    doc.build()
        .pack(file)
        .map_err(|err| format!("Не удалось экспортировать DOCX: {err}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_models(provider: String, api_key: String, base_url: String) -> Result<Vec<String>, String> {
    let provider = provider.trim().to_lowercase();
    let api_key = api_key.trim().to_string();
    let base_url = normalized_base_url(&provider, &base_url);

    if provider != "ollama" && provider != "openrouter" && provider != "custom" && api_key.is_empty() {
        return Err("Для этого провайдера нужен API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let models_url = models_endpoint(&provider, &base_url);
    let client = reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("Не удалось инициализировать HTTP клиент: {err}"))?;

    let mut request = client
        .get(models_url)
        .header("Accept-Encoding", "identity")
        .header("Connection", "close");
    if provider != "ollama" && !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }
    if provider == "openrouter" {
        request = request
            .header("HTTP-Referer", "https://github.com/tauri-apps/tauri")
            .header("X-Title", "LinTL");
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("Сетевая ошибка при загрузке моделей: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = read_response_body(response).await.unwrap_or_default();
        return Err(extract_error_message(status, &body));
    }

    let mut models: Vec<String> = if provider == "ollama" {
        let payload: OllamaTagsResponse = response
            .json()
            .await
            .map_err(|err| format!("Не удалось разобрать список моделей: {err}"))?;
        payload.models.into_iter().map(|item| item.name).collect()
    } else {
        let payload: OpenAiModelsResponse = response
            .json()
            .await
            .map_err(|err| format!("Не удалось разобрать список моделей: {err}"))?;
        payload.data.into_iter().map(|item| item.id).collect()
    };

    models.sort();
    models.dedup();

    if models.is_empty() {
        return Err("Провайдер вернул пустой список моделей.".to_string());
    }

    Ok(models)
}

fn parse_price_value(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::String(raw)) => raw.parse::<f64>().ok(),
        Some(Value::Number(num)) => num.as_f64(),
        _ => None,
    }
}

#[tauri::command]
async fn get_model_pricing(
    provider: String,
    api_key: String,
    base_url: String,
    model: String,
) -> Result<Option<ModelPricing>, String> {
    let provider = provider.trim().to_lowercase();
    let api_key = api_key.trim().to_string();
    let base_url = normalized_base_url(&provider, &base_url);
    let model = model.trim().to_string();

    if model.is_empty() {
        return Ok(None);
    }
    if provider != "ollama" && provider != "openrouter" && provider != "custom" && api_key.is_empty() {
        return Ok(None);
    }
    if provider == "custom" && base_url.is_empty() {
        return Ok(None);
    }

    let models_url = models_endpoint(&provider, &base_url);
    let client = reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("Не удалось инициализировать HTTP клиент: {err}"))?;

    let mut request = client
        .get(models_url)
        .header("Accept-Encoding", "identity")
        .header("Connection", "close");
    if provider != "ollama" && !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }
    if provider == "openrouter" {
        request = request
            .header("HTTP-Referer", "https://github.com/tauri-apps/tauri")
            .header("X-Title", "LinTL");
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("Сетевая ошибка при загрузке цен: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = read_response_body(response).await.unwrap_or_default();
        return Err(extract_error_message(status, &body));
    }

    let body = read_response_body(response).await?;
    let parsed: Value =
        serde_json::from_str(&body).map_err(|err| format!("Не удалось разобрать ответ цен: {err}"))?;
    let items = parsed
        .get("data")
        .and_then(|value| value.as_array())
        .or_else(|| parsed.as_array())
        .cloned()
        .unwrap_or_default();

    let item = items.into_iter().find(|entry| {
        entry
            .get("id")
            .and_then(|value| value.as_str())
            .map(|id| id == model)
            .unwrap_or(false)
    });

    let Some(entry) = item else {
        return Ok(None);
    };

    let prompt_price = parse_price_value(
        entry
            .get("pricing")
            .and_then(|pricing| pricing.get("prompt")),
    );
    let completion_price = parse_price_value(
        entry
            .get("pricing")
            .and_then(|pricing| pricing.get("completion")),
    );

    if prompt_price.is_none() && completion_price.is_none() {
        return Ok(None);
    }

    Ok(Some(ModelPricing {
        model,
        prompt_per_token: prompt_price,
        completion_per_token: completion_price,
        currency: "USD".to_string(),
        source: provider,
    }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn translate(
    text: String,
    model: String,
    api_key: String,
    source_lang: String,
    target_lang: String,
    provider: String,
    base_url: String,
    context_before: Option<String>,
    glossary: Option<Vec<GlossaryEntry>>,
    character_cards: Option<Vec<CharacterCard>>,
    rag_context: Option<String>,
    memory: Option<String>,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let text = text.trim().to_string();
    let model = model.trim().to_string();
    let api_key = api_key.trim().to_string();
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);

    if text.is_empty() {
        return Err("Введите исходный текст для перевода.".to_string());
    }
    if model.is_empty() {
        return Err("Выберите модель.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let context_block = context_before.unwrap_or_default().trim().to_string();
    let rag_block = rag_context.unwrap_or_default().trim().to_string();
    let memory_block = memory.unwrap_or_default().trim().to_string();
    let glossary_items = glossary.unwrap_or_default();
    let glossary_block = format_glossary(&glossary_items);
    let character_cards_block = format_character_cards(&character_cards.unwrap_or_default());

    let mut prompt = format!(
        "Ты — профессиональный переводчик лайт-новелл. Переведи следующий отрывок с {source_lang} на {target_lang}, сохраняя стиль, эмоции и повествование."
    );

    if !glossary_block.is_empty() {
        prompt.push_str(&format!(
            "\n\nГлоссарий (обязательно используй именно эти переводы):\n{glossary_block}"
        ));
    }
    if !memory_block.is_empty() {
        prompt.push_str(&format!(
            "\n\nКонтекст предыдущих глав:\n{memory_block}"
        ));
    }
    if !character_cards_block.is_empty() {
        prompt.push_str(&format!(
            "\n\nКарточки персонажей (сохраняй согласованность имен, речи и отношений):\n{character_cards_block}"
        ));
    }
    if !rag_block.is_empty() {
        prompt.push_str(&format!(
            "\n\nРелевантные фрагменты из предыдущих глав (используй только как контекст):\n{rag_block}"
        ));
    }
    if !context_block.is_empty() {
        prompt.push_str(&format!(
            "\n\nКонтекст предыдущего текста (не переводи этот блок, используй только для согласованности терминов и стиля):\n{context_block}"
        ));
    }

    prompt.push_str(&format!(
        "\n\nПереведи только следующий фрагмент:\n{text}\n\nНе добавляй комментарии."
    ));

    request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await
}

#[tauri::command]
fn read_translation_project(path: String) -> Result<TranslationProject, String> {
    let candidate = PathBuf::from(path.trim());
    if candidate.as_os_str().is_empty() {
        return Err("Путь к проекту пустой.".to_string());
    }
    if !candidate.exists() {
        return Err("Файл проекта не найден.".to_string());
    }

    let raw = fs::read_to_string(&candidate)
        .map_err(|err| format!("Не удалось прочитать файл проекта: {err}"))?;
    let mut project: TranslationProject = serde_json::from_str(&raw)
        .map_err(|err| format!("Некорректный JSON проекта: {err}"))?;

    project.project_name = project.project_name.trim().to_string();
    project.source_lang = project.source_lang.trim().to_string();
    project.target_lang = project.target_lang.trim().to_string();
    project.model = project.model.trim().to_string();
    project.memory = project.memory.trim().to_string();
    project
        .glossary
        .retain(|item| !item.original.trim().is_empty() || !item.translated.trim().is_empty());
    project
        .character_cards
        .retain(|card| !card.name.trim().is_empty());
    project.chapter_archive = project
        .chapter_archive
        .into_iter()
        .map(|mut chapter| {
            chapter.id = chapter.id.trim().to_string();
            chapter.title = chapter.title.trim().to_string();
            chapter.text = chapter.text.trim().to_string();
            chapter.added_at = chapter.added_at.trim().to_string();
            chapter
        })
        .filter(|chapter| !chapter.text.is_empty())
        .collect();

    Ok(project)
}

#[tauri::command]
fn write_translation_project(path: String, project: TranslationProject) -> Result<(), String> {
    let candidate = PathBuf::from(path.trim());
    if candidate.as_os_str().is_empty() {
        return Err("Путь к проекту пустой.".to_string());
    }

    let parent = candidate
        .parent()
        .ok_or_else(|| "Не удалось определить папку файла проекта.".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("Не удалось создать папку проекта: {err}"))?;

    let serialized = serde_json::to_string_pretty(&project)
        .map_err(|err| format!("Не удалось сериализовать проект: {err}"))?;
    fs::write(&candidate, serialized).map_err(|err| format!("Не удалось сохранить проект: {err}"))?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn update_memory_summary(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    previous_memory: String,
    chapter_source: String,
    chapter_translation: String,
    target_lang: String,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let target_lang = target_lang.trim().to_string();

    if model.is_empty() {
        return Err("Выберите модель для обновления памяти.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let prompt = format!(
        "Ты помощник редактора перевода новелл. Обнови память проекта на языке {target_lang}.\n\nТекущая память проекта:\n{previous_memory}\n\nНовый оригинальный фрагмент главы:\n{chapter_source}\n\nНовый переведенный фрагмент:\n{chapter_translation}\n\nВерни только обновленную память (5-12 предложений), без объяснений и без markdown."
    );

    request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn compress_chapter_to_memory(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    source_lang: String,
    target_lang: String,
    current_memory: String,
    chapter_text: String,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let source_lang = source_lang.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let chapter_text = chapter_text.trim().to_string();
    let current_memory = current_memory.trim().to_string();

    if chapter_text.is_empty() {
        return Err("Вставьте текст главы для сжатия.".to_string());
    }
    if model.is_empty() {
        return Err("Выберите модель для сжатия memory.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let prompt = format!(
        "Ты редактор памяти проекта перевода новеллы.\n\nЯзык оригинала: {source_lang}\nЯзык memory: {target_lang}\n\nТекущая память проекта:\n{current_memory}\n\nПолный текст предыдущей главы:\n{chapter_text}\n\nСожми информацию в компактную память проекта на {target_lang}:\n- 6-12 предложений\n- только важные события, отношения персонажей, цели, конфликты, термины\n- без цитат и без markdown\n- сохраняй имена и ключевые термины согласованно\n\nВерни только итоговый текст memory."
    );

    request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn suggest_glossary_entries(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    source_lang: String,
    target_lang: String,
    current_memory: String,
    chapter_text: String,
    existing_glossary: Vec<GlossaryEntry>,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<Vec<GlossaryEntry>, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let source_lang = source_lang.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let current_memory = current_memory.trim().to_string();
    let chapter_text = chapter_text.trim().to_string();

    if chapter_text.is_empty() {
        return Err("Вставьте текст главы для извлечения глоссария.".to_string());
    }
    if model.is_empty() {
        return Err("Выберите модель для извлечения глоссария.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let existing = format_glossary(&existing_glossary);
    let prompt = format!(
        "Ты помощник переводчика новелл.\n\nИсходный язык: {source_lang}\nЯзык перевода: {target_lang}\n\nТекущая память проекта:\n{current_memory}\n\nУже известный глоссарий:\n{existing}\n\nТекст главы:\n{chapter_text}\n\nВыдели только действительно важные термины и имена, которые стоит зафиксировать в глоссарии.\nЕсли новых терминов нет, верни []\n\nВерни строго JSON-массив объектов формата:\n{{\"original\":\"...\",\"translated\":\"...\",\"note\":\"...\"}}\n\nБез markdown, без комментариев, только JSON."
    );

    let raw = request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await?;
    parse_glossary_from_model_output(&raw)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn edit_translation(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    source_lang: String,
    target_lang: String,
    source_text: String,
    translated_text: String,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let source_lang = source_lang.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let source_text = source_text.trim().to_string();
    let translated_text = translated_text.trim().to_string();

    if translated_text.is_empty() {
        return Err("Нет текста для редакторской правки.".to_string());
    }
    if model.is_empty() {
        return Err("Выберите модель-редактор.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let prompt = format!(
        "Ты литературный редактор перевода лайт-новелл.\n\nЯзык оригинала: {source_lang}\nЯзык перевода: {target_lang}\n\nОригинальный текст (для сверки смысла):\n{source_text}\n\nТекущий перевод (нужно отредактировать):\n{translated_text}\n\nЗадача:\n- исправь нелогичные места, неточности, ошибки согласования и стиля\n- сохрани имена, термины и общий тон\n- не сокращай содержание без причины\n- не добавляй комментарии\n\nВерни только отредактированный итоговый перевод."
    );

    request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn suggest_edit_patches(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    source_lang: String,
    target_lang: String,
    source_text: String,
    editable_text: String,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<Vec<ParagraphPatch>, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let source_lang = source_lang.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let source_text = source_text.trim().to_string();
    let editable_text = editable_text.trim().to_string();

    if editable_text.is_empty() {
        return Err("Нет текста для редактуры.".to_string());
    }
    if model.is_empty() {
        return Err("Выберите модель-редактор.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let paragraphs = editable_text
        .split("\n\n")
        .enumerate()
        .map(|(idx, part)| format!("{}| {}", idx + 1, part))
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "Ты литературный редактор перевода лайт-новелл.\n\nЯзык оригинала: {source_lang}\nЯзык редактируемого текста: {target_lang}\n\nОригинал для сверки (может быть пустым):\n{source_text}\n\nТекст для редактуры, разбитый на абзацы (формат 'index| text'):\n{paragraphs}\n\nНужно исправить только действительно проблемные абзацы. Не переписывай хорошие абзацы.\n\nВерни строго JSON-массив патчей, где каждый объект:\n{{\"index\": number, \"text\": \"исправленный абзац\"}}\n\nПравила:\n- index начинается с 1\n- включай только измененные абзацы\n- если изменений нет, верни []\n- без markdown, без пояснений, только JSON."
    );

    let raw = request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await?;
    parse_paragraph_patches(&raw)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn research_project_context(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    project_name: String,
    user_query: String,
    source_lang: String,
    target_lang: String,
    current_memory: String,
    existing_glossary: Vec<GlossaryEntry>,
    existing_characters: Vec<CharacterCard>,
    model_provider: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<ResearchContextResult, String> {
    let provider = provider.trim().to_lowercase();
    let base_url = normalized_base_url(&provider, &base_url);
    let api_key = api_key.trim().to_string();
    let model = model.trim().to_string();
    let project_name = project_name.trim().to_string();
    let user_query = user_query.trim().to_string();
    let source_lang = source_lang.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    let current_memory = current_memory.trim().to_string();

    if model.is_empty() {
        return Err("Выберите модель для research.".to_string());
    }
    if provider != "ollama" && provider != "custom" && api_key.is_empty() {
        return Err("Введите API ключ.".to_string());
    }
    if provider == "custom" && base_url.is_empty() {
        return Err("Для custom-провайдера укажите Base URL.".to_string());
    }

    let glossary_block = format_glossary(&existing_glossary);
    let character_cards_block = format_character_cards(&existing_characters);
    let prompt = format!(
        "Ты исследователь контекста для переводчика новелл.\n\nНазвание проекта: {project_name}\nИсходный язык: {source_lang}\nЯзык перевода: {target_lang}\nЗапрос пользователя: {user_query}\n\nТекущая память проекта:\n{current_memory}\n\nТекущий глоссарий:\n{glossary_block}\n\nТекущие персонажи:\n{character_cards_block}\n\nЕсли модель поддерживает веб-поиск (например Perplexity/Sonar), используй его. Если не поддерживает, верни максимально полезный результат на своей базе знаний.\n\nВерни строго JSON-объект формата:\n{{\n  \"summary\": \"краткий апдейт memory (3-8 предложений)\",\n  \"glossary\": [{{\"original\":\"...\",\"translated\":\"...\",\"note\":\"...\"}}],\n  \"characters\": [{{\"name\":\"...\",\"description\":\"...\",\"appearance\":\"...\",\"relationships\":\"...\"}}],\n  \"sources\": [\"https://...\"]\n}}\n\nПравила:\n- summary на языке {target_lang}\n- glossary только полезные новые/уточненные термины\n- characters только реально важные персонажи/обновления\n- если нет данных для поля, верни пустую строку/массив\n- без markdown, только JSON."
    );

    let raw = request_model_completion(
        &provider,
        &base_url,
        &api_key,
        &model,
        model_provider.as_deref(),
        prompt,
        system_prompt,
        temperature,
        top_p,
        max_tokens,
    )
    .await?;

    parse_research_context_result(&raw)
}

#[tauri::command]
fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|err| format!("Не удалось получить статус auto-start: {err}"))
}

#[tauri::command]
fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|err| format!("Не удалось включить auto-start: {err}"))?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|err| format!("Не удалось выключить auto-start: {err}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let show_item = MenuItemBuilder::with_id("show", "Показать").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Скрыть").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Выход").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &tauri::AppHandle, event| {
                    let id = event.id.as_ref();
                    if id == "quit" {
                        app.exit(0);
                        return;
                    }
                    if let Some(window) = app.get_webview_window("main") {
                        if id == "show" {
                            let _ = window.show();
                            let _ = window.set_focus();
                        } else if id == "hide" {
                            let _ = window.hide();
                        }
                    }
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                match window.is_visible() {
                                    Ok(true) => {
                                        let _ = window.hide();
                                    }
                                    Ok(false) | Err(_) => {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            translate,
            list_models,
            get_model_pricing,
            read_text_file,
            save_translated_file,
            export_translation_html,
            export_translation_docx,
            read_translation_project,
            write_translation_project,
            update_memory_summary,
            compress_chapter_to_memory,
            suggest_glossary_entries,
            edit_translation,
            suggest_edit_patches,
            research_project_context,
            get_autostart_enabled,
            set_autostart_enabled,
            request_cancel_processing,
            clear_cancel_processing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
