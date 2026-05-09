"use client";

// 알림 채널 설정 화면 (06_PHASE2_PRD.md §2.5)
// email(기본) / push / both / off 4가지.
// 푸시는 PWA 설치 + 브라우저 알림 권한이 필요. 권한 미허용 상태에서 push/both 선택 시 권한 요청.
// 사용자 변경 시 notification_channel_locked=true 로 잠금 → 자동 승격 정지.
import { useEffect, useState } from "react";
import { Bell, Mail, Smartphone, BellOff, Check, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isPushSupported,
  subscribePush,
  unsubscribePush,
} from "@/lib/push-client";
import type { NotificationChannel } from "@/types/database";

interface Props {
  initialChannel: NotificationChannel;
  initialLocked: boolean;
  email: string | null;
}

const OPTIONS: Array<{
  value: NotificationChannel;
  label: string;
  caption: string;
  icon: LucideIcon;
  needsPush: boolean;
}> = [
  {
    value: "email",
    label: "이메일",
    caption: "가입한 이메일로 회고 리마인더를 받아요.",
    icon: Mail,
    needsPush: false,
  },
  {
    value: "push",
    label: "푸시",
    caption: "PWA 설치 + 브라우저 알림 권한이 필요해요.",
    icon: Smartphone,
    needsPush: true,
  },
  {
    value: "both",
    label: "둘 다",
    caption: "이메일과 푸시 모두로 받아요.",
    icon: Bell,
    needsPush: true,
  },
  {
    value: "off",
    label: "끄기",
    caption: "회고 알림을 보내지 않아요.",
    icon: BellOff,
    needsPush: false,
  },
];

export function NotificationsView({
  initialChannel,
  initialLocked,
  email,
}: Props) {
  const [channel, setChannel] = useState<NotificationChannel>(initialChannel);
  const [locked, setLocked] = useState(initialLocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pushPermission, setPushPermission] =
    useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) {
      setPushPermission("unsupported");
      return;
    }
    setPushPermission(Notification.permission);
  }, []);

  async function save(next: NotificationChannel) {
    setError(null);
    setSaved(false);
    const opt = OPTIONS.find((o) => o.value === next);
    setBusy(true);
    try {
      // 푸시가 필요한 채널이면 먼저 브라우저 구독을 만들어 두고, 실패 시 채널 변경 자체를 막는다.
      if (opt?.needsPush) {
        const sub = await subscribePush();
        setPushPermission(
          isPushSupported() ? Notification.permission : "unsupported",
        );
        if (!sub.ok) {
          setError(sub.reason ?? "푸시 구독에 실패했어요.");
          return;
        }
      } else {
        // push/both → email/off 전환 시 기존 구독 정리.
        await unsubscribePush().catch(() => undefined);
      }

      const res = await fetch(`/api/profile/notification-channel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: next }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "저장에 실패했어요.");
      setChannel(next);
      setLocked(true);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-base font-semibold">회고 알림 채널</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          최종 결정일로부터 7일 / 30일 뒤 "그 결정 어땠나요?" 알림을 보내드려요.
        </p>

        <ul className="mt-4 space-y-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = channel === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save(opt.value)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/40",
                    busy && "cursor-not-allowed opacity-70",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {opt.label}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opt.caption}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-3 text-xs text-emerald-600">저장됐어요.</p>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground sm:p-6">
        <div className="flex items-center gap-2">
          {locked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          <span className="font-medium">현재 상태</span>
        </div>
        <ul className="mt-2 space-y-1">
          <li>
            이메일: <span className="font-mono">{email ?? "(없음)"}</span>
          </li>
          <li>
            푸시 권한:{" "}
            <span className="font-mono">
              {pushPermission === "unsupported"
                ? "미지원"
                : pushPermission === "granted"
                  ? "허용"
                  : pushPermission === "denied"
                    ? "거부"
                    : "미요청"}
            </span>
          </li>
          <li>
            자동 승격 잠금:{" "}
            <span className="font-mono">{locked ? "잠김" : "열림"}</span>
            {locked && (
              <span className="ml-1">
                (직접 변경한 적이 있어 첫 결정 후 자동 푸시 전환은 멈췄어요.)
              </span>
            )}
          </li>
        </ul>

        {!locked && (
          <p className="mt-3">
            첫 결정 저장 직후 PWA 설치 + 푸시 권한이 허용되면 자동으로
            <span className="font-semibold"> 푸시 </span>로 전환돼요.
          </p>
        )}
      </div>
    </div>
  );
}
