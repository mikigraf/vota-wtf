"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToSupabaseRealtime } from "@/lib/supabase-realtime";

export function AdminLiveRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState("ready");

  useEffect(() => {
    function refresh() {
      setLastRefresh(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      router.refresh();
    }
    const stopRealtime = subscribeToSupabaseRealtime(refresh, { debounceMs: 500 });
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [router]);

  return (
    <span className="font-mono-vota inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-2 text-[10px] font-bold uppercase text-ink">
      <span className="vota-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
      Live sync {lastRefresh}
    </span>
  );
}
