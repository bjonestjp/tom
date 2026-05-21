import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STORE_NAME = "tom-leaderboard";
const IMAGE_STORE_NAME = "tom-leaderboard-player-images";
const STATE_KEY = "state-v1";
const LOCAL_STATE_PATH = join(process.cwd(), ".data", "leaderboard-state.json");
const LOCAL_IMAGE_DIR = join(process.cwd(), ".data", "player-images");
const MAX_PLAYER_IMAGES = 12;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_EVENT_NOTE_LENGTH = 300;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const COMPETITORS = [
  { id: "brad-jones", name: "Brad Jones" },
  { id: "jack-birch", name: "Jack Birch" },
  { id: "tom-garrod", name: "Tom Garrod" },
  { id: "chris-bond", name: "Chris Bond" },
  { id: "sam-gallop", name: "Sam Gallop" },
  { id: "tommy-hearn", name: "Tommy Hearn" },
  { id: "james-hogan", name: "James Hogan" },
  { id: "sam-holdsworth", name: "Sam Holdsworth" },
  { id: "jack-tunnacliffe-jones", name: "Jack Tunnacliffe-Jones" },
  { id: "scott-mcevoy", name: "Scott McEvoy" }
];

export default async function handler(request) {
  if (request.method === "OPTIONS") return json({}, 204);

  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.has("image")) {
      return servePlayerImage(url.searchParams.get("image"));
    }

    if (request.method === "GET") {
      const { state } = await readCurrentState();
      return json({ state });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const payload = await readJson(request);
    const passwordCheck = checkPassword(payload.password);
    if (!passwordCheck.ok) return json({ error: passwordCheck.error }, passwordCheck.status);

    if (payload.action === "verify") {
      return json({ ok: true });
    }

    if (payload.action === "uploadPlayerImage") {
      return uploadPlayerImage(payload);
    }

    if (payload.action === "deletePlayerImage") {
      return deletePlayerImage(payload);
    }

    if (payload.action !== "saveState") {
      return json({ error: "Unknown action." }, 400);
    }

    const storage = await getStorage();
    const currentEntry = await storage.read();
    const currentState = normalizeState(currentEntry?.state || createDefaultState());
    const nextState = normalizeIncomingState(payload.state, currentState);

    if (nextState.revision !== currentState.revision) {
      return json({
        error: "The leaderboard changed since this page loaded.",
        state: currentState
      }, 409);
    }

    const now = new Date().toISOString();
    const stateToSave = {
      ...nextState,
      revision: currentState.revision + 1,
      updatedAt: now
    };

    const writeResult = await storage.write(stateToSave, currentEntry?.etag);
    if (writeResult?.conflict) {
      const { state } = await readCurrentState();
      return json({ error: "The leaderboard changed while saving.", state }, 409);
    }

    return json({ state: stateToSave });
  } catch (error) {
    return json({ error: error.message || "Unexpected server error." }, 500);
  }
}

async function readCurrentState() {
  const storage = await getStorage();
  const entry = await storage.read();
  return {
    state: normalizeState(entry?.state || createDefaultState()),
    etag: entry?.etag || null
  };
}

async function uploadPlayerImage(payload) {
  const storage = await getStorage();
  const currentEntry = await storage.read();
  const currentState = normalizeState(currentEntry?.state || createDefaultState());
  const competitorIndex = currentState.competitors.findIndex((competitor) => competitor.id === payload.competitorId);

  if (competitorIndex === -1) {
    return json({ error: "Unknown player." }, 400);
  }

  const currentImages = currentState.competitors[competitorIndex].images || [];
  if (currentImages.length >= MAX_PLAYER_IMAGES) {
    return json({ error: "This player already has 12 images." }, 400);
  }

  const image = parseImageDataUrl(payload.image?.dataUrl);
  const imageId = `player-${payload.competitorId}-${randomUUID()}`;
  const now = new Date().toISOString();
  const imageMeta = {
    id: imageId,
    name: cleanText(payload.image?.name, "Player image", 80),
    contentType: image.contentType,
    uploadedAt: now
  };

  const imageStorage = await getImageStorage();
  await imageStorage.write(imageId, image.bytes, image.contentType);

  const stateToSave = {
    ...currentState,
    competitors: currentState.competitors.map((competitor, index) => index === competitorIndex
      ? { ...competitor, images: [...currentImages, imageMeta].slice(0, MAX_PLAYER_IMAGES) }
      : competitor
    ),
    revision: currentState.revision + 1,
    updatedAt: now
  };

  const writeResult = await storage.write(stateToSave, currentEntry?.etag);
  if (writeResult?.conflict) {
    await imageStorage.delete(imageId);
    const { state } = await readCurrentState();
    return json({ error: "The leaderboard changed while uploading.", state }, 409);
  }

  return json({ state: stateToSave, image: imageMeta });
}

