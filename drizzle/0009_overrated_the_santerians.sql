ALTER TABLE "sichtungen" ADD COLUMN "melder_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "sichtungen" ADD COLUMN "melder_intern" boolean;--> statement-breakpoint
ALTER TABLE "sichtungen" ADD COLUMN "anonymisiert_am" timestamp;--> statement-breakpoint
CREATE INDEX "idx_melder_hash" ON "sichtungen" USING btree ("melder_hash");