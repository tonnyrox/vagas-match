document.addEventListener('DOMContentLoaded', () => {
  const emptyState = document.getElementById('empty-state');
  const jobContent = document.getElementById('job-content');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const badge = document.getElementById('vagas-match-badge');
        if (badge) {
          const timerEl = document.getElementById('vm-timer');
          const scoreEl = document.getElementById('vm-score');
          const detailsEl = document.getElementById('vm-details');
          const statusEl = document.getElementById('vm-status');

          return {
            found: true,
            timer: timerEl?.textContent || '00:00',
            score: scoreEl?.textContent || '--',
            status: statusEl?.textContent || '',
            details: detailsEl?.innerHTML || ''
          };
        }
        return { found: false };
      }
    }, (results) => {
      const data = results?.[0]?.result;
      if (data?.found) {
        emptyState.style.display = 'none';
        jobContent.style.display = 'block';

        document.getElementById('popup-timer').textContent = data.timer;
        document.getElementById('popup-score').textContent = data.score + '%';

        const scoreNum = parseInt(data.score) || 0;
        const bar = document.getElementById('popup-bar');
        bar.style.width = scoreNum + '%';
        if (scoreNum >= 70) bar.style.background = '#00d4aa';
        else if (scoreNum >= 40) bar.style.background = '#ffc107';
        else bar.style.background = '#e94560';

        document.getElementById('popup-details').innerHTML = data.details;

        document.getElementById('job-title').textContent = 'Vaga detectada';
        document.getElementById('job-company').textContent = data.status;
      }
    });
  });

  document.getElementById('btn-reload')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });

  document.getElementById('btn-options')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

});
