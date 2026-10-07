/*
 * Light / dark theme.
 *
 * With no choice saved, the site follows the visitor's system setting through
 * the prefers-color-scheme media query in each page's CSS — this script only
 * adds the header toggle on top. A choice made with the toggle is remembered
 * on this device and wins over the system setting.
 *
 * Loaded in <head> without defer, so a saved theme is applied before the
 * first paint and the page never flashes the wrong colors.
 */
(function () {
  var KEY = "cd-theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* private mode: still works for this page */ }
  }
  function isDark() {
    var forced = root.getAttribute("data-theme");
    if (forced) return forced === "dark";
    return !!(media && media.matches);
  }
  function sync() {
    var dark = isDark();
    var buttons = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-pressed", String(dark));
  }

  var initial = saved();
  if (initial === "dark" || initial === "light") root.setAttribute("data-theme", initial);
  root.classList.add("js"); // the toggle is hidden without JavaScript

  document.addEventListener("DOMContentLoaded", function () {
    sync();
    var buttons = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next = isDark() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        save(next);
        sync();
      });
    }
    if (media && media.addEventListener) media.addEventListener("change", sync);
  });
})();
