import "dotenv/config"
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"

/**
 * `npm run db:backup`: a full dump of the database (DIRECT_URL, else
 * DATABASE_URL) into backups/drft-<date>.dump, keeping the newest KEEP files.
 * Needs pg_dump of the server's major version on PATH, or its path in PG_DUMP.
 *
 * Restore into an empty database:
 *   pg_restore --clean --if-exists --no-owner --no-privileges -d "<url>" backups/<file>.dump
 *
 * Uploaded images live in the storage bucket, not in this dump.
 */
const KEEP = 14
const DIR = path.resolve(__dirname, "..", "backups")

const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!raw) {
	console.error("Set DIRECT_URL or DATABASE_URL")
	process.exit(1)
}
// verify-full is the node driver's setting; libpq would also want a CA file for it.
const url = raw.replace(/sslmode=verify-full/, "sslmode=require")

fs.mkdirSync(DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")
const file = path.join(DIR, `drft-${stamp}.dump`)

const result = spawnSync(
	process.env.PG_DUMP ?? "pg_dump",
	["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, `--dbname=${url}`],
	{ stdio: "inherit" }
)
if (result.error || result.status !== 0) {
	console.error(result.error?.message ?? `pg_dump exited with ${result.status}`)
	fs.rmSync(file, { force: true })
	process.exit(1)
}

const backups = fs
	.readdirSync(DIR)
	.filter((name) => /^drft-.*\.dump$/.test(name))
	.sort()
for (const old of backups.slice(0, -KEEP)) fs.rmSync(path.join(DIR, old))

console.log(`Saved ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB); keeping the newest ${KEEP}.`)
