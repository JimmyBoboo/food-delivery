/**
 * Oppretter lagringsboetta som produktbilder lastes opp til.
 *
 * Kjoeres med `npm run storage:setup`. Scriptet er idempotent, saa det er
 * trygt aa kjoere paa nytt mot et prosjekt som allerede er satt opp.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Mangler ${name}. Fyll ut .env foer du kjoerer dette scriptet.`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const { data: existing } = await supabase.storage.getBucket(BUCKET);

if (existing) {
  console.log(`Boetta "${BUCKET}" finnes allerede.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  });

  if (error) {
    console.error(`Kunne ikke opprette boetta: ${error.message}`);
    process.exit(1);
  }

  console.log(`Opprettet offentlig boette "${BUCKET}" med 5 MB grense per fil.`);
}
