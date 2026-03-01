# Contributing

Thanks for contributing to LinTL.

## Workflow

1. Fork the repository and create a feature branch from `main`.
2. Keep changes focused and small.
3. Run local checks before opening a PR.
4. Open a Pull Request with a clear description of:
   - what changed
   - why it changed
   - how it was tested

## Local Setup

```bash
bun install
bun run tauri dev
```

## Required Checks

```bash
bunx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Code Style

- Prefer clear, small functions.
- Avoid unrelated refactors in feature PRs.
- Keep UI strings localizable.
- For Rust warnings, fix the warning or document why an allow is necessary.

## Commit Messages

- Use concise, imperative messages (example: `Add EPUB export pipeline`).
- Group related changes into a single commit when possible.
