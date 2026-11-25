document.addEventListener('DOMContentLoaded', () => {
  const blocks = JSON.parse(document.getElementById('report-blocks').textContent || '[]');

  // Long blocks are cut in HTML, their rest contents are rendered by "Show all" buttons
  document.querySelectorAll('.block-rest[data-block]').forEach((rest) => {
    const content = blocks[Number(rest.dataset.block)] ?? '';
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'show-all';
    button.textContent = `Show all (${Math.ceil(content.length / 1024)} KB more)`;

    button.addEventListener('click', () => {
      rest.replaceWith(content);
      button.remove();
    });

    rest.textContent = '\n…';
    rest.closest('pre').after(button);
  });
});
