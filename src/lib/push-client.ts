// 브라우저 측 푸시 구독 헬퍼 (06_PHASE2_PRD.md §2.5)
// - registerServiceWorker(): /sw.js 등록
// - subscribePush(): 구독 생성 → /api/profile/push-subscription POST
// - unsubscribePush(): 현재 구독 해제 → DELETE
// - getCurrentSubscription(): 등록 여부 확인

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.error("[push] sw register failed", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribePush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported())
    return { ok: false, reason: "이 브라우저는 푸시를 지원하지 않아요." };
  const vapid = getVapidPublicKey();
  if (!vapid)
    return {
      ok: false,
      reason: "푸시 키가 설정되지 않았어요. 관리자에게 문의해주세요.",
    };

  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return { ok: false, reason: "알림 권한이 허용되지 않았어요." };

  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await registerServiceWorker());
  if (!reg) return { ok: false, reason: "서비스 워커 등록에 실패했어요." };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }

  const json = sub.toJSON();
  const res = await fetch("/api/profile/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: j.error ?? "서버에 구독을 저장하지 못했어요." };
  }
  return { ok: true };
}

export async function unsubscribePush(): Promise<{ ok: boolean; reason?: string }> {
  const sub = await getCurrentSubscription();
  if (!sub) return { ok: true };

  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  const res = await fetch("/api/profile/push-subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return { ok: false, reason: "서버 구독 해제에 실패했어요." };
  return { ok: true };
}
