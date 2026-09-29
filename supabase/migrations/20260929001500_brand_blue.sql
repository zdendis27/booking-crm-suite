alter table public.salons alter column brand_color set default '#3056d3';
alter table public.staff alter column color set default '#3056d3';
update public.salons set brand_color = '#3056d3' where brand_color = '#6d5efc';
update public.staff set color = '#3056d3' where color = '#6d5efc';
