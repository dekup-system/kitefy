/**
 * Screenshot fiel via CDP: emula viewport (sem janela, sem largura mínima do
 * Windows) e captura a página inteira.
 *
 * Uso: npx tsx scripts/cdp-shot.mts <url> <width> <out> [dark]
 * Requer Chrome com --remote-debugging-port=9222.
 */

const url = process.argv[2] ?? "http://localhost:3000/";
const width = Number(process.argv[3] ?? "430");
const out = process.argv[4] ?? "artifacts/shots/cdp.png";
const dark = process.argv[5] === "dark";

interface Target {
  webSocketDebuggerUrl: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

async function main(): Promise<void> {
  const targets = (await (await fetch("http://127.0.0.1:9222/json/list")).json()) as Target[];
  const target = targets.find((item) => item.webSocketDebuggerUrl);
  if (!target) throw new Error("Nenhuma aba depurável.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, Pending>();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WS falhou")), { once: true });
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
    if (typeof payload.id !== "number") return;
    const entry = pending.get(payload.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(payload.id);
    if (payload.error) entry.reject(new Error(payload.error.message));
    else entry.resolve(payload.result);
  });

  const send = <T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const viewportHeight = 3000;

  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: width < 700,
    screenWidth: width,
    screenHeight: viewportHeight,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }],
  });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (dark) {
    await send("Runtime.evaluate", {
      expression: `document.documentElement.classList.add('dark'); true`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const metrics = await send<{ contentSize: { height: number } }>("Page.getLayoutMetrics");
  const fullHeight = Math.ceil(metrics.contentSize.height);
  console.log(`conteúdo: ${width}x${fullHeight}`);

  // Expande o viewport para a altura total antes de capturar (evita clip enorme).
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: Math.min(fullHeight, 8000),
    deviceScaleFactor: 1,
    mobile: width < 700,
    screenWidth: width,
    screenHeight: Math.min(fullHeight, 8000),
  });
  await new Promise((resolve) => setTimeout(resolve, 700));

  const shot = await send<{ data: string }>("Page.captureScreenshot", { format: "png" }, 45_000);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(`ok ${out}`);

  socket.close();
}

main().catch((error: unknown) => {
  console.error("Falha:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
