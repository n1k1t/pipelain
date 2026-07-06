document.addEventListener('DOMContentLoaded', () => {
  // Find all elements with language-json class and format them
  document.querySelectorAll('code.language-json').forEach((el) => {
    try {
      const raw = el.textContent.trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        el.textContent = JSON.stringify(parsed, null, 2);
      }
    } catch (e) {
      // Keep as-is on parse error
    }
  });
});
