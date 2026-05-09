// 결정 공유 토큰 발급/취소/OG 토글 (06_PHASE2_PRD.md §2.6)
// POST: share_token이 없으면 생성 (uuid v4), 응답에 token + share URL.
// DELETE: share_token = null (무효화).
// PATCH { og_enabled: boolean }: share_og_enabled 토글.
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function ensureOwner(decisionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  }
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, user_id, share_token, share_og_enabled")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision) {
    return {
      error: NextResponse.json(
        { error: "결정을 찾을 수 없어요." },
        { status: 404 },
      ),
    };
  }
  if (decision.user_id !== user.id) {
    return {
      error: NextResponse.json({ error: "권한이 없어요." }, { status: 403 }),
    };
  }
  return { supabase, decision };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const ctx = await ensureOwner(decisionId);
  if ("error" in ctx) return ctx.error;
  const { supabase, decision } = ctx;

  const token = decision.share_token ?? randomUUID();
  if (!decision.share_token) {
    const { error } = await supabase
      .from("decisions")
      .update({ share_token: token })
      .eq("id", decisionId);
    if (error) {
      return NextResponse.json(
        { error: "공유 링크 발급에 실패했어요." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    share_token: token,
    share_og_enabled: decision.share_og_enabled,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const ctx = await ensureOwner(decisionId);
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const { error } = await supabase
    .from("decisions")
    .update({ share_token: null })
    .eq("id", decisionId);
  if (error) {
    return NextResponse.json(
      { error: "공유 링크 무효화에 실패했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

interface PatchBody {
  og_enabled?: boolean;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (typeof body?.og_enabled !== "boolean") {
    return NextResponse.json(
      { error: "og_enabled 값이 필요해요." },
      { status: 400 },
    );
  }
  const ctx = await ensureOwner(decisionId);
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const { error } = await supabase
    .from("decisions")
    .update({ share_og_enabled: body.og_enabled })
    .eq("id", decisionId);
  if (error) {
    return NextResponse.json(
      { error: "OG 설정 변경에 실패했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, share_og_enabled: body.og_enabled });
}
