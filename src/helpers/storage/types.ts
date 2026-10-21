/**
 * Storage abstraction for public media (product, category and SEO images).
 *
 * The driver is picked by STORAGE_DRIVER, so development runs on local disk and
 * production on an S3-compatible bucket (Neon Object Storage) without any module code changing. Nothing outside
 * this folder knows which one is in use.
 *
 * Keys are relative, slash-separated paths such as "images/2026/10/<hex>.webp".
 * Services generate them; they never come from an uploaded filename.
 */

/** What a browser needs to upload one object straight to storage. */
export interface PresignedPut {
	url: string
	method: "PUT"
	/** Headers the client must send unchanged; they are part of the signature. */
	headers: Record<string, string>
	expiresAt: Date
}

export interface StorageDriver {
	readonly name: "local" | "s3"

	put(key: string, body: Buffer, contentType: string): Promise<void>

	/** The bytes back. Used to process an object that was uploaded with a presigned URL. */
	get(key: string): Promise<Buffer>

	/** Deleting a key that does not exist is not an error. */
	delete(key: string): Promise<void>

	/** Permanent public URL. */
	publicUrl(key: string): string

	/**
	 * A short-lived URL the browser can PUT one object to, bypassing the API's
	 * request-size limit.
	 *
	 * An S3 presigned PUT cannot express "at most N bytes", only an exact length,
	 * so `sizeBytes` is the size the client declared (already checked against the
	 * cap by the caller). It is signed as Content-Length, and the bucket rejects a body
	 * of any other length.
	 *
	 * The local driver throws a 501 ApiError: in development, files are small
	 * enough to go through the normal multipart upload.
	 */
	presignPut(key: string, contentType: string, sizeBytes: number): Promise<PresignedPut>
}
