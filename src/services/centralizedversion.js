export const API_VERSION = "1.202602.0";

export function api(path) {
  return `/${API_VERSION}${path}`;
}