// Bytes ↔ base64 for the JSON upload envelopes (DESIGN §C.3, DR-1).

/** A file's bytes as standard base64. */
export async function encodeBase64(file: Blob): Promise<string> {
  return encodeBytes(new Uint8Array(await file.arrayBuffer()));
}

export function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + chunk)));
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
