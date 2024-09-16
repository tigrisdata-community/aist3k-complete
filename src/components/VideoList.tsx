"use client";

import { TigrisObject } from "@/lib/tigris";
import Link from "next/link";
import { useState, useEffect } from "react";
import listFiles from "@/app/actions/files";

export default function VideoList() {
  const [videos, setVideos] = useState<TigrisObject[] | null>(null);

  useEffect(() => {
    listFiles().then((videos) => setVideos(videos));
  }, []);

  if (videos === null) {
    return <>Loading...</>;
  }

  return (
    <section className="flex justify-center items-center w-full py-12 md:py-24 lg:py-32 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl text-white">
              Multi-modal Starter Kit
            </h1>
            <p className="max-w-[900px] text-white md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Explore our collection of starter videos to kickstart your
              multi-modal project.
            </p>
          </div>
          <ul className="grid gap-2 py-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
            {videos === null ? (
              <>Loading...</>
            ) : (
              videos.map((f, index) => {
                return (
                  <li key={f.key} className="flex flex-col items-center gap-2">
                    <Link
                      className="text-lg font-medium hover:underline underline-offset-4 text-white"
                      href={{
                        pathname: "/files/play",
                        query: {
                          name: f.key,
                        },
                      }}
                    >
                      <img
                        alt={`Video ${index}`}
                        className="w-full aspect-[16/9] object-cover rounded-lg"
                        height="200"
                        src="https://placehold.co/1280x720"
                        width="350"
                      />
                      {f.displayName}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
