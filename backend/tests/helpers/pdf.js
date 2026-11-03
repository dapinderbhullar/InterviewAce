// Generated synthetic PDF; never read user documents in tests.
function validPdf(targetBytes) {
  let result = "%PDF-1.4\n";
  const offsets = [0];
  const content = "BT /F1 12 Tf 50 100 Td (Synthetic resume skills) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(result);
  result += "xref\n0 6\n0000000000 65535 f \n";
  result += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  result += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  let buffer = Buffer.from(result);
  if (targetBytes !== undefined) {
    if (targetBytes < buffer.length) throw new Error("Target too small");
    // Whitespace before the trailer preserves xref offsets and keeps EOF at the end.
    const split = result.indexOf("trailer\n");
    buffer = Buffer.from(result.slice(0, split) + " ".repeat(targetBytes - buffer.length) + result.slice(split));
  }
  return buffer;
}
module.exports = { validPdf };
