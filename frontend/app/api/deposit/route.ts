import { NextResponse } from "next/server";
import { getState } from "../../../lib/state";

export async function POST(req: Request) {
  const { commitment, label } = await req.json();
  if (!commitment) {
    return NextResponse.json({ error: "commitment required" }, { status: 400 });
  }
  const state = getState();
  state.poolDeposits.push({ commitment: String(commitment), label: label || "deposit" });
  return NextResponse.json({ index: state.poolDeposits.length - 1 });
}
