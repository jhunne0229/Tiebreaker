"use client";

// 공유 토큰 발급 / 무효화 / OG 토글 (06_PHASE2_PRD.md §2.6)
// 결정 상세 헤더의 "공유" 버튼이 모달을 연다.
//   1) 토큰이 없으면 → "공유 링크 만들기" 버튼 → POST /api/decisions/[id]/share
//   2) 토큰이 있으면 → URL 표시 + 복사 버튼 + OG 토글 + "공유 중단" 버튼
import { useState } from "react";
import { Share2, Copy, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  decisionId: string;
  initialToken: string | null;
  initialOgEnabled: boolean;
}

export function ShareDialog({ decisionId, initialToken, initialOgEnabled }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
  const [ogEnabled, setOgEnabled] = useState(initialOgEnabled);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = token
    ? typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : `/share/${token}`
    : null;

  async function createToken() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/share`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        share_token?: string;
        error?: string;
      };
      if (!res.ok || !j.share_token) {
        throw new Error(j.error ?? "발급 실패");
      }
      setToken(j.share_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "발급 실패");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("공유 링크를 무효화할까요? 기존 링크는 더 이상 열리지 않아요.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/share`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "무효화 실패");
      }
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "무효화 실패");
    } finally {
      setBusy(false);
    }
  }

  async function toggleOg(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ og_enabled: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "변경 실패");
      }
      setOgEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("복사에 실패했어요.");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Share2 className="h-4 w-4" />
        공유
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">결정 공유</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              읽기 전용 링크로 공유돼요. 회고·경향성·드러커 답변은 노출되지
              않아요.
            </p>

            <div className="mt-4 space-y-3">
              {token && shareUrl ? (
                <>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copy}
                      type="button"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "복사됨" : "복사"}
                    </Button>
                  </div>

                  <label className="flex items-start gap-3 rounded-md border p-3">
                    <input
                      type="checkbox"
                      checked={ogEnabled}
                      onChange={(e) => toggleOg(e.target.checked)}
                      disabled={busy}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Globe className="h-3.5 w-3.5" />
                        링크 미리보기 (OG)
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        카카오톡·메신저에서 공유 시 결정 제목이 미리보기로
                        표시돼요. 옵션과 맥락은 미리보기에 포함되지 않아요.
                      </p>
                    </div>
                  </label>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={revoke}
                    disabled={busy}
                    type="button"
                  >
                    공유 중단 (링크 무효화)
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    공유 링크를 만들면 비로그인 사용자도 이 결정의 요약을
                    읽을 수 있어요.
                  </p>
                  <Button onClick={createToken} disabled={busy} type="button">
                    공유 링크 만들기
                  </Button>
                </>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                type="button"
              >
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
