"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/app/Spinner";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setPending(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use the admin account for this machine.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-[13px] font-medium text-muted-foreground">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoFocus
            className="h-[42px] w-full rounded-[10px] border border-border2 bg-field px-3 text-sm text-fg outline-none placeholder:text-muted-foreground focus:border-brand-border"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-[42px] w-full rounded-[10px] border border-border2 bg-field px-3 text-sm text-fg outline-none placeholder:text-muted-foreground focus:border-brand-border"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[10px] border border-bad-bg bg-bad-bg px-3 py-2 text-[13px] text-bad"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex h-[42px] items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
        >
          {pending ? (
            <>
              <Spinner />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthCard>
  );
}
