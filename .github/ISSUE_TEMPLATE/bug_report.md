---
name: Bug Report (Recommended)
about: Report a bug - comprehensive template
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description
<!-- A clear and concise description of what the bug is -->

## Steps to Reproduce
<!-- Detailed steps to reproduce the behavior -->
1.
2.
3.

## Expected Behavior
<!-- What you expected to happen -->

## Actual Behavior
<!-- What actually happened -->

## Error Messages/Logs
<!-- If applicable, paste error messages or relevant logs -->
```
Paste logs here
```

## Configuration
<!-- Share relevant parts of your config (remove sensitive data) -->
```json
{
  "batchSize": 400,
  "importOptions": {
    ...
  }
}
```

## Environment
- **Node version**: [e.g., 18.17.0]
- **Operating System**: [e.g., macOS 13.5, Ubuntu 22.04, Windows 11]
- **Tool version**: [e.g., commit hash or branch]
- **Migration size**:
  - Assets: [e.g., 10,000]
  - Entries: [e.g., 25,000]
  - Content types: [e.g., 50]

## Migration Stage
<!-- Which step were you on when the error occurred? -->
- [ ] Export
- [ ] Draft cleanup
- [ ] Validation stripping
- [ ] Splitting
- [ ] Import
- [ ] Publishing
- [ ] Validation restore

## Additional Context
<!-- Add any other context about the problem here -->
- Were you using CLI import or custom script?
- Is rate limiting enabled?
- Have you tried resuming the import?
- Any custom modifications to the scripts?

## Screenshots
<!-- If applicable, add screenshots to help explain your problem -->

## Workarounds
<!-- Have you found any temporary workarounds? -->
