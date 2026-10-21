/* Delegated interactions also work when the exercise chart is re-rendered. */
(() => {
  let activePoint = null;
  let pinned = false;
  let hideTimer;
  const pointFor = target => target?.closest?.('.trend-point-target');

  function hide() {
    clearTimeout(hideTimer);
    if (!activePoint) return;
    activePoint.removeAttribute('aria-describedby');
    activePoint.classList.remove('is-selected');
    document.getElementById('trend-point-tooltip')?.setAttribute('hidden', '');
    activePoint = null;
    pinned = false;
  }

  function show(point, pin = false) {
    clearTimeout(hideTimer);
    if (point !== activePoint) hide();
    const frame = point.closest('.trend-chart-frame');
    const tooltip = frame?.querySelector('[role="tooltip"]');
    if (!tooltip) return;
    activePoint = point;
    pinned = pin;
    tooltip.textContent = point.dataset.trendValue;
    tooltip.hidden = false;
    point.setAttribute('aria-describedby', tooltip.id);
    point.classList.add('is-selected');

    const bounds = frame.getBoundingClientRect();
    const dot = point.querySelector('.trend-point').getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const center = dot.left + dot.width / 2 - bounds.left;
    const above = dot.top - bounds.top - height - 10;
    tooltip.style.left = `${Math.max(0, Math.min(center - width / 2, bounds.width - width))}px`;
    tooltip.style.top = `${above >= 0 ? above : dot.bottom - bounds.top + 10}px`;
  }

  document.addEventListener('click', event => {
    const point = pointFor(event.target);
    if (!point) {
      if (!event.target.closest?.('.trend-point-tooltip')) hide();
      return;
    }
    if (point === activePoint && pinned) hide();
    else show(point, true);
  });
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || pinned) return;
    if (event.target.closest?.('.trend-point-tooltip')) clearTimeout(hideTimer);
    const point = pointFor(event.target);
    if (point && !point.contains(event.relatedTarget)) show(point);
  });
  document.addEventListener('pointerout', event => {
    if (pinned || event.pointerType === 'touch') return;
    const point = pointFor(event.target);
    if (event.relatedTarget?.closest?.('.trend-point-tooltip')) return;
    if (point && !point.contains(event.relatedTarget) && document.activeElement !== point) hideTimer = setTimeout(hide, 150);
    else if (event.target.closest?.('.trend-point-tooltip') && !pointFor(event.relatedTarget)) hideTimer = setTimeout(hide, 150);
  });
  document.addEventListener('focusin', event => {
    const point = pointFor(event.target);
    if (point) show(point);
  });
  document.addEventListener('focusout', event => {
    if (pointFor(event.target)) hide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
    const point = pointFor(event.target);
    if (point && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (point === activePoint && pinned) hide();
      else show(point, true);
    }
  });
  document.addEventListener('scroll', () => {
    // Keyboard focus can scroll its point into view; reposition in that case.
    if (activePoint === document.activeElement && !pinned && activePoint?.isConnected) {
      const dot = activePoint.querySelector('.trend-point').getBoundingClientRect();
      const viewport = activePoint.closest('.trend-chart-scroll').getBoundingClientRect();
      if (dot.left >= viewport.left && dot.right <= viewport.right) {
        show(activePoint);
        return;
      }
    }
    hide();
  }, { capture: true, passive: true });
  window.addEventListener('resize', hide);
})();
