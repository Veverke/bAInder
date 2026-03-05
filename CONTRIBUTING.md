# Contributing to bAInder

Thank you for your interest in contributing to bAInder! This document provides guidelines and instructions for developing and contributing to the project.

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- Git
- A code editor (VS Code recommended)
- Chrome or Edge browser for testing

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/bAInder.git
   cd bAInder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development with watch mode**
   ```bash
   npm run dev
   ```

4. **Load the extension in your browser**
   - **Chrome**: Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/chrome/`
   - **Edge**: Open `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/edge/`

## Available Scripts

```bash
npm run build:all    # Build extensions for both Chrome and Edge
npm run dev          # Start development server with watch mode
npm run test         # Run tests with Vitest
npm test -- --watch # Run tests in watch mode
npm run lint         # Run ESLint
```

## Project Structure

- **`src/background/`** — Extension background scripts and service workers
- **`src/content/`** — Content scripts injected into web pages
- **`src/sidepanel/`** — Side panel UI and logic
- **`src/reader/`** — Chat viewer UI and functionality
- **`src/lib/`** — Core utilities, storage, export/import logic
- **`tests/`** — Test files for all modules
- **`docs/`** — Documentation and design specifications

## Code Quality Standards

- **Linting**: ESLint configuration ensures code consistency
- **Tests**: All new features must include corresponding tests
- **UT Coverage gate**: 90% minimum code coverage required
- **Commits**: Follow conventional commit messages for clarity

### Running Tests

```bash
npm test             # Run all tests once
npm test -- --watch # Run tests in watch mode
npm run lint         # Check code style
```

Test files use Vitest and cover:
- Chat extraction and parsing
- Data storage and retrieval
- Export/import functionality
- UI components and interactions
- Utility functions

## Making a Contribution

### 1. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

Use clear branch names:
- `feature/add-x` for new features
- `fix/issue-description` for bug fixes
- `docs/improve-readme` for documentation

### 2. Make Your Changes

- Write clear, readable code
- Follow the existing code style (ESLint enforces this)
- Add or update tests for your changes
- Update documentation if you're changing user-facing behavior

### 3. Verify Your Work

```bash
npm run lint         # Fix any linting errors
npm test             # Run all tests
npm run build:all    # Build both extensions
```

Test in the actual extension:
- Load the updated extension in your browser
- Test the feature manually
- Check that existing features still work

### 4. Commit Your Changes

Use clear, descriptive commit messages:
```
feat: add sticky notes to reader view
fix: prevent duplicate saves
docs: update contributing guidelines
test: add coverage for export engine
```

Commit message format:
```
<type>: <subject>

<body (optional)>

<footer (optional)>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `chore`

### 5. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

In your PR description:
- Explain what your change does
- Reference any related issues: `Closes #123`
- Describe how to test it
- Note any breaking changes

## Reporting Issues

When opening an issue:
1. Check if the issue already exists
2. Include a clear description of the problem
3. Provide steps to reproduce
4. Include browser/OS information
5. Attach screenshots if applicable

## Questions or Need Help?

- Open a GitHub discussion
- Check existing issues for similar questions
- Create a detailed issue with your question

## License

By contributing to bAInder, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE) for details).

---

Thank you for helping make bAInder better! 🎉
