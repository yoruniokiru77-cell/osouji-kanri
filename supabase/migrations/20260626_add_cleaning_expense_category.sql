insert into public.expense_categories (name)
values ('クリーニング費用')
on conflict (name) do nothing;
