(() => {
  "use strict";

  const form = document.getElementById("verifyForm");
  const input = document.getElementById("subscriptionId");
  const verifyButton = document.getElementById("verifyButton");
  const verifyStatus = document.getElementById("verifyStatus");
  const checkoutContainer = document.getElementById(
    "paypal-button-container"
  );
  const checkoutStatus = document.getElementById("checkoutStatus");

  function setStatus(element, message, state = "info") {
    element.textContent = message;
    element.dataset.state = state;
  }

  async function verifySubscription(subscriptionId) {
    const response = await fetch("/api/pro-status", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "X-Stackcut-Subscription-Id": subscriptionId
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.reason || `Verification failed (${response.status}).`
      );
    }

    if (
      result.active !== true ||
      result.status !== "active" ||
      result.source !== "paypal"
    ) {
      throw new Error(
        result.reason || "PayPal has not confirmed an active subscription."
      );
    }

    return result;
  }

  function loadPayPalSdk(config) {
    if (window.paypal?.Buttons) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const host = config.environment === "sandbox"
        ? "https://www.sandbox.paypal.com"
        : "https://www.paypal.com";

      const params = new URLSearchParams({
        "client-id": config.clientId,
        vault: "true",
        intent: "subscription",
        components: "buttons"
      });

      script.src = `${host}/sdk/js?${params.toString()}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error("Could not load the PayPal SDK."));

      document.head.appendChild(script);
    });
  }

  async function initializeCheckout() {
    try {
      const response = await fetch("/api/paypal-config", {
        cache: "no-store",
        credentials: "same-origin"
      });

      const config = await response.json();

      if (!response.ok || config.configured !== true) {
        throw new Error(
          config.reason || "PayPal configuration is unavailable."
        );
      }

      await loadPayPalSdk(config);

      if (!window.paypal?.Buttons) {
        throw new Error("The PayPal checkout buttons did not load.");
      }

      const buttons = window.paypal.Buttons({
        style: {
          layout: "vertical",
          shape: "rect",
          label: "subscribe"
        },

        createSubscription: (_data, actions) => {
          return actions.subscription.create({
            plan_id: config.planId
          });
        },

        async onApprove(data) {
          const subscriptionId = data.subscriptionID;

          if (!subscriptionId) {
            setStatus(
              checkoutStatus,
              "PayPal did not return a subscription ID. Contact support before trying again.",
              "error"
            );
            return;
          }

          setStatus(
            checkoutStatus,
            "PayPal approved the subscription. Verifying its status with the server…"
          );

          try {
            // Give PayPal a short time to report the new subscription
            // as active, but never unlock Pro without server confirmation.
            let verified = false;
            let lastError;

            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await verifySubscription(subscriptionId);
                verified = true;
                break;
              } catch (error) {
                lastError = error;
                if (attempt < 2) {
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }

            if (!verified) {
              throw lastError || new Error("Subscription not yet verified.");
            }

            const appLink = document.createElement("a");
            appLink.href = "/app";
            appLink.textContent = "Open the app";

            checkoutStatus.dataset.state = "success";
            checkoutStatus.replaceChildren(
              document.createTextNode(
                "Subscription verified. Copy this ID into the app's Pro access dialog to enable Pro for this session: " +
                subscriptionId + " "
              ),
              appLink
            );
          } catch (error) {
            setStatus(
              checkoutStatus,
              "PayPal approved the subscription, but StackCut could not verify it yet. Do not subscribe again. Keep this subscription ID and try verification later: " +
                subscriptionId +
                ". " + error.message,
              "error"
            );
          }
        },

        onCancel() {
          setStatus(
            checkoutStatus,
            "Checkout cancelled. No Pro access was granted."
          );
        },

        onError(error) {
          console.error("PayPal checkout error:", error);
          setStatus(
            checkoutStatus,
            "PayPal checkout encountered an error. Check the browser console and try again.",
            "error"
          );
        }
      });

      if (
        typeof buttons.isEligible === "function" &&
        !buttons.isEligible()
      ) {
        throw new Error("PayPal checkout is not eligible for this session.");
      }

      await buttons.render("#paypal-button-container");

      setStatus(checkoutStatus, "PayPal checkout is ready.");
    } catch (error) {
      console.error("Checkout initialization failed:", error);
      checkoutContainer.replaceChildren();

      setStatus(
        checkoutStatus,
        "Checkout unavailable: " + error.message,
        "error"
      );
    }
  }

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const subscriptionId = input.value.trim();

      if (!subscriptionId) {
        setStatus(verifyStatus, "Enter a PayPal subscription ID.", "error");
        return;
      }

      verifyButton.disabled = true;
      setStatus(verifyStatus, "Checking the subscription with PayPal…");

      try {
        await verifySubscription(subscriptionId);

        setStatus(
          verifyStatus,
          "PayPal verified this active subscription. Open the app and enter the same subscription ID to enable Pro for this session.",
          "success"
        );
      } catch (error) {
        setStatus(verifyStatus, error.message, "error");
      } finally {
        verifyButton.disabled = false;
      }
    });
  }

  if (checkoutContainer && checkoutStatus) {
    initializeCheckout();
  }
})();