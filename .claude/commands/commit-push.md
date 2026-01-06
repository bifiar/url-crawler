Commit and push all current changes with a descriptive commit message.

Steps:
1. Run `git status` to see all changed/untracked files
2. Run `git diff` to see unstaged changes
3. Run `git diff --staged` to see staged changes
4. Analyze the changes and generate a clear, descriptive commit message
5. Stage all changes with `git add .`
6. Commit with the generated message
7. Push to the remote branch

Commit message guidelines:
- Use simple descriptive style: "Add X", "Fix Y", "Update Z", "Remove W"
- Focus on WHAT changed and WHY (if not obvious)
- Keep it concise (50 chars for title, wrap body at 72)
- Include the Claude Code footer

Example commit messages:
- "Add user authentication endpoint"
- "Fix null pointer in batch processing"
- "Update CLAUDE.md with Node.js best practices"
- "Remove deprecated API routes"

IMPORTANT:
- Do NOT commit files containing secrets (.env, credentials, etc.)
- Do NOT force push
- If on main/master branch, warn before pushing
