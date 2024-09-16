import { inngest } from "@/inngest/client";
import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Ollama } from "ollama";
import { Redis } from "@upstash/redis";

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";

const client = new S3Client();
export const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://localhost:11434",
});
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export interface LLMOutput {
  detected: string;
  comment: string;
};

const framesDir = path.join(process.cwd(), "static", "frames");
const videoDir = path.join(process.cwd(), "static", "video");
const frameRate = 30;
export const tigrisCollagesDir = process.env.COLLAGE_FOLDER_NAME || "collages";

export async function downloadVideo(url: string, videoName: string) {
  const filePath = path.join(videoDir, videoName);
  if (fs.existsSync(filePath)) {
  } else {
    fs.existsSync(videoDir) || fs.mkdirSync(videoDir, { recursive: true });
    const resp = await fetch(url);

    try {
      const blob = await resp.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(filePath, buffer);
    } catch (e) {
      console.error(e);
    }
    console.log("video downloaded: ", filePath);
  }
  return filePath;
}

export async function publishNotification(channel: string, message: string) {
  await redis.publish(
    channel,
    JSON.stringify({
      channel,
      message,
      date: new Date().toString(),
    })
  );
}

export async function listTigrisDirectoryItems(directoryPrefix: string) {
  const tigrisParams = {
    Bucket: process.env.NEXT_PUBLIC_BUCKET_NAME!,
    Prefix: directoryPrefix,
  };

  try {
    const command = new ListObjectsV2Command(tigrisParams);
    const response = await client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error("Error checking directory:", error);
    throw error;
  }
}

export async function videoToFrames(filePath: string, videoName: string) {
  const framesFullPath = path.join(framesDir, videoName);

  // No collage found. Generate frames!
  if (!fs.existsSync(framesFullPath)) {
    fs.mkdirSync(framesFullPath, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([`-vf fps=1/${frameRate}`, `-vsync 0`, `-frame_pts 1`])
      .output(`${framesFullPath}/frame-%04d.png`)
      .on("end", () => {
        console.log("Frame extraction completed.");
        resolve("Done");
      })
      .on("progress", (progress: any) => {
        console.log(`Processing video: ${progress.percent}% done`);
      })
      .on("error", (err: any) => {
        console.error(`Error processing video: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

let context = "";
const setKey = "ai-responses";

export async function makeCollage(
  videoName: string,
  shouldCreateCollage: boolean,
  modelName: string
) {
  const framesFullPath = path.join(framesDir, videoName);
  const files = fs.readdirSync(framesFullPath);

  if (shouldCreateCollage) {
    if (files.length === 0) {
      console.error("ERROR: no frames found for video.");
      return;
    }

    for (let i = 0; i < files.length; i += 6) {
      const batch = files.slice(i, i + 6);
      const collageUrl = await createCollage(
        batch,
        Math.floor(i / 6),
        videoName
      );
      console.log("collageUrl", collageUrl);

      // describing collages!
      const result: any = await describeImageForVideo(
        collageUrl,
        context,
        modelName
      );
      const publishStr = result.content + "COLLAGE_URL:" + collageUrl;
      await publishNotification(setKey, publishStr || "");

      //TODO - should retry if OAI says it't can't help with the request
      context += result.content + " ";
      if (i >= files.length - 6) {
        await publishNotification(setKey, "END");
      }
    }
    context = "";
  } else {
    console.log("Collages already created.");
    const collages = await listTigrisDirectoryItems(
      `${tigrisCollagesDir}/${videoName}`
    );
    if (collages.length === 0) {
      // for some reason, collages are empty!
      throw new Error("No collages found.");
    } else {
      for (let i = 0; i < collages.length; i++) {
        const collageUrl = `https://${process.env.NEXT_PUBLIC_BUCKET_NAME}.fly.storage.tigris.dev/${collages[i].Key}`;
        const result: any = await describeImageForVideo(
          collageUrl,
          context,
          modelName
        );
        const publishStr = result.content + "COLLAGE_URL:" + collageUrl;
        console.log("publishStr", publishStr);
        await publishNotification(setKey, publishStr || "");
        context += result.content + " ";

        if (i >= collages.length - 1) {
          await publishNotification(setKey, "END");
        }
      }
    }
  }
}

async function uploadToTigris(
  key: string,
  body: any,
  contentType: string,
  bucket = process.env.NEXT_PUBLIC_BUCKET_NAME!
) {
  const tigrisParam = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  };

  try {
    await client.send(new PutObjectCommand(tigrisParam));
  } catch (e) {
    console.error("Failed to save collage: ", e);
  }
}

export async function createCollage(
  framesBatch: string[],
  batchIndex: number,
  videoName: string,
  collageFromCapture: boolean = false // If true, the collage is created from the capture and frames are base64
): Promise<string> {
  const collageWidth = 600; // Width of one image in the collage
  const collageHeight = 400; // Height of one image in the collage

  let collage = sharp({
    create: {
      width: collageWidth * 3, // 3 images per row
      height: collageHeight * 2, // 2 rows
      channels: 4,
      background: "white",
    },
  });

  const composites = await Promise.all(
    framesBatch.map(async (frame, index) => {
      let resizedImage;
      if (collageFromCapture) {
        const base64Data = frame.split(";base64,").pop();
        if (!base64Data) {
          throw new Error("Invalid Base64 image data");
        }
        const imageBuffer = Buffer.from(base64Data, "base64");
        resizedImage = await sharp(imageBuffer)
          .resize({
            width: collageWidth,
            fit: "cover",
          })
          .toBuffer();
      } else {
        const imagePath = path.join(framesDir, videoName, frame);

        resizedImage = await sharp(imagePath)
          .resize({
            width: collageWidth,
            fit: "cover",
          })
          .toBuffer();
      }

      return {
        input: resizedImage,
        top: Math.floor(index / 3) * collageHeight,
        left: (index % 3) * collageWidth,
      };
    })
  );

  collage = collage.composite(composites);
  const collageBuffer = await collage.jpeg().toBuffer();
  const collageTs = Date.now();

  const collageUrl = collageFromCapture
    ? `https://${process.env.NEXT_PUBLIC_BUCKET_NAME}.fly.storage.tigris.dev/capture/${videoName}/${collageTs}.jpg`
    : `https://${process.env.NEXT_PUBLIC_BUCKET_NAME
    }.fly.storage.tigris.dev/${tigrisCollagesDir}/${videoName}/collage-${batchIndex + 1
    }.jpg`;

  const uploadKey = collageFromCapture
    ? `capture/${videoName}/${collageTs}.jpg`
    : `${tigrisCollagesDir}/${videoName}/collage-${batchIndex + 1}.jpg`;

  await uploadToTigris(uploadKey, collageBuffer, "image/jpeg");
  return collageUrl;
}

export async function fetchLatestFromTigris() {
  const listObjectsV2Command = new ListObjectsV2Command({
    Bucket: process.env.NEXT_PUBLIC_BUCKET_NAME,
    Prefix: `${tigrisCollagesDir}/`,
  });
  const resp = await client.send(listObjectsV2Command);
  if (!resp.Contents || resp.Contents.length === 0) {
    console.log("No files found.");
    return;
  }

  const latestFile = resp.Contents.sort(
    (a: any, b: any) => b.LastModified - a.LastModified
  )[0];

  if (!latestFile) {
    console.log("No file found.");
    return;
  }

  const getObjectCommand = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: latestFile.Key,
  });

  const url = await getSignedUrl(client, getObjectCommand);
  inngest.send({
    name: "Tigris.complete",
    data: { url },
  });
  return url;
}

