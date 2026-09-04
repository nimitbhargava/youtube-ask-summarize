# Chrome Web Store (CWS) Release Kit & Copy-Paste Guide

This guide contains everything you need to upload and publish **1-Click Ask Summarizer for YouTube™** to the Chrome Web Store Developer Dashboard.

---

## 📦 1. Pre-built ZIP Archive (Ready to Upload)

Your distribution archive has been packaged and verified:
```text
dist/1-click-ask-summarizer-v1.0.0.zip
```
*(Contains clean Manifest V3 scripts, icons, popup, and stylesheets with zero unnecessary files).*

---

## 📋 2. Store Listing (Copy & Paste)

### Extension Name:
```text
1-Click Ask Summarizer for YouTube™
```
*(Follows CWS Trademark Guidelines: does not start with "YouTube").*

### Summary (Short Description — 112 / 132 chars):
```text
Summarize YouTube videos in 1 click using YouTube's native 'Ask about this video' AI modal. Zero API keys needed.
```

### Detailed Description:
```text
Tired of clicking "Ask", waiting for the panel to open, and then clicking "Summarize the video" every single time?

1-Click Ask Summarizer for YouTube™ turns YouTube's experimental conversational AI ("Ask about this video") into a seamless, single-click experience.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 1-Click Floating Button: A sleek, frosted-glass "Summarize" button sits cleanly on the top-right corner of the video player.
• Native YouTube AI: Directly automates YouTube's built-in Gemini "Ask" feature. No OpenAI/Gemini API keys, logins, or server setups required.
• Theater Mode Auto-Toggle: If you're watching in Theater Mode, clicking Summarize automatically switches to default view so the summary panel appears side-by-side next to your video.
• Uninterrupted Playback: The video continues playing smoothly while your summary streams in.
• Keyboard Shortcut: Press Alt+S (or ⌥+S on Mac) anywhere on YouTube to trigger a summary instantly.
• Lightweight & Fast: Built with pure native JavaScript and zero external dependencies.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY-FIRST BY DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Zero Tracking: We do not collect, store, or sell any personal data, video history, or user telemetry.
• Zero Remote Servers: All automation happens 100% locally within your own browser session on youtube.com.
• No Account Needed: Works right out of the box with your existing YouTube account.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 HOW TO USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open any YouTube video where YouTube's native "Ask" feature is available.
2. Click the frosted "✨ Summarize" button in the top-right corner of the video player (or press Alt+S / ⌥+S).
3. The Ask panel opens and streams your video summary in 1 step!

Note: YouTube's conversational "Ask" feature is an experimental feature provided directly by YouTube (available in select regions/languages and video types).
```

### Category:
```text
Productivity
```
*(Alternative: Workflow & Planning)*

### Primary Language:
```text
English
```

---

## 🛡️ 3. Privacy Practices Tab (Copy & Paste)

### Single Purpose Description:
```text
To automate YouTube's built-in conversational AI ('Ask about this video') prompt into a single-click action directly on the video player.
```

### Permission Justifications:

#### 1. `storage`
```text
Used exclusively to save user interface preferences (such as enabling or disabling the on-video button overlay or auto-summarize mode) across browser sessions. No user tracking data is collected or stored.
```

#### 2. `activeTab`
```text
Used to communicate with the currently active YouTube tab when the user clicks the extension popup or triggers the Alt+S (⌥+S) keyboard shortcut to request a summary.
```

#### 3. Host Permissions (`https://www.youtube.com/*`, `https://m.youtube.com/*`)
```text
Required to detect YouTube's native experimental "Ask about this video" feature and inject the on-video summarize button onto the watch page player.
```

### Data Usage Declarations:
- **Does your extension collect user data?**: Select **NO**
- **User Data Compliance**: Check all certification boxes confirming compliance with the Chrome Web Store Developer Program Policies.

### Privacy Policy URL:
Host `privacy_policy.html` on your GitHub Pages or personal site, or use:
```text
https://<your-username>.github.io/<repo-name>/privacy_policy.html
```
*(A standalone privacy policy document has been saved to `privacy_policy.html` and `PRIVACY_POLICY.md` in this project).*

---

## 🖼️ 4. Graphic Assets & Screenshots

1. **Store Icon**:
   - Use: `icons/icon128.png` (128x128 PNG).
2. **Screenshots**:
   - Requires at least 1 screenshot (1280x800 or 640x400).
   - Tip: Take a screenshot of YouTube with the on-video "✨ Summarize" button visible and the Ask panel showing a generated summary!
