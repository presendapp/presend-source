(function () {
  const SITE_KEY = "0x4AAAAAAEQOO1HzprAOju8v";
  const form = document.getElementById("waitlistForm");
  const status = document.getElementById("waitlistStatus");
  if (!form || !status) return;
  const button = form.querySelector("button[type=submit]");
  let widgetId = null;
  let loading = null;

  // Turnstile is only loaded when someone starts filling in the form.
  function loadTurnstile() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      window.presendWaitlistReady = resolve;
      const sc = document.createElement("script");
      sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=presendWaitlistReady";
      sc.async = true;
      sc.onerror = () => { loading = null; reject(new Error("Turnstile failed to load")); };
      document.head.appendChild(sc);
    }).then(() => {
      if (widgetId === null) widgetId = window.turnstile.render("#waitlistTurnstile", { sitekey: SITE_KEY, size: "compact" });
    });
    return loading;
  }

  form.addEventListener("focusin", () => {
    loadTurnstile().catch(() => {
      status.textContent = "The anti-spam check could not load. Please reload the page, or write to presendapp@gmail.com.";
    });
  }, { once: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = (widgetId !== null && window.turnstile) ? window.turnstile.getResponse(widgetId) : "";
    if (!token) {
      status.textContent = "Please complete the anti-spam check above the button.";
      loadTurnstile().catch(() => {});
      return;
    }
    const fd = new FormData(form);
    const payload = {
      email: fd.get("email") || "",
      team_size: fd.get("team_size") || "",
      ecosystem: fd.get("ecosystem") || "",
      would_pay: fd.get("would_pay") || "",
      note: fd.get("note") || "",
      turnstileToken: token,
    };
    button.disabled = true;
    status.textContent = "Sending...";
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        form.hidden = true;
        status.textContent = "Thanks, you are on the list. We will write once, when there is something to try, and not otherwise.";
        return;
      }
      status.textContent = data.error || "Something went wrong. Please try again.";
    } catch {
      status.textContent = "Network error. Please try again.";
    }
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    button.disabled = false;
  });
})();