async function deletePlayerImage(payload) {
  const storage = await getStorage();
  const currentEntry = await storage.read();
  const currentState = normalizeState(currentEntry?.state || createDefaultState());
  let deletedImage = null;

  const stateToSave = {
    ...currentState,
    competitors: currentState.competitors.map((competitor) => {
      const images = competitor.images || [];
      const nextImages = images.filter((image) => {
        const keep = image.id !== payload.imageId;
        if (!keep) deletedImage = image;
        return keep;
      });
      return nextImages.length === images.length ? competitor : { ...competitor, images: nextImages };
    }),
    revision: currentState.revision + 1,
    updatedAt: new Date().toISOString()
  };

  if (!deletedImage) {
    return json({ error: "Image not found." }, 404);
  }

  const writeResult = await storage.write(stateToSave, currentEntry?.etag);
  if (writeResult?.conflict) {
    const { state } = await readCurrentState();
    return json({ error: "The leaderboard changed while deleting the image.", state }, 409);
  }

  const imageStorage = await getImageStorage();
  await imageStorage.delete(deletedImage.id);

  return json({ state: stateToSave });
}

async function servePlayerImage(imageId) {
  if (!isSafeImageId(imageId)) return json({ error: "Image not found." }, 404);

  const { state } = await readCurrentState();
  const imageMeta = state.competitors
    .flatMap((competitor) => competitor.images || [])
    .find((image) => image.id === imageId);

  if (!imageMeta) return json({ error: "Image not found." }, 404);

  const imageStorage = await getImageStorage();
  const bytes = await imageStorage.read(imageId);
  if (!bytes) return json({ error: "Image not found." }, 404);

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": imageMeta.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    }
  });
}

async function getStorage() {
  if (useLocalStorage()) {
    return getLocalStorage();
  }

  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  return {
    async read() {
      const entry = await store.getWithMetadata(STATE_KEY, {
        consistency: "strong",
        type: "json"
      });
      if (!entry) return null;
      return { state: entry.data, etag: entry.etag };
    },
    async write(state, etag) {
      const options = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
      const result = await store.setJSON(STATE_KEY, state, options);
      return result.modified ? { etag: result.etag } : { conflict: true };
    }
  };
}

