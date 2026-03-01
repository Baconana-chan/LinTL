# Release Notes Guide

This project publishes desktop bundles through GitHub Actions.

## Supported Release Assets

- Windows installer: `.exe` (NSIS)
- Linux bundle: `.AppImage`
- macOS installer: `.dmg`

## How Releases Are Triggered

- Push a semantic tag matching `v*.*.*` (example: `v1.2.0`).
- Workflow used: `.github/workflows/build.yml`.

## Manual Build (No Release)

Run `Build & Release` via `workflow_dispatch` to only produce workflow artifacts.

## Common Issues

- Linux build fails with WebKitGTK errors:
  - Ensure workflow keeps required apt packages in the Linux job.
- macOS signing/notarization:
  - Current setup produces unsigned `.dmg` suitable for direct distribution/testing.
  - For notarized production releases, add Apple signing secrets and notarization steps.
