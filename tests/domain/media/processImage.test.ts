import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { processImage } from "../../../src/app/modules/media/media.image"

const png = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 3, background: "#336699" } })
		.png()
		.toBuffer()

describe("processImage", () => {
	it("reads the size and makes WebP derivatives without upscaling", async () => {
		const result = await processImage(await png(600, 300), "image/png")

		expect(result).toMatchObject({ mimeType: "image/png", width: 600, height: 300, unchanged: false })
		expect(result.derivatives.map(({ name, width, height }) => ({ name, width, height }))).toEqual([
			{ name: "thumb", width: 400, height: 200 },
			{ name: "medium", width: 600, height: 300 },
		])
		expect((await sharp(result.derivatives[0]!.body).metadata()).format).toBe("webp")
	})

	it("strips metadata from the original", async () => {
		const withExif = await sharp(await png(50, 50))
			.withExif({ IFD0: { Copyright: "secret-camera" } })
			.jpeg()
			.toBuffer()
		const result = await processImage(withExif, "image/jpeg")
		expect((await sharp(result.body).metadata()).exif).toBeUndefined()
	})

	it("rejects content that does not match the declared type", async () => {
		await expect(processImage(await png(10, 10), "image/jpeg")).rejects.toMatchObject({ statusCode: 415 })
		await expect(processImage(Buffer.from("not an image"), "image/png")).rejects.toMatchObject({ statusCode: 400 })
	})

	it("stores SVG untouched, without sharp", async () => {
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')
		const result = await processImage(svg, "image/svg+xml")
		expect(result).toMatchObject({ unchanged: true, width: null, height: null, derivatives: [] })
		expect(result.body).toBe(svg)
	})
})
