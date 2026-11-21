/**
 * Diagnóstico de overflow horizontal via Chrome DevTools Protocol.
 *
 * Usa o WebSocket nativo do Node 22 — nenhuma dependência nova.
 * Uso: npx tsx scripts/diagnose-overflow.mts [url] [width]
 */

interface CdpTarget {
  webSocketDebuggerUrl: string;
  id: string;
}

const NAV_URL = process.argv[2] ?? "http://localhost:3000/";
const VIEWPORT = Number(process.argv[3] ?? "430");

async function getTarget(): Promise<CdpTarget> {
  const response = await fetch("http://127.0.0.1:9222/json/list");
  const targets = (await response.json()) as CdpTarget[];
  const page = targets.find((target) => target.webSocketDebuggerUrl);
  if (!page) throw new Error("Nenhuma aba depurável encontrada.");
  return page;
}

class Cdp {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (value: unknown) => void>();

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Falha no WebSocket")), {
        once: true,
      });
    });
    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (typeof data.id === "number") {
        const resolve = this.pending.get(data.id);
        if (resolve) {
          this.pending.delete(data.id);
          resolve(data.result);
        }
      }
    });
  }

  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      this.pending.set(id, (value) => resolve(value as T));
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

interface EvaluateResult {
  result: { value?: unknown };
}

async function main(): Promise<void> {
  const target = await getTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT,
    height: 900,
    deviceScaleFactor: 1,
    mobile: process.env.MOBILE === "1",
    screenWidth: VIEWPORT,
    screenHeight: 900,
  });
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: NAV_URL });
  await new Promise((resolve) => setTimeout(resolve, 3500));

  const script = `
    (() => {
      const docWidth = document.documentElement.scrollWidth;
      const inner = window.innerWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.right > inner + 1 || rect.left < -1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 90),
            text: (el.textContent || '').trim().slice(0, 60),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }
      offenders.sort((a, b) => b.right - a.right);
      return { docWidth, inner, count: offenders.length, top: offenders.slice(0, 12) };
    })()
  `;

  const evaluated = await cdp.send<EvaluateResult>("Runtime.evaluate", {
    expression: script,
    returnByValue: true,
  });

  console.log(JSON.stringify(evaluated.result.value, null, 2));
  cdp.close();
}

main().catch((error: unknown) => {
  console.error("Falha no diagnóstico:", error);
  process.exitCode = 1;
});
