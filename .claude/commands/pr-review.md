Review all changes on this branch compared to origin/main.

Steps:

1. Run `git fetch origin main` to get latest main
2. Run `git diff origin/main...HEAD` to see all committed changes on this branch
3. Run `git diff` to see any uncommitted changes
4. Review ALL changes against the Code Review Standards section in CLAUDE.md

For each issue found, report:

- **File:line** - Description of the issue
- Severity: 🔴 Critical | 🟡 Important | 🔵 Suggestion

Output format:

- ✅ **Approved** - No critical issues, ready to merge
- ⚠️ **Changes Requested** - Issues found that should be addressed
- 🔴 **Blocked** - Critical issues must be fixed

Group findings by file.
