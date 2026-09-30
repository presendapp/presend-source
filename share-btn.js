document.getElementById('shareBtn').addEventListener('click', async function() {
  const btn = this;
  const url = window.location.href;
  const title = document.title;
  
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  } else {
    try {
      await navigator.clipboard.writeText(url);
      const original = btn.textContent;
      btn.textContent = btn.dataset.copied || 'Copied!';
      setTimeout(() => btn.textContent = original, 2000);
    } catch (err) {
      console.error(err);
    }
  }
});
