"use server";

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { TigrisObject } from '@/lib/tigris';

const client = new S3Client();

export type FilesResponse = Array<TigrisObject>;

export interface ErrorMessage {
  message: string;
}

export default async function listFiles(): Promise<TigrisObject[]> {
  const listObjectsV2Command = new ListObjectsV2Command(
    { Bucket: process.env.NEXT_PUBLIC_BUCKET_NAME });

  const resp = await client.send(listObjectsV2Command);

  if (resp.Contents === undefined) {
    return [];
  }

  return resp.Contents
    .filter(file => file.Key !== undefined)
    .filter(file => file.Key && file.Key.endsWith(".mp4"))
    .map(file => file.Key)
    .map(
      key => {
        return {
          displayName: key,
          key,
          urlSlug: key?.replace(".", "_")
        } as TigrisObject;
      });
}
