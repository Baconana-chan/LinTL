# TODO.md — Лёгкий AI-переводчик новелл на Tauri

Цель: десктопное приложение для последовательного перевода текстов (особенно японских/китайских новелл) с сохранением контекста, персонажей и терминов.  
Используем свой API-ключ (OpenRouter / Chutes / Groq / OpenAI / локальный Ollama).

## Фаза 1: Самый простой MVP — перевод одного куска текста (2–5 часов)

Цель: вставить текст → нажать кнопку → получить перевод → всё.

- [x] Frontend: textarea для исходного текста + textarea для перевода + кнопка "Перевести"
- [x] Backend (Rust): команда `translate` через tauri::command
  - Принимает: text: String, model: String, api_key: String, source_lang: String, target_lang: String
  - Формирует промпт:  
    ```
    Ты — профессиональный переводчик лайт-новелл. Переведи следующий отрывок с {source} на {target}, сохраняя стиль, эмоции и повествование. Не добавляй комментарии.

    Текст:
    {text}
    ```
  - Делает HTTP POST на OpenRouter / Chutes / OpenAI-совместимый API (reqwest + serde_json)
  - Возвращает только content из ответа
- [x] Обработка ошибок: показать toast / alert при 429, 401, network error
- [x] Добавить выбор модели (dropdown: claude-3.5-sonnet, gemini-2.0-flash, deepseek-v3, llama-3.1-70b и т.д.)
- [x] Сохранить последний использованный ключ/модель в localStorage (frontend) или tauri::api::path::app_local_data_dir (backend)

Результат: можно переводить абзацы/главы вручную копипастом.

## Фаза 2: Работа с файлами и чанкинг (3–7 часов)

- [x] Добавить кнопку "Открыть файл" → поддержка .txt, .md (позже .epub)
- [x] Разбивать текст на чанки по ~3000–5000 символов (или по \n\n с учётом глав)
- [x] Показывать список чанков / прогресс-бар
- [x] Перевод по кнопке "Перевести весь файл" → последовательно или параллельно (с лимитом concurrency)
- [x] Сохранять перевод в .txt / .md рядом с оригиналом (original → translated)
- [x] Добавить настройку размера чанка и overlap (для сохранения контекста)

## Фаза 3: Простая память контекста / глоссарий (4–10 часов)

- [x] Создать JSON-файл проекта (.translation-project) в той же папке:
  ```json
  {
    "project_name": "Название новеллы",
    "source_lang": "ja",
    "target_lang": "ru",
    "model": "anthropic/claude-4-sonnet",
    "glossary": [
      {"original": "主人公", "translated": "главный герой", "note": "всегда так"},
      {"original": "先輩", "translated": "сенпай", "note": "не переводить как старший товарищ"}
    ],
    "memory": "Краткое описание предыдущих глав: Акира встретил таинственную девушку Юки в школе..."
  }
  ```
- [x] Добавить кнопку "Открыть проект" / "Новый проект"
- [x] В промпт добавлять:
  ```
  Глоссарий (обязательно используй именно эти переводы):
  {glossary_formatted}

  Контекст предыдущих глав:
  {memory}

  Переведи следующий отрывок:
  ```
- [x] UI для редактирования глоссария (таблица: original → translated → note)
- [x] После каждой главы — кнопка "Обновить summary памяти" (отправить краткое содержание главы модели)

## Фаза 4: Удобный UX и визуализация (5–12 часов)

- [x] Side-by-side вид: оригинал | перевод (два скроллащихся textarea или Monaco editor)
- [x] Подсветка различий / diff (использовать diff2html или простой JS diff)
- [x] Автосохранение перевода каждые N секунд / после чанка
- [x] Темы (light/dark/oled) + font settings (размер, шрифт для японского/китайского)
- [x] Drag & drop файлов
- [x] Прогресс + cancel button (abort controller в fetch)
- [x] История переводов (локальная база — sqlite через tauri-plugin-sql или просто JSON)

## Фаза 5: Продвинутые фичи для новелл (10–30+ часов)

