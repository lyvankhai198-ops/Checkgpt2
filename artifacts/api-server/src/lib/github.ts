import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function githubProxy(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
) {
  const response = await connectors.proxy("github", endpoint, {
    method: options.method ?? "GET",
    ...(options.body
      ? { body: JSON.stringify(options.body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
  return response.json();
}
