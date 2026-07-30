# Contributing to Slang AI Lab

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository and create your branch from `main`.
2. Follow the setup steps in [README.md](./README.md).
3. Make your changes and verify the app works as expected.
4. Open a pull request with a clear description of the change.

## Development Setup

```bash
cd app
npm install
cp .env.local.example .env.local
# Add your GROQ_API_KEY to .env.local (optional — you can also enter a key in the Settings panel)
npm run dev
```

## Before Opening a PR

Run these locally from `app/` — CI runs the same checks:

```bash
npm run lint
npm run test:unit
npm run build
```

## Guidelines

- **TypeScript**: The project is fully typed. Do not disable type checking.
- **Commits**: Use short, descriptive commit messages in the imperative mood (e.g. `fix shader compile error`).
- **Shaders**: New Slang shader templates go in `app/lib/slang-templates.ts` (compiled in-browser to WGSL). Legacy GLSL templates in `app/lib/shader-templates.ts` must compile under WebGL 1.0 (GLSL ES 1.00).
- **Secrets**: Never commit API keys, even in examples or scripts. See [SECURITY.md](./SECURITY.md).
- **UI**: Follow the design system defined in [DESIGN.md](./DESIGN.md). Do not introduce new accent colors or deviate from the established glass-dark visual language.
- **No comments**: Prefer self-documenting code. Add a comment only when the *why* is non-obvious.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be kind.

## Reporting Issues

Please open a GitHub Issue with:
- A clear description of the problem
- Steps to reproduce
- Browser / OS information
- Console error output if applicable

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
