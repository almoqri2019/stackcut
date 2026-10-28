(() => {
  "use strict";

  const form = document.getElementById("verifyForm");
  const input = document.getElementById("subscriptionId");
  const button = document.getElementById("verifyButton");
  const status = document.getElementById("verifyStatus");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const subscriptionId = input.value.trim();
    if (!subscriptionId) {
      status.textContent = "Enter a PayPal subscription ID.";
      status.dataset.state = "error";
      return;
    }

    button.disabled = true;
    status.textContent = "Checking the subscription with PayPal…";
    status.dataset.state = "info";
    try {
      const response = await fetch("/api/pro-status", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Stackcut-Subscription-Id": subscriptionId },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.reason || `Server returned HTTP ${response.status}.`);
      }
      if (data?.active === true && data?.status === "active" && data?.source === "paypal") {
        status.textContent =
          "PayPal verified this subscription. Open the app and enter the same ID there to enable Pro for that session.";
        status.dataset.state = "info";
        return;
      }
      status.textContent =
        data?.reason || "PayPal did not confirm an active subscription. No Pro access was enabled.";
      status.dataset.state = "error";
    } catch (error) {
      status.textContent = `Could not verify the subscription: ${error.message}`;
      status.dataset.state = "error";
    } finally {
      button.disabled = false;
    }
  });
})();
