# Contributing to Contentful Batch Migrator

Thank you for considering contributing to Contentful Batch Migrator! This document provides guidelines and instructions for contributing.

## 🎯 Ways to Contribute

- 🐛 **Report bugs** - Found a bug? Open an issue!
- 💡 **Suggest features** - Have an idea? We'd love to hear it!
- 📝 **Improve documentation** - Help others understand the tool better
- 🔧 **Submit code** - Fix bugs or add features
- 🧪 **Test and provide feedback** - Try the tool and share your experience
- ⭐ **Star the repo** - Show your support!

## 🐛 Reporting Bugs

Before submitting a bug report:
1. Check if the issue already exists
2. Verify you're using the latest version
3. Test with a minimal reproducible example

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure with '...'
2. Run '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- Node version: [e.g., 18.0.0]
- OS: [e.g., macOS 13.0]
- contentful-import version: [e.g., 8.0.0]
- Batch size: [e.g., 600]
- Number of assets: [e.g., 4126]

**Logs**
Please attach relevant logs from `batches/logs/`

**Additional context**
Any other context about the problem.
```

## 💡 Suggesting Features

We welcome feature suggestions! Please:
1. Check if the feature is already requested
2. Provide a clear use case
3. Explain the expected behavior
4. Consider implementation details

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Use case**
Explain when and why this feature would be useful.

**Additional context**
Any other context or screenshots about the feature request.
```

## 🔧 Development Setup

### Prerequisites

- Node.js >= 14.0.0
- npm or yarn
- Git
- A Contentful account (for testing)

### Setup Steps

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/contentful-batch-migrator.git
   cd contentful-batch-migrator
   ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/faisalbasra/contentful-batch-migrator.git
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Create a test environment**
   - Create two Contentful spaces (source and target)
   - Add some test content (10-50 entries and assets)
   - Generate management tokens for both spaces

5. **Configure for testing**
   ```bash
   cp batch-config.example.json batch-config.json
   # Edit with your test space credentials
   ```

6. **Test the setup**
   ```bash
   node split-contentful-export.js
   ```

## 🌿 Git Workflow

We follow a standard Git workflow:

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/updates

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

3. **Test your changes**
   ```bash
   # Test with a small batch first
   node split-contentful-export.js
   node import-batches.js --start-from 1
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   **Commit message format:**
   ```
   <type>: <description>

   [optional body]

   [optional footer]
   ```

   **Types:**
   - `feat` - New feature
   - `fix` - Bug fix
   - `docs` - Documentation changes
   - `style` - Formatting, missing semicolons, etc.
   - `refactor` - Code restructuring
   - `test` - Adding tests
   - `chore` - Maintenance tasks

   **Examples:**
   ```bash
   git commit -m "feat: add progress bar to batch import"
   git commit -m "fix: handle empty asset URLs correctly"
   git commit -m "docs: update EXPORT-GUIDE with more examples"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Go to GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template

## 📋 Pull Request Guidelines

### Before Submitting

- [ ] Code follows existing style
- [ ] Comments added for complex logic
- [ ] Documentation updated (if needed)
- [ ] Tested with real Contentful data
- [ ] No console errors or warnings
- [ ] Commit messages follow convention

### PR Template

```markdown
**Description**
A clear description of what this PR does.

**Related Issue**
Fixes #123 (if applicable)

**Type of Change**
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

**Testing**
Describe how you tested your changes:
- Batch size: 100
- Number of assets: 150
- Success rate: 100%

**Screenshots** (if applicable)
Add screenshots to help explain your changes.

**Checklist**
- [ ] My code follows the project's code style
- [ ] I have added tests (if applicable)
- [ ] I have updated the documentation
- [ ] All tests pass
- [ ] I have tested with real Contentful data
```

## 🧪 Testing Guidelines

### Manual Testing

Always test your changes with real Contentful data:

1. **Small batch test** (10-50 items)
   ```json
   { "batchSize": 25 }
   ```

2. **Medium batch test** (100-500 items)
   ```json
   { "batchSize": 100 }
   ```

