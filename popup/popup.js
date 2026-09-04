document.addEventListener('DOMContentLoaded', async () => {
  const statusPage = document.getElementById('status-page');
  const statusAsk = document.getElementById('status-ask');
  const quickBtn = document.getElementById('btn-quick-summarize');

  const btnTogglePlayback = document.getElementById('btn-toggle-playback');
  const playbackIcon = document.getElementById('playback-icon');
  const playbackText = document.getElementById('playback-text');

  const prefShowVideoOverlay = document.getElementById('pref-showVideoOverlay');
  const prefShowButton = document.getElementById('pref-showButton');
  const prefExitTheaterOnSummarize = document.getElementById('pref-exitTheaterOnSummarize');
  const prefPauseOnSummarize = document.getElementById('pref-pauseOnSummarize');
  const prefAutoClickOnAsk = document.getElementById('pref-autoClickOnAsk');
  const prefAutoSummarizeOnLoad = document.getElementById('pref-autoSummarizeOnLoad');

  // Detect Mac for shortcut label
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutPill = document.querySelector('.shortcut-pill');
  if (shortcutPill && isMac) {
    shortcutPill.textContent = '⌥+S';
  }

  // Load saved settings
  chrome.storage.sync.get(
    {
      showVideoOverlay: true,
      showButton: false,
      exitTheaterOnSummarize: true,
      pauseOnSummarize: false,
      autoClickOnAsk: true,
      autoSummarizeOnLoad: false,
      userExplicitlyEnabledActionBar: false,
      userExplicitlyEnabledPause: false,
    },
    (items) => {
      prefShowVideoOverlay.checked = items.showVideoOverlay;
      prefShowButton.checked = items.userExplicitlyEnabledActionBar ? items.showButton : false;
      prefExitTheaterOnSummarize.checked = items.exitTheaterOnSummarize;
      prefPauseOnSummarize.checked = items.userExplicitlyEnabledPause ? items.pauseOnSummarize : false;
      prefAutoClickOnAsk.checked = items.autoClickOnAsk;
      prefAutoSummarizeOnLoad.checked = items.autoSummarizeOnLoad;
    }
  );

  // Helper to save settings and notify content script
  function saveSetting(key, value) {
    chrome.storage.sync.set({ [key]: value }, () => {
      notifyContentScript({ action: 'settings_updated' });
    });
  }

  prefShowVideoOverlay.addEventListener('change', (e) => {
    saveSetting('showVideoOverlay', e.target.checked);
  });

  prefShowButton.addEventListener('change', (e) => {
    chrome.storage.sync.set({
      showButton: e.target.checked,
      userExplicitlyEnabledActionBar: e.target.checked,
    }, () => {
      notifyContentScript({ action: 'settings_updated' });
    });
  });

  prefExitTheaterOnSummarize.addEventListener('change', (e) => {
    saveSetting('exitTheaterOnSummarize', e.target.checked);
  });

  prefPauseOnSummarize.addEventListener('change', (e) => {
    chrome.storage.sync.set({
      pauseOnSummarize: e.target.checked,
      userExplicitlyEnabledPause: e.target.checked,
    }, () => {
      notifyContentScript({ action: 'settings_updated' });
    });
  });

  prefAutoClickOnAsk.addEventListener('change', (e) => {
    saveSetting('autoClickOnAsk', e.target.checked);
  });

  prefAutoSummarizeOnLoad.addEventListener('change', (e) => {
    saveSetting('autoSummarizeOnLoad', e.target.checked);
  });

  // Query active tab and check YouTube status
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab && activeTab.url && activeTab.url.includes('youtube.com/')) {
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'get_status' });

      if (response?.isWatchPage) {
        statusPage.textContent = 'Watch Page';
        statusPage.className = 'badge active';

        if (response.askFound) {
          statusAsk.textContent = 'Detected';
          statusAsk.className = 'badge active';
          quickBtn.disabled = false;
        } else {
          statusAsk.textContent = 'Not Found';
          statusAsk.className = 'badge inactive';
        }

        // Playback state
        if (response.isPaused) {
          playbackIcon.textContent = '▶';
          playbackText.textContent = 'Play Video';
        } else {
          playbackIcon.textContent = '⏸';
          playbackText.textContent = 'Pause Video';
        }
      } else {
        statusPage.textContent = 'YouTube (Other)';
        statusPage.className = 'badge';
        statusAsk.textContent = 'N/A';
        statusAsk.className = 'badge';
        quickBtn.disabled = true;
        btnTogglePlayback.disabled = true;
      }
    } catch (err) {
      statusPage.textContent = 'Ready (Refresh Tab)';
      statusPage.className = 'badge inactive';
      statusAsk.textContent = 'Unknown';
      statusAsk.className = 'badge';
      btnTogglePlayback.disabled = true;
    }
  } else {
    statusPage.textContent = 'Not YouTube';
    statusPage.className = 'badge';
    statusAsk.textContent = 'N/A';
    statusAsk.className = 'badge';
    quickBtn.disabled = true;
    btnTogglePlayback.disabled = true;
  }

  // Toggle video playback from popup
  btnTogglePlayback.addEventListener('click', async () => {
    if (!activeTab?.id) return;
    try {
      const res = await chrome.tabs.sendMessage(activeTab.id, { action: 'toggle_playback' });
      if (res?.paused) {
        playbackIcon.textContent = '▶';
        playbackText.textContent = 'Play Video';
      } else {
        playbackIcon.textContent = '⏸';
        playbackText.textContent = 'Pause Video';
      }
    } catch (err) {
      console.warn('Could not toggle playback:', err);
    }
  });

  // Quick Summarize button click
  quickBtn.addEventListener('click', async () => {
    if (!activeTab?.id) return;
    try {
      quickBtn.disabled = true;
      quickBtn.querySelector('span').textContent = 'Summarizing...';
      await chrome.tabs.sendMessage(activeTab.id, { action: 'trigger_summarize' });
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (err) {
      console.warn('Could not trigger summarize:', err);
      quickBtn.disabled = false;
      quickBtn.querySelector('span').textContent = 'Summarize This Video';
    }
  });

  async function notifyContentScript(message) {
    if (activeTab?.id && activeTab.url && activeTab.url.includes('youtube.com/')) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, message);
      } catch (err) {}
    }
  }
});
