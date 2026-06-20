// Light/dark theme: apply saved choice before first paint (no flash),
// wire the toggle buttons, and notify charts via a 'themechange' event.
(function () {
  var KEY = "hg-theme";
  function current() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function paintIcons(mode) {
    document.querySelectorAll("[data-theme-icon]").forEach(function (el) {
      el.textContent = mode === "dark" ? "☀️" : "🌙";
    });
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  // ?theme=dark|light overrides (shareable + handy for testing)
  var q = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
  var initial = q || saved;
  if (initial === "dark" || initial === "light") {
    document.documentElement.setAttribute("data-theme", initial);
    if (q) { try { localStorage.setItem(KEY, q); } catch (e) {} }
  }

  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
    paintIcons(next);
    window.dispatchEvent(new Event("themechange"));
  }

  document.addEventListener("DOMContentLoaded", function () {
    paintIcons(current());
    document.querySelectorAll(".theme-toggle").forEach(function (b) { b.addEventListener("click", toggle); });
  });
})();