function isValidLLMOutput(output: string): boolean {
  try {
    const data: LLMOutput = JSON.parse(output);

    // Check if the required fields are present and are of type string
    if (typeof data.detected === "string" && typeof data.comment === "string") {
      return true;
    }
    return false;
  } catch (e) {
    // If JSON parsing fails or any other error occurs
    console.error(e);
    return false;
  }
}

export async function toBase64ImageUrl(
  imgUrl: string
): Promise<string> {
  const fetchImageUrl = await fetch(imgUrl);
  const responseArrBuffer = await fetchImageUrl.arrayBuffer();
  //data:${fetchImageUrl.headers.get("Content-Type") || "image/png"};base64,$
  const toBase64 = `${Buffer.from(responseArrBuffer).toString("base64")}`;
  return toBase64;
}

export async function describeImageForVideo(
  url: string,
  context: string = "",
  modelName: string
) {
  const cachedResult = await redis.get(url);
  if (cachedResult) {
    return cachedResult;
  }

  const systemPrompt = {
    role: "system",
    content: `
      You are a a professional comedian. One of the funniest people in the world. You're known for deeply intellectual comedy that's hilarious but also interesting.
      `,
  };

  const prompt = `These are frames from an old movie with one or more pictures. 
  Generate a funny description of the image or a sequence of images. Make your narrative continuous and natural based on what you have said before. Really roast the movie.
  Previously you have described other frames from the same video, here is what you said: ${context}. 
  
  Make your description unique and not repetitive please!. Also, please keep it to only a few sentances.

  "`;


  console.log("Ollama Model: ", modelName);
  const response = await ollama.chat({
    model: modelName || "llava",
    messages: [
      systemPrompt,
      {
        role: "user",
        content: prompt,
        images: [await toBase64ImageUrl(url)],
      },
    ],
  });
  console.log("Ollama (Llava) Response: ", response.message);
  await redis.set(url, response.message);
  await redis.expire(url, 60 * 60);
  return response.message;
}