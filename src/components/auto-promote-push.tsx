"use client";

// 결정 상세 페이지에 마운트되는 자동 푸시 승격 컴포넌트 (06_PHASE2_PRD.md §2.5)
// 서버에서 "승격 후보(notification_channel=email && !locked && decision_count>=1)"라고 판정한 경우만 렌더.
// 클라이언트에서 추가로:
//   - 푸시 지원 + Notification.permission === 'granted'
//   - 서비스 워커 + 구독 객체 가져옴
// 이 두 조건이 다 맞으면 /api/profile/auto-promote-push 호출.
// 성공하면 한 번만 인라인 안내 띄움.
// 같은 세션 내 중복 시도 방지: sessionStorage.
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  isPushSupported,
  registerServiceWorker,
  getCurrentSubscription,
} from "@/lib/push-client";

const STORAGE_KEY = "tiebreaker:auto-promote-tried";

export function AutoPromotePush() {
  const [promoted, setPromoted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) return;
      if (Notification.permission !== "granted") return;
      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(STORAGE_KEY)) return;
        sessionStorage.setItem(STORAGE_KEY, "1");
      }

      // SW 등록 보장
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = (await registerServiceWorker()) ?? undefined;
      if (!reg) return;

      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) return;

      // 기존 구독이 있으면 그걸 사용. 없으면 PRD 상 "이미 권한 허용" 요건만 충족 — 새로 만들지 않음
      // (사용자에게 명시 동의 없이 PushManager.subscribe 호출하지 않기 위함).
      const sub = await getCurrentSubscription();
      if (!sub) return;

      const json = sub.toJSON();
      const res = await fetch("/api/profile/auto-promote-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        promoted?: boolean;
        error?: string;
      };
      if (!cancelled && res.ok && j.promoted) {
        setPromoted(true);
      }
    })().catch((e) => console.error("[auto-promote] failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!promoted || dismissed) return null;

  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">이제 푸시로 알려드릴게요.</p>
          <p className="mt-0.5 text-xs">
            7일 / 30일 뒤 회고 알림이 브라우저로 전달돼요. 설정에서 언제든 변경할
            수 있어요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="닫기"
          className="rounded p-0.5 hover:bg-emerald-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
