"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "destructive";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

const ToastContext = React.createContext<{
  toast: (message: string, variant?: ToastVariant) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = "default") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 3500);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "max-w-sm rounded-md border bg-card px-4 py-3 text-sm shadow-md",
              t.variant === "destructive" &&
                "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
