"use server";

import {
  videoToFrames,
  downloadVideo,
  makeCollage,
  listTigrisDirectoryItems,
  tigrisCollagesDir,
} from "@/util/video";

export interface DescribeVideoArgs {
  url: string;
  key: string;
  modelName: string;
};

export default async function describeVideo(data: DescribeVideoArgs): Promise<void> {
  const videoUrl = data.url;
  const videoName = data.key;
  const modelName = data.modelName;

  const collagesDir: string = `${tigrisCollagesDir}/${videoName}`;
  console.log("collagesDir: ", collagesDir);
  const tigrisCollageContent = await listTigrisDirectoryItems(collagesDir);
  console.log("bucket contents: ", tigrisCollageContent);

  if (tigrisCollageContent.length > 0) {
    // collages already created
    await makeCollage(videoName, false, modelName);
  } else {
    // need to pre-process video
    const videoFilePath = await downloadVideo(videoUrl, videoName);

    // frames are stored temporarily in static/frames
    await videoToFrames(videoFilePath, videoName);

    await makeCollage(videoName, true, modelName);
  }
}