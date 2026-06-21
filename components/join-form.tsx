"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { safeParticipantNextPath } from "@/lib/safe-paths";

type InputChangeEvent = { currentTarget: HTMLInputElement };
type ResizeSource = { image: CanvasImageSource; width: number; height: number; close?: () => void };

type JoinFormProps = {
  eventSlug: string;
  initialNickname?: string;
  initialEmail?: string;
  initialAvatarUrl?: string;
  nextPath?: string;
};

async function resizeImage(file: File) {
  const source = await loadImageSource(file);
  const scale = Math.min(1, 512 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return canvas.toDataURL("image/webp", 0.82);
}

async function loadImageSource(file: File): Promise<ResizeSource> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    const decode = image.decode;
    if (typeof decode === "function") {
      await decode.call(image);
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not read this image."));
      });
    }
    return { image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function initialName(value?: string) {
  if (!value || value === "oracle") return "";
  return value;
}

function postJoinPath(nextPath: string | undefined, eventSlug: string) {
  const eventHome = `/e/${eventSlug}`;
  const safeNext = safeParticipantNextPath(nextPath);
  if (!safeNext) return eventHome;
  try {
    const url = new URL(safeNext, "https://vota.local");
    return url.pathname === eventHome ? `${url.pathname}${url.search}` : eventHome;
  } catch {
    return eventHome;
  }
}

export function JoinForm({
  eventSlug,
  initialNickname,
  initialEmail,
  initialAvatarUrl,
  nextPath
}: JoinFormProps) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialName(initialNickname));
  const [email, setEmail] = useState(initialEmail || "");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(initialAvatarUrl || "");
  const [newAvatarDataUrl, setNewAvatarDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    try {
      setError("");
      const resized = await resizeImage(file);
      if (!resized) throw new Error("Could not read this image.");
      setNewAvatarDataUrl(resized);
      setAvatarPreviewUrl(resized);
    } catch {
      setError("Could not use that photo. You can continue without one.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const initResponse = await fetch("/api/session/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSlug })
      });
      const initData = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok) throw new Error(initData.error || "Could not start this event session.");
      const recoveredNext = postJoinPath(nextPath, eventSlug);
      if (initData.profileComplete) {
        router.push(recoveredNext);
        router.refresh();
        return;
      }
      const response = await fetch("/api/session/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, email, avatarDataUrl: newAvatarDataUrl })
      });
      const data = await response.json();
      if (response.status === 409 && /locked after entering/i.test(String(data.error || ""))) {
        router.push(recoveredNext);
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not join.");
      router.push(postJoinPath(nextPath, eventSlug));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:gap-4" data-testid="join-form">
      <label className="grid gap-2 text-sm font-extrabold">
        Stage name
        <input
          className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
          value={nickname}
          onChange={(event: InputChangeEvent) => setNickname(event.currentTarget.value)}
          maxLength={24}
          placeholder="Your name or team handle"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-extrabold">
        Email
        <input
          className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
          type="email"
          value={email}
          onChange={(event: InputChangeEvent) => setEmail(event.currentTarget.value)}
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </label>
      {error ? <p className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p> : null}
      <button
        data-testid="join-submit"
        className="focus-ring min-h-12 rounded-full bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 sm:order-last"
        disabled={busy || !nickname.trim() || !email.trim()}
      >
        {busy ? "Joining..." : "Enter the markets"}
      </button>
      <details className="rounded-xl border border-line p-1.5 sm:hidden">
        <summary className="focus-ring flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-sm font-extrabold">Add photo optional</summary>
        <label className="mt-3 grid gap-2 text-sm font-extrabold">
          Photo or avatar optional
          <input
            className="focus-ring rounded-xl border-[1.5px] border-dashed border-line bg-paper p-3 text-sm font-semibold"
            type="file"
            accept="image/*"
            onChange={(event: InputChangeEvent) => onFile(event.currentTarget.files?.[0])}
          />
        </label>
        {avatarPreviewUrl ? (
          <img className="mt-3 h-20 w-20 rounded-xl object-cover" src={avatarPreviewUrl} alt="Avatar preview" />
        ) : (
          <div className="font-expanded mt-3 flex h-20 w-20 items-center justify-center rounded-xl bg-ink text-2xl font-black text-white">
            WTF
          </div>
        )}
      </details>
      <label className="hidden gap-2 text-sm font-extrabold sm:grid">
        Photo or avatar optional
        <input
          className="focus-ring rounded-xl border-[1.5px] border-dashed border-line bg-paper p-3 text-sm font-semibold"
          type="file"
          accept="image/*"
          onChange={(event: InputChangeEvent) => onFile(event.currentTarget.files?.[0])}
        />
      </label>
      {avatarPreviewUrl ? (
        <img className="hidden h-24 w-24 rounded-xl object-cover sm:block" src={avatarPreviewUrl} alt="Avatar preview" />
      ) : (
        <div className="font-expanded hidden h-24 w-24 items-center justify-center rounded-xl bg-ink text-3xl font-black text-white sm:flex">
          WTF
        </div>
      )}
    </form>
  );
}
