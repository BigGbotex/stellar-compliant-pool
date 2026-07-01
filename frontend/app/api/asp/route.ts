import { NextResponse } from "next/server";
import { addAspIdentity, revokeAspIdentity } from "../../../lib/state";

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "add") {
    if (!body.identitySecret || !body.label) {
      return NextResponse.json({ error: "identitySecret and label required" }, { status: 400 });
    }
    await addAspIdentity(String(body.label), BigInt(body.identitySecret));
    return NextResponse.json({ ok: true });
  }
  if (body.action === "revoke") {
    if (typeof body.index !== "number") {
      return NextResponse.json({ error: "index required" }, { status: 400 });
    }
    revokeAspIdentity(body.index);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
