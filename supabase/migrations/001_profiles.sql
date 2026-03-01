-- AutoClipper: User profiles with plan info
-- Run this in Supabase SQL Editor after creating the project

-- Profiles table (auto-populated via trigger on signup)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  created_at timestamptz default now()
);

-- RLS: users can only read their own profile
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Index for Stripe webhook lookup
create index idx_profiles_stripe_customer_id on public.profiles(stripe_customer_id);
