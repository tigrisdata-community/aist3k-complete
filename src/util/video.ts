import { Ollama } from "ollama";
import { Redis } from "@upstash/redis";

export const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://localhost:11434",
});
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});