/**
 * Simple in-memory cookie jar for managing cookies across requests.
 * Manages cookies by domain, handles Set-Cookie response headers.
 */

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expires?: Date;
}

export class CookieJar {
  private cookies: Map<string, Cookie> = new Map();

  /** Add/update cookies from a Set-Cookie header string or array */
  setCookiesFromHeaders(headers: Headers | Record<string, string | string[]>, domain: string): void {
    const rawValues: string[] = [];

    if (headers instanceof Headers) {
      // Collect all set-cookie entries
      headers.forEach((value, name) => {
        if (name.toLowerCase() === "set-cookie") {
          rawValues.push(value);
        }
      });
      // getSetCookie() is available in Node 18+
      const sc = (headers as { getSetCookie?: () => string[] }).getSetCookie?.();
      if (sc && sc.length > 0) {
        rawValues.length = 0;
        rawValues.push(...sc);
      }
    } else {
      const sc = headers["set-cookie"];
      if (sc) {
        if (Array.isArray(sc)) rawValues.push(...sc);
        else rawValues.push(sc);
      }
    }

    for (const raw of rawValues) {
      this.parseAndStore(raw, domain);
    }
  }

  private parseAndStore(raw: string, defaultDomain: string): void {
    const parts = raw.split(";").map((p) => p.trim());
    if (!parts[0]) return;

    const [nameRaw, ...valueRaw] = parts[0].split("=");
    const name = nameRaw.trim();
    const value = valueRaw.join("=").trim();

    let domain = defaultDomain;
    let path = "/";
    let secure = false;
    let expires: Date | undefined;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part.startsWith("domain=")) {
        domain = parts[i].slice(7).replace(/^\./, "");
      } else if (part.startsWith("path=")) {
        path = parts[i].slice(5);
      } else if (part === "secure") {
        secure = true;
      } else if (part.startsWith("expires=")) {
        expires = new Date(parts[i].slice(8));
      } else if (part.startsWith("max-age=")) {
        const maxAge = parseInt(parts[i].slice(8), 10);
        if (!isNaN(maxAge)) {
          expires = new Date(Date.now() + maxAge * 1000);
        }
      }
    }

    const key = `${domain}::${name}`;
    if (expires && expires < new Date()) {
      this.cookies.delete(key);
      return;
    }

    this.cookies.set(key, { name, value, domain, path, secure, expires });
  }

  /** Get Cookie header string for a given URL */
  getCookieHeader(url: string): string {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const now = new Date();

    const relevant: Cookie[] = [];
    for (const cookie of this.cookies.values()) {
      if (cookie.expires && cookie.expires < now) continue;
      // Match domain (exact or subdomain)
      if (host === cookie.domain || host.endsWith(`.${cookie.domain}`)) {
        relevant.push(cookie);
      }
    }
    return relevant.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  /** Get specific cookie value by name */
  get(name: string, domain?: string): string | undefined {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) {
        if (!domain || cookie.domain === domain || domain.endsWith(`.${cookie.domain}`)) {
          return cookie.value;
        }
      }
    }
    return undefined;
  }

  /** Check if a session token exists */
  hasSessionToken(): boolean {
    const base = "__Secure-next-auth.session-token";
    return !!(this.get(base) || this.get(`${base}.0`));
  }

  /** Get all cookie names and values for debugging */
  getAll(): { name: string; value: string; domain: string }[] {
    return Array.from(this.cookies.values()).map((c) => ({
      name: c.name,
      value: c.value.slice(0, 20) + (c.value.length > 20 ? "..." : ""),
      domain: c.domain,
    }));
  }

  /** Set a cookie directly */
  set(name: string, value: string, domain: string): void {
    this.cookies.set(`${domain}::${name}`, { name, value, domain, path: "/", secure: true });
  }
}
