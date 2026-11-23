"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  signInAction,
  signInWithGoogleAction,
  sendMagicLinkAction,
  signUpAction,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function LoginForm({
  next,
  oauthError,
  googleEnabled = false,
}: {
  next: string;
  oauthError?: string;
  googleEnabled?: boolean;
}) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signInState, signIn, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUp, signUpPending] = useActionState(signUpAction, initialState);
  const [magicState, magicLink, magicPending] = useActionState(sendMagicLinkAction, initialState);

  const state = tab === "signin" ? signInState : signUpState;
  const pending = signInPending || signUpPending;

  return (
    <div className="w-full space-y-6">
      {googleEnabled ? (
        <>
          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="w-full" size="lg">
              <GoogleMark />
              Continuar com Google
            </Button>
          </form>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {(oauthError || state.error || state.notice) && (
        <Alert variant={state.error || oauthError ? "destructive" : "success"}>
          <AlertDescription>{state.error ?? oauthError ?? state.notice}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Entrar</TabsTrigger>
          <TabsTrigger value="signup">Criar conta</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form action={signIn} className="space-y-4 pt-4">
            <input type="hidden" name="next" value={next} />
            <FieldGroup>
              <Field htmlFor="signin-email" label="E-mail">
                <Input
                  id="signin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@empresa.com"
                  aria-describedby="signin-email-hint"
                />
              </Field>
              <Field htmlFor="signin-password" label="Senha">
                <Input
                  id="signin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </Field>
              <Field htmlFor="signup-password-confirm" label="Confirme a senha">
                <Input
                  id="signup-password-confirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </Field>
            </FieldGroup>
            <p id="signin-email-hint" className="text-xs text-muted-foreground">
              Sem senha? Use o Google acima — leva menos de 10 segundos.
            </p>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Entrar
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form action={signUp} className="space-y-4 pt-4">
            <FieldGroup>
              <Field
                htmlFor="signup-brand"
                label="Nome da marca"
                hint="Usamos para criar seu espaço. Pode mudar depois."
              >
                <Input id="signup-brand" name="brandName" autoComplete="organization" placeholder="Minha marca" />
              </Field>
              <Field htmlFor="signup-email" label="E-mail">
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@empresa.com"
                />
              </Field>
              <Field htmlFor="signup-password" label="Senha" hint="Mínimo de 8 caracteres.">
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </Field>
            </FieldGroup>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Criar conta gratuita
            </Button>
            <p className="text-xs text-muted-foreground">
              Ao criar a conta você aceita os{" "}
              <Link href="/termos" className="underline underline-offset-4">
                termos
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="underline underline-offset-4">
                política de privacidade
              </Link>
              . Não usamos seus dados para treinar modelos.
            </p>
          </form>
        </TabsContent>
      </Tabs>

      {tab === "signin" ? (
        <form action={magicLink} className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium">Prefere entrar sem senha?</p>
          <div className="flex gap-2">
            <Input
              name="email"
              type="email"
              required
              placeholder="voce@empresa.com"
              aria-label="E-mail para receber o link de acesso"
            />
            <Button type="submit" variant="outline" disabled={magicPending}>
              {magicPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Enviar link
            </Button>
          </div>
          {magicState.error ? <p className="text-xs text-destructive">{magicState.error}</p> : null}
          {magicState.notice ? (
            <p className="text-xs text-muted-foreground">{magicState.notice}</p>
          ) : null}
        </form>
      ) : null}

      <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Mail className="size-3.5 shrink-0" aria-hidden="true" />
        {googleEnabled
          ? "Login por e-mail também aceita link mágico enviado após o cadastro."
          : "Login com Google ainda não está habilitado neste projeto — use e-mail e senha."}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.86c2.26-2.09 3.56-5.17 3.56-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a11.99 11.99 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.63l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export { FieldError as LoginFieldError };
