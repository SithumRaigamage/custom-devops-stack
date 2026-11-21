"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/app/Spinner";
import { setupAdmin } from "@/lib/api";

const MIN_PASSWORD = 12;

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setPending(true);
    try {
      await setupAdmin(username.trim(), password);
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the admin account");
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create the admin account"
      subtitle="No account exists yet. This one controls the whole stack."
    >
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={MIN_PASSWORD}
            className="h-[42px] w-full rounded-[10px] border border-border2 bg-field px-3 text-sm text-fg outline-none placeholder:text-muted-foreground focus:border-brand-border"
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD} characters.
          </p>
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
              Creating account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthCard>
  );
}
