import { NextRequest } from "next/server";

const vars = [
  "AWS_ENDPOINT_URL_S3",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_BUCKET_NAME",
  "XI_VOICE_ID",
  "XI_API_KEY",
  "UPSTASH_REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

export async function GET(_req: NextRequest) {
  const missingVars = vars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    return new Response(`Missing env vars: ${missingVars.join(", ")}`, {
      status: 500,
    });
  }

  return new Response("All env vars are set", { status: 200 });
}