3. **Large batch test** (1000+ items)
   ```json
   { "batchSize": 500 }
   ```

### Test Checklist

- [ ] Split works correctly
- [ ] Import completes successfully
- [ ] Validation passes
- [ ] Resume works after interruption
- [ ] Error handling works properly
- [ ] Logs are created correctly
- [ ] Asset files are copied
- [ ] Relationships are maintained

## 📝 Code Style

### JavaScript Style

- Use ES6+ features
- Use `const` and `let`, not `var`
- Use template literals for strings
- Use arrow functions where appropriate
- Add semicolons
- Use 2-space indentation

### Good Example

```javascript
const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function importBatch(batchDir, batchNum) {
  const config = loadConfig();
  const result = await runImport(batchDir, config);
  return result;
}
```

### Naming Conventions

- **Functions**: `camelCase` (e.g., `importBatch`, `loadConfig`)
- **Variables**: `camelCase` (e.g., `batchSize`, `assetCount`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `DEFAULT_DELAY`)
- **Files**: `kebab-case.js` (e.g., `split-export.js`, `import-batches.js`)

### Comments

Add comments for:
- Complex algorithms
- Non-obvious logic
- Important decisions
- Configuration options

```javascript
// Build asset-to-entry mapping to maintain relationships
// This ensures entries are imported with their referenced assets
const assetToEntries = new Map();
```

## 🎨 Documentation Standards

### Code Documentation

```javascript
/**
 * Import a single batch to Contentful
 * @param {string} batchDir - Directory containing batch data
 * @param {number} batchNum - Batch number (1-indexed)
 * @param {boolean} isFirstBatch - Whether this is the first batch
 * @returns {Promise<Object>} Import result
 */
async function importBatch(batchDir, batchNum, isFirstBatch) {
  // Implementation
}
```

### Markdown Documentation

- Use clear headings
- Add code examples
- Include screenshots (if helpful)
- Provide step-by-step instructions
- Link to related docs

## 🏗️ Project Structure

Understanding the codebase:

```
contentful-batch-migrator/
├── split-contentful-export.js    # Main splitter logic
│   ├── Read export JSON
│   ├── Build asset-entry relationships
│   ├── Split into batches
│   └── Copy asset files
│
├── import-batches.js             # Main import logic
│   ├── Load batch manifest
│   ├── Generate import configs
│   ├── Run contentful-import
│   ├── Handle retries
│   └── Track state
│
├── validate-migration.js         # Validation logic
│   ├── Connect to Contentful API
│   ├── Fetch source/target counts
│   └── Compare and report
│
└── resume-import.js              # Resume logic
    ├── Load import state
    ├── Determine resume point
    └── Call import-batches.js
```

## 🔍 Code Review Process

All contributions go through code review:

1. **Automated checks** (when available)
   - Linting
   - Tests
   - Build

2. **Manual review**
   - Code quality
   - Documentation
   - Testing
   - Security

3. **Feedback**
   - Reviewers may request changes
   - Address feedback promptly
   - Discussion is encouraged

4. **Approval & Merge**
   - Maintainer approves
   - PR is merged
   - Thank you! 🎉

## 🛡️ Security

### Reporting Security Issues

**Do NOT open a public issue for security vulnerabilities.**

Instead, email: faisal.basra@gmail.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

- Never commit tokens or credentials
- Use environment variables for secrets
- Validate all user input
- Handle errors gracefully
- Keep dependencies updated

## 📜 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards others

**Unacceptable behavior:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Violations may result in:
1. Warning
2. Temporary ban
3. Permanent ban

Report violations to: faisal.basra@gmail.com

## 📞 Getting Help

- **Documentation**: Check [docs/](docs/)
- **Issues**: Search existing issues
- **Discussions**: Ask questions in GitHub Discussions
- **Email**: faisal.basra@gmail.com

## 🙏 Recognition

Contributors will be:
- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Forever appreciated! ❤️

## 📝 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Contentful Batch Migrator!** 🎉

Every contribution, no matter how small, makes a difference.
