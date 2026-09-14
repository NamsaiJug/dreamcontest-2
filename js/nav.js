(async function () {
  // Load nav
  const navContainer = document.getElementById('site-nav');
  if (navContainer) {
    try {
      const res = await fetch('components/nav.html');
      if (res.ok) {
        navContainer.innerHTML = await res.text();
        const page = document.body.dataset.page;
        if (page) {
          const link = navContainer.querySelector(`[data-page="${page}"]`);
          if (link) link.classList.add('active');
        }
      }
    } catch (e) { console.warn('Could not load nav:', e.message); }
  }

  // Load footer
  const footerContainer = document.getElementById('site-footer');
  if (footerContainer) {
    try {
      const res = await fetch('components/footer.html');
      if (res.ok) {
        footerContainer.innerHTML = await res.text();
        const page = document.body.dataset.page;
        if (page) {
          const link = footerContainer.querySelector(`[data-page="${page}"]`);
          if (link) link.classList.add('active');
        }
      }
    } catch (e) { console.warn('Could not load footer:', e.message); }
  }
})();
