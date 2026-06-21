"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/constants";

type JoinFormProps = {
  eventSlug: string;
  initialNickname?: string;
  initialRole?: string;
  initialAvatarUrl?: string;
  initialProfileComplete?: boolean;
  nextPath?: string;
};

async function resizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

function initialName(value?: string) {
  if (!value || value === "oracle") return "";
  return value;
}

function initialRoleValue(value?: string, hasCompletedProfile?: boolean) {
  if (!value || !hasCompletedProfile) return "";
  return value;
}

function safeClientNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  if (value.startsWith("/admin") || value.startsWith("/api")) return "";
  return value;
}

export function JoinForm({
  eventSlug,
  initialNickname,
  initialRole,
  initialAvatarUrl,
  initialProfileComplete,
  nextPath
}: JoinFormProps) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialName(initialNickname));
  const [role, setRole] = useState(initialRoleValue(initialRole, initialProfileComplete));
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

  async function submit(event: React.FormEvent) {
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
      const response = await fetch("/api/session/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, role, avatarDataUrl: newAvatarDataUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join.");
      const safeNext = safeClientNextPath(nextPath);
      router.push(safeNext || (data.nextMarketId ? `/m/${data.nextMarketId}` : `/e/${eventSlug}`));
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
          onChange={(event: any) => setNickname(event.target.value)}
          maxLength={24}
          placeholder="Your name or team handle"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-extrabold">
        Role
        <select
          className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
          value={role}
          onChange={(event: any) => setRole(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose your role
          </option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p> : null}
      <button
        data-testid="join-submit"
        className="focus-ring min-h-12 rounded-full bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 sm:order-last"
        disabled={busy || !nickname.trim() || !role}
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
            onChange={(event: any) => onFile(event.target.files?.[0])}
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
          onChange={(event: any) => onFile(event.target.files?.[0])}
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