function getLocalStorage() {
  return {
    async read() {
      try {
        const raw = await readFile(LOCAL_STATE_PATH, "utf8");
        return { state: JSON.parse(raw), etag: null };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(state) {
      await mkdir(dirname(LOCAL_STATE_PATH), { recursive: true });
      await writeFile(LOCAL_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
      return { etag: null };
    }
  };
}

async function getImageStorage() {
  if (useLocalStorage()) {
    return getLocalImageStorage();
  }

  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: IMAGE_STORE_NAME, consistency: "strong" });

  return {
    async read(key) {
      const entry = await store.get(key, {
        consistency: "strong",
        type: "arrayBuffer"
      });
      return entry ? Buffer.from(entry) : null;
    },
    async write(key, bytes, contentType) {
      await store.set(key, bytes, {
        metadata: { contentType }
      });
    },
    async delete(key) {
      await store.delete(key);
    }
  };
}

function useLocalStorage() {
  return process.env.LEADERBOARD_STORAGE === "local" || process.env.NETLIFY_DEV === "true";
}

function getLocalImageStorage() {
  return {
    async read(key) {
      try {
        return await readFile(join(LOCAL_IMAGE_DIR, key));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(key, bytes) {
      await mkdir(LOCAL_IMAGE_DIR, { recursive: true });
      await writeFile(join(LOCAL_IMAGE_DIR, key), bytes);
    },
    async delete(key) {
      try {
        await unlink(join(LOCAL_IMAGE_DIR, key));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  };
}

function createDefaultState() {
  const scores = Object.fromEntries(COMPETITORS.map((competitor) => [competitor.id, null]));
  const notes = Object.fromEntries(COMPETITORS.map((competitor) => [competitor.id, ""]));
  const events = Array.from({ length: 10 }, (_, index) => ({
    id: `event-${index + 1}`,
    name: `Event ${index + 1}`,
    description: "",
    completed: false,
    scores: { ...scores },
    notes: { ...notes }
  }));

  return {
    version: 1,
    competitionName: "Leaderboard",
    aboutText: "",
    competitors: normalizeCompetitors([]),
    events,
    revision: 0,
    updatedAt: null
  };
}

function normalizeState(input) {
  return normalizeIncomingState(input, createDefaultState(), { allowRevisionFallback: true });
}

function normalizeIncomingState(input, currentState, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("State payload is missing.");
  }

  const currentRevision = Number.isInteger(currentState.revision) ? currentState.revision : 0;
  const revision = Number.isInteger(input.revision)
    ? input.revision
    : options.allowRevisionFallback
      ? currentRevision
      : null;

  if (!Number.isInteger(revision)) {
    throw new Error("State revision is missing.");
  }

  const eventsInput = Array.isArray(input.events) ? input.events.slice(0, 50) : [];
  const seenEventIds = new Set();
  const competitorIds = new Set(COMPETITORS.map((competitor) => competitor.id));
  const competitors = normalizeCompetitors(input.competitors);

  const events = eventsInput.map((eventItem, index) => {
    const fallbackId = `event-${index + 1}`;
    const id = sanitizeId(eventItem?.id, fallbackId, seenEventIds);
    seenEventIds.add(id);

    const scores = {};
    const notes = {};
    for (const competitorId of competitorIds) {
      scores[competitorId] = parseScore(eventItem?.scores?.[competitorId]);
      notes[competitorId] = cleanText(eventItem?.notes?.[competitorId], "", MAX_EVENT_NOTE_LENGTH);
    }

    return {
      id,
      name: cleanText(eventItem?.name, `Event ${index + 1}`, 80),
      description: cleanText(eventItem?.description, "", 500),
      completed: eventItem?.completed === true,
      scores,
      notes
    };
  });

  return {
    version: 1,
    competitionName: cleanText(input.competitionName, "Leaderboard", 80),
    aboutText: cleanText(input.aboutText, "", 3000),
    competitors,
    events,
    revision,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : currentState.updatedAt || null
  };
}

function normalizeCompetitors(inputCompetitors) {
  const inputById = new Map(
    (Array.isArray(inputCompetitors) ? inputCompetitors : [])
      .filter((competitor) => competitor && typeof competitor.id === "string")
      .map((competitor) => [competitor.id, competitor])
  );

  return COMPETITORS.map((competitor) => ({
    ...competitor,
    titles: cleanTitleLines(inputById.get(competitor.id)?.titles),
    images: cleanPlayerImages(inputById.get(competitor.id)?.images)
  }));
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, status: 500, error: "ADMIN_PASSWORD is not configured." };
  }
  if (password !== expected) {
    return { ok: false, status: 401, error: "Incorrect admin password." };
  }
  return { ok: true };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function parseScore(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function cleanText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function cleanTitleLines(value) {
  const lines = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return lines
    .map((line) => String(line).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.slice(0, 100));
}

function cleanPlayerImages(value) {
  const images = Array.isArray(value) ? value : [];
  return images
    .filter((image) => image && isSafeImageId(image.id) && ALLOWED_IMAGE_TYPES.has(image.contentType))
    .map((image) => ({
      id: image.id,
      name: cleanText(image.name, "Player image", 80),
      contentType: image.contentType,
      uploadedAt: typeof image.uploadedAt === "string" ? image.uploadedAt : null
    }))
    .slice(0, MAX_PLAYER_IMAGES);
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("Image data is missing.");
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Images must be JPEG, PNG, or WebP.");
  }

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large after compression.");
  }

  return {
    contentType: match[1],
    bytes
  };
}

function isSafeImageId(value) {
  return typeof value === "string" && /^[a-z0-9-]{1,140}$/.test(value);
}

function sanitizeId(value, fallback, seen) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  let id = /^[a-z0-9-]{1,80}$/.test(text) ? text : fallback;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${fallback}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
