# Ai Gramam mod for Claude Code

This mod links each Claude Code session to **Ai Gramam**, a local app that shows your sessions as villagers in an animated village and as a workspace dashboard. **The app is separate:** install and start it first (see the [install guide](../../docs/INSTALL.md)). Without the app running, the mod only shows `Ai Gramam ○ app not running` in the status line.

With the app running, a linked session can, from the browser:

- receive a message, which runs as your own prompt when the session is free;
- be stopped, like Esc;
- have a permission request approved or denied, if it would have asked you;
- have Claude's questions answered.

With no answer in 45 seconds, requests and questions appear in the terminal as usual. Plan approvals always stay in the terminal.

```powershell
claude plugin marketplace add C:\path\to\aigramam
claude plugin install ai-gramam@aigramam
```

- **Talks to:** `http://127.0.0.1:4317` only (set `AI_GRAMAM_URL` to change it), with the local key from `~/.ai-gramam/hook-key`.
- **Sends:** small labels (paths, commands, patterns), never file contents.
- **License:** MIT.
