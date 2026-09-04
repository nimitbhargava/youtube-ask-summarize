# YouTube 1-Click Ask Summarizer

A Chrome extension (Manifest V3) that automates YouTube's built-in **"Ask about this video"** Gemini modal into a single click or keyboard shortcut.

---

## ⚡ The Problem It Solves

On YouTube videos where the native **"Ask"** AI feature is present, summarizing normally takes two manual steps:
1. Click the **"Ask"** button in YouTube's action bar.
2. Wait for the **"Ask about this video"** modal to open, locate the prompt chips, and click **"Summarize the video"**.

With **YouTube 1-Click Ask Summarizer**, you get the summary in a single step!

---

## ✨ Features

- **1-Click Native "Summarize" Button**: Automatically injects a sleek `[✨ Summarize]` pill button right next to YouTube's "Ask" button. Clicking it opens the modal and triggers "Summarize the video" immediately.
- **Auto-Click on Native "Ask"**: If you prefer clicking YouTube's original "Ask" button, the extension automatically clicks the "Summarize the video" chip the instant the modal appears.
- **Keyboard Shortcut**: Press <kbd>Alt</kbd> + <kbd>S</kbd> (or <kbd>Option</kbd> + <kbd>S</kbd> on Mac) on any YouTube video to trigger Ask + Summarize instantly.
- **Zero API Keys & Privacy-Focused**: Works entirely by interacting with YouTube's own built-in Gemini feature. No third-party accounts, external API keys, or data collection.
- **Seamless Native Styling**: Styled 1:1 with YouTube's pill action buttons, fully adapting to both Dark Mode and Light Mode.
- **Customizable Preferences**:
  - Toggle the injected 1-click button on/off.
  - Enable/disable auto-clicking on native Ask button.
  - Optional **"Auto-summarize on Load"** for 0-click automatic summaries on videos with Ask available.

---

## 🚀 Installation Guide

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **"Developer mode"** in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left.
5. Select this project folder (`youtube-ask-summarize`).
6. The extension is now installed and active!

---

## 🎮 How to Use

1. Open any YouTube video that has the **"Ask"** button (available to YouTube Premium or experimental accounts).
2. You will see a `[✨ Summarize]` button next to the "Ask" button.
3. Click `[✨ Summarize]` or press <kbd>Alt</kbd> + <kbd>S</kbd> (<kbd>Option</kbd> + <kbd>S</kbd>).
4. YouTube's "Ask about this video" modal opens and immediately generates your summary!

---

## 📂 Project Structure

```
youtube-ask-summarize/
├── manifest.json       # Chrome Manifest V3 configuration
├── icons/              # 16, 32, 48, 128px extension icons
├── src/
│   ├── background.js   # Service worker for keyboard shortcut routing
│   ├── content.js      # Core DOM automation, modal & Ask detection
│   └── styles.css      # Native YouTube styling & animations
└── popup/
    ├── popup.html      # Settings & quick-action popup UI
    ├── popup.css       # Modern dark popup theme
    └── popup.js        # Settings storage & tab communication
```
