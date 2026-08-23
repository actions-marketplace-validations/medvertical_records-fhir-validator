export function interpolateMessageTemplate(
  template: string,
  params: Record<string, unknown>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.split(`{${key}}`).join(String(value ?? ''));
  }
  return result;
}