- [x] Поддержка .epub (parse с помощью epub-rs или JS-библиотеки → перевод → новый epub)
- [x] Авто-детект терминов (отдельный вызов модели: "Выдели ключевые имена/термины и предложи переводы")
- [x] RAG-подобный поиск по предыдущим главам (векторизация чанков → хранить в vector db lite или просто текстом)
- [x] Character cards (как в SillyTavern): имя, описание, внешность, отношения → добавлять в промпт
- [x] Batch-режим + очередь + приоритет
- [x] Локальный режим (Ollama / candle / llama-rs sidecar)
- [x] Экспорт в .docx / .html с сохранением форматирования
- [x] Горячие клавиши, tray icon, auto-start
- [x] Настройки: температура, top_p, max_tokens, system prompt template

## Фаза 6: Полировка и релиз (много часов)

- [x] Иконки, splash screen, about окно
- [x] Локализация интерфейса (ru / en / ja)
- [x] Обработка очень длинных текстов (>1 млн символов)
- [x] Тестирование на реальных новеллах (jp→ru, cn→en и т.д.)
- [x] GitHub repo + releases (AppImage, .exe, .dmg)
- [x] Документация


### Post-release / vNext

#### Core Improvements
- [ ] Кастомный title bar (Tauri-style, без системного)  
  → Использовать tauri-plugin-window-customization или react-titlebar; добавить кнопки minimize/maximize/close + интеграцию с tray icon; поддержка drag на всём окне. (2–4 часа)  
  → Почему: Улучшит эстетику, особенно в dark/oled темах, и сделает app более "нативным" на Windows/macOS.

- [ ] Более user-friendly UI для новичков  
  → Onboarding-тур (первые 3 запуска: туториал по шагам — "Загрузи файл", "Настрой ключ", "Добавь глоссарий");  
  → Упрощённый "Wizard Mode" (шаги: 1. Выбери файл, 2. Языки, 3. Модели/агенты, 4. Запусти);  
  → Tooltips везде (hover на полях: "Что такое temperature?"); пресеты для популярных пар (jp→ru хентай/LN). (5–10 часов)

- [ ] Авто-обновления app (tauri-plugin-updater)  
  → Проверка на GitHub релизы + silent download/install. (2–3 часа)

- [ ] Multi-project tabs (переключение между проектами без перезагрузки)  
  → Как в VS Code: tabs для открытых .translation-project. (4–8 часов)

#### Advanced AI Features
- [ ] Настоящая векторизация RAG (эмбеддинги + vector db + rerank)  
  → Заменить token-overlap на полноценный: embeddings от Sentence-Transformers (Rust binding через candle или внешний API); хранить в qdrant-rs или sled-vec (локально); rerank с cross-encoder.  
  → Применять для memory retrieval, glossary suggestions, character relations. (10–20 часов)

- [ ] Пятый агент: "Coordinator/Critic" (вдохновлён Grok 4.20)  
  → После всех агентов — финальный pass: разрешает конфликты (e.g., Term vs Editor), оценивает качество (self-eval промпт), предлагает alternatives. (5–10 часов)

- [ ] Интеграция с внешними tools (e.g., Tavily/Serper для Search Model)  
  → Если Perplexity Sonar дорогой — добавить опции для других search APIs; auto-fallback на локальный если offline. (3–6 часов)

- [ ] Multi-iteration refine loop  
  → Опция "Deep Refine": 2–3 итерации Editor + Term на проблемных чанках (с лимитом). (4–7 часов)

- [ ] Support для multi-modal (image descriptions в новеллах)  
  → Если epub с иллюстрациями — описывать их через vision-модели (Gemini 3.0 / Claude 4 Vision) и добавлять в текст. (8–15 часов)

#### UX/Accessibility
- [ ] Customizable shortcuts editor  
  → UI для смены горячих клавиш (e.g., Ctrl+T → translate). (2–4 часа)

- [ ] Collaborative mode (share project via link/file)  
  → Экспорт/импорт .translation-project как zip с историей; опционально — sync через GitHub Gist. (5–10 часов)

#### Performance/Tech
- [ ] GPU acceleration для локального режима (candle-metal для Apple M-series, candle-cuda)  
  → Ускорить Ollama/locals на 2–5x. (3–7 часов, если hardware-dependent)

- [ ] Caching responses (sled или rocksdb для повторных чанков)  
  → Если чанк не изменился — брать из cache, экономя токены. (4–6 часов)

- [ ] Mobile build (Tauri Mobile alpha)  
  → Android/iOS версия для API (без локальных фишек). (10–20+ часов)

- [ ] WASM-sidecar для browser fallback  
  → Лёгкая веб-версия (без full Tauri, локалки, но с теми же промптами + возможность монетизации). (8–15 часов)
