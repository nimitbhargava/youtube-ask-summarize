// Background Service Worker for YouTube 1-Click Ask Summarizer

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'trigger-summarize') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id && activeTab.url && activeTab.url.includes('youtube.com/')) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, { action: 'trigger_summarize' });
      } catch (err) {
        console.warn('[YT-Ask-Summarizer] Could not send message to active tab:', err);
      }
    }
  }
});
