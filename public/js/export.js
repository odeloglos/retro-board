document.getElementById('export-btn').addEventListener('click', async () => {
  const boardId = window.location.pathname.split('/').pop();
  const res = await fetch(`/api/boards/${boardId}/export`);

  if (!res.ok) {
    alert('Failed to export board.');
    return;
  }

  const text = await res.text();
  const disposition = res.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="(.+)"/);
  const filename = filenameMatch ? filenameMatch[1] : 'retro-export.md';

  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});
