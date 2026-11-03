const pdf = require("pdf-parse");
process.once("message", async data => {
  try {
    const buffer = Buffer.from(data);
    if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(buffer.subarray(0, 16).toString("latin1"))) throw new Error();
    // Require a complete trailer and a real cross-reference target, not parser repair of a prefix.
    const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
    const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
    if (!trailer) throw new Error();
    const offset = Number(trailer[1]);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= buffer.length) throw new Error();
    const target = buffer.subarray(offset, offset + 64).toString("latin1");
    if (!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(target)) throw new Error();
    const parsed = await pdf(buffer, { max: 1 });
    if (!Number.isInteger(parsed.numpages) || parsed.numpages < 1) throw new Error();
    process.send({ valid: true });
  } catch {
    process.send({ valid: false });
  }
});
