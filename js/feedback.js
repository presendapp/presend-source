(function() {
  const SITE_KEY = '0x4AAAAAAEQOO1HzprAOju8v';
  // Turnstile is only loaded when someone starts writing feedback, so that
  // visitors who never use the form do not contact challenges.cloudflare.com.
  let widgetId = null;
  let loading = null;

  function loadTurnstile() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      window.presendTurnstileReady = resolve;
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=presendTurnstileReady';
      sc.async = true;
      sc.onerror = () => { loading = null; reject(new Error('Turnstile failed to load')); };
      document.head.appendChild(sc);
    }).then(() => {
      if (widgetId === null) widgetId = window.turnstile.render('#feedbackTurnstile', { sitekey: SITE_KEY, size: 'compact' });
    });
    return loading;
  }
  
  function initFeedback() {
    const container = document.getElementById('feedback-widget');
    if (!container) return;
    
    const tool = container.dataset.tool || 'general';
    
    container.innerHTML = `
      <div style="margin-top:3rem;padding:1.5rem;background:#f8f9fa;border-radius:12px;border-left:4px solid #0066cc;">
        <h3 style="margin-top:0;">💬 Feedback</h3>
        <p style="color:#6c757d;font-size:0.9rem;">Help us improve this tool. No email required.</p>
        <form id="feedbackForm" style="display:flex;flex-direction:column;gap:0.75rem;">
          <textarea id="feedbackMessage" placeholder="Your feedback..." required minlength="3" maxlength="2000" 
            style="padding:0.75rem;border:1px solid #dee2e6;border-radius:8px;min-height:80px;resize:vertical;font-family:inherit;"></textarea>
          <div id="feedbackTurnstile"></div>
          <button type="submit" style="padding:0.75rem 1.5rem;background:#0066cc;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
            Send Feedback
          </button>
        </form>
        <p id="feedbackStatus" style="margin-top:0.5rem;font-size:0.9rem;min-height:1.5rem;"></p>
      </div>
    `;
    
    const form = document.getElementById('feedbackForm');
    const status = document.getElementById('feedbackStatus');
    document.getElementById('feedbackMessage').addEventListener('focus', () => { loadTurnstile().catch(() => {}); }, { once: true });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = document.getElementById('feedbackMessage').value.trim();
      const token = (widgetId !== null && window.turnstile) ? window.turnstile.getResponse(widgetId) : '';
      
      if (!message || message.length < 3) {
        status.textContent = 'Message too short.';
        status.style.color = '#dc3545';
        return;
      }
      
      if (token === '' || token === undefined) {
        status.textContent = 'Please complete the anti-spam check above, then send again.';
        status.style.color = '#dc3545';
        loadTurnstile().catch(() => { status.textContent = 'The anti-spam check could not load. Please try again later.'; });
        return;
      }

      status.textContent = 'Sending...';
      status.style.color = '#0066cc';
      
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, message, turnstileToken: token })
        });
        const data = await res.json();
        if (data.success) {
          status.textContent = '✅ Thank you! Feedback saved.';
          status.style.color = '#198754';
          form.reset();
          if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        } else {
          status.textContent = '❌ ' + (data.error || 'Error');
          status.style.color = '#dc3545';
        }
      } catch (err) {
        status.textContent = '❌ Network error. Try again.';
        status.style.color = '#dc3545';
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeedback);
  } else {
    initFeedback();
  }
})();
