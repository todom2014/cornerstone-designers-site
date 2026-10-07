/*
 * Phone menu. Below 62rem the header links fold into a Menu button.
 *
 * The menu is a <details> element, so it opens and closes without this
 * script, and screen readers announce it as expanded or collapsed. This only
 * tidies up: it closes the menu when one of its links is followed, when
 * Escape is pressed (focus goes back to the button), when you tap outside
 * it, and when the window widens to the full header.
 */
(function () {
  var menu = document.querySelector(".menu");
  if (!menu) return;
  var button = menu.querySelector("summary");

  function close(refocus) {
    if (!menu.open) return;
    menu.open = false;
    if (refocus) button.focus();
  }

  menu.addEventListener("click", function (event) {
    if (event.target.closest && event.target.closest("a")) close(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && menu.open) close(true);
  });
  document.addEventListener("click", function (event) {
    if (menu.open && !menu.contains(event.target)) close(false);
  });
  if (window.matchMedia) {
    var wide = window.matchMedia("(min-width: 62rem)");
    var onChange = function () { if (wide.matches) close(false); };
    if (wide.addEventListener) wide.addEventListener("change", onChange);
  }
})();
