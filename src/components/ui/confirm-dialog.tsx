"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "warning" | "destructive";
export type ConfirmResult = { success: boolean; msg: string };

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  variant?: ConfirmVariant;
  /** Runs the action and reports what happened; the dialog stays open to show the result. */
  onConfirm: () => Promise<ConfirmResult>;
  /** Side effects for a successful confirm (e.g. router.refresh()) — does not close the dialog. */
  onSuccess?: () => void;
};

const VARIANT_ICON: Record<ConfirmVariant, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-blue-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  destructive: <AlertTriangle className="h-5 w-5 text-red-600" />,
};

const VARIANT_CONFIRM_CLASS: Record<ConfirmVariant, string> = {
  default: "",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

type Phase = "idle" | "loading" | "done";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loadingLabel = "Procesando…",
  variant = "default",
  onConfirm,
  onSuccess,
}: ConfirmDialogProps) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<ConfirmResult | null>(null);

  // Reset to a clean state whenever the dialog transitions to open, without the extra
  // render-after-commit an effect would cost (see "adjusting state as a prop changes").
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhase("idle");
      setResult(null);
    }
  }

  async function handleConfirm() {
    setPhase("loading");
    const r = await onConfirm();
    setResult(r);
    setPhase("done");
    if (r.success) onSuccess?.();
  }

  const succeeded = phase === "done" && result?.success;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (phase === "loading") return; // don't let an in-flight action get dismissed
        onOpenChange(o);
      }}
    >
      <DialogContent showCloseButton={phase !== "loading"}>
        <DialogHeader>
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0">{VARIANT_ICON[variant]}</div>
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        {phase === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingLabel}
          </div>
        )}

        {phase === "done" && result && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
              result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
            )}
          >
            {result.success ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{result.msg}</span>
          </div>
        )}

        <DialogFooter>
          {succeeded ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Entendido
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === "loading"}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={phase === "loading"}
                className={VARIANT_CONFIRM_CLASS[variant]}
              >
                {phase === "loading"
                  ? loadingLabel
                  : phase === "done"
                  ? "Reintentar"
                  : confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
