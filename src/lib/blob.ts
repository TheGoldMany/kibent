import "server-only";
import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";

/**
 * Vercel Blob – PRIVÁT tároló az orvosi igazolásokhoz.
 * A BLOB_READ_WRITE_TOKEN környezeti változót a Vercel automatikusan beállítja,
 * ha a projekthez Blob store van kapcsolva (helyileg: `vercel env pull`).
 */
export async function uploadPrivate(pathname: string, file: File): Promise<void> {
  await put(pathname, file, {
    access: "private",
    contentType: file.type,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

export async function deletePrivate(pathnames: string[]): Promise<void> {
  if (pathnames.length > 0) await del(pathnames);
}

/** Egyetlen fájlra szóló, `ttlSeconds` másodpercig érvényes olvasási URL. */
export async function signedReadUrl(pathname: string, ttlSeconds: number): Promise<string> {
  const validUntil = Date.now() + ttlSeconds * 1000;
  const token = await issueSignedToken({ operations: ["get"], pathname, validUntil });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    access: "private",
    pathname,
    validUntil,
    useCache: false,
  });
  return presignedUrl;
}
