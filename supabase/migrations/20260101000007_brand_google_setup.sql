-- =============================================================================
-- 0007 — Pacote Google: token de verificação do Search Console por marca
-- =============================================================================
-- O token é público por natureza (vai no <meta> do index.html), mas pertence a
-- UMA marca: por isso fica em brand_profiles, sob a mesma RLS das demais colunas.
-- Aceita valor nulo (marca sem verificação) e limita a 200 caracteres.
-- =============================================================================

alter table public.brand_profiles
  add column if not exists google_verification_token text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.brand_profiles'::regclass
       and conname = 'brand_profiles_google_token_length'
  ) then
    alter table public.brand_profiles
      add constraint brand_profiles_google_token_length
      check (
        google_verification_token is null
        or char_length(trim(google_verification_token)) between 1 and 200
      );
  end if;
end
$$;

comment on column public.brand_profiles.google_verification_token is
  'Token do Search Console (meta google-site-verification) usado no Pacote Google.';
