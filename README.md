# LinTL

Desktop AI translator for long-form novels (Tauri + Preact + Rust).

## Features

- Chunked translation for long chapters (`.txt`, `.md`, `.epub`)
- Project memory, glossary, character cards, chapter archive
- Side-by-side editor, diff view, autosave, translation history
- Batch queue mode and export (`.html`, `.docx`)
- Cloud and local backends (OpenRouter/OpenAI/Groq/Chutes/Ollama/etc.)
- UI localization: English / Russian / Japanese

## Tech Stack

- Frontend: Preact + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend: Rust (`src-tauri`)
- Package manager: Bun

## Requirements

- Bun (latest)
- Rust stable toolchain
- Tauri prerequisites for your OS: <https://tauri.app/start/prerequisites/>

## Development

```bash
bun install
bun run tauri dev
```

## Type-check

```bash
bunx tsc --noEmit
```

## Production build (local)

```bash
bun run tauri build
```

## GitHub Actions

- `CI` workflow:
  - Triggered on `push` to `main/dev` and pull requests
  - Runs TypeScript check + Rust check/clippy
- `Build & Release` workflow:
  - Manual run (`workflow_dispatch`) builds artifacts
  - Tag push `v*.*.*` builds and publishes release assets:
    - Windows: `.exe` (NSIS)
    - Linux: `.AppImage`
    - macOS: `.dmg`

## Release Process

1. Update version in `src-tauri/tauri.conf.json`.
2. Commit changes to `main`.
3. Create and push a tag:
   - `git tag v1.0.1`
   - `git push origin v1.0.1`
4. Wait for `Build & Release` workflow to finish.
5. Verify assets in GitHub Releases.

## Repository Layout

- `src/` - Preact UI
- `src-tauri/` - Rust/Tauri backend
- `.github/workflows/` - CI/CD pipelines
- `TODO.md` - roadmap and progress checklist

## Roadmap

See [TODO.md](TODO.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
