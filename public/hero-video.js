/*
 * Hero background video: turquoise water washing over white sand.
 *
 * Plays only when it should: not on screens narrower than 48rem (phones get
 * the still poster; the clip is 1.1–1.7 MB), not with "reduce motion" turned
 * on, not with Data Saver on, and not while the top of the page is scrolled
 * out of view
 * (saves battery). The Pause/Play button (WCAG 2.2.2) is remembered on this
 * device. Without this script the still poster shows and no video downloads.
 */
(function () {
  var KEY = "cd-hero-video";
  var video = document.querySelector(".hero-media video");
  var button = document.querySelector(".video-toggle");
  if (!video || !button) return;
  if (navigator.connection && navigator.connection.saveData) return;
  if (window.matchMedia && window.matchMedia("(max-width: 47.99rem)").matches) return;

  var label = button.querySelector("span");
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var choice = null; // "playing" or "paused" once the visitor presses the button
  try { choice = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  var inView = true;

  function wanted() {
    if (choice === "paused") return false;
    if (choice === "playing") return true;
    return !(reduce && reduce.matches);
  }
  function show(playing) {
    label.textContent = playing ? "Pause video" : "Play video";
    button.classList.toggle("is-paused", !playing);
  }
  function update() {
    var play = wanted();
    show(play);
    if (play && inView) {
      var started = video.play();
      if (started && started.catch) started.catch(function () { show(false); });
    } else {
      video.pause();
    }
  }

  button.hidden = false;
  button.addEventListener("click", function () {
    // If autoplay was blocked, the first press starts it.
    choice = wanted() && !video.paused ? "paused" : "playing";
    try { localStorage.setItem(KEY, choice); } catch (e) { /* private mode */ }
    update();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      update();
    }).observe(video.parentNode);
  }
  if (reduce && reduce.addEventListener) reduce.addEventListener("change", update);
  update();
})();
