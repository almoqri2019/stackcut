(() => {
  const toggle = document.querySelector(".mobile-toggle");
  const menu = document.getElementById("mobileMenu");
  const featureToggle = document.querySelector(".nav-dropdown-toggle");
  const featureMenu = document.getElementById("featuresMenu");

  if (toggle && menu) {
    function setMenuOpen(isOpen) {
      menu.classList.toggle("hidden", !isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    }

    toggle.addEventListener("click", () => {
      setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenuOpen(false);
        toggle.focus();
      }
    });
  }

  if (!featureToggle || !featureMenu) return;

  function setFeaturesOpen(isOpen) {
    featureMenu.classList.toggle("hidden", !isOpen);
    featureToggle.setAttribute("aria-expanded", String(isOpen));
  }

  featureToggle.addEventListener("click", () => {
    setFeaturesOpen(featureToggle.getAttribute("aria-expanded") !== "true");
  });

  featureMenu.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setFeaturesOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && !event.target.closest(".nav-dropdown")) {
      setFeaturesOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && featureToggle.getAttribute("aria-expanded") === "true") {
      setFeaturesOpen(false);
      featureToggle.focus();
    }
  });
})();
