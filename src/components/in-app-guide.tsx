"use client";
// 카톡/페북 등 인앱 웹뷰에서 /login 진입 시 노출. Google OAuth 가 막혀있어
// 외부 브라우저로 옮기도록 안내 + URL 복사 제공.
import { useState } from "react";

interface Props {
  url: string;
}

export function InAppGuide({ url }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 일부 인앱 웹뷰는 clipboard 권한이 없을 수 있음 — 사용자가 직접 길게 눌러 복사하면 됨
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 text-4xl">🌐</div>
          <h1 className="text-lg font-bold">외부 브라우저에서 열어주세요</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            지금 화면은 메신저 앱 안의 임시 브라우저예요. Google 정책상 여기서는
            로그인이 막혀있어요.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 font-medium">카카오톡인 경우</p>
            <p className="text-muted-foreground">
              우상단 점 세 개(⋮) → &quot;다른 브라우저로 열기&quot; → Chrome 또는 Safari
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 font-medium">또는 URL 복사해서 직접 열기</p>
            <p className="break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
              {url}
            </p>
            <button
              onClick={onCopy}
              className="mt-2 w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition hover:opacity-90"
            >
              {copied ? "✓ 복사됨" : "URL 복사"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          외부 브라우저로 옮긴 뒤 Google 로그인 하시면 돼요.
        </p>
      </div>
    </main>
  );
}
