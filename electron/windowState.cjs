// electron/windowState.cjs

function getWindowState(targetWindow, platform = process.platform) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return {
      expandMode: platform === 'darwin' ? 'fullscreen' : 'maximize',
      isFullScreen: false,
      isMaximized: false,
    };
  }

  return {
    expandMode: platform === 'darwin' ? 'fullscreen' : 'maximize',
    isFullScreen: targetWindow.isFullScreen(),
    isMaximized: targetWindow.isMaximized(),
  };
}

function toggleWindowExpandControl(targetWindow, platform = process.platform) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return false;
  }

  if (platform === 'darwin') {
    const nextFullscreen = !targetWindow.isFullScreen();
    targetWindow.setFullScreen(nextFullscreen);
    return nextFullscreen;
  }

  if (targetWindow.isMaximized()) {
    targetWindow.unmaximize();
    return false;
  }

  targetWindow.maximize();
  return true;
}

module.exports = { getWindowState, toggleWindowExpandControl };
