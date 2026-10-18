/**
 * Through the API (multipart). Vercel caps a request body at about 4.5 MB, so
 * the limit sits under it with room for the multipart envelope.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/** Direct-to-R2 uploads (presign + complete). Still processed by sharp on "complete". */
export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024

/** How long a presigned upload (and its token) stays valid. */
export const UPLOAD_TOKEN_TTL_SECONDS = 15 * 60

export const ORIGINAL_QUALITY = 90
export const DERIVATIVE_QUALITY = 82

/** `folderId=none` lists assets that are in no folder (folderId IS NULL). */
export const UNFILED = "none"

export const megabytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`
