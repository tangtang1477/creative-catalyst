import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONSUME_TOTAL = 100; // default monthly allotment (mocked)

const ConsumeInput = z.object({
  taskId: z.string().min(1).max(80).nullable().optional(),
  stage: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  cost: z.number().int().min(1).max(1000),
});

/** Insert a consume row into credit_ledger and return new balance. */
export const consumeCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConsumeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("credit_ledger").insert({
      user_id: userId,
      task_id: data.taskId ?? null,
      stage: data.stage,
      label: data.label,
      cost: data.cost,
      kind: "consume",
    });
    if (error) throw new Error(error.message);

    const { data: rows, error: sumErr } = await supabase
      .from("credit_ledger")
      .select("cost,kind")
      .eq("user_id", userId);
    if (sumErr) throw new Error(sumErr.message);

    let used = 0;
    let topup = 0;
    for (const r of rows ?? []) {
      if (r.kind === "consume") used += r.cost;
      else if (r.kind === "topup") topup += r.cost;
      else if (r.kind === "refund") used -= r.cost;
    }
    used = Math.max(0, used);
    const total = CONSUME_TOTAL + topup;
    return { used, total, remaining: Math.max(0, total - used) };
  });

/** Get balance from ledger. */
export const getCreditsBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("credit_ledger")
      .select("cost,kind")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    let used = 0;
    let topup = 0;
    for (const r of rows ?? []) {
      if (r.kind === "consume") used += r.cost;
      else if (r.kind === "topup") topup += r.cost;
      else if (r.kind === "refund") used -= r.cost;
    }
    used = Math.max(0, used);
    const total = CONSUME_TOTAL + topup;
    return { used, total, remaining: Math.max(0, total - used) };
  });
