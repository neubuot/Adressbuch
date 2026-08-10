/**
 * Escapes HTML to prevent XSS attacks
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Shows a status message to the user
 */
export function showStatus(message: string, isError: boolean = false): void {
  const statusBar = document.getElementById('statusBar');
  if (!statusBar) return;

  statusBar.textContent = message;
  statusBar.className = 'status-bar show' + (isError ? ' error' : '');

  setTimeout(() => {
    statusBar.classList.remove('show');
  }, 3000);
}
