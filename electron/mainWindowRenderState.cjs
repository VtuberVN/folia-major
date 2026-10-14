// electron/mainWindowRenderState.cjs
// Visibility is explicit so Chromium transport clocks can remain unthrottled.
function readMainWindowRenderState(window, wallpaper) {
  return {
    visible: Boolean(window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()),
    wallpaper: Boolean(wallpaper),
  };
}

module.exports = { readMainWindowRenderState };
