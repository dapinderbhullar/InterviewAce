export function notify(message) { window.dispatchEvent(new CustomEvent('ia-toast',{detail:message})); }
