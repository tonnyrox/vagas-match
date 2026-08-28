chrome.runtime.onInstalled.addListener(() => {
  console.log('Vagas Match instalado!');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'JOB_DATA') {
    chrome.storage.local.set({ lastJob: msg.data, lastResult: msg.result });
  }
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
});
