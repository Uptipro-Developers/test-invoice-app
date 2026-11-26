alter table public.negotiations
  add column if not exists items jsonb;

comment on column public.negotiations.items is
  'Item-level price snapshot for this offer; total-only legacy offers are resolved proportionally.';
