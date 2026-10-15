export function desktopRuntime(configuredApi) {
  if (!configuredApi?.trim()) return 'local';
  const url = new URL(configuredApi.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('O endereço da API deve indicar a origem HTTP ou HTTPS, sem credenciais, caminho ou parâmetros.');
  return 'remote';
}
