"use server";

import { describeImageForVideo, createCollage } from "@/util/video";

export interface DescribeFrameArgs {
  frames: string[];
  modelName: string;
};

export default async function describeFrame(request: DescribeFrameArgs) {
  const videoUrls = request["frames"];
  const modelName = request["modelName"];

  const collageUrl = await createCollage(videoUrls, 0, "test-video-name", true);
  const aiResponse: any = await describeImageForVideo(
    collageUrl,
    "",
    modelName
  );

  return aiResponse.content + "COLLAGE_URL:" + collageUrl;
}