const SUPPORTED_LINKED_DOCUMENT_TYPES = new Set([
  "JournalEntry",
  "JournalEntryPage",
  "Token",
  "TokenDocument",
  "Actor"
]);

export function isSupportedLinkedWorldMapDocument(document) {
  const documentName = String(document?.documentName || "").trim();
  return SUPPORTED_LINKED_DOCUMENT_TYPES.has(documentName);
}

export function getWorldMapDragItemCount(event) {
  const nativeEvent = event?.originalEvent ?? event;
  const dragData = globalThis.TextEditor?.getDragEventData?.(nativeEvent) ?? null;
  if (dragData?.uuid) return 1;
  const raw = nativeEvent?.dataTransfer?.getData?.("text/plain");
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed?.uuid) return 1;
  } catch (_error) {
    return 0;
  }
  return 0;
}

export async function resolveDroppedWorldMapDocument(event) {
  const nativeEvent = event?.originalEvent ?? event;
  const dragData = globalThis.TextEditor?.getDragEventData?.(nativeEvent) ?? null;
  let document = null;
  if (dragData?.uuid && typeof fromUuid === "function") {
    document = await fromUuid(dragData.uuid);
  }
  if (!document) {
    const raw = nativeEvent?.dataTransfer?.getData?.("text/plain");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.uuid && typeof fromUuid === "function") {
          document = await fromUuid(parsed.uuid);
        }
      } catch (_error) {
        // Unsupported drag payloads are ignored by design.
      }
    }
  }
  return document?.document ?? document ?? null;
}

export async function openLinkedWorldMapDocument(entry, { warn } = {}) {
  const documentUuid = String(entry?.documentUuid || "").trim();
  if (!documentUuid || typeof fromUuid !== "function") return false;
  const document = await fromUuid(documentUuid);
  if (!document) {
    warn?.();
    return false;
  }
  if (document.sheet?.render) {
    document.sheet.render(true);
    return true;
  }
  if (document.actor?.sheet?.render) {
    document.actor.sheet.render(true);
    return true;
  }
  if (document.parent?.sheet?.render) {
    document.parent.sheet.render(true);
    return true;
  }
  return false;
}
