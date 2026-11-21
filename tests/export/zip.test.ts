import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "@/lib/export/zip";

/**
 * O escritor ZIP é usado no download de pacotes (PNG + Markdown + JSON-LD).
 * Validamos a estrutura binária e o CRC32 — sem depender de biblioteca externa.
 */

function readAscii(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, start + length).toString("latin1");
}

describe("createZip", () => {
  it("escreve header local, central directory e EOCD válidos", () => {
    const zip = createZip([
      { name: "conteudo.md", data: Buffer.from("# Olá\n\nTexto do ativo.", "utf8") },
      { name: "payload.json", data: Buffer.from(JSON.stringify({ ok: true }), "utf8") },
    ]);

    // Assinaturas
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);

    const eocdOffset = zip.length - 22;
    expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocdOffset + 10)).toBe(2); // total de entradas

    const centralSize = zip.readUInt32LE(eocdOffset + 12);
    const centralOffset = zip.readUInt32LE(eocdOffset + 16);
    expect(centralOffset + centralSize).toBe(eocdOffset);
    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
  });

  it("guarda nome e CRC corretos da primeira entrada", () => {
    const data = Buffer.from("conteúdo do ativo", "utf8");
    const zip = createZip([{ name: "a.md", data }], new Date("2026-01-01T12:00:00Z"));

    const nameLength = zip.readUInt16LE(26);
    const extraLength = zip.readUInt16LE(28);
    const name = readAscii(zip, 30, nameLength);
    expect(name).toBe("a.md");
    expect(extraLength).toBe(0);

    const storedCrc = zip.readUInt32LE(14);
    expect(storedCrc).toBe(crc32(data));

    const payloadStart = 30 + nameLength + extraLength;
    expect(zip.subarray(payloadStart, payloadStart + data.length).toString("utf8")).toBe(
      "conteúdo do ativo",
    );
  });

  it("calcula CRC32 conhecido para string vazia e para 'abc'", () => {
    expect(crc32(Buffer.from(""))).toBe(0);
    // CRC32("abc") = 0x352441c2
    expect(crc32(Buffer.from("abc"))).toBe(0x352441c2);
  });

  it("não comprime PNG (compress:false) e mantém bytes idênticos", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const zip = createZip([{ name: "imagens/slide-1.png", data: png, compress: false }]);

    const nameLength = zip.readUInt16LE(26);
    const method = zip.readUInt16LE(8);
    expect(method).toBe(0); // STORE

    const payloadStart = 30 + nameLength;
    expect(zip.subarray(payloadStart, payloadStart + png.length).equals(png)).toBe(true);
  });

  it("recusa lote vazio", () => {
    expect(() => createZip([])).toThrow(/sem arquivos/i);
  });
});
