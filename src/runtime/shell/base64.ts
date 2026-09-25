/** A file's bytes as base64, for the JSON envelopes the host's "local" auth accepts. */
export async function encodeBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + chunk)));
  }
  return btoa(binary);
}
