import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createSessionFile, type SessionFileRecord } from "../db/db";

export type StorableAttachment = {
    data: string;
    mimeType: string;
    name?: string;
    store?: boolean;
};

export type StoredSessionFile = SessionFileRecord & {
    absolutePath: string;
};

const SESSION_FILES_ROOT = resolve(process.cwd(), "data", "session-files");

function ensureSessionDirectory(sessionId: string): string {
    const dir = join(SESSION_FILES_ROOT, sessionId);
    mkdirSync(dir, { recursive: true });
    return dir;
}

function sanitizeBaseName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "file";
}

function sanitizeExtension(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

function inferExtension(
    filename: string | undefined,
    mimeType: string,
): string {
    const existing = sanitizeExtension(extname(filename ?? ""));
    if (existing) return existing;

    const lookup: Record<string, string> = {
        "text/csv": ".csv",
        "application/pdf": ".pdf",
        "text/plain": ".txt",
        "application/json": ".json",
        "text/markdown": ".md",
        "text/md": ".md",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
        "image/svg+xml": ".svg",
    };

    return lookup[mimeType.toLowerCase()] ?? "";
}

function decodeBase64(data: string): Buffer {
    return Buffer.from(data, "base64");
}

export function getSessionFilesRoot(): string {
    mkdirSync(SESSION_FILES_ROOT, { recursive: true });
    return SESSION_FILES_ROOT;
}

export function getSessionFileAbsolutePath(relativePath: string): string {
    return resolve(process.cwd(), relativePath);
}

export async function storeAttachmentForSession(
    sessionId: string,
    attachment: StorableAttachment,
): Promise<StoredSessionFile> {
    const sessionDir = ensureSessionDirectory(sessionId);
    const fileId = randomUUID();
    const originalName = attachment.name?.trim() || "file";
    const extension = inferExtension(originalName, attachment.mimeType);
    const safeBase = sanitizeBaseName(originalName.replace(/\.[^.]+$/, ""));
    const storedName = `${safeBase}-${fileId}${extension}`;
    const absolutePath = join(sessionDir, storedName);
    const relativePath = join("data", "session-files", sessionId, storedName);

    const bytes = decodeBase64(attachment.data);
    writeFileSync(absolutePath, bytes);

    const record = await createSessionFile({
        id: fileId,
        sessionId,
        originalName,
        storedName,
        relativePath,
        mimeType: attachment.mimeType,
        size: bytes.byteLength,
    });

    return {
        ...record,
        absolutePath,
    };
}

export async function storeAttachmentsForSession(
    sessionId: string,
    attachments: StorableAttachment[],
): Promise<StoredSessionFile[]> {
    const stored: StoredSessionFile[] = [];

    for (const attachment of attachments) {
        if (!attachment.store) continue;
        stored.push(await storeAttachmentForSession(sessionId, attachment));
    }

    return stored;
}
