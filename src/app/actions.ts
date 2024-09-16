"use server";

import { ollama } from "@/util/video";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";

const client = new S3Client();
const redis = Redis.fromEnv();

function isEmpty(val: string | undefined | null) {
  return val === undefined || val == null || val.length <= 0 ? true : false;
}

function removeQuotesAndNewlines(str: string) {
  return (str + "")
    .replaceAll('"', "")
    .replaceAll("'", "")
    .replaceAll("\n", "");
}

export async function listOllamaVisionModels() {
  return ollama.list()
    .then((list) => list.models)
    .then((models) => models.filter(m => m.details.families && m.details.families.includes("clip")))
    .then((models) => models.map(m => m.name))
}

export async function fetchAndPlayTextToSpeech(
  narrationText: string,
  videoName: string
) {
  console.log("current narration", narrationText);
  const cachedResult = await redis.get(narrationText);
  if (cachedResult) {
    console.log("cached result", cachedResult);
    return cachedResult;
  }

  if (isEmpty(process.env.XI_API_KEY)) {
    throw new Error("missing Eleven Labs key at envvar XI_API_KEY, see the section about setting up 11 labs");
  }

  if (isEmpty(process.env.XI_VOICE_ID)) {
    throw new Error("missing Eleven Labs key at envvar XI_VOICE_ID, see the section about setting up 11 labs");
  }

  const escapestr = removeQuotesAndNewlines(narrationText);
  const options = {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": process.env.XI_API_KEY!,
    },
    body: JSON.stringify({
      model_id: "eleven_turbo_v2",
      text: escapestr,
    }),
  };

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.XI_VOICE_ID!}`,
      options
    );
    if (response.status !== 200) {
      console.error(
        "Unable to create elevenlabs audio. Error: " +
        JSON.stringify(await response.json())
      );
      return;
    }

    const blob = await response.blob();
    const ts = new Date().getTime();
    const audioFileSavedAt = `elevenLabsAudio/${videoName}/${ts}.mp3`;
    const arrayBuffer = await blob.arrayBuffer();
    const tigrisParam = {
      Bucket: process.env.NEXT_PUBLIC_BUCKET_NAME!,
      Key: audioFileSavedAt,
      Body: Buffer.from(arrayBuffer),
      ContentType: "audio/mpeg",
    };

    try {
      await client.send(new PutObjectCommand(tigrisParam));
      const url = `https://${process.env.NEXT_PUBLIC_BUCKET_NAME}.fly.storage.tigris.dev/${audioFileSavedAt}`;
      await redis.set(narrationText, url);
      console.log("Audio saved to Tigris: ", url);
      return url;
    } catch (e) {
      console.error("Failed to save collage: ", e);
    }
  } catch (err) {
    console.error("Error fetching text-to-speech:", err);
  }
}
