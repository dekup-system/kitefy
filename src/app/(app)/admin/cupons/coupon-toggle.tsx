"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCouponActiveAction, type AdminActionState } from "@/lib/admin/actions";

export function CouponToggle({ couponId, active }: { couponId: string; active: boolean }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    setCouponActiveAction,
    {},
  );

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="couponId" value={couponId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={active ? "destructive" : "outline"}
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {active ? "Desativar" : "Reativar"}
      </Button>
      {state.error ? <p className="max-w-[14rem] text-xs text-muted-foreground">{state.error}</p> : null}
    </form>
  );
}
