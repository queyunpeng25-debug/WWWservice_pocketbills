/**
 * Local bill extraction (phase 1). Everything runs in the browser: images go
 * through Tesseract OCR, PDFs through pdf.js' text layer, emails are parsed as
 * text. Libraries are loaded on first use so they never slow the main bundle.
 * Tesseract fetches its engine and English model from a CDN once; the user's
 * file itself is never uploaded.
 */
import { parseEmail, parseText, normalizeDraft } from "./importer.js";

const MAX_BYTES = 15 * 1024 * 1024;
export const ACCEPT =
  "image/*,application/pdf,.pdf,.eml,message/rfc822,.txt,text/plain,.html,text/html";

export function kindOf(file) {
  const name = file.name?.toLowerCase() || "";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    file.type.startsWith("text/") ||
    file.type === "message/rfc822" ||
    /\.(eml|txt|html?)$/.test(name)
  )
    return "email";
  return null;
}

async function ocrImage(file, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) =>
      m.status === "recognizing text" &&
      onProgress?.(Math.round(m.progress * 100)),
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function pdfText(file) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const pages = [];
  // Bills put the total and due date on the first pages.
  for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join(""),
    );
  }
  await doc.destroy();
  return pages.join("\n");
}

/**
 * File or pasted text → { draft, confidence, warnings, source }.
 * Throws an Error with a user-facing message when nothing can be read.
 */
export async function extractBill(input, { onProgress } = {}) {
  let text = "",
    hints = {},
    source;
  if (typeof input === "string") {
    ({ text, hints } = parseEmail(input));
    source = { kind: "email", label: hints.subject || "Pasted email" };
  } else {
    const kind = kindOf(input);
    if (!kind)
      throw new Error("Use a photo, a PDF, or an email (.eml or text).");
    if (input.size > MAX_BYTES)
      throw new Error("That file is larger than 15 MB.");
    source = { kind, label: input.name || "Pasted image" };
    if (kind === "image") {
      source.preview = URL.createObjectURL(input);
      text = await ocrImage(input, onProgress);
    } else if (kind === "pdf") {
      text = await pdfText(input);
      if (!text.trim())
        throw new Error(
          "This PDF is a scan without text. Take a photo or screenshot of it instead.",
        );
    } else ({ text, hints } = parseEmail(await input.text()));
  }
  if (!text.trim()) throw new Error("We couldn’t find any text in this bill.");
  return { ...normalizeDraft(parseText(text, hints)), source };
}
