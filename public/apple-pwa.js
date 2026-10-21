'use strict';

// navigator.standalone identifies Apple's installed Home Screen web app mode.
// Keep the regular browser viewport and its zoom behavior unchanged.
if (navigator.standalone === true) {
  document.documentElement.classList.add('apple-pwa');
  document.querySelector('meta[name="viewport"]').content =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  // WebKit can ignore viewport scaling limits, so also cancel pinch gestures.
  const preventZoom = event => event.preventDefault();
  document.addEventListener('gesturestart', preventZoom, {passive: false});
  document.addEventListener('gesturechange', preventZoom, {passive: false});
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, {passive: false});
}
