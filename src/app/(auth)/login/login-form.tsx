"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  signInAction,
  sendMagicLinkAction,
  requestPasswordResetAction,
  signUpAction,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function LoginForm({
  next,
  oauthError,
}: {
  next: string;
  oauthError?: string;
}) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signInState, signIn, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUp, signUpPending] = useActionState(signUpAction, initialState);
  const [magicState, magicLink, magicPending] = useActionState(sendMagicLinkAction, initialState);
  const [resetState, resetPassword, resetPending] = useActionState(requestPasswordResetAction, initialState);
  const [forgot, setForgot] = useState(false);

  // Campos controlados para NUNCA limpar os dados digitados se houver erro no login/cadastro.
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  const [signUpBrand, setSignUpBrand] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirm, setSignUpConfirm] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirm, setShowSignUpConfirm] = useState(false);

  const state = tab === "signin" ? signInState : signUpState;
  const pending = signInPending || signUpPending;

  return (
    <div className="w-full space-y-6">
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
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  aria-describedby="signin-email-hint"
                />
              </Field>
              <Field htmlFor="signin-password" label="Senha">
                <div className="relative">
                  <Input
                    id="signin-password"
                    name="password"
                    type={showSignInPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword((v) => !v)}
                    aria-label={showSignInPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSignInPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </Field>
            </FieldGroup>
            <p id="signin-email-hint" className="text-xs text-muted-foreground">
              Sem senha? Use o link mágico abaixo — leva menos de 10 segundos.
            </p>
            <button
              type="button"
              onClick={() => setForgot((value) => !value)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Esqueci minha senha
            </button>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Entrar
            </Button>
          </form>

          {forgot ? (
            <form action={resetPassword} className="mt-4 space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium">Redefinir senha</p>
              <p className="text-xs text-muted-foreground">
                Informe o e-mail da conta. Enviamos um link para você criar uma senha nova.
              </p>
              <Input
                name="email"
                type="email"
                required
                defaultValue={signInEmail}
                placeholder="voce@empresa.com"
                aria-label="E-mail para redefinir a senha"
              />
              <Button type="submit" variant="outline" className="w-full" disabled={resetPending}>
                {resetPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Enviar link de redefinição
              </Button>
              {resetState.error ? <p className="text-xs text-destructive">{resetState.error}</p> : null}
              {resetState.notice ? (
                <p className="text-xs text-muted-foreground">{resetState.notice}</p>
              ) : null}
            </form>
          ) : null}
        </TabsContent>

        <TabsContent value="signup">
          <form action={signUp} className="space-y-4 pt-4">
            <FieldGroup>
              <Field
                htmlFor="signup-brand"
                label="Nome da marca"
                hint="Usamos para criar seu espaço. Pode mudar depois."
              >
                <Input
                  id="signup-brand"
                  name="brandName"
                  autoComplete="organization"
                  value={signUpBrand}
                  onChange={(e) => setSignUpBrand(e.target.value)}
                  placeholder="Minha marca"
                />
              </Field>
              <Field htmlFor="signup-email" label="E-mail">
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                />
              </Field>
              <Field htmlFor="signup-password" label="Senha" hint="Mínimo de 8 caracteres.">
                <div className="relative">
                  <Input
                    id="signup-password"
                    name="password"
                    type={showSignUpPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword((v) => !v)}
                    aria-label={showSignUpPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSignUpPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </Field>
              <Field
                htmlFor="signup-password-confirm"
                label="Repita a senha"
                hint="Para evitar erro de digitação."
              >
                <div className="relative">
                  <Input
                    id="signup-password-confirm"
                    name="confirmPassword"
                    type={showSignUpConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={signUpConfirm}
                    onChange={(e) => setSignUpConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpConfirm((v) => !v)}
                    aria-label={showSignUpConfirm ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSignUpConfirm ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="email"
              type="email"
              required
              defaultValue={signInEmail}
              placeholder="voce@empresa.com"
              aria-label="E-mail para receber o link de acesso"
            />
            <Button type="submit" variant="outline" className="shrink-0" disabled={magicPending}>
              {magicPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
              Enviar link
            </Button>
          </div>
          {magicState.error ? <p className="text-xs text-destructive">{magicState.error}</p> : null}
          {magicState.notice ? <p className="text-xs text-muted-foreground">{magicState.notice}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
