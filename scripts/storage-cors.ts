import "dotenv/config"
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"
import { env } from "../src/config"

/**
 * Lets the admin upload large files straight to the bucket (presigned PUT)
 * from the site: PUBLIC_BASE_URL plus any CORS_ORIGINS. Run once per bucket,
 * and again when the domain changes: `npm run storage:cors`.
 */
const run = async () => {
	if (env.STORAGE_DRIVER !== "s3" || !env.S3_ENDPOINT || !env.S3_BUCKET) {
		throw new Error("Set STORAGE_DRIVER=s3 and the S3_* variables first")
	}
	const origins = [env.PUBLIC_BASE_URL, ...env.CORS_ORIGINS.split(",")]
		.map((origin) => origin.trim().replace(/\/+$/, ""))
		.filter(Boolean)

	const s3 = new S3Client({
		region: env.S3_REGION,
		endpoint: env.S3_ENDPOINT,
		credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
		forcePathStyle: true,
	})
	await s3.send(
		new PutBucketCorsCommand({
			Bucket: env.S3_BUCKET,
			CORSConfiguration: {
				CORSRules: [
					{
						AllowedOrigins: [...new Set(origins)],
						AllowedMethods: ["PUT"],
						AllowedHeaders: ["content-type"],
						MaxAgeSeconds: 3600,
					},
				],
			},
		})
	)
	const saved = await s3.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }))
	console.log(`CORS on ${env.S3_BUCKET}: PUT from ${saved.CORSRules?.[0]?.AllowedOrigins?.join(", ")}`)
}

run().catch((error) => {
	console.error(error)
	process.exit(1)
})